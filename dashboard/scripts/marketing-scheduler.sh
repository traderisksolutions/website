#!/usr/bin/env bash
# Cloud Scheduler job for the nightly article batch. The content engine runs on Cloud Run
# (content-engine/deploy.sh); this calls its /nightly once a night, and the engine creates
# each site's batch from marketing_sites.nightly_count.
#
#   CONTENT_ENGINE_SECRET=... ./scripts/marketing-scheduler.sh [engine-url]
#
# Idempotent: creates the job if missing, else updates it. Needs gcloud signed in as
# developer@trade-risksol.com with access to trs-ai-project.
set -euo pipefail
PROJ=trs-ai-project; REGION=asia-southeast1; ACCT=developer@trade-risksol.com
ENGINE="${1:-}"
if [ -z "$ENGINE" ]; then ENGINE="$(gcloud run services describe trs-content-engine --project "$PROJ" --region "$REGION" --account "$ACCT" --format "value(status.url)")"; fi
: "${CONTENT_ENGINE_SECRET:?CONTENT_ENGINE_SECRET is required (the engine bearer secret)}"

common=(--project "$PROJ" --location "$REGION" --account "$ACCT" --schedule '0 2 * * *' --time-zone "Asia/Singapore"
  --uri "$ENGINE/nightly" --http-method POST --headers "Authorization=Bearer $CONTENT_ENGINE_SECRET" --attempt-deadline 60s)
if gcloud scheduler jobs describe content-nightly --project "$PROJ" --location "$REGION" --account "$ACCT" >/dev/null 2>&1; then
  gcloud scheduler jobs update http content-nightly "${common[@]}"
else
  gcloud scheduler jobs create http content-nightly "${common[@]}"
fi
gcloud scheduler jobs list --project "$PROJ" --location "$REGION" --account "$ACCT" --format='table(name.basename(),schedule,state)'
