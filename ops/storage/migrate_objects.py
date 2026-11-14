"""Copy every object from the old S3-compatible storage to the new one, verified.

Dry run by default: prints what would be copied and changes nothing.

  python ops/storage/migrate_objects.py                # dry run
  python ops/storage/migrate_objects.py --apply        # copy missing/changed objects
  python ops/storage/migrate_objects.py --verify       # compare every object, change nothing

Env (never committed; export from Infisical for the target environment):
  SRC_ENDPOINT, SRC_ACCESS_KEY, SRC_SECRET_KEY         old provider (e.g. Supabase Storage S3)
  DST_ENDPOINT, DST_ACCESS_KEY, DST_SECRET_KEY         new provider (Cloudflare R2)
  BUCKETS   comma list of "old=new" pairs, e.g. "resumes=rap-prod-resumes,assets=rap-prod-assets"

Verification compares size and SHA-256 of the bytes (ETags differ between
providers and for multipart uploads). Objects already present with the same
size and hash are skipped, so the script is safe to re-run. It never deletes
anything from either side; switch STORAGE_PROVIDER=r2 with
STORAGE_LEGACY_FALLBACK=true first, run --apply, then --verify, and only then
turn the fallback off.
"""

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass, field

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

MAX_OBJECT_BYTES = 512 * 1024 * 1024  # refuse anything unexpectedly large rather than buffering it


def client(prefix: str):
    endpoint = os.environ[f"{prefix}_ENDPOINT"]
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ[f"{prefix}_ACCESS_KEY"],
        aws_secret_access_key=os.environ[f"{prefix}_SECRET_KEY"],
        region_name="auto" if "r2.cloudflarestorage.com" in endpoint else None,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 5, "mode": "standard"},
        ),
    )


def pairs(spec: str) -> list[tuple[str, str]]:
    out = []
    for item in [p.strip() for p in spec.split(",") if p.strip()]:
        old, _, new = item.partition("=")
        out.append((old.strip(), (new or old).strip()))
    if not out:
        raise SystemExit("BUCKETS is empty")
    return out


def keys(c, bucket: str):
    token = None
    while True:
        kwargs = {"Bucket": bucket, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        page = c.list_objects_v2(**kwargs)
        for obj in page.get("Contents", []):
            yield obj["Key"], int(obj["Size"])
        if not page.get("IsTruncated"):
            return
        token = page["NextContinuationToken"]


def fetch(c, bucket: str, key: str) -> tuple[bytes, str]:
    obj = c.get_object(Bucket=bucket, Key=key)
    data = obj["Body"].read(MAX_OBJECT_BYTES + 1)
    if len(data) > MAX_OBJECT_BYTES:
        raise ValueError(f"{bucket}/{key} is larger than {MAX_OBJECT_BYTES} bytes")
    return data, obj.get("ContentType") or "application/octet-stream"


def digest_or_none(c, bucket: str, key: str) -> tuple[int, str] | None:
    try:
        data, _ = fetch(c, bucket, key)
    except ClientError as e:
        if str(e.response.get("Error", {}).get("Code")) in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise
    return len(data), hashlib.sha256(data).hexdigest()


@dataclass
class Report:
    checked: int = 0
    copied: int = 0
    skipped: int = 0
    mismatched: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def run(src, dst, buckets: list[tuple[str, str]], mode: str) -> Report:
    r = Report()
    for old, new in buckets:
        for key, size in keys(src, old):
            r.checked += 1
            name = f"{old}/{key} -> {new}/{key}"
            try:
                data, ctype = fetch(src, old, key)
                want = (len(data), hashlib.sha256(data).hexdigest())
                have = digest_or_none(dst, new, key)
                if have == want:
                    r.skipped += 1
                    continue
                if mode == "verify":
                    r.mismatched.append(name)
                    continue
                if mode == "dry-run":
                    print(f"would copy {name} ({size} bytes)")
                    r.copied += 1
                    continue
                dst.put_object(Bucket=new, Key=key, Body=data, ContentType=ctype)
                if digest_or_none(dst, new, key) != want:
                    r.mismatched.append(name)
                else:
                    r.copied += 1
            except Exception as e:  # keep going; report every failure at the end
                r.errors.append(f"{name}: {type(e).__name__}")
    return r


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true")
    g.add_argument("--verify", action="store_true")
    args = ap.parse_args()
    mode = "apply" if args.apply else "verify" if args.verify else "dry-run"
    report = run(client("SRC"), client("DST"), pairs(os.environ.get("BUCKETS", "")), mode)
    print(json.dumps({"mode": mode, **report.__dict__}, indent=2))
    return 1 if report.errors or report.mismatched else 0


if __name__ == "__main__":
    sys.exit(main())
