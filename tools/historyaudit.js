// Flag revokes (and impossible cards) in stored hand history.
// Usage: node tools/historyaudit.js CODE [https://bridge-neil.onrender.com]   or   node tools/historyaudit.js file.json
const { revokesIn } = require('../src/room');
(async () => {
  const arg = process.argv[2]; const base = process.argv[3] || 'https://bridge-neil.onrender.com';
  const data = /\.json$/.test(arg) ? JSON.parse(require('fs').readFileSync(arg, 'utf8')) : await (await fetch(`${base}/api/history?code=${arg}`)).json();
  let bad = 0;
  for (const h of data.boards || []) {
    const rv = revokesIn(h.hands, h.tricks);
    // every played card must come from the player's original hand
    const own = []; for (const t of h.tricks || []) for (const c of t.cards) if (!(h.hands[c.seat] || []).includes(c.card)) own.push(c);
    console.log(`board ${h.number}: ${h.text || ''} ${rv.length || own.length ? 'PROBLEM' : 'ok'}`, rv.length ? JSON.stringify(rv) : '', own.length ? 'not-held: ' + JSON.stringify(own) : '');
    bad += rv.length + own.length;
  }
  if (!(data.boards || []).length) console.log('no finished boards');
  process.exit(bad ? 1 : 0);
})();
