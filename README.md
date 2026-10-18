# Bridge Club (PWA)
Run: `npm install && node server.js` (port 8787), or `./start.sh` for the server plus a cloudflared quick tunnel. start.sh prints the trycloudflare URL.
Tests: `npm test`, which runs the unit tests, a 500-board simulation and the two-client WebSocket test.
- Per-system simulation: `node test/simulate.js 300 acol sayc`
- Against a deployed server: `node test/twoclient.js https://<host>`
- Screenshots: `node tools/screens.js`, saved to screenshots/

Note: on the agent box, cloudflared cannot reach Cloudflare's edge, because outbound TCP/UDP 7844 is blocked. Run start.sh on any machine with normal internet access.
Strategy and sources: see STRATEGY.md.
