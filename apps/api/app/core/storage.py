"""
S3-compatible object storage.

One code path for every provider: MinIO locally, Supabase Storage (S3 API) and
Cloudflare R2. boto3 is used because it accepts endpoints with a path
component (Supabase's `/storage/v1/s3`), which the minio SDK does not.

Provider selection (`STORAGE_PROVIDER`):

- ``s3`` (default): the `MINIO_*` settings (MinIO locally, Supabase Storage in
  production today).
- ``r2``: Cloudflare R2 via `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`. Bucket names still come from the `MINIO_BUCKET_*`
  and `FILES_BUCKET` settings, set per environment.

Migration window (`STORAGE_LEGACY_FALLBACK=true`): the previous `MINIO_*`
storage stays reachable. Reads and download links fall back to it for objects
not copied yet (`STORAGE_LEGACY_BUCKETS` maps new bucket -> old bucket name),
and deletes remove both copies so an erased file never survives in the old
provider. Uploads only ever go to the primary provider.
"""

import asyncio
import json
from functools import lru_cache
from typing import Any

import boto3
import structlog
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import settings

logger = structlog.get_logger(__name__)

_TIMEOUTS = {
    "connect_timeout": 10,
    "read_timeout": 30,
    "retries": {"total_max_attempts": 3, "mode": "standard"},
}


def _legacy_endpoint_url() -> str:
    scheme = "https" if settings.MINIO_SECURE else "http"
    endpoint = settings.MINIO_ENDPOINT
    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        return endpoint
    return f"{scheme}://{endpoint}"


def _endpoint_url() -> str:
    """Endpoint of the primary provider (kept for callers that need it)."""
    if settings.STORAGE_PROVIDER == "r2":
        return settings.R2_ENDPOINT.rstrip("/")
    return _legacy_endpoint_url()


def _client(
    endpoint_url: str,
    key_id: str,
    secret: str,
    *,
    region: str | None = None,
    timeouts: dict[str, Any] | None = None,
):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name=region,
        # Bounded: boto3's defaults (60 s connect/read plus retries) would hold a
        # request worker thread for minutes when storage is down (PERF-01).
        config=BotoConfig(
            signature_version="s3v4", s3={"addressing_style": "path"}, **(timeouts or _TIMEOUTS)
        ),
    )


@lru_cache
def get_s3_client():
    """Cached client for the primary provider."""
    if settings.STORAGE_PROVIDER == "r2":
        return _client(
            settings.R2_ENDPOINT.rstrip("/"),
            settings.R2_ACCESS_KEY_ID,
            settings.R2_SECRET_ACCESS_KEY,
            region="auto",
        )
    return _client(_legacy_endpoint_url(), settings.MINIO_ACCESS_KEY, settings.MINIO_SECRET_KEY)


@lru_cache
def get_legacy_client():
    """Cached client for the previous provider during a migration window, else None."""
    if not legacy_fallback_enabled():
        return None
    return _client(_legacy_endpoint_url(), settings.MINIO_ACCESS_KEY, settings.MINIO_SECRET_KEY)


def legacy_fallback_enabled() -> bool:
    return settings.STORAGE_PROVIDER == "r2" and settings.STORAGE_LEGACY_FALLBACK


def _r2_names() -> dict[str, str]:
    """Logical (MINIO_*/FILES_BUCKET) bucket name -> R2 bucket name."""
    pairs = (
        (settings.MINIO_BUCKET_RESUMES, settings.R2_BUCKET_RESUMES),
        (settings.MINIO_BUCKET_ASSETS, settings.R2_BUCKET_ASSETS),
        (settings.MINIO_BUCKET_DELIVERABLES, settings.R2_BUCKET_DELIVERABLES),
        (settings.FILES_BUCKET, settings.R2_BUCKET_FILES),
    )
    return {old: new for old, new in pairs if new}


def primary_bucket(bucket_name: str) -> str:
    """The bucket to use on the primary provider for a configured bucket name."""
    if settings.STORAGE_PROVIDER == "r2":
        return _r2_names().get(bucket_name, bucket_name)
    return bucket_name


def legacy_bucket(bucket_name: str) -> str:
    """The bucket that held this data before the migration: the configured
    (MINIO_*) name for callers, unless STORAGE_LEGACY_BUCKETS maps it."""
    if bucket_name in _r2_names():
        return bucket_name
    try:
        mapping = (
            json.loads(settings.STORAGE_LEGACY_BUCKETS) if settings.STORAGE_LEGACY_BUCKETS else {}
        )
    except ValueError:
        mapping = {}
    value = mapping.get(bucket_name) if isinstance(mapping, dict) else None
    return value if isinstance(value, str) and value else bucket_name


def _missing(exc: Exception) -> bool:
    if isinstance(exc, ClientError):
        code = str(exc.response.get("Error", {}).get("Code", ""))
        return code in {"404", "NoSuchKey", "NotFound"}
    return False


