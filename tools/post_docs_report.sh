#!/bin/sh
# Post (or update in place) the pull request comment that shows what this PR
# changes in the generated docs; delete it when the PR no longer changes any.
#
#   tools/post_docs_report.sh architecture|api
#
# Needs: GH_TOKEN (pull-requests: write), PR_NUMBER, BASE_REF, GITHUB_REPOSITORY,
# a full-history checkout whose HEAD is the PR head after any sync commit.
# PYTHON (default python3) must have PyYAML.
set -eu

KIND=$1
PYTHON=${PYTHON:-python3}
MARKER="<!-- docs-sync:$KIND -->"

git fetch --quiet --no-tags origin "$BASE_REF"
BASE=$(git merge-base FETCH_HEAD HEAD)
HEAD=$(git rev-parse HEAD)

REPORT=$(mktemp)
"$PYTHON" -m tools.docs_report "$KIND" "$BASE" "$HEAD" "$GITHUB_REPOSITORY" > "$REPORT"

EXISTING=$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" \
  --jq ".[] | select(.body | startswith(\"$MARKER\")) | .id" | head -1)

if [ ! -s "$REPORT" ]; then
  if [ -n "$EXISTING" ]; then
    gh api -X DELETE "repos/$GITHUB_REPOSITORY/issues/comments/$EXISTING" > /dev/null
    echo "No $KIND changes any more; removed the PR comment."
  else
    echo "No $KIND changes in this PR."
  fi
  exit 0
fi

if [ -n "$EXISTING" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$EXISTING" -F "body=@$REPORT" > /dev/null
  echo "Updated the $KIND PR comment."
else
  gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -F "body=@$REPORT" > /dev/null
  echo "Posted the $KIND PR comment."
fi
cat "$REPORT" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
