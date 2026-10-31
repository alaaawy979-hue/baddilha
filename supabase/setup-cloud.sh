#!/usr/bin/env bash
# Builds (or rebuilds) the whole بدّلها cloud in one go on Supabase's FREE plan:
# project → tables → server secrets → functions → hourly job → app config.
# Needs: SUPABASE_ACCESS_TOKEN in the environment, VAPID keys in supabase/.secrets.env.
# Usage (from the repo root): bash supabase/setup-cloud.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is required}"
API=https://api.supabase.com/v1
auth=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
sb() { npx -y supabase "$@"; }
json() { python -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

# 1) organization (reuse the first one; never pick a paid plan)
ORG=$(curl -s "${auth[@]}" "$API/organizations" | json "d[0]['id'] if d else ''")
if [ -z "$ORG" ]; then ORG=$(sb orgs create baddilha --output json | sed -n '/^{/,$p' | json "d['id']"); fi
PLAN=$(curl -s "${auth[@]}" "$API/organizations/$ORG" | json "d.get('plan')")
[ "$PLAN" = "free" ] || { echo "Organization plan is '$PLAN', not free — stopping."; exit 1; }
echo "org: $ORG (free)"

# 2) project (reuse an existing 'baddilha' project if there is one)
REF=$(curl -s "${auth[@]}" "$API/projects" | json "next((p['id'] for p in d if p['name']=='baddilha' and p['organization_id']=='$ORG'), '')")
if [ -z "$REF" ]; then
  DBPW=$(python -c "import secrets,string;a=string.ascii_letters+string.digits;print(''.join(secrets.choice(a) for _ in range(28)))")
  sed -i '/^SUPABASE_DB_PASSWORD=/d' supabase/.secrets.env
  printf 'SUPABASE_DB_PASSWORD=%s\n' "$DBPW" >> supabase/.secrets.env
  REF=$(sb projects create baddilha --org-id "$ORG" --db-password "$DBPW" --region ap-south-1 --output json | sed -n '/^{/,$p' | json "d['id']")
fi
echo "project: $REF"
for i in $(seq 1 60); do
  s=$(curl -s "${auth[@]}" "$API/projects/$REF/health?services=db&services=rest" | json "','.join(x['status'] for x in d)" 2>/dev/null || true)
  [ "$s" = "ACTIVE_HEALTHY,ACTIVE_HEALTHY" ] && break; sleep 10
done
echo "health: $s"

# 3) point the app + hourly job at this project
ANON=$(curl -s "${auth[@]}" "$API/projects/$REF/api-keys" | json "[k['api_key'] for k in d if k['name']=='anon'][0]")
sed -i -E "s|supabaseUrl: '[^']*'|supabaseUrl: 'https://$REF.supabase.co'|; s|supabaseKey: '[^']*'|supabaseKey: '$ANON'|" js/config.js
sed -i -E "s|https://[a-z0-9]+\.supabase\.co/functions/v1/notify|https://$REF.supabase.co/functions/v1/notify|; s|'Bearer [^']*'|'Bearer $ANON'|" supabase/migrations/*_hourly_notify.sql

# 4) tables, secrets, functions
export SUPABASE_DB_PASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' supabase/.secrets.env | cut -d= -f2)"
sb link --project-ref "$REF" >/dev/null
sb db push --linked --include-all --yes 2>&1 | grep -E "Applying|Finished|error" || true
grep -E '^VAPID' supabase/.secrets.env > supabase/.temp/vapid.env
sb secrets set --env-file supabase/.temp/vapid.env --project-ref "$REF" >/dev/null && rm -f supabase/.temp/vapid.env
for f in notify feed; do sb functions deploy "$f" --no-verify-jwt --use-api --project-ref "$REF" 2>&1 | tail -1; done
curl -s -X POST "${auth[@]}" -H "Content-Type: application/json" "$API/projects/$REF/database/query" \
  -d '{"query":"select jobname, schedule, active from cron.job"}'; echo
echo "DONE ref=$REF"
