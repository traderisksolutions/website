#!/usr/bin/env bash
# Puts the thread embedder (scripts/embed-threads.mts) on Cloud Run as the job `thread-embed` and
# schedules it every night. Every step creates or updates, so it is safe to re-run after the script
# changes. Run from dashboard/:
#   tools/thread-embed/deploy.sh          build, deploy, schedule
#   npm run embed:run                     run the job now and wait for it
# No key is read or printed: the job takes the database key from Secret Manager, and the scheduler
# starts the job as its own service account (no CRON_SECRET, no service-account key).
set -euo pipefail
PROJ=trs-ai-project; REGION=asia-southeast1; ACCT=developer@trade-risksol.com
JOB=thread-embed; SA="$JOB@$PROJ.iam.gserviceaccount.com"
SECRET=TRS_SUPABASE_SERVICE_KEY
DB_URL=https://trs-api-335840130686.asia-southeast1.run.app
SCHEDULE='0 1 * * *'
ESBUILD=0.25.10
IMAGE="$REGION-docker.pkg.dev/$PROJ/trs/$JOB:$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M)"
G=(--project "$PROJ" --account "$ACCT")

[ -f scripts/embed-threads.mts ] || { echo "Run this from dashboard/."; exit 1; }
MODEL=tools/thread-embed/model-cache/Xenova/bge-small-en-v1.5/onnx/model_quantized.onnx
[ -f "$MODEL" ] || { echo "The model file is not on this machine. Run the embedder here once (it downloads the model), then deploy."; exit 1; }

# The build context: the script and what it imports as one file, the runtime's lock file, the model.
CTX=$(mktemp -d); trap 'rm -rf "$CTX"' EXIT
mkdir -p "$CTX/tools/thread-embed"
npx --yes "esbuild@$ESBUILD" scripts/embed-threads.mts --bundle --platform=node --format=esm --target=node24 \
  --tsconfig=tsconfig.json --log-level=warning --outfile="$CTX/embed-threads.mjs"
cp tools/thread-embed/Dockerfile "$CTX/Dockerfile"
cp tools/thread-embed/package.json tools/thread-embed/package-lock.json "$CTX/tools/thread-embed/"
cp -R tools/thread-embed/model-cache "$CTX/tools/thread-embed/model-cache"
if [ "${1:-}" = "--context" ]; then trap - EXIT; echo "$CTX"; exit 0; fi

gcloud builds submit "$CTX" --tag "$IMAGE" "${G[@]}" --quiet
echo "Built $IMAGE"

gcloud iam service-accounts describe "$SA" "${G[@]}" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$JOB" --display-name "Thread embedder (Cloud Run job)" "${G[@]}"
# A service account made a moment ago is not known everywhere yet, so the grant is tried for a minute.
for attempt in 1 2 3 4 5 6; do
  gcloud secrets add-iam-policy-binding "$SECRET" --member "serviceAccount:$SA" \
    --role roles/secretmanager.secretAccessor "${G[@]}" >/dev/null 2>&1 && break
  [ "$attempt" = 6 ] && { echo "Could not grant $SA access to $SECRET."; exit 1; }
  sleep 10
done

gcloud run jobs deploy "$JOB" --image "$IMAGE" --region "$REGION" --service-account "$SA" \
  --set-secrets "SUPABASE_SERVICE_KEY=$SECRET:latest" --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=$DB_URL" \
  --cpu 2 --memory 2Gi --task-timeout 30m --max-retries 1 "${G[@]}" --quiet
gcloud run jobs add-iam-policy-binding "$JOB" --region "$REGION" --member "serviceAccount:$SA" \
  --role roles/run.invoker "${G[@]}" >/dev/null

common=(--location "$REGION" --schedule "$SCHEDULE" --time-zone "Asia/Singapore" --http-method POST
  --uri "https://run.googleapis.com/v2/projects/$PROJ/locations/$REGION/jobs/$JOB:run"
  --oauth-service-account-email "$SA" --attempt-deadline 60s)
if gcloud scheduler jobs describe "$JOB" --location "$REGION" "${G[@]}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${common[@]}" "${G[@]}" >/dev/null
else
  gcloud scheduler jobs create http "$JOB" "${common[@]}" "${G[@]}" >/dev/null
fi
echo "Scheduled $JOB ($SCHEDULE, Asia/Singapore)"
