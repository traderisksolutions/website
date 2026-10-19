#!/usr/bin/env bash
# Seed each site's first knowledge file from seeds/knowledge/<site>.txt through the dashboard
# API, which also mirrors the file into knowledge_entries for the engine. Skips a site that
# already has a version.
#
#   Local (writes to the live DB through a local server):
#     API_GATE_MODE=log-only CRON_SECRET=seed npx next dev -p 3111 &
#     CRON_SECRET=seed ./scripts/seed-knowledge.sh http://localhost:3111
#   Production:
#     CRON_SECRET=<vercel value> ./scripts/seed-knowledge.sh https://<dashboard host>
set -euo pipefail
BASE="${1:?usage: seed-knowledge.sh <base url>}"
: "${CRON_SECRET:?CRON_SECRET is required}"
cd "$(dirname "$0")/.."
for f in seeds/knowledge/*.txt; do
  key="$(basename "$f" .txt)"
  cur="$(curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/marketing/knowledge/file?site=$key")"
  if echo "$cur" | grep -q '"current":{'; then echo "$key: already has a version, skipped"; continue; fi
  body="$(python3 -c 'import json,sys;print(json.dumps({"text":open(sys.argv[1]).read()}))' "$f")"
  res="$(curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H "content-type: application/json" --data "$body" "$BASE/api/marketing/knowledge/file?site=$key")"
  echo "$key: $res"
done
