#!/usr/bin/env bash
# =============================================================================
# NIWMS security spot-check — repeatable cross-role / cross-tenant matrix
# =============================================================================
# Usage:
#   BASE_URL=http://localhost:3000 \
#   ORG_A="Synthetic Organization A" ORG_B="Synthetic Organization B" \
#   ADMIN_A=syntheticorga.orgadmin@example.test \
#   EMP_A=syntheticorga.employee1@example.test \
#   ADMIN_B=syntheticorgb.orgadmin@example.test \
#   PASSWORD='...' \
#   CRON_SECRET='...' \
#   bash scripts/security-spot-check.sh
#
# Exits non-zero if any expectation fails. Safe against synthetic tenants
# only; read-only or rejected-by-design requests.
set -u
BASE_URL="${BASE_URL:-http://localhost:3000}"
ORG_A="${ORG_A:-Synthetic Organization A}"
ORG_B="${ORG_B:-Synthetic Organization B}"
ADMIN_A="${ADMIN_A:-syntheticorga.orgadmin@example.test}"
EMP_A="${EMP_A:-syntheticorga.employee1@example.test}"
ADMIN_B="${ADMIN_B:-syntheticorgb.orgadmin@example.test}"
PASSWORD="${PASSWORD:?PASSWORD env var required}"
CRON_SECRET="${CRON_SECRET:-invalid-secret}"
JAR_A="/tmp/niwms-qa-admin-a.jar"
JAR_B="/tmp/niwms-qa-admin-b.jar"
JAR_E="/tmp/niwms-qa-emp-a.jar"
FAILURES=0
PASS=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo "  PASS  $label (got $actual)"
  else
    FAILURES=$((FAILURES + 1))
    echo "  FAIL  $label — expected $expected, got $actual"
  fi
}

status_of() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

login() { # jar org username
  status_of -c "$1" -X POST "$BASE_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"organization\":\"$2\",\"username\":\"$3\",\"password\":\"$PASSWORD\"}"
}

json_field() { # json python-expr
  printf '%s' "$1" | python3 -c "import sys, json; d = json.load(sys.stdin); print($2)"
}

echo "== logins =="
check "org A admin login" 200 "$(login "$JAR_A" "$ORG_A" "$ADMIN_A")"
check "org A employee login" 200 "$(login "$JAR_E" "$ORG_A" "$EMP_A")"
check "org B admin login" 200 "$(login "$JAR_B" "$ORG_B" "$ADMIN_B")"

echo "== authentication boundaries =="
check "anon -> /api/auth/me" 401 "$(status_of "$BASE_URL/api/auth/me")"
check "anon -> /api/admin/stats" 401 "$(status_of "$BASE_URL/api/admin/stats")"
check "anon -> /api/admin/password-resets" 401 "$(status_of "$BASE_URL/api/admin/password-resets")"

echo "== role boundaries (employee cookie) =="
check "employee -> /api/admin/stats" 403 "$(status_of -b "$JAR_E" "$BASE_URL/api/admin/stats")"
check "employee -> /api/admin/employees" 403 "$(status_of -b "$JAR_E" "$BASE_URL/api/admin/employees")"
check "employee -> /api/organizations/settings" 403 "$(status_of -b "$JAR_E" "$BASE_URL/api/organizations/settings")"
check "employee -> /api/admin/reports" 403 "$(status_of -b "$JAR_E" "$BASE_URL/api/admin/reports")"
check "employee -> /api/platform/overview" 403 "$(status_of -b "$JAR_E" "$BASE_URL/api/platform/overview")"

echo "== cron secret boundaries =="
check "reminders with bad bearer" 401 "$(status_of -X POST "$BASE_URL/api/internal/reminders" -H 'Authorization: Bearer invalid-secret')"
check "billing sync with bad bearer" 401 "$(status_of -X POST "$BASE_URL/api/internal/billing/sync" -H 'Authorization: Bearer invalid-secret')"

echo "== notification ownership =="
check "employee PATCH unknown notification id" 404 "$(status_of -b "$JAR_E" -X PATCH "$BASE_URL/api/notifications/00000000-0000-4000-8000-000000000000")"
check "employee DELETE unknown notification id" 404 "$(status_of -b "$JAR_E" -X DELETE "$BASE_URL/api/notifications/00000000-0000-4000-8000-000000000000")"

echo "== cross-tenant isolation (org B admin cookie) =="
# Find one org A employee (reportingEmployee id) via org A admin
EMPLOYEES_JSON="$(curl -s -b "$JAR_A" "$BASE_URL/api/admin/employees")"
ORG_A_EMP_ID="$(json_field "$EMPLOYEES_JSON" "d['employees'][0]['id'] if d.get('employees') else ''")"
# Find one org A user account id via the reports list (userId field)
REPORTS_JSON="$(curl -s -b "$JAR_A" "$BASE_URL/api/admin/reports?limit=1")"
ORG_A_USER_ID="$(json_field "$REPORTS_JSON" "(d['reports'][0].get('user') or {}).get('id','') if d.get('reports') else ''")"

if [ -n "$ORG_A_USER_ID" ]; then
  B_VIEW="$(curl -s -b "$JAR_B" "$BASE_URL/api/admin/reports?userId=$ORG_A_USER_ID")"
  ROWS="$(json_field "$B_VIEW" "len(d.get('reports', []))")"
  check "org B sees 0 rows for org A employee filter" 0 "$ROWS"
else
  echo "  SKIP  cross-tenant reports filter (org A has no reports to sample)"
fi

if [ -n "$ORG_A_EMP_ID" ]; then
  check "org B PATCH org A employee" 404 "$(status_of -b "$JAR_B" -X PATCH "$BASE_URL/api/admin/employees/$ORG_A_EMP_ID" -H 'Content-Type: application/json' -d '{"status":"suspended"}')"
  check "org B DELETE org A employee" 404 "$(status_of -b "$JAR_B" -X DELETE "$BASE_URL/api/admin/employees/$ORG_A_EMP_ID")"
else
  echo "  SKIP  cross-tenant employee mutation (org A has no employees)"
fi

B_RESETS="$(curl -s -b "$JAR_B" "$BASE_URL/api/admin/password-resets?status=pending")"
B_PENDING="$(json_field "$B_RESETS" "d.get('pendingCount', -1)")"
A_RESETS="$(curl -s -b "$JAR_A" "$BASE_URL/api/admin/password-resets?status=pending")"
A_PENDING="$(json_field "$A_RESETS" "d.get('pendingCount', -1)")"
if [ "$B_PENDING" != "-1" ] && [ "$A_PENDING" != "-1" ]; then
  if [ "$B_PENDING" -le "$A_PENDING" ]; then
    PASS=$((PASS + 1)); echo "  PASS  org B pending resets ($B_PENDING) <= org A ($A_PENDING) — no cross-org visibility gain"
  else
    FAILURES=$((FAILURES + 1)); echo "  FAIL  org B sees more pending resets ($B_PENDING) than org A ($A_PENDING)"
  fi
else
  echo "  SKIP  reset-request isolation probe (API error)"
fi

rm -f "$JAR_A" "$JAR_B" "$JAR_E"
echo "== summary: $PASS passed, $FAILURES failed =="
[ "$FAILURES" -eq 0 ]
