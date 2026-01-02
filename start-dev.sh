#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

osascript <<EOF
tell application "Terminal"
  activate
  set backTab to do script "cd \"$SCRIPT_DIR/backend\"; npx nodemon"
  set frontTab to do script "cd \"$SCRIPT_DIR/frontend\"; npm run dev" in front window
end tell
EOF
