"""OPS-06/07: ops/backup must never write outside the backup folder, and its
expected row counts must come from the dump's own snapshot.

The full restore drill (disposable PostgreSQL + MinIO, concurrent writes,
identity/emptiness/confirmation refusals) is recorded in the private
evidence index; these are the parts that run in CI."""

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

_parents = Path(__file__).resolve().parents
BACKUP = (_parents[3] if len(_parents) > 3 else _parents[-1]) / "ops" / "backup"
# The API-only Docker test image has no ops/ folder; CI's full checkout does.
pytestmark = pytest.mark.skipif(not BACKUP.is_dir(), reason="ops/backup not in this build context")


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"backup_{name}", BACKUP / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize(
    "key",
    [
        "/etc/passwd",
        "../outside",
        "a/../../outside",
        "a/./b",
        "a//b",
        "",
        "a\\..\\b",
        "a/\x00b",
        "a/\nb",
        "..",
    ],
)
def test_unsafe_object_keys_are_refused(tmp_path, key):
    objects = _load("objects")
    with pytest.raises(objects.UnsafeKey):
        objects.safe_target(tmp_path, "bucket", key)


@pytest.mark.parametrize("bucket", ["..", "", "a/b\\c"])
def test_unsafe_bucket_names_are_refused(tmp_path, bucket):
    objects = _load("objects")
    with pytest.raises(objects.UnsafeKey):
        objects.safe_target(tmp_path, bucket, "k")


def test_symlinked_escape_is_refused(tmp_path):
    objects = _load("objects")
    outside = tmp_path / "outside"
    outside.mkdir()
    root = tmp_path / "root"
    (root / "bucket").mkdir(parents=True)
    (root / "bucket" / "link").symlink_to(outside)
    with pytest.raises(objects.UnsafeKey):
        objects.safe_target(root, "bucket", "link/file")


def test_ordinary_keys_stay_inside(tmp_path):
    objects = _load("objects")
    target = objects.safe_target(tmp_path, "resumes", "user-1/cv v2.pdf")
    assert target == (tmp_path / "resumes" / "user-1" / "cv v2.pdf").resolve()


def test_dump_counts_read_copy_blocks():
    dump = "\n".join(
        [
            "SET x = 1;",
            "COPY public.users (id, full_name) FROM stdin;",
            "1\tMulti\\nline",
            "2\tTwo",
            "\\.",
            'COPY public."Odd ""Name""" (id) FROM stdin;',
            "1",
            "\\.",
            "COPY public.empty_table (id) FROM stdin;",
            "\\.",
            "",
        ]
    )
    out = subprocess.run(
        [sys.executable, str(BACKUP / "dumpcounts.py")], input=dump, capture_output=True, text=True, check=True
    ).stdout
    assert out.splitlines() == ['Odd "Name"\t1', "empty_table\t0", "users\t2"]
