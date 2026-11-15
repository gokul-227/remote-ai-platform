#!/usr/bin/env bash
# Post one line to Slack with chat.postMessage (free bot token, no webhook app).
#   SLACK_BOT_TOKEN=xoxb-... SLACK_CHANNEL=C0123 infra/ops/slack-notify.sh "text"
# Silently does nothing when the token or channel is unset; never fails the caller.
set -u
text="${1:-}"
if [ -z "${SLACK_BOT_TOKEN:-}" ] || [ -z "${SLACK_CHANNEL:-}" ] || [ -z "$text" ]; then
  echo "slack-notify: not configured, skipped"
  exit 0
fi
payload=$(python3 -c 'import json,sys; print(json.dumps({"channel": sys.argv[1], "text": sys.argv[2], "unfurl_links": False}))' "$SLACK_CHANNEL" "$text")
res=$(curl -sS --max-time 15 -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data "$payload" || true)
case "$res" in
  *'"ok":true'*) echo "slack-notify: posted" ;;
  *) echo "slack-notify: not posted (${res:0:120})" ;;
esac
exit 0
