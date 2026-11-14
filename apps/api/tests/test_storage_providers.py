"""Storage provider selection, migration-window fallback and the object copy tool.
boto3 clients are replaced by in-memory fakes."""

import importlib.util
import io
import pathlib

import pytest
from botocore.exceptions import ClientError

from app.core import storage
from app.core.config import settings


def _missing() -> ClientError:
    return ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")


class FakeS3:
    def __init__(self, name: str) -> None:
        self.name = name
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}
        self.deleted: list[tuple[str, str]] = []

    def head_object(self, Bucket, Key):  # noqa: N803
        if (Bucket, Key) not in self.objects:
            raise _missing()
        return {}

    def head_bucket(self, Bucket):  # noqa: N803
        return {}

    def generate_presigned_url(self, op, Params, ExpiresIn):  # noqa: N803
        return f"https://{self.name}/{Params['Bucket']}/{Params['Key']}?e={ExpiresIn}"

    def get_object(self, Bucket, Key, Range=None):  # noqa: N803
        if (Bucket, Key) not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        data, ctype = self.objects[(Bucket, Key)]
        return {"Body": io.BytesIO(data), "ContentType": ctype}

    def put_object(self, Bucket, Key, Body, ContentType="application/octet-stream"):  # noqa: N803
        self.objects[(Bucket, Key)] = (Body, ContentType)

    def delete_object(self, Bucket, Key):  # noqa: N803
        self.deleted.append((Bucket, Key))
        self.objects.pop((Bucket, Key), None)

    def list_objects_v2(self, Bucket, MaxKeys=1000, ContinuationToken=None):  # noqa: N803
        keys = sorted(k for b, k in self.objects if b == Bucket)
        start = int(ContinuationToken or 0)
        page = keys[start : start + 2]  # tiny pages exercise pagination
        more = start + 2 < len(keys)
        out = {
            "Contents": [{"Key": k, "Size": len(self.objects[(Bucket, k)][0])} for k in page],
            "IsTruncated": more,
        }
        if more:
            out["NextContinuationToken"] = str(start + 2)
        return out


@pytest.fixture
def providers(monkeypatch):
    new, old = FakeS3("r2"), FakeS3("supabase")
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "r2")
    monkeypatch.setattr(settings, "STORAGE_LEGACY_FALLBACK", True)
    monkeypatch.setattr(settings, "STORAGE_LEGACY_BUCKETS", '{"rap-prod-resumes": "resumes"}')
    monkeypatch.setattr(storage, "get_s3_client", lambda: new)
    monkeypatch.setattr(storage, "get_legacy_client", lambda: old)
    return new, old


def test_links_fall_back_to_the_legacy_bucket_until_copied(providers):
    new, old = providers
    old.objects[("resumes", "u1/cv.pdf")] = (b"%PDF-old", "application/pdf")
    url = storage.generate_presigned_url("rap-prod-resumes", "u1/cv.pdf", expires_hours=0.1)
    assert url == "https://supabase/resumes/u1/cv.pdf?e=360"
    new.objects[("rap-prod-resumes", "u1/cv.pdf")] = (b"%PDF-old", "application/pdf")
    url = storage.generate_presigned_url("rap-prod-resumes", "u1/cv.pdf", expires_hours=0.1)
    assert url == "https://r2/rap-prod-resumes/u1/cv.pdf?e=360"


@pytest.mark.asyncio
async def test_reads_fall_back_and_deletes_remove_both_copies(providers):
    new, old = providers
    old.objects[("resumes", "k")] = (b"legacy bytes", "text/plain")
    svc = storage.StorageService()
    assert await svc.read_file("rap-prod-resumes", "k", 100) == b"legacy bytes"
    new.objects[("rap-prod-resumes", "k")] = (b"new bytes", "text/plain")
    assert await svc.read_file("rap-prod-resumes", "k", 100) == b"new bytes"
    assert await svc.delete_file("rap-prod-resumes", "k") is True
    assert ("rap-prod-resumes", "k") in new.deleted
    assert ("resumes", "k") in old.deleted  # erasure leaves no copy behind
    assert await svc.read_file("rap-prod-resumes", "k", 100) is None


@pytest.mark.asyncio
async def test_uploads_only_go_to_the_primary_provider(providers):
    new, old = providers
    svc = storage.StorageService()
    await svc.upload_file("rap-prod-resumes", "k2", b"data", content_type="text/plain")
    assert ("rap-prod-resumes", "k2") in new.objects
    assert old.objects == {}


