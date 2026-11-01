#!/usr/bin/env bash
# Build and serve the static documentation preview in the foreground.
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_DIR="$(pwd)"
export PROJECT_DIR
PORT="${PORT:-3000}"
export PORT
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR is required}"

timed() {
  local start end status
  start="$(date +%s%N)"
  "$@" && status=0 || status=$?
  end="$(date +%s%N)"
  printf '[timing] %s: %d ms\n' "$*" "$(( (end - start) / 1000000 ))" >&2
  return "$status"
}

timed mkdir -p "$OPENCODE_WEB_DIR"

# Dependencies are not required by the dependency-free Markdown renderer, but
# keep the hook explicit so a future build step can add them here.
if [[ -f package.json ]]; then
  if [[ ! -d node_modules ]]; then
    timed npm install --no-audit --no-fund
  fi
fi

stamp="$(sha256sum CONFIGURATION_REPORT.md scripts/build.mjs 2>/dev/null | sha256sum | cut -d' ' -f1)"
stamp_file="$OPENCODE_WEB_DIR/build-stamp"
if [[ ! -f dist/index.html ]] || [[ ! -f "$stamp_file" ]] || [[ "$(cat "$stamp_file")" != "$stamp" ]]; then
  timed node scripts/build.mjs
  printf '%s\n' "$stamp" > "$stamp_file"
else
  printf '[timing] build: cached (%s)\n' "$stamp" >&2
fi

timed node scripts/deployment-output.mjs

echo "[timing] server: starting on port $PORT" >&2
exec node scripts/serve.mjs
