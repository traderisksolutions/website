#!/usr/bin/env bash
# Reads a mailbox's inbox and sent mail back into the dashboard, one page at a time, until done.
# Messages already stored are skipped, so it is safe to stop and run again.
#   CRON_SECRET=… scripts/mailbox-readback.sh operations@trade-risksol.com 365
set -euo pipefail
MAILBOX=${1:?mailbox address}; DAYS=${2:-365}
BASE=${BASE:-https://trs-dashboard-pi.vercel.app}
: "${CRON_SECRET:?set CRON_SECRET}"
page=""; total=0
while :; do
  r=$(curl -s --max-time 310 -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/email/ingest?mailbox=$MAILBOX&days=$DAYS&size=50${page:+&page=$page}")
  n=$(echo "$r" | python3 -c "import json,sys;print(json.load(sys.stdin).get('processed',0))")
  total=$((total + n)); echo "$(date +%T) +$n (total $total) $(echo "$r" | python3 -c "import json,sys;print(json.load(sys.stdin).get('outcomes',''))")"
  page=$(echo "$r" | python3 -c "import json,sys;print(json.load(sys.stdin).get('next') or '')")
  [ -z "$page" ] && break
done
echo "done: $total messages read"