def test_no_fallback_outside_the_migration_window(monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "s3")
    monkeypatch.setattr(settings, "STORAGE_LEGACY_FALLBACK", True)
    assert storage.legacy_fallback_enabled() is False
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "r2")
    monkeypatch.setattr(settings, "STORAGE_LEGACY_FALLBACK", False)
    assert storage.legacy_fallback_enabled() is False


def test_production_validation_requires_r2_credentials(monkeypatch):
    for name, value in {
        "APP_ENV": "production",
        "STORAGE_PROVIDER": "r2",
        "R2_ENDPOINT": "",
        "R2_ACCESS_KEY_ID": "",
        "R2_SECRET_ACCESS_KEY": "",
        "STORAGE_LEGACY_FALLBACK": False,
    }.items():
        monkeypatch.setattr(settings, name, value)
    with pytest.raises(Exception, match="R2_ENDPOINT must be configured") as exc:
        settings.validate_production_settings()
    text = str(exc.value)
    assert "R2_ENDPOINT must be configured" in text
    assert (
        "MINIO_SECRET_KEY" not in text
    )  # the old provider is not required once the window is closed


def _load_tool():
    path = pathlib.Path(__file__).resolve().parents[3] / "ops" / "storage" / "migrate_objects.py"
    spec = importlib.util.spec_from_file_location("migrate_objects", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_copy_tool_dry_run_apply_verify_and_idempotence():
    tool = _load_tool()
    src, dst = FakeS3("src"), FakeS3("dst")
    for i in range(5):
        src.objects[("resumes", f"u{i}.pdf")] = (f"pdf {i}".encode(), "application/pdf")
    dst.objects[("rap-prod-resumes", "u0.pdf")] = (b"pdf 0", "application/pdf")  # already copied
    dst.objects[("rap-prod-resumes", "u1.pdf")] = (b"stale", "application/pdf")  # wrong content
    buckets = tool.pairs("resumes=rap-prod-resumes")

    dry = tool.run(src, dst, buckets, "dry-run")
    assert (dry.checked, dry.copied, dry.skipped) == (5, 4, 1)
    assert dst.objects[("rap-prod-resumes", "u1.pdf")][0] == b"stale"  # dry run changed nothing

    applied = tool.run(src, dst, buckets, "apply")
    assert (applied.copied, applied.skipped, applied.errors, applied.mismatched) == (4, 1, [], [])
    assert dst.objects[("rap-prod-resumes", "u1.pdf")] == (b"pdf 1", "application/pdf")

    verified = tool.run(src, dst, buckets, "verify")
    assert (verified.skipped, verified.mismatched) == (5, [])
    # Re-running apply copies nothing; nothing is ever deleted from the source.
    assert tool.run(src, dst, buckets, "apply").copied == 0
    assert src.deleted == []


@pytest.mark.asyncio
async def test_r2_bucket_names_are_resolved_per_purpose(monkeypatch):
    new, old = FakeS3("r2"), FakeS3("supabase")
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "r2")
    monkeypatch.setattr(settings, "STORAGE_LEGACY_FALLBACK", True)
    monkeypatch.setattr(settings, "STORAGE_LEGACY_BUCKETS", "")
    monkeypatch.setattr(settings, "MINIO_BUCKET_RESUMES", "resumes")
    monkeypatch.setattr(settings, "R2_BUCKET_RESUMES", "rap-prod-resumes")
    monkeypatch.setattr(storage, "get_s3_client", lambda: new)
    monkeypatch.setattr(storage, "get_legacy_client", lambda: old)
    assert storage.primary_bucket("resumes") == "rap-prod-resumes"
    assert storage.legacy_bucket("resumes") == "resumes"
    svc = storage.StorageService()
    await svc.upload_file("resumes", "u/cv.pdf", b"%PDF-1", content_type="application/pdf")
    assert ("rap-prod-resumes", "u/cv.pdf") in new.objects
    old.objects[("resumes", "u/old.pdf")] = (b"%PDF-old", "application/pdf")
    assert storage.generate_presigned_url("resumes", "u/old.pdf").startswith(
        "https://supabase/resumes/"
    )
    assert storage.generate_presigned_url("resumes", "u/cv.pdf").startswith(
        "https://r2/rap-prod-resumes/"
    )
    assert await svc.delete_file("resumes", "u/old.pdf") is True
    assert ("resumes", "u/old.pdf") in old.deleted
    monkeypatch.setattr(settings, "STORAGE_PROVIDER", "s3")
    assert storage.primary_bucket("resumes") == "resumes"
