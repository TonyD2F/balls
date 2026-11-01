#!/usr/bin/env bash
# Capture desktop and mobile screenshots of a running preview.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${CAPTURE_URL:?Set CAPTURE_URL to the preview URL.}"
CAPTURE_DIR="${CAPTURE_DIR:-${RUNNER_TEMP:-/tmp}/omgithub-capture}"

timed() {
  printf '[capture] $ %s\n' "$*" >&2
  /usr/bin/time -p "$@"
}

timed mkdir -p "$CAPTURE_DIR"
CAPTURE_DIR="$(cd "$CAPTURE_DIR" && pwd)"

case "$CAPTURE_DIR/" in
  "$PROJECT_DIR/"*)
    echo "[capture] CAPTURE_DIR must be outside the project source: $CAPTURE_DIR" >&2
    exit 1
    ;;
esac

export CAPTURE_URL CAPTURE_DIR

status=0
timed node "$PROJECT_DIR/capture.mjs" || status=$?
echo "[capture] finished with exit code $status" >&2
exit "$status"
