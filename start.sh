#!/usr/bin/env bash
# Start (or restart) the bridge server and a cloudflared quick tunnel; prints the public URL.
cd "$(dirname "$0")"
pkill -f "node server.js" 2>/dev/null; pkill -f "cloudflared tunnel" 2>/dev/null; sleep 1
setsid nohup node server.js > server.log 2>&1 < /dev/null &
setsid nohup ./bin/cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:8787 > tunnel.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' tunnel.log | head -1)
  [ -n "$URL" ] && break; sleep 1
done
echo "${URL:-no tunnel URL yet - see tunnel.log}"
