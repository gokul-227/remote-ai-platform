"""Bounded, passive OOXML text previews; no rendering, formulas or relationships.

Call with the COMPLETE object, read with MAX_ARCHIVE_BYTES + 1 as the storage
limit. Office preview failure should fall back to download, never partial ZIPs.
"""

import io
import re
import struct
import zipfile
import zlib
from dataclasses import dataclass

from lxml import etree

MAX_ARCHIVE_BYTES = 8 * 1024 * 1024
MAX_ENTRIES = 512
MAX_ENTRY_BYTES = 2 * 1024 * 1024
MAX_EXPANDED_BYTES = 16 * 1024 * 1024
MAX_COMPRESSION_RATIO = 200
MAX_TEXT_CHARS = 100_000
MAX_XML_NODES = 100_000
MAX_PARTS = 128
OFFICE_MIMES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
}
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


class _TextLimitError(Exception):
    """Internal early exit once the output budget is exhausted."""


class OfficePreviewError(ValueError):
    """Malformed, unsupported or over-budget Office archive."""


@dataclass(frozen=True)
class OfficePreview:
    text: str
    truncated: bool


def extract_office_preview(data: bytes, mime: str) -> OfficePreview:
    """Extract passive text or raise OfficePreviewError. MIME must be exact.

    XLSX uses cached formula values only, with no sparse-grid allocation. Macros,
    linked resources, embedded objects, styles, and images are never interpreted.
    Limits apply to ALL ZIP members, including unused parts. No files are written.
    """
    kind = OFFICE_MIMES.get(mime)
    if kind is None or len(data) > MAX_ARCHIVE_BYTES:
        raise OfficePreviewError("Unsupported type or archive exceeds preview limit")
    # Bound central-directory allocation before ZipFile constructs ZipInfo objects.
    end = data.rfind(b"PK\x05\x06", max(0, len(data) - 65557))
    if end < 0 or end + 22 > len(data):
        raise OfficePreviewError("Missing ZIP directory")
    disk, directory_disk, disk_count, count, size, offset, comment = struct.unpack_from(
        "<4H2LH", data, end + 4
    )
    if (
        disk
        or directory_disk
        or disk_count != count
        or count > MAX_ENTRIES
        or end + 22 + comment != len(data)
        or offset + size != end
    ):
        raise OfficePreviewError("Unsupported or excessive ZIP directory")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) != count:
                raise OfficePreviewError("Inconsistent ZIP directory")
            names = set()
            total = 0
            for entry in entries:
                name = entry.filename
                if (
                    name in names
                    or name.startswith("/")
                    or "\\" in name
                    or any(p in {".", ".."} for p in name.split("/"))
                    or entry.flag_bits & 1
                    or entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
                    or entry.file_size > MAX_ENTRY_BYTES
                    or entry.file_size > max(1, entry.compress_size) * MAX_COMPRESSION_RATIO
                ):
                    raise OfficePreviewError("Unsafe or excessive ZIP member")
                names.add(name)
                total += entry.file_size
            if total > MAX_EXPANDED_BYTES:
                raise OfficePreviewError("Archive expansion exceeds preview limit")

            def xml(name):
                with archive.open(name) as stream:
                    payload = stream.read(MAX_ENTRY_BYTES + 1)
                if len(payload) > MAX_ENTRY_BYTES:
                    raise OfficePreviewError("XML part exceeds preview limit")
                parser = etree.XMLParser(
                    resolve_entities=False,
                    load_dtd=False,
                    no_network=True,
                    huge_tree=False,
                    recover=False,
                )
                root = etree.fromstring(payload, parser)
                if root.getroottree().docinfo.doctype:
                    raise OfficePreviewError("DTDs are forbidden in previews")
                if sum(1 for _ in root.iter()) > MAX_XML_NODES:
                    raise OfficePreviewError("XML node count exceeds preview limit")
                return root

            chunks = []
            length = 0
            truncated = False

            def append(value):
                nonlocal length, truncated
                remaining = MAX_TEXT_CHARS - length
                if len(value) > remaining:
                    truncated = True
                chunks.append(value[:remaining])
                length += min(len(value), remaining)
                if truncated:
                    raise _TextLimitError

            if kind == "docx":
                root = xml("word/document.xml")
                for paragraph in root.iter(W + "p"):
                    append("".join(n.text or "" for n in paragraph.iter(W + "t")) + "\n")
            else:
                pattern = (
                    r"xl/worksheets/sheet([0-9]+)\.xml"
                    if kind == "xlsx"
                    else r"ppt/slides/slide([0-9]+)\.xml"
                )
                parts = sorted(
                    (n for n in names if re.fullmatch(pattern, n)),
                    key=lambda n: int(
                        n.rsplit("/", 1)[1]
                        .split(".")[0]
                        .removeprefix("sheet")
                        .removeprefix("slide")
                    ),
                )
                if not parts or len(parts) > MAX_PARTS:
                    raise OfficePreviewError("Missing or excessive document parts")
                shared = []
                if kind == "xlsx" and "xl/sharedStrings.xml" in names:
                    shared = [
                        "".join(n.text or "" for n in item.iter(S + "t"))
                        for item in xml("xl/sharedStrings.xml").iter(S + "si")
                    ]
                for index, part in enumerate(parts, 1):
                    append(f"{'Sheet' if kind == 'xlsx' else 'Slide'} {index}\n")
                    root = xml(part)
                    if kind == "pptx":
                        for paragraph in root.iter(A + "p"):
                            append("".join(n.text or "" for n in paragraph.iter(A + "t")) + "\n")
                    else:
                        for row in root.iter(S + "row"):
                            for cell in row.iter(S + "c"):
                                value = cell.findtext(S + "v", "")
                                if cell.get("t") == "s":
                                    if not value.isascii() or not value.isdigit() or len(value) > 8:
                                        raise OfficePreviewError("Invalid shared string reference")
                                    position = int(value)
                                    if position >= len(shared):
                                        raise OfficePreviewError("Invalid shared string reference")
                                    value = shared[position]
                                elif cell.get("t") == "inlineStr":
                                    value = "".join(n.text or "" for n in cell.iter(S + "t"))
                                append(value + "\t")
                            append("\n")
            return OfficePreview(text="".join(chunks), truncated=truncated)
    except _TextLimitError:
        return OfficePreview(text="".join(chunks), truncated=True)
    except (
        zipfile.BadZipFile,
        zlib.error,
        KeyError,
        etree.XMLSyntaxError,
        OSError,
        RuntimeError,
        EOFError,
        NotImplementedError,
    ) as exc:
        raise OfficePreviewError("Invalid Office archive") from exc
