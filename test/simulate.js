// Headless simulation: all four seats computer-controlled, many full boards.
const E = require('../src/engine');
const G = require('../src/game');
const N = +process.argv[2] || 1000;
const SYS = process.argv[3] || 'sayc', OPP = process.argv[4] || SYS;
const systems = { NS: { id: SYS }, EW: { id: OPP } };
let stats = { boards: 0, passedOut: 0, made: 0, down: 0, illegal: 0, stuck: 0, tricksTotal: 0, byLevel: {}, ms: 0 };
const t0 = Date.now();
for (let i = 1; i <= N; i++) {
  const b = G.newBoard(i, undefined, systems);
  let steps = 0;
  while (b.phase !== 'done') {
    if (b.trickComplete) { G.collectTrick(b); continue; }
    const a = G.botAction(b);
    if (!a) { stats.stuck++; break; }
    try {
      if (a.type === 'call') G.applyCall(b, a.actor, a.value); else G.applyCard(b, a.actor, a.value);
    } catch (e) { stats.illegal++; console.error('Illegal action on board', i, a, e.message); break; }
    if (++steps > 200) { stats.stuck++; console.error('Stuck board', i); break; }
  }
  if (b.phase !== 'done') continue;
  stats.boards++;
  // integrity: every card played exactly once
  if (!b.result.passedOut) {
    const seen = new Set(b.tricks.flatMap((t) => t.cards.map((c) => c.card)));
    if (seen.size !== 52 || b.tricks.length !== 13) { stats.illegal++; console.error('Integrity failure board', i); }
    // follow-suit audit against original hands
    const hands = JSON.parse(JSON.stringify(b.original));
    for (const t of b.tricks) {
      const led = t.cards[0].card[0];
      for (const tc of t.cards) {
        const h = hands[tc.seat];
        if (tc.card[0] !== led && h.some((c) => c[0] === led)) { stats.illegal++; console.error('Revoke board', i, tc); }
        h.splice(h.indexOf(tc.card), 1);
      }
    }
    b.result.made ? stats.made++ : stats.down++;
    stats.byLevel[b.contract.level] = (stats.byLevel[b.contract.level] || 0) + 1;
  } else stats.passedOut++;
}
stats.ms = Date.now() - t0;
console.log(SYS + ' vs ' + OPP + ': ' + JSON.stringify(stats));
if (stats.illegal || stats.stuck || stats.boards !== N) process.exit(1);
