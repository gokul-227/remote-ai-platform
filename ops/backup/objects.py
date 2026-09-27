"""Copy S3-compatible buckets to a folder and back, with a SHA-256 and metadata per object.

  python objects.py download <dest-dir>   # reads S3_* env, writes <dest>/<bucket>/<key> + <dest>/objects.json
  python objects.py upload <src-dir>      # reads S3_* env, uploads every object listed in objects.json
  python objects.py verify <dir>          # prints "<sha256>  <bucket>/<key>" for comparison
  python objects.py preflight             # refuses (exit 4) unless every target bucket is empty or absent
  python objects.py refcheck <dir> <refs> # prints stored references (one per line) with no object in the backup

Env: S3_ENDPOINT (http(s)://host:port), S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKETS (comma list), S3_REGION (optional).

Object keys come from the remote store and are never trusted as file paths
(OPS-07): absolute keys, `..`/`.` segments, empty segments, backslashes and
control characters are refused, and every destination is checked to stay
inside the backup folder after resolution.
"""

import hashlib
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config

MANIFEST = "objects.json"


class UnsafeKey(ValueError):
    pass


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["S3_ENDPOINT"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["S3_SECRET_KEY"],
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def _buckets() -> list[str]:
    buckets = [b.strip() for b in os.environ["S3_BUCKETS"].split(",") if b.strip()]
    for b in buckets:
        _check_segment(b)
    return buckets


def _check_segment(part: str) -> None:
    if part in ("", ".", "..") or any(ord(c) < 32 or c in "\\\x7f" for c in part):
        raise UnsafeKey(f"unsafe path segment {part!r}")


def safe_target(root: Path, bucket: str, key: str) -> Path:
    """The local path for bucket/key, guaranteed to stay inside root."""
    if not key or key.startswith("/"):
        raise UnsafeKey(f"unsafe object key {key!r}")
    for part in [bucket, *key.split("/")]:
        _check_segment(part)
    base = root.resolve()
    target = (base / bucket / key).resolve()
    if base not in target.parents:
        raise UnsafeKey(f"object key {key!r} escapes the backup folder")
    return target


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(dest: Path) -> int:
    s3, entries = _client(), []
    for bucket in _buckets():
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith("/") and obj.get("Size", 0) == 0:
                    continue  # folder placeholder, no content
                target = safe_target(dest, bucket, key)
                target.parent.mkdir(parents=True, exist_ok=True)
                head = s3.head_object(Bucket=bucket, Key=key)
                s3.download_file(bucket, key, str(target))
                entries.append(
                    {
                        "bucket": bucket,
                        "key": key,
                        "size": target.stat().st_size,
                        "sha256": _sha256(target),
                        "content_type": head.get("ContentType"),
                        "cache_control": head.get("CacheControl"),
                        "content_disposition": head.get("ContentDisposition"),
                        "metadata": head.get("Metadata") or {},
                        "last_modified": obj["LastModified"].isoformat(),
                    }
                )
    (dest / MANIFEST).write_text(json.dumps(entries, indent=1, sort_keys=True))
    return len(entries)


def _manifest(src: Path) -> list[dict]:
    path = src / MANIFEST
    if path.exists():
        return json.loads(path.read_text())
    # Archives made before objects.json existed: content only, no metadata.
    entries = []
    for bucket in _buckets():
        root = src / bucket
        for p in sorted(q for q in root.rglob("*") if q.is_file()) if root.exists() else []:
            entries.append({"bucket": bucket, "key": p.relative_to(root).as_posix(), "metadata": {}})
    return entries


def upload(src: Path) -> int:
    s3, n = _client(), 0
    wanted = set(_buckets())
    for bucket in sorted(wanted):
        try:
            s3.head_bucket(Bucket=bucket)
        except Exception:
            s3.create_bucket(Bucket=bucket)
    for entry in _manifest(src):
        if entry["bucket"] not in wanted:
            continue
        path = safe_target(src, entry["bucket"], entry["key"])
        if entry.get("sha256") and _sha256(path) != entry["sha256"]:
            raise SystemExit(f"checksum mismatch for {entry['bucket']}/{entry['key']}")
        extra: dict = {"Metadata": entry.get("metadata") or {}}
        for field, arg in (
            ("content_type", "ContentType"),
            ("cache_control", "CacheControl"),
            ("content_disposition", "ContentDisposition"),
        ):
            if entry.get(field):
                extra[arg] = entry[field]
        s3.upload_file(str(path), entry["bucket"], entry["key"], ExtraArgs=extra)
        n += 1
    return n


def preflight() -> None:
    """Restores go only into empty or missing buckets, never over live objects."""
    s3, busy = _client(), []
    for bucket in _buckets():
        try:
            resp = s3.list_objects_v2(Bucket=bucket, MaxKeys=1)
        except s3.exceptions.NoSuchBucket:
            continue
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, "response", {}).get("Error", {}).get("Code") in ("NoSuchBucket", "404"):
                continue
            raise
        if resp.get("KeyCount", 0):
            busy.append(bucket)
    if busy:
        sys.stderr.write(f"refusing: target bucket(s) not empty: {', '.join(busy)}\n")
        sys.exit(4)
    print("target buckets: empty")


def refcheck(src: Path, refs_file: Path) -> None:
    """References in the restored database with no object in the backup.

    The dump and the object listing are taken at different moments; an object
    deleted in between leaves a dangling reference. Keys are matched exactly
    or as the tail of a stored URL (older rows kept a full URL)."""
    keys = {f"{e['bucket']}/{e['key']}" for e in _manifest(src)}
    bare = {e["key"] for e in _manifest(src)}
    for ref in (line.strip() for line in refs_file.read_text().splitlines()):
        if ref and ref not in bare and not any(ref.endswith("/" + k) for k in keys):
            print(ref)


def verify(root: Path) -> None:
    for path in sorted(p for p in root.rglob("*") if p.is_file() and p.name != MANIFEST):
        print(f"{_sha256(path)}  {path.relative_to(root).as_posix()}")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "download":
        print(download(Path(sys.argv[2])))
    elif cmd == "upload":
        print(upload(Path(sys.argv[2])))
    elif cmd == "verify":
        verify(Path(sys.argv[2]))
    elif cmd == "preflight":
        preflight()
    elif cmd == "refcheck":
        refcheck(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        sys.exit(f"unknown command {cmd}")
