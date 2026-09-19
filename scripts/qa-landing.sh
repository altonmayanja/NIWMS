#!/usr/bin/env bash
# Landing-page QA: boots the dev server and runs all browser checks in ONE call
# (sandbox kills background processes between tool calls).
set -u
LOG=/home/z/my-project/tool-results/qa-landing.log
SHOTS=/home/z/my-project/tool-results/qa
mkdir -p "$SHOTS"
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

cd /home/z/my-project
setsid nohup bun run dev > dev.log 2>&1 &
DEV_PID=$!
log "dev server launching…"

for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
log "root responded $code after ~${i}s"

ab() { agent-browser "$@" 2>&1 | tail -4; }

# ---------- desktop ----------
agent-browser set viewport 1440 900 >/dev/null 2>&1
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/desktop-hero.png" >/dev/null 2>&1 && log "shot: desktop-hero"
agent-browser screenshot --full "$SHOTS/desktop-full.png" >/dev/null 2>&1 && log "shot: desktop-full"

agent-browser eval "(() => { const d=document.documentElement; return 'overflowGap=' + (d.scrollWidth - d.clientWidth) })()" >> "$LOG" 2>&1
log "UFMI check:"
agent-browser eval "document.body.innerText.includes('UFMI') ? 'FAIL: UFMI found' : 'PASS: no UFMI on landing'" >> "$LOG" 2>&1

# nav interactions
agent-browser eval "[...document.querySelectorAll('header a')].map(a=>a.textContent.trim()).filter(Boolean).join(' | ')" >> "$LOG" 2>&1

# FAQ accordion
agent-browser eval "[...document.querySelectorAll('#faq details summary')][1]?.scrollIntoView({block:'center'})" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('#faq details summary')][1].click()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "document.querySelectorAll('#faq details')[1].open ? 'PASS: FAQ accordion opens' : 'FAIL: FAQ did not open'" >> "$LOG" 2>&1
agent-browser screenshot "$SHOTS/faq-open.png" >/dev/null 2>&1 && log "shot: faq-open"

# pricing interval toggle
agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Monthly'))?.scrollIntoView({block:'center'})" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Monthly')).click()" >/dev/null 2>&1
agent-browser wait 600 >/dev/null 2>&1
agent-browser eval "(() => { const t=document.querySelector('#pricing').innerText; return t.includes('88,500') ? 'PASS: business monthly 88,500 incl VAT renders' : 'FAIL: monthly quote missing' })()" >> "$LOG" 2>&1
agent-browser screenshot "$SHOTS/pricing-monthly.png" >/dev/null 2>&1 && log "shot: pricing-monthly"

# calculator slider (server-verified quote)
agent-browser eval "(() => { const el=document.querySelector('#seats'); const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(el,'60'); el.dispatchEvent(new Event('input',{bubbles:true})); return 'slider=60' })()" >> "$LOG" 2>&1
agent-browser wait 1800 >/dev/null 2>&1
agent-browser eval "(() => { const c=document.querySelector('[data-testid=pricing-calculator]'); if (!c) return 'FAIL: calculator missing'; const t=c.innerText; if (!t.includes('server-verified')) return 'FAIL: quote not server-verified'; if (t.includes('Professional') && t.includes('177,000')) return 'PASS: calculator auto-fit Professional monthly 60 seats = 177,000 incl VAT'; return 'CHECK: ' + t.replace(/\n/g,' / ').slice(0, 400) })()" >> "$LOG" 2>&1

# annual toggle back + calculator plan chips screenshot
agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Annual')).click()" >/dev/null 2>&1
agent-browser wait 800 >/dev/null 2>&1

# CTA banner email flow → /start-free-trial prefill
agent-browser eval "(() => { const i=document.querySelector('#cta-email'); i.scrollIntoView({block:'center'}); const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; set.call(i,'jane@acme.co'); i.dispatchEvent(new Event('input',{bubbles:true})); return 'email set' })()" >> "$LOG" 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "document.querySelector('#cta-email').closest('form').querySelector('button[type=submit]').click()" >/dev/null 2>&1
agent-browser wait 2200 >/dev/null 2>&1
agent-browser eval "(() => ({ url: location.pathname + location.search, emailPrefilled: document.querySelector('#email')?.value || 'MISSING' }))()" >> "$LOG" 2>&1
agent-browser screenshot "$SHOTS/trial-prefilled.png" >/dev/null 2>&1 && log "shot: trial-prefilled"

# ---------- tablet ----------
agent-browser set viewport 768 1024 >/dev/null 2>&1
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1400 >/dev/null 2>&1
agent-browser screenshot --full "$SHOTS/tablet-full.png" >/dev/null 2>&1 && log "shot: tablet-full"
agent-browser eval "(() => { const d=document.documentElement; return 'tablet overflowGap=' + (d.scrollWidth - d.clientWidth) })()" >> "$LOG" 2>&1

# ---------- mobile ----------
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1400 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/mobile-hero.png" >/dev/null 2>&1 && log "shot: mobile-hero"
agent-browser screenshot --full "$SHOTS/mobile-full.png" >/dev/null 2>&1 && log "shot: mobile-full"
agent-browser eval "(() => { const d=document.documentElement; return 'mobile overflowGap=' + (d.scrollWidth - d.clientWidth) })()" >> "$LOG" 2>&1
agent-browser eval "header => 0" >/dev/null 2>&1
agent-browser eval "!!document.querySelector('button[aria-label=\"Open menu\"]') ? 'PASS: hamburger present' : 'FAIL: no hamburger'" >> "$LOG" 2>&1
agent-browser click 'button[aria-label="Open menu"]' >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/mobile-menu.png" >/dev/null 2>&1 && log "shot: mobile-menu"
agent-browser eval "(() => { const nav=[...document.querySelectorAll('nav')].find(n=>n.ariaLabel==='Mobile navigation'); return nav ? 'PASS: mobile nav shows ' + nav.innerText.replace(/\n/g,' / ') : 'FAIL: mobile nav missing' })()" >> "$LOG" 2>&1

# /login smoke
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/login.png" >/dev/null 2>&1 && log "shot: login"
agent-browser eval "location.pathname" >> "$LOG" 2>&1

# console + errors
log "console errors:"
agent-browser errors >> "$LOG" 2>&1
agent-browser console >> "$LOG" 2>&1

agent-browser close --all >/dev/null 2>&1
kill -- -$(ps -o pgid= $DEV_PID 2>/dev/null | tr -d ' ') 2>/dev/null
pkill -f "next dev" 2>/dev/null; pkill -f "bun run dev" 2>/dev/null
log "QA complete"
