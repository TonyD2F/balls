#!/usr/bin/env bash
# Capture desktop and mobile screenshots of the running preview.
set -euo pipefail
cd "$(dirname "$0")"

: "${CAPTURE_URL:?Set CAPTURE_URL to the preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the project}"

timed() {
  local start end status
  start="$(date +%s%N)"
  "$@" && status=0 || status=$?
  end="$(date +%s%N)"
  printf '[timing] %s: %d ms\n' "$*" "$(( (end - start) / 1000000 ))" >&2
  return "$status"
}

timed mkdir -p "$CAPTURE_DIR"
export PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
timed node scripts/capture.mjs
