#!/usr/bin/env bash
# Schedules the TRS agent jobs only (no sales emails):
#   agents-drain  every 10 min, 07:00-22:50 SGT -> /api/cron/agents
#   admin-sweep   hourly, 07:00-22:00 SGT       -> /api/cron/admin-sweep
# Asks for the dashboard's Vercel CRON_SECRET (hidden), checks it, then creates or updates the jobs.
set -euo pipefail
APP=https://trs-dashboard-pi.vercel.app
PROJ=trs-ai-project; REGION=asia-southeast1; ACCT=developer@trade-risksol.com

read -r -s -p "Paste the CRON_SECRET and press Enter: " CRON_SECRET; echo
[ -n "$CRON_SECRET" ] || { echo "No secret entered."; exit 1; }

code=$(curl -s -o /dev/null -w "%{http_code}" -m 300 -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/agents")
if [ "$code" != "200" ]; then echo "The app answered $code, not 200: wrong secret? Nothing scheduled."; exit 1; fi
echo "Secret works (200)."

upsert() {
  local name=$1 schedule=$2 path=$3
  local common=(--project "$PROJ" --location "$REGION" --account "$ACCT" --schedule "$schedule" --time-zone "Asia/Singapore"
    --uri "$APP$path" --http-method GET --headers "Authorization=Bearer $CRON_SECRET" --attempt-deadline 320s)
  if gcloud scheduler jobs describe "$name" --project "$PROJ" --location "$REGION" --account "$ACCT" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" "${common[@]}" >/dev/null
  else
    gcloud scheduler jobs create http "$name" "${common[@]}" >/dev/null
  fi
  echo "Scheduled $name ($schedule)"
}
upsert agents-drain '*/10 7-22 * * *' /api/cron/agents
upsert admin-sweep  '0 7-22 * * *'    /api/cron/admin-sweep
gcloud scheduler jobs list --project "$PROJ" --location "$REGION" --account "$ACCT" --format='table(name.basename(),schedule,state)'
