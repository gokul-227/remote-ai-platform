"""Write the API's OpenAPI document as YAML, straight from the FastAPI app.

No server, database or secrets are needed: the app is imported and
`app.openapi()` is serialised. The process environment and any `.env` file are
ignored so every machine produces the same bytes; the only inputs are the code.

    apps/api/.venv/bin/python tools/api_docs/export_openapi.py [--check] [output]
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "apps/api"
DEFAULT_OUTPUT = ROOT / "docs/api/openapi.yaml"

# Kept from the caller's environment; everything else (DATABASE_URL, API keys,
# feature flags, a local .env) is dropped before the app's Settings load.
KEEP = {"PATH", "HOME", "LANG", "LC_ALL", "SYSTEMROOT", "TMPDIR", "TEMP", "TMP"}

HEADER = (
    "# GENERATED from the FastAPI app by `make api-sync` -- do not edit.\n"
    "# Source: apps/api/app/main.py (tools/api_docs/export_openapi.py)\n"
)


def load_schema() -> dict:
    for key in list(os.environ):
        if key not in KEEP:
            del os.environ[key]
    os.environ["APP_ENV"] = "development"
    sys.path.insert(0, str(API))
    # Settings reads `.env` from the working directory; use an empty one.
    os.chdir(tempfile.mkdtemp())

    from app.main import app

    schema = app.openapi()
    # Postman's base URL comes from the first server; environments override it.
    schema["servers"] = [{"url": "http://localhost:8000", "description": "Local development (make dev)"}]
    return schema


def dump(schema: dict) -> str:
    import yaml

    class Dumper(yaml.SafeDumper):
        pass

    # Multi-line descriptions as block scalars keep diffs readable.
    def str_presenter(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
        style = "|" if "\n" in value else None
        return dumper.represent_scalar("tag:yaml.org,2002:str", value, style=style)

    Dumper.add_representer(str, str_presenter)
    return HEADER + yaml.dump(schema, Dumper=Dumper, sort_keys=False, allow_unicode=True, width=1000)


def main() -> int:
    check = "--check" in sys.argv[1:]
    args = [a for a in sys.argv[1:] if a != "--check"]
    output = Path(args[0]).resolve() if args else DEFAULT_OUTPUT
    text = dump(load_schema())
    changed = not output.exists() or output.read_text() != text
    shown = output.relative_to(ROOT) if output.is_relative_to(ROOT) else output
    if check:
        if changed:
            print(f"API documentation drift detected.\n\n{shown} differs from the FastAPI app.\n\nRun:\n\n  make api-sync\n")
            return 1
        print(f"{shown} is up to date.")
        return 0
    if changed:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text)
    print(f"{'updated' if changed else 'unchanged'}: {shown}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
