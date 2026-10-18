// Replay board k with the same seeded rng as playaudit, stop at a position: node tools/playrepro.js bd seat trickPrefix
const E = require('../src/engine'), G = require('../src/game'), T = require('../src/tips'), P = require('../src/play');
const [bd, seat, prefix] = [+process.argv[2], process.argv[3], process.argv[4] || ''];
let x = +process.argv[5] || 7; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
const fmtH = (h) => ['S', 'H', 'D', 'C'].map((t) => h.filter((q) => q[0] === t).map((q) => q[1]).join('') || '-').join('.');
for (let k = 1; k <= bd; k++) {
  const b = G.newBoard(k, rng);
  while (b.phase !== 'done') {
    if (b.trickComplete) { G.collectTrick(b); continue; }
    const a = G.botAction(b);
    if (k === bd && b.phase === 'play' && b.turn === seat && b.trick.map((t) => t.seat + t.card).join(' ') === prefix) {
      console.log('orig', E.SEATS.map((s) => s + ':' + fmtH(b.original[s])).join('  '));
      console.log('auction', b.auction.map((q) => q.seat + q.call).join(' '));
      b.tricks.forEach((t, i) => console.log(' T' + (i + 1), t.cards.map((c) => c.seat + c.card).join(' '), '->', t.winner));
      console.log('now', E.SEATS.map((s) => s + ':' + fmtH(b.hands[s])).join('  '));
      const K = P.knowledge(b, seat); console.log('need', K.need, 'role', K.role);
      process.env.BRIDGE_DEBUG = 1; console.log(T.playTip(b, G.controllerOf(b, seat)));
      process.exit(0);
    }
    a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value);
  }
}
