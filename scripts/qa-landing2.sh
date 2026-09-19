#!/usr/bin/env bash
# Round 2: in-viewport shots of features / HIW / CTA+footer + login + dev.log errors
set -u
LOG=/home/z/my-project/tool-results/qa-landing2.log
SHOTS=/home/z/my-project/tool-results/qa
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

cd /home/z/my-project
setsid nohup bun run dev > dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
log "root responded $code"

agent-browser set viewport 1440 900 >/dev/null 2>&1
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1

# features section in viewport
agent-browser eval "document.querySelector('#features').scrollIntoView()" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/features-view.png" >/dev/null 2>&1 && log "shot: features-view"

# how-it-works in viewport
agent-browser eval "document.querySelector('#how-it-works').scrollIntoView()" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/hiw-view.png" >/dev/null 2>&1 && log "shot: hiw-view"

# CTA + footer in viewport
agent-browser eval "document.querySelector('footer').scrollIntoView({block:'end'})" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/cta-footer-view.png" >/dev/null 2>&1 && log "shot: cta-footer-view"

# reveal sanity: are feature cards visible after scroll?
agent-browser eval "(() => { const card=document.querySelector('#features article'); const cs=getComputedStyle(card); return 'features card opacity=' + cs.opacity })()" >> "$LOG" 2>&1

log "dev.log errors:"
rg -i "error|unhandled" dev.log | rg -v "telemetry|Anonymous|Fast Refresh" | head -5 >> "$LOG" 2>&1 || echo "none" >> "$LOG"

agent-browser close --all >/dev/null 2>&1
pkill -f "next dev" 2>/dev/null; pkill -f "bun run dev" 2>/dev/null
log "round 2 complete"
