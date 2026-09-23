#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$(mktemp -d)"
PORT="${PRODUCTION_SMOKE_PORT:-3199}"
PID=""

cleanup() {
  if [[ -n "$PID" ]]; then kill "$PID" 2>/dev/null || true; fi
  rm -rf "$RUNTIME_DIR"
}
trap cleanup EXIT

mkdir -p "$RUNTIME_DIR/server"
cp -a "$ROOT/dist" "$ROOT/pipeline" "$ROOT/package.json" "$RUNTIME_DIR/"
cp -a "$ROOT/server/data" "$RUNTIME_DIR/server/"

test ! -d "$RUNTIME_DIR/node_modules"
(
  cd "$RUNTIME_DIR"
  PORT="$PORT" NODE_ENV=production PYTHON_BIN="${PYTHON_BIN:-python3}" node dist/index.cjs
) >"$RUNTIME_DIR/server.log" 2>&1 &
PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/" >"$RUNTIME_DIR/index.html"; then break; fi
  sleep 0.2
done

grep -q "RAIN//TH Intelligence" "$RUNTIME_DIR/index.html"
curl -fsS "http://127.0.0.1:$PORT/api/trpc/weather.latest?input=%7B%22json%22%3Anull%7D" >"$RUNTIME_DIR/weather.json"
code="$(curl -sS -o "$RUNTIME_DIR/cron.json" -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/scheduled/refresh-data" -H 'content-type: application/json' -d '{}')"
test "$code" = "403"

echo '{"ok":true,"nodeModules":false,"cronUnauthenticatedStatus":403}'
