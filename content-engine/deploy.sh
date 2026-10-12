#!/usr/bin/env bash
# Deploy the content engine to Cloud Run (trs-ai-project, asia-southeast1).
#
#   ./deploy.sh
#
# Run once after creating the secrets in Secret Manager:
#   printf '%s' "$KEY" | gcloud secrets create TRS_SUPABASE_SERVICE_KEY --data-file=- --project trs-ai-project
#   (same for ANTHROPIC_API_KEY, GEMINI_API_KEY, CONTENT_ENGINE_SECRET; OPENAI_API_KEY optional)
# Then the dashboard needs CONTENT_ENGINE_URL (the service URL printed at the
# end) and CONTENT_ENGINE_SECRET in its Vercel environment.
#
# min-instances 1: the poll loop is what resumes a run after a crash, and a
# nightly batch of four articles runs for about an hour.
set -euo pipefail
PROJECT="${GCP_PROJECT:-trs-ai-project}"
REGION="${GCP_REGION:-asia-southeast1}"
SERVICE="${SERVICE_NAME:-trs-content-engine}"
ACCOUNT="${GCP_ACCOUNT:-developer@trade-risksol.com}"
SUPABASE_URL="${SUPABASE_URL:-https://trs-api-335840130686.asia-southeast1.run.app}"

# "^@^" makes @ the separator: the provider order itself contains commas.
# Anthropic and OpenAI are optional: include their secrets only when they exist, and put
# Gemini first in the provider order until an Anthropic key is in Secret Manager.
SECRETS="SUPABASE_SERVICE_KEY=TRS_SUPABASE_SERVICE_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,CONTENT_ENGINE_SECRET=CONTENT_ENGINE_SECRET:latest"
ORDER="${ENGINE_PROVIDER_ORDER:-gemini,anthropic,openai}"
for s in ANTHROPIC_API_KEY OPENAI_API_KEY; do
  if gcloud secrets describe "$s" --project "$PROJECT" --account "$ACCOUNT" >/dev/null 2>&1; then
    SECRETS="$SECRETS,$s=$s:latest"
    [ "$s" = ANTHROPIC_API_KEY ] && ORDER="${ENGINE_PROVIDER_ORDER:-anthropic,gemini,openai}"
  fi
done

gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --account "$ACCOUNT" --source . \
  --platform managed --allow-unauthenticated --quiet \
  --min-instances 1 --max-instances 2 --cpu 1 --memory 1Gi --timeout 3600 --concurrency 4 \
  --set-env-vars "^@^SUPABASE_URL=$SUPABASE_URL@ENGINE_POLL_SECONDS=15@ENGINE_MODEL_STRONG=${ENGINE_MODEL_STRONG:-claude-opus-5-5}@ENGINE_MODEL_FAST=${ENGINE_MODEL_FAST:-claude-sonnet-5-5}@ENGINE_PROVIDER_ORDER=$ORDER@ENGINE_GEMINI_MODEL=${ENGINE_GEMINI_MODEL:-gemini-3.8-flash}" \
  --set-secrets "$SECRETS"

echo "Service URL:"
gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --account "$ACCOUNT" --format 'value(status.url)'
