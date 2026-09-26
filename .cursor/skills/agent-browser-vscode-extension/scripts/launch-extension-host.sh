#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PORT="${AB_CDP_PORT:-9226}"
PROFILE="${AB_USER_DATA_DIR:-$ROOT/.tmp/vscode-ab-profile}"
EXTDIR="${AB_EXTENSIONS_DIR:-$ROOT/.tmp/vscode-ab-ext}"
FOLDER="${1:-$ROOT/docs/tests/markdown}"

mkdir -p "$PROFILE" "$EXTDIR"

echo "ROOT=$ROOT"
echo "PORT=$PORT"
echo "PROFILE=$PROFILE"
echo "EXTDIR=$EXTDIR"
echo "FOLDER=$FOLDER"
echo "SESSION=ib-ext  (agent-browser --session ib-ext connect $PORT)"

exec code \
  --extensionDevelopmentPath="$ROOT" \
  --user-data-dir="$PROFILE" \
  --extensions-dir="$EXTDIR" \
  --remote-debugging-port="$PORT" \
  --disable-workspace-trust \
  "$FOLDER"
