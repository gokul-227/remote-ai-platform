"""Copy backup archives to an S3-compatible bucket (Oracle Object Storage) and keep the newest N.

  python offsite.py ensure-bucket            # creates ARCHIVE_BUCKET (private) if missing
  python offsite.py upload <archive>         # uploads <archive> and <archive>.sha256
  python offsite.py prune                    # keeps the newest ARCHIVE_KEEP (default 14) archives
  python offsite.py fetch <name> <dest-dir>  # downloads an archive and its .sha256
  python offsite.py list

Env: ARCHIVE_S3_ENDPOINT, ARCHIVE_S3_REGION, ARCHIVE_S3_ACCESS_KEY, ARCHIVE_S3_SECRET_KEY,
ARCHIVE_BUCKET, ARCHIVE_PREFIX (default "db/"), ARCHIVE_KEEP. Never prints credentials.
"""

import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

SUFFIX = ".tar.enc"


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["ARCHIVE_S3_ENDPOINT"],
        region_name=os.environ["ARCHIVE_S3_REGION"],
        aws_access_key_id=os.environ["ARCHIVE_S3_ACCESS_KEY"],
        aws_secret_access_key=os.environ["ARCHIVE_S3_SECRET_KEY"],
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            # OCI's S3 compatibility layer rejects the newer default CRC checksum headers.
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def _archives(s3, bucket: str, prefix: str) -> list[str]:
    keys: list[str] = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        keys += [o["Key"] for o in page.get("Contents", []) if o["Key"].endswith(SUFFIX)]
    return sorted(keys)  # names embed a UTC timestamp, so lexical order is time order


def main() -> int:
    s3, bucket = _client(), os.environ["ARCHIVE_BUCKET"]
    prefix = os.environ.get("ARCHIVE_PREFIX", "db/")
    cmd = sys.argv[1]
    if cmd == "ensure-bucket":
        try:
            s3.head_bucket(Bucket=bucket)
            print(f"bucket {bucket}: exists")
        except ClientError:
            s3.create_bucket(Bucket=bucket)  # OCI: private, default storage tier
            print(f"bucket {bucket}: created")
    elif cmd == "upload":
        archive = Path(sys.argv[2])
        for f in (archive, Path(f"{archive}.sha256")):
            s3.upload_file(str(f), bucket, prefix + f.name)
        print(f"offsite: uploaded {prefix}{archive.name}")
    elif cmd == "prune":
        keep = int(os.environ.get("ARCHIVE_KEEP", "14"))
        old = _archives(s3, bucket, prefix)[:-keep] if keep > 0 else []
        for key in old:
            s3.delete_object(Bucket=bucket, Key=key)
            s3.delete_object(Bucket=bucket, Key=key + ".sha256")
        print(f"offsite: pruned {len(old)}, kept newest {keep}")
    elif cmd == "fetch":
        name, dest = sys.argv[2], Path(sys.argv[3])
        dest.mkdir(parents=True, exist_ok=True)
        for n in (name, name + ".sha256"):
            s3.download_file(bucket, prefix + n, str(dest / n))
        print(f"offsite: fetched {name}")
    elif cmd == "list":
        for key in _archives(s3, bucket, prefix):
            print(key)
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
