"""
S3-Compatible Object Storage Client

Uses boto3 rather than the minio SDK specifically because boto3 supports
S3-compatible endpoints that include a path component (e.g. Supabase
Storage's `https://<project>.supabase.co/storage/v1/s3`), which the minio
SDK's Minio() client does not — it only accepts a bare host:port. This
keeps local dev (MinIO) and the $0 production deploy (Supabase Storage)
on the same code path. See docs/DEPLOYMENT_ZERO_COST.md.
"""

from functools import lru_cache
from typing import Optional

import boto3
import structlog
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import settings

logger = structlog.get_logger(__name__)


def _endpoint_url() -> str:
    scheme = "https" if settings.MINIO_SECURE else "http"
    endpoint = settings.MINIO_ENDPOINT
    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        return endpoint
    return f"{scheme}://{endpoint}"


@lru_cache
def get_s3_client():
    """Return a cached boto3 S3-compatible client."""
    return boto3.client(
        "s3",
        endpoint_url=_endpoint_url(),
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def ensure_bucket_exists(bucket_name: str) -> None:
    """Create bucket if it doesn't already exist."""
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=bucket_name)
    except ClientError:
        try:
            client.create_bucket(Bucket=bucket_name)
            logger.info("Storage bucket created", bucket=bucket_name)
        except ClientError as e:
            logger.error("Failed to ensure bucket exists", bucket=bucket_name, error=str(e))
            raise


def generate_presigned_url(
    bucket_name: str,
    object_name: str,
    expires_hours: int = 1,
) -> Optional[str]:
    """Generate a presigned GET URL for temporary file access."""
    client = get_s3_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket_name, "Key": object_name},
            ExpiresIn=expires_hours * 3600,
        )
    except ClientError as e:
        logger.error(
            "Failed to generate presigned URL",
            bucket=bucket_name,
            object=object_name,
            error=str(e),
        )
        return None


class StorageService:
    def __init__(self):
        self.client = get_s3_client()

    async def upload_file(
        self, bucket_name: str, object_name: str, data: bytes, content_type: str = "application/pdf"
    ) -> str:
        try:
            ensure_bucket_exists(bucket_name)
            self.client.put_object(
                Bucket=bucket_name,
                Key=object_name,
                Body=data,
                ContentType=content_type,
            )
            return f"{settings.MINIO_PUBLIC_ENDPOINT.rstrip('/')}/{bucket_name}/{object_name}"
        except Exception as e:
            logger.error("Storage upload failed", bucket=bucket_name, object=object_name, error=str(e))
            raise RuntimeError("Object storage upload failed") from e


@lru_cache
def get_storage() -> StorageService:
    return StorageService()
