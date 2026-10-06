#!/bin/sh
# Mirror this repository's postman/ (collection, environments, globals, spec,
# mock, documents, flows) into a Postman cloud workspace. GitHub is the source
# of truth: with the force-sync strategy, anything edited or added only in that
# workspace is overwritten or deleted, so use a workspace dedicated to it.
#
#   POSTMAN_API_KEY=...  POSTMAN_WORKSPACE_ID=...  tools/api_docs/publish.sh
#
# Without POSTMAN_WORKSPACE_ID, the workspace the Postman app bound this folder
# to (.postman/resources.yaml) is used. Without POSTMAN_API_KEY, your existing
# `postman login` is used. POSTMAN_PUSH_STRATEGY: force-sync (default) or
# default (create/update only).
#
# The push runs from a staged copy whose ids are reconciled with the cloud
# collection (stage_publish.mjs); the repository's files are never modified.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
POSTMAN="$ROOT/tools/node_modules/.bin/postman"
STRATEGY=${POSTMAN_PUSH_STRATEGY:-force-sync}
BINDING="$ROOT/.postman/resources.yaml"
STAGE="$ROOT/.cache/postman-publish"

workspace_of() { sed -n 's/^  id: *["'\'']\{0,1\}\([^"'\'']*\)["'\'']\{0,1\} *$/\1/p' "$1" | head -1; }

if [ -n "${POSTMAN_WORKSPACE_ID:-}" ]; then
  if [ -f "$BINDING" ] && [ -n "$(workspace_of "$BINDING")" ] && [ "$(workspace_of "$BINDING")" != "$POSTMAN_WORKSPACE_ID" ]; then
    echo "$BINDING binds this folder to another workspace; unset POSTMAN_WORKSPACE_ID to use it." >&2
    exit 1
  fi
  if [ ! -f "$BINDING" ] || [ -z "$(workspace_of "$BINDING")" ]; then
    mkdir -p "$ROOT/.postman"
    printf 'workspace:\n  id: %s\n' "$POSTMAN_WORKSPACE_ID" > "$BINDING"
  fi
elif [ ! -f "$BINDING" ] || [ -z "$(workspace_of "$BINDING")" ]; then
  echo "Set POSTMAN_WORKSPACE_ID (or open this folder in the Postman app to bind a workspace)." >&2
  exit 1
fi

if [ -n "${POSTMAN_API_KEY:-}" ]; then
  "$POSTMAN" login --with-api-key "$POSTMAN_API_KEY" > /dev/null
fi
OWNER=$("$POSTMAN" whoami --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);console.log((d.user||d).id)})')

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$ROOT/postman" "$ROOT/.postman" "$STAGE/"
rm -rf "$STAGE/postman/overrides" # merged into the collection; not a Postman entity
COLLECTION=$(sed -n 's/^ *\.\.\/postman\/collections\/[^:]*: *//p' "$STAGE/.postman/resources.yaml" | head -1)
node "$ROOT/tools/api_docs/stage_publish.mjs" "$STAGE" "$OWNER" "$COLLECTION"

cd "$STAGE"
echo "Changes this push makes to the workspace (strategy: $STRATEGY):"
"$POSTMAN" workspace diff --push-strategy "$STRATEGY" --summary || true
"$POSTMAN" workspace push --yes --no-report-events --push-strategy "$STRATEGY" 2>&1 | tee push.log
# Keep the cloud mapping Postman recorded (gitignored, per developer).
cp "$STAGE/.postman/resources.yaml" "$BINDING"
if grep -q "Failed to" push.log; then
  echo "Postman rejected part of the push (see above)." >&2
  exit 1
fi
