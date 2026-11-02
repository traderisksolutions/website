#!/usr/bin/env bash
# Cloud Scheduler jobs for the sales module (Vercel Hobby crons are daily only).
#
#   CRON_SECRET=... ./scripts/sales-scheduler.sh [app-url]
#
#   campaign-sender   every 20 min, Mon–Fri 09:00–16:40 SGT  → /api/cron/campaign-sender
#   sales-enrich      hourly, Mon–Fri 08:00–18:00 SGT         → /api/cron/sales-enrich
#   agents-drain      every 10 min, 07:00–22:50 SGT daily     → /api/cron/agents (the task queue; a chase
#                     decided at 01:10 no longer waits for the nightly drain)
#   admin-sweep       hourly, 07:00–22:00 SGT daily            → /api/cron/admin-sweep (chaser, renewals, claims sync)
#
# Idempotent: creates the job if missing, else updates it. Needs gcloud signed in as
# developer@trade-risksol.com with access to trs-ai-project.
set -euo pipefail
APP="${1:-https://trs-dashboard-pi.vercel.app}"
PROJ=trs-ai-project; REGION=asia-southeast1; ACCT=developer@trade-risksol.com
: "${CRON_SECRET:?CRON_SECRET is required (the dashboard Vercel CRON_SECRET)}"

upsert() {
  local name=$1 schedule=$2 path=$3
  local common=(--project "$PROJ" --location "$REGION" --account "$ACCT" --schedule "$schedule" --time-zone "Asia/Singapore"
    --uri "$APP$path" --http-method GET --headers "Authorization=Bearer $CRON_SECRET" --attempt-deadline 320s)
  if gcloud scheduler jobs describe "$name" --project "$PROJ" --location "$REGION" --account "$ACCT" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" "${common[@]}"
  else
    gcloud scheduler jobs create http "$name" "${common[@]}"
  fi
}

upsert campaign-sender '*/20 9-16 * * 1-5' /api/cron/campaign-sender
upsert sales-enrich    '0 8-18 * * 1-5'    /api/cron/sales-enrich
upsert agents-drain    '*/10 7-22 * * *'   /api/cron/agents
upsert admin-sweep     '0 7-22 * * *'      /api/cron/admin-sweep
gcloud scheduler jobs list --project "$PROJ" --location "$REGION" --account "$ACCT" --format='table(name.basename(),schedule,state)'
