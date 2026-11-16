"""Execute deploy helpers in Bash with no Docker, network, or production writes."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "infra/docker/deploy.sh"
SHA = "a" * 40


def bash(tmp_path: Path, body: str) -> subprocess.CompletedProcess[str]:
    # Load the actual helper definitions, excluding both initialization and the
    # top-level deployment dispatcher. Every side-effecting dependency is mocked.
    source = SCRIPT.read_text()
    helpers = source[source.index("ROLLBACK_OVERRIDE=\"\""):source.index('if [ "${1:-}" = "--rollback" ]; then')]
    library = tmp_path / "helpers.sh"
    library.write_text(helpers)
    harness = '''set -euo pipefail
source "$HELPERS"
STATE_DIR="$TEST_DIR"
ENV_FILE="$TEST_DIR/env"
APP_SERVICES=(api worker scheduler web admin)
set_tag() { echo "tag $1" >> "$TEST_DIR/calls"; }
env_get() { echo false; }
sleep() { :; }
seq() { echo 1; }
''' + body
    return subprocess.run(
        ["bash", "-c", harness],
        env={**os.environ, "HELPERS": str(library), "TEST_DIR": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=10,
    )


@pytest.mark.parametrize("failure,code", [("pull", 41), ("run", 42)])
def test_roll_out_propagates_failure_inside_if(tmp_path: Path, failure: str, code: int) -> None:
    result = bash(tmp_path, f'''
compose() {{
  echo "$*" >> "$TEST_DIR/calls"
  if [ "$1" = "{failure}" ]; then return {code}; fi
}}
# Match the production conditional: errexit is suppressed throughout roll_out.
if roll_out {SHA}; then
  echo unexpected-success
else
  rc=$?
  echo "failure=$rc"
fi
''')
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == f"failure={code}"
    calls = (tmp_path / "calls").read_text().splitlines()
    assert calls[1] == "pull api worker scheduler web admin job-cache"
    assert not any("--remove-orphans" in call for call in calls)
    if failure == "pull":
        assert len(calls) == 2
    else:
        assert calls[2:] == ["up -d --no-deps job-cache", "run --rm --no-deps api alembic upgrade head"]


def test_rollback_override_replaces_old_api_migrator(tmp_path: Path) -> None:
    result = bash(tmp_path, '''
docker() { printf '%s\\n' "$@" > "$TEST_DIR/docker-args"; }
prepare_rollback
compose up -d --no-deps "${APP_SERVICES[@]}"
''')
    assert result.returncode == 0, result.stderr
    args = (tmp_path / "docker-args").read_text().splitlines()
    assert args == ["compose", "--env-file", str(tmp_path / "env"), "-f", "docker-compose.prod.yml",
                    "-f", str(tmp_path / "rollback-compose.yml"), "up", "-d", "--no-deps",
                    "api", "worker", "scheduler", "web", "admin"]
    override = (tmp_path / "rollback-compose.yml").read_text()
    assert 'command: ["sh", "-c", "exec uvicorn app.main:app ' in override
    assert "alembic" not in override
    assert "$${WEB_CONCURRENCY:-2}" in override


@pytest.mark.parametrize(
    "api_sha,web_sha,legacy,passes",
    [(SHA, SHA, False, True), ("unknown", SHA, False, False),
     ("unknown", SHA, True, True), ("b" * 40, SHA, True, False),
     ("unknown", "unknown", True, False)],
)
def test_health_gate_only_allows_unknown_api_for_legacy_rollback(
    tmp_path: Path, api_sha: str, web_sha: str, legacy: bool, passes: bool,
) -> None:
    result = bash(tmp_path, f'''
curl() {{
  case "$*" in
    *api/version*) echo '{{"git_sha":"{web_sha}"}}' ;;
    *3002*) echo 'Operations console' ;;
    *) return 0 ;;
  esac
}}
compose() {{
  case "$*" in
    *health/version*) echo '{{"git_sha":"{api_sha}"}}' ;;
    *) return 0 ;;
  esac
}}
if health_gate {SHA} {'true' if legacy else ''}; then echo accepted; else echo rejected; fi
''')
    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines()[-1] == ("accepted" if passes else "rejected")


def test_dispatcher_limits_legacy_health_to_rollback() -> None:
    dispatcher = SCRIPT.read_text().split('if [ "${1:-}" = "--rollback" ]; then', 1)[1]
    assert 'if roll_out "$sha" && health_gate "$sha"; then' in dispatcher
    assert dispatcher.count('health_gate "$prev" true') == 2
    assert 'health_gate "$sha" true' not in dispatcher
