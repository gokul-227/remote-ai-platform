"""Copy S3-compatible buckets to a folder and back, with a SHA-256 per object.

  python objects.py download <dest-dir>   # reads S3_* env, writes <dest>/<bucket>/<key>
  python objects.py upload <src-dir>      # reads S3_* env, uploads every <bucket>/<key>
  python objects.py verify <dir>          # prints "<sha256>  <bucket>/<key>" for comparison

Env: S3_ENDPOINT (http(s)://host:port), S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKETS (comma list), S3_REGION (optional).
"""

import hashlib
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config


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
    return [b.strip() for b in os.environ["S3_BUCKETS"].split(",") if b.strip()]


def download(dest: Path) -> int:
    s3, n = _client(), 0
    for bucket in _buckets():
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for obj in page.get("Contents", []):
                target = dest / bucket / obj["Key"]
                target.parent.mkdir(parents=True, exist_ok=True)
                s3.download_file(bucket, obj["Key"], str(target))
                n += 1
    return n


def upload(src: Path) -> int:
    s3, n = _client(), 0
    for bucket in _buckets():
        root = src / bucket
        try:
            s3.head_bucket(Bucket=bucket)
        except Exception:
            s3.create_bucket(Bucket=bucket)
        for path in sorted(p for p in root.rglob("*") if p.is_file()) if root.exists() else []:
            s3.upload_file(str(path), bucket, path.relative_to(root).as_posix())
            n += 1
    return n


def verify(root: Path) -> None:
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        print(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root).as_posix()}")


if __name__ == "__main__":
    cmd, where = sys.argv[1], Path(sys.argv[2])
    if cmd == "download":
        print(download(where))
    elif cmd == "upload":
        print(upload(where))
    elif cmd == "verify":
        verify(where)
    else:
        sys.exit(f"unknown command {cmd}")
