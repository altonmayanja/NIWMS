#!/bin/bash
# One-shot E2E: server lifetime is limited to this tool call, so everything runs here.
cd /home/z/my-project
mkdir -p /tmp/qa-shots

setsid nohup ./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 2; CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$CODE" = "200" ] && break; done
echo "SERVER_READY=$CODE"

echo "=== [1] /api/plans engine numbers ==="
curl -s http://localhost:3000/api/plans | python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d['plans']:
    q=p['intervals']
    print(p['key'], '| monthly', q['monthly']['total'], '| quarterly', q['quarterly']['total'], '| annual', q['annual']['total'], '| annualSave', q['annual']['savings'], f\"({q['annual']['savingsPercent']}%)\")
"

echo "=== [2] /api/billing/quote business/annual/24 ==="
curl -s "http://localhost:3000/api/billing/quote?plan=business&interval=annual&seats=24" | python3 -c "
import json,sys
d=json.load(sys.stdin)
q=d['quote']
print('plan:',d['plan']['name'],'| interval:',d['interval'],'| seats:',d['seats'],'| fits:',d['fits'])
print('effective/mo:',q['effectiveMonthlyPrice'],'| subtotal:',q['subtotal'],'| vat:',q['vatAmount'],'| TOTAL:',q['total'])
print('period:',q['periodStartLabel'],'->',q['periodEndLabel'],'| renews:',q['renewsAt'][:10],'| savings:',q['savings'])
"

echo "=== [3] UFMI admin login ==="
curl -s -c /tmp/c-admin.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"organization":"ufmi","username":"Admin","password":"Admin@UFMI256"}' | python3 -c "
import json,sys
u=json.load(sys.stdin)['user']
print('user:',u['username'],'| role:',u['role'],'| orgType:',u.get('organizationType'),'| org:',u.get('organizationName'))
"
echo "=== [4] UFMI employee login (id number) ==="
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"organization":"ufmi","username":"UFMI001","password":"Cinema@UFMI2026"}' | python3 -c "
import json,sys
u=json.load(sys.stdin)['user']
print('user:',u['username'],'| role:',u['role'],'| orgType:',u.get('organizationType'))
"
echo "=== [5] UFMI admin /me (portal session works) ==="
curl -s -b /tmp/c-admin.txt http://localhost:3000/api/auth/me | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('me:',d['username'],'| org:',d.get('organizationName'),'| type:',d.get('organizationType'))
"
echo "=== [6] UFMI admin stats API (portal admin data) ==="
curl -s -b /tmp/c-admin.txt "http://localhost:3000/api/admin/stats" -o /dev/null -w "admin_stats=%{http_code}\n"

echo "=== [7] orgA admin set_interval quarterly ==="
curl -s -c /tmp/c-orga.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"organization":"Synthetic Organization A","username":"syntheticorga.orgadmin@example.test","password":"Ni#Synthetic2026"}' -o /dev/null -w "login=%{http_code}\n"
curl -s -b /tmp/c-orga.txt -X POST http://localhost:3000/api/billing -H "Content-Type: application/json" -d '{"action":"set_interval","interval":"quarterly"}' | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('persisted interval:',d['subscription']['billingInterval'],'| charge:',d['quote']['total'],'| periodEnd:',d['quote']['periodEndLabel'])
"
echo "=== [8] employee forbidden from set_interval ==="
curl -s -c /tmp/c-emp.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"organization":"Synthetic Organization A","username":"syntheticorga.employee1@example.test","password":"Ni#Synthetic2026"}' -o /dev/null -w "login=%{http_code}\n"
curl -s -b /tmp/c-emp.txt -X POST http://localhost:3000/api/billing -H "Content-Type: application/json" -d '{"action":"set_interval","interval":"annual"}' -o /dev/null -w "set_interval_as_employee=%{http_code} (expect 403)\n"

echo "=== [9] trial request carries plan selection ==="
curl -s -X POST http://localhost:3000/api/trial-requests -H "Content-Type: application/json" -d '{"organizationName":"Pricing Probe Co","contactName":"Probe Person","contactEmail":"pricing-probe@example.test","industry":"Technology","plan":"business","billingInterval":"annual","seats":24}' -w "\nhttp=%{http_code}\n" | head -c 300
echo ""
node -e "
const dotenv=require('dotenv');dotenv.config({path:'.env'});
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{const t=await p.trialRequest.findUnique({where:{contactEmail:'pricing-probe@example.test'}});console.log('notes:',t?.notes);await p.\$disconnect();})()
"

