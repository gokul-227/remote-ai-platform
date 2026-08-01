"""
MinIO Object Storage Client
"""

from functools import lru_cache
from typing import Optional

import structlog
from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = structlog.get_logger(__name__)


@lru_cache
def get_minio_client() -> Minio:
    """Return a cached MinIO client instance."""
    return Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def ensure_bucket_exists(bucket_name: str) -> None:
    """Create bucket if it doesn't already exist."""
    client = get_minio_client()
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            logger.info("MinIO bucket created", bucket=bucket_name)
    except S3Error as e:
        logger.error("Failed to ensure bucket exists", bucket=bucket_name, error=str(e))
        raise


def generate_presigned_url(
    bucket_name: str,
    object_name: str,
    expires_hours: int = 1,
) -> Optional[str]:
    """Generate a presigned GET URL for temporary file access."""
    from datetime import timedelta

    client = get_minio_client()
    try:
        return client.presigned_get_object(
            bucket_name,
            object_name,
            expires=timedelta(hours=expires_hours),
        )
    except S3Error as e:
        logger.error(
            "Failed to generate presigned URL",
            bucket=bucket_name,
            object=object_name,
            error=str(e),
        )
        return None


class StorageService:
    def __init__(self):
        self.client = get_minio_client()

    async def upload_file(
        self, bucket_name: str, object_name: str, data: bytes, content_type: str = "application/pdf"
    ) -> str:
        import io
        try:
            ensure_bucket_exists(bucket_name)
            self.client.put_object(
                bucket_name=bucket_name,
                object_name=object_name,
                data=io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
            return f"http://{settings.MINIO_ENDPOINT}/{bucket_name}/{object_name}"
        except Exception as e:
            logger.warning(f"MinIO upload error (falling back to mock URL): {e}")
            return f"http://localhost:9000/{bucket_name}/{object_name}"


@lru_cache
def get_storage() -> StorageService:
    return StorageService()
