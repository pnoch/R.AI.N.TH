#!/usr/bin/env bash
set -euo pipefail

FORECAST_UID="${FORECAST_UID:-${1:-}}"
VERIFICATION_UID="${VERIFICATION_UID:-${2:-}}"
if [[ -z "$FORECAST_UID" || -z "$VERIFICATION_UID" ]]; then
  echo "Usage: $0 <forecast-task-uid> <verification-task-uid>" >&2
  exit 2
fi
FORECAST_NORMAL="0 45 0,6,12,18 * * *"
VERIFICATION_NORMAL="0 30 1 * * *"
STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
FORECAST_AT="$(date -u -d '+2 minutes' '+%Y-%m-%dT%H:%M:00Z')"
VERIFICATION_AT="$(date -u -d '+5 minutes' '+%Y-%m-%dT%H:%M:00Z')"

cron_once() {
  date -u -d "$1" '+0 %-M %-H %-d %-m *'
}

restore() {
  manus-heartbeat update --task-uid "$FORECAST_UID" --cron "$FORECAST_NORMAL" >/dev/null || true
  manus-heartbeat update --task-uid "$VERIFICATION_UID" --cron "$VERIFICATION_NORMAL" >/dev/null || true
}
trap restore EXIT

manus-heartbeat update --task-uid "$FORECAST_UID" --cron "$(cron_once "$FORECAST_AT")" >/dev/null
manus-heartbeat update --task-uid "$VERIFICATION_UID" --cron "$(cron_once "$VERIFICATION_AT")" >/dev/null

echo "forecast scheduled for $FORECAST_AT"
echo "verification scheduled for $VERIFICATION_AT"

forecast_status="pending"
verification_status="pending"
for attempt in $(seq 1 48); do
  manus-heartbeat logs --task-uid "$FORECAST_UID" --with-body --page-size 3 --time-after "$STARTED_AT" > /tmp/rain-forecast-runs.json || true
  manus-heartbeat logs --task-uid "$VERIFICATION_UID" --with-body --page-size 3 --time-after "$STARTED_AT" > /tmp/rain-verification-runs.json || true
  forecast_status="$(jq -r '.runs[0].status // "pending"' /tmp/rain-forecast-runs.json 2>/dev/null || echo pending)"
  verification_status="$(jq -r '.runs[0].status // "pending"' /tmp/rain-verification-runs.json 2>/dev/null || echo pending)"
  printf 'check %02d: forecast=%s verification=%s\n' "$attempt" "$forecast_status" "$verification_status"
  if [[ "$forecast_status" =~ ^(success|failed|timeout|skipped)$ ]] && [[ "$verification_status" =~ ^(success|failed|timeout|skipped)$ ]]; then
    break
  fi
  sleep 15
done

restore
trap - EXIT

jq '{task_uid,total,runs:[.runs[]|{run_uid,status,scheduled_at,started_at,finished_at,response_status_code,response_body}]}' /tmp/rain-forecast-runs.json
jq '{task_uid,total,runs:[.runs[]|{run_uid,status,scheduled_at,started_at,finished_at,response_status_code,response_body}]}' /tmp/rain-verification-runs.json

[[ "$forecast_status" == "success" && "$verification_status" == "success" ]]