def object_exists(client: Any, bucket_name: str, object_name: str) -> bool:
    try:
        client.head_object(Bucket=bucket_name, Key=object_name)
        return True
    except Exception as exc:
        if _missing(exc):
            return False
        raise


def ensure_bucket_exists(bucket_name: str) -> None:
    """Create the bucket if missing (MinIO/dev). R2 and Supabase buckets are
    provisioned by the owner and scoped tokens cannot create them."""
    client = get_s3_client()
    bucket_name = primary_bucket(bucket_name)
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError:
        if settings.STORAGE_PROVIDER == "r2":
            logger.error(
                "Storage bucket missing; create it in the provider console", bucket=bucket_name
            )
            raise
        try:
            client.create_bucket(Bucket=bucket_name)
            logger.info("Storage bucket created", bucket=bucket_name)
        except ClientError as e:
            logger.error("Failed to ensure bucket exists", bucket=bucket_name, error=str(e))
            raise


def generate_presigned_url(
    bucket_name: str, object_name: str, expires_hours: float = 1
) -> str | None:
    """Presigned GET URL. During a migration window, an object not yet copied to
    the primary provider is signed against the legacy provider instead."""
    expires = int(expires_hours * 3600)
    client = get_s3_client()
    primary = primary_bucket(bucket_name)
    try:
        legacy = get_legacy_client()
        if legacy is not None and not object_exists(client, primary, object_name):
            old_bucket = legacy_bucket(bucket_name)
            if object_exists(legacy, old_bucket, object_name):
                return str(
                    legacy.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": old_bucket, "Key": object_name},
                        ExpiresIn=expires,
                    )
                )
        return str(
            client.generate_presigned_url(
                "get_object", Params={"Bucket": primary, "Key": object_name}, ExpiresIn=expires
            )
        )
    except Exception as e:
        logger.error(
            "Failed to generate presigned URL", bucket=bucket_name, object=object_name, error=str(e)
        )
        return None


class StorageService:
    """Async facade over the synchronous boto3 clients: every network call runs
    in a worker thread so a slow upload never blocks the event loop (PERF-01)."""

    legacy: Any = None

    def __init__(self):
        self.client = get_s3_client()
        self.legacy = get_legacy_client()

    async def upload_file(
        self, bucket_name: str, object_name: str, data: bytes, content_type: str = "application/pdf"
    ) -> str:
        try:
            await asyncio.to_thread(ensure_bucket_exists, bucket_name)
            await asyncio.to_thread(
                self.client.put_object,
                Bucket=primary_bucket(bucket_name),
                Key=object_name,
                Body=data,
                ContentType=content_type,
            )
            # Callers store the object key; this URL is informational only.
            return f"{_endpoint_url()}/{primary_bucket(bucket_name)}/{object_name}"
        except Exception as e:
            logger.error(
                "Storage upload failed", bucket=bucket_name, object=object_name, error=str(e)
            )
            raise RuntimeError("Object storage upload failed") from e

    async def read_file(self, bucket_name: str, object_name: str, max_bytes: int) -> bytes | None:
        """Read at most max_bytes of one object (primary, then legacy). Returns None
        (and logs) instead of raising."""

        def _read(client: Any, bucket: str) -> bytes:
            obj = client.get_object(
                Bucket=bucket, Key=object_name, Range=f"bytes=0-{max_bytes - 1}"
            )
            body: bytes = obj["Body"].read(max_bytes)
            return body

        try:
            return await asyncio.to_thread(_read, self.client, primary_bucket(bucket_name))
        except Exception as e:
            if self.legacy is not None and _missing(e):
                try:
                    return await asyncio.to_thread(_read, self.legacy, legacy_bucket(bucket_name))
                except Exception as legacy_error:
                    logger.error(
                        "Storage read failed (legacy)", bucket=bucket_name, error=str(legacy_error)
                    )
                    return None
            logger.error("Storage read failed", bucket=bucket_name, error=str(e))
            return None

    async def delete_file(self, bucket_name: str, object_name: str) -> bool:
        """Delete one object everywhere it may exist. Returns False (and logs) if the
        primary delete failed or a legacy copy could not be removed."""
        ok = True
        try:
            await asyncio.to_thread(
                self.client.delete_object, Bucket=primary_bucket(bucket_name), Key=object_name
            )
        except Exception as e:
            logger.error("Storage delete failed", bucket=bucket_name, error=str(e))
            ok = False
        if self.legacy is not None:
            try:
                await asyncio.to_thread(
                    self.legacy.delete_object, Bucket=legacy_bucket(bucket_name), Key=object_name
                )
            except Exception as e:
                logger.error("Storage delete failed (legacy)", bucket=bucket_name, error=str(e))
                ok = False
        return ok


def get_storage() -> StorageService:
    return StorageService()
