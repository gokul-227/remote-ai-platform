"""Synthetic Office archives exercise passive extraction and resource boundaries."""

import io
import zipfile

import pytest

from app.domains.files import office_preview as preview

MIMES = {value: key for key, value in preview.OFFICE_MIMES.items()}


def package(parts, compression=zipfile.ZIP_STORED):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=compression) as archive:
        for name, value in parts.items():
            archive.writestr(name, value)
    return output.getvalue()


def word(text="Hello"):
    return f'<w:document xmlns:w="{preview.W[1:-1]}"><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:document>'


def test_docx_text_and_ignored_external_relationships():
    data = package(
        {
            "word/document.xml": word(),
            "word/_rels/document.xml.rels": '<Relationship Target="https://example.invalid/private" TargetMode="External"/>',
            "word/vbaProject.bin": b"unexecuted",
        }
    )
    assert preview.extract_office_preview(data, MIMES["docx"]) == preview.OfficePreview(
        "Hello\n", False
    )


def test_xlsx_shared_inline_and_cached_formula_values():
    data = package(
        {
            "xl/sharedStrings.xml": f'<sst xmlns="{preview.S[1:-1]}"><si><t>Shared</t></si></sst>',
            "xl/worksheets/sheet1.xml": f'''<worksheet xmlns="{preview.S[1:-1]}"><row r="999999999">
        <c t="s"><v>0</v></c><c t="inlineStr"><is><t>Inline</t></is></c>
        <c><f>WEBSERVICE("https://example.invalid")</f><v>42</v></c></row></worksheet>''',
        }
    )
    result = preview.extract_office_preview(data, MIMES["xlsx"])
    assert result.text == "Sheet 1\nShared\tInline\t42\t\n"


def test_pptx_numeric_slide_order():
    def slide(text):
        return f'<s xmlns:a="{preview.A[1:-1]}"><a:p><a:r><a:t>{text}</a:t></a:r></a:p></s>'

    data = package({"ppt/slides/slide10.xml": slide("Ten"), "ppt/slides/slide2.xml": slide("Two")})
    assert (
        preview.extract_office_preview(data, MIMES["pptx"]).text == "Slide 1\nTwo\nSlide 2\nTen\n"
    )


@pytest.mark.parametrize(
    "doctype",
    [
        '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]>',
        '<!DOCTYPE x SYSTEM "https://example.invalid/evil.dtd">',
        '<!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY secret "&a;&a;">]>',
    ],
)
def test_dtd_and_entities_rejected(doctype):
    data = package({"word/document.xml": doctype + word("&secret;")})
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data, MIMES["docx"])


@pytest.mark.parametrize(
    "parts",
    [
        {"word/document.xml": "<broken"},
        {"other.xml": "<x/>"},
        {"word/document.xml": word(), "../evil": "bad"},
        {"word/document.xml": word(), "/evil": "bad"},
        {"word/document.xml": word(), "a\\evil": "bad"},
    ],
)
def test_invalid_packages(parts):
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(package(parts), MIMES["docx"])


@pytest.mark.parametrize(
    ("constant", "limit", "parts"),
    [
        ("MAX_ARCHIVE_BYTES", 10, {"word/document.xml": word()}),
        ("MAX_ENTRIES", 1, {"word/document.xml": word(), "extra": "x"}),
        ("MAX_ENTRY_BYTES", 10, {"word/document.xml": word()}),
        ("MAX_EXPANDED_BYTES", 10, {"word/document.xml": word()}),
        ("MAX_XML_NODES", 1, {"word/document.xml": word()}),
        ("MAX_PARTS", 1, {"ppt/slides/slide1.xml": "<x/>", "ppt/slides/slide2.xml": "<x/>"}),
    ],
)
def test_limits(monkeypatch, constant, limit, parts):
    monkeypatch.setattr(preview, constant, limit)
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(
            package(parts), MIMES["pptx" if constant == "MAX_PARTS" else "docx"]
        )


def test_compression_bomb_even_in_unused_part():
    data = package({"word/document.xml": word(), "unused": "a" * 100_000}, zipfile.ZIP_DEFLATED)
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data, MIMES["docx"])


def test_text_is_bounded_and_truncation_explicit(monkeypatch):
    monkeypatch.setattr(preview, "MAX_TEXT_CHARS", 4)
    result = preview.extract_office_preview(package({"word/document.xml": word()}), MIMES["docx"])
    assert result == preview.OfficePreview("Hell", True)


@pytest.mark.parametrize(("data", "mime"), [(b"bad", MIMES["docx"]), (b"", "application/msword")])
def test_invalid_input(data, mime):
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data, mime)


def test_invalid_shared_reference():
    data = package(
        {
            "xl/worksheets/sheet1.xml": f'<worksheet xmlns="{preview.S[1:-1]}"><row><c t="s"><v>1</v></c></row></worksheet>'
        }
    )
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data, MIMES["xlsx"])


def test_duplicate_zip_members():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("word/document.xml", word())
        with pytest.warns(UserWarning, match="Duplicate name"):
            archive.writestr("word/document.xml", word("Other"))
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(output.getvalue(), MIMES["docx"])


def test_excessive_xml_depth():
    data = package({"word/document.xml": "<x>" * 300 + "</x>" * 300})
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data, MIMES["docx"])


def test_corrupt_crc():
    data = package({"word/document.xml": word()})
    data = data.replace(b"Hello", b"Jello", 1)
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data, MIMES["docx"])


def test_complete_archive_required():
    data = package({"word/document.xml": word()})
    with pytest.raises(preview.OfficePreviewError):
        preview.extract_office_preview(data[:-10], MIMES["docx"])