echo "=== [10] BROWSER: landing pricing ==="
agent-browser open http://localhost:3000/ 2>&1 | tail -1
agent-browser wait 1500 > /dev/null 2>&1
agent-browser eval "document.getElementById('pricing').scrollIntoView({block:'start'}); 'scrolled'" 2>&1 | tail -1
agent-browser wait 1200 > /dev/null 2>&1
agent-browser screenshot /tmp/qa-shots/pricing-cards.png 2>&1 | tail -1
agent-browser eval "
(() => {
  const calc = document.querySelector('[data-testid=\"pricing-calculator\"]');
  return calc ? 'calculator-present' : 'MISSING';
})()
" 2>&1 | tail -1

echo "=== [11] BROWSER: calculator quote for seats=60 (auto-fits Professional) ==="
agent-browser eval "
(() => {
  const s = document.getElementById('seats');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(s, '60');
  s.dispatchEvent(new Event('input', { bubbles: true }));
  return 'slider-set-60';
})()
" 2>&1 | tail -1
agent-browser wait 1200 > /dev/null 2>&1
agent-browser eval "
(() => {
  const calc = document.querySelector('[data-testid=\"pricing-calculator\"]');
  const text = calc ? calc.innerText.replace(/\n+/g, ' | ') : 'MISSING';
  return text.slice(0, 460);
})()
" 2>&1 | tail -1
agent-browser screenshot /tmp/qa-shots/pricing-calculator.png 2>&1 | tail -1

echo "=== [12] BROWSER: UFMI admin login -> portal ==="
agent-browser open http://localhost:3000/login 2>&1 | tail -1
agent-browser wait 1000 > /dev/null 2>&1
agent-browser eval "
(() => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('organization', 'ufmi');
  set('username', 'Admin');
  set('password', 'Admin@UFMI256');
  return 'filled';
})()
" 2>&1 | tail -1
agent-browser click "button[type=submit]" 2>&1 | tail -1
agent-browser wait 3000 > /dev/null 2>&1
agent-browser eval "window.location.pathname" 2>&1 | tail -1
agent-browser screenshot /tmp/qa-shots/ufmi-portal-admin.png 2>&1 | tail -1

echo "=== [13] BROWSER: logout, UFMI employee login -> portal ==="
agent-browser eval "(async () => { await fetch('/api/auth/logout', { method: 'POST' }); return 'logged-out'; })()" 2>&1 | tail -1
agent-browser wait 1000 > /dev/null 2>&1
agent-browser open http://localhost:3000/login 2>&1 | tail -1
agent-browser wait 1000 > /dev/null 2>&1
agent-browser eval "
(() => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('organization', 'ufmi');
  set('username', 'UFMI001');
  set('password', 'Cinema@UFMI2026');
  return 'filled';
})()
" 2>&1 | tail -1
agent-browser click "button[type=submit]" 2>&1 | tail -1
agent-browser wait 3000 > /dev/null 2>&1
agent-browser eval "window.location.pathname" 2>&1 | tail -1
agent-browser screenshot /tmp/qa-shots/ufmi-portal-employee.png 2>&1 | tail -1

echo "=== [14] BROWSER: mobile pricing check ==="
agent-browser set viewport 390 844 2>&1 | tail -1
agent-browser open http://localhost:3000/ 2>&1 | tail -1
agent-browser wait 1200 > /dev/null 2>&1
agent-browser eval "document.getElementById('pricing').scrollIntoView(); 'ok'" 2>&1 | tail -1
agent-browser wait 900 > /dev/null 2>&1
agent-browser eval "
(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth ? 'H-OVERFLOW' : 'clean',
  calcVisible: Boolean(document.querySelector('[data-testid=\"pricing-calculator\"]')),
}))()
" 2>&1 | tail -1
agent-browser screenshot /tmp/qa-shots/pricing-mobile.png 2>&1 | tail -1

echo "=== [15] console errors ==="
agent-browser console 2>&1 | tail -6
echo "E2E_DONE"
