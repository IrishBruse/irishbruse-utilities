#!/usr/bin/env bash
# Block agent `git commit` until tests (with markdown-inline coverage), and lint pass.
set -euo pipefail

ROOT="${CURSOR_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT"

input="$(cat)"
command="$(jq -r '.command // empty' <<<"$input")"

if [[ "$command" =~ (--no-verify|-n[[:space:]]|-n$) ]]; then
  echo '{ "permission": "allow" }'
  exit 0
fi

if npm run test:coverage && npm run lint; then
  echo '{ "permission": "allow" }'
  exit 0
fi

jq -n \
  --arg user_message "Commit blocked: \`npm run test:coverage\` or \`npm run lint\` failed. Fix the failures, then commit again." \
  --arg agent_message "Pre-commit checks failed. Fix test, coverage, or lint errors before running git commit again." \
  '{ permission: "deny", user_message: $user_message, agent_message: $agent_message }'
exit 0
