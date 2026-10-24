"""Input rules for deliverables: commit references, demo links and document files.

Nothing here fetches a URL. Links are recorded and opened by the reviewer's
browser, so the API can never be used to reach internal networks (SSRF).
"""

import io
import ipaddress
import re
import zipfile
from urllib.parse import urlsplit

COMMIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
GITHUB_REPO_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$")
BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]{1,255}$")

MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

# extension -> (canonical MIME, container check)
DOCUMENT_TYPES: dict[str, tuple[str, str]] = {
    "pdf": ("application/pdf", "pdf"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "ooxml"),
    "pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "ooxml"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ooxml"),
    "txt": ("text/plain", "text"),
    "md": ("text/markdown", "text"),
    "csv": ("text/csv", "text"),
}
_OOXML_ROOT = {"docx": "word/", "pptx": "ppt/", "xlsx": "xl/"}


def normalize_commit_sha(value: str) -> str:
    sha = value.strip().lower()
    if not COMMIT_SHA_RE.match(sha):
        raise ValueError("commit must be a full 40-character SHA")
    return sha


def validate_repo_url(value: str) -> str:
    url = value.strip().removesuffix(".git")
    if not GITHUB_REPO_RE.match(url):
        raise ValueError("repository must be an https://github.com/<owner>/<repo> URL")
    return url.rstrip("/")


def validate_branch(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    branch = value.strip()
    if not BRANCH_RE.match(branch) or ".." in branch:
        raise ValueError("invalid branch name")
    return branch


def validate_demo_url(value: str) -> str:
    """http(s) only, and never a loopback/private/link-local host."""
    url = value.strip()
    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("demo link must be an http:// or https:// URL")
    if parts.username or parts.password:
        raise ValueError("demo link must not contain credentials")
    host = parts.hostname.lower()
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".internal"):
        raise ValueError("demo link must be publicly reachable")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return url
    if not ip.is_global:
        raise ValueError("demo link must be publicly reachable")
    return url


def safe_file_name(name: str) -> str:
    base = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:200]
    return base or "document"


def check_document(file_name: str, data: bytes) -> tuple[str, str]:
    """Return (extension, canonical MIME) or raise ValueError.

    The type comes from the extension *and* the content must match it, so a
    renamed executable or a macro-enabled Office file is refused. Active content
    is never executed; Office files are only inspected as zip listings.
    """
    if not data:
        raise ValueError("file is empty")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise ValueError("file is larger than 15 MB")
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext not in DOCUMENT_TYPES:
        raise ValueError("allowed types: " + ", ".join(sorted(DOCUMENT_TYPES)))
    mime, container = DOCUMENT_TYPES[ext]
    if container == "pdf" and not data.startswith(b"%PDF-"):
        raise ValueError("file content does not match its .pdf extension")
    if container == "text":
        if b"\x00" in data:
            raise ValueError("text file contains binary data")
        try:
            data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("text file must be UTF-8") from exc
    if container == "ooxml":
        if not data.startswith(b"PK\x03\x04"):
            raise ValueError(f"file content does not match its .{ext} extension")
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = zf.namelist()
        except zipfile.BadZipFile as exc:
            raise ValueError("file is not a valid Office document") from exc
        if "[Content_Types].xml" not in names or not any(n.startswith(_OOXML_ROOT[ext]) for n in names):
            raise ValueError(f"file content does not match its .{ext} extension")
        if any(n.lower().endswith("vbaproject.bin") for n in names):
            raise ValueError("macro-enabled documents are not accepted")
    return ext, mime
