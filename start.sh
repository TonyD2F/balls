#!/usr/bin/env bash
# Build (when needed) and serve the static site in the foreground.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DIST_DIR="$PROJECT_DIR/dist"
DEPLOYMENT_OUTPUT="$OPENCODE_WEB_DIR/deployment-output.json"

timed() {
  printf '[start] $ %s\n' "$*" >&2
  /usr/bin/time -p "$@"
}

if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "[start] invalid PORT: $PORT" >&2
  exit 1
fi

timed mkdir -p "$OPENCODE_WEB_DIR"

# Install dependencies only when the manifest or lockfile is newer than the tree.
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  needs_install=false
  if [[ ! -d "$PROJECT_DIR/node_modules" || ! -f "$PROJECT_DIR/node_modules/.package-lock.json" ]]; then
    needs_install=true
  elif [[ "$PROJECT_DIR/package.json" -nt "$PROJECT_DIR/node_modules/.package-lock.json" ]]; then
    needs_install=true
  fi

  if [[ "$needs_install" == true ]]; then
    if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then
      timed npm ci --no-audit --no-fund --prefer-offline
    else
      timed npm install --no-audit --no-fund --prefer-offline
    fi
  else
    echo "[start] dependencies already installed" >&2
  fi
fi

# Rebuild when dist is missing or any source/build input is newer than the build.
needs_build=false
if [[ ! -f "$DIST_DIR/index.html" ]]; then
  needs_build=true
else
  newer_source="$(timed find "$PROJECT_DIR/src" "$PROJECT_DIR/build.mjs" "$PROJECT_DIR/package.json" -newer "$DIST_DIR/index.html" -print -quit)"
  if [[ -n "$newer_source" ]]; then
    needs_build=true
  fi
fi

if [[ "$needs_build" == true ]]; then
  timed node "$PROJECT_DIR/build.mjs"
else
  echo "[start] build is up to date" >&2
fi

[[ -f "$DIST_DIR/index.html" ]] || { echo "[start] missing $DIST_DIR/index.html" >&2; exit 1; }

timed node -e '
const fs = require("node:fs");
const [output, project, directory] = process.argv.slice(1);
fs.writeFileSync(output, JSON.stringify({ project, directory }) + "\n");
' "$DEPLOYMENT_OUTPUT" "$PROJECT_DIR" "$DIST_DIR"

echo "[start] deployment output: $(cat "$DEPLOYMENT_OUTPUT")" >&2
echo "[start] serving $DIST_DIR on 0.0.0.0:$PORT" >&2

exec node "$PROJECT_DIR/serve.mjs" "$DIST_DIR" "$PORT"
