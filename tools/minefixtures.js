// Find real positions where the classic engine failed to cash an ace (cost >= 1 trick double dummy)
// and the simulation engine plays a correct card; save them as regression fixtures.
const E = require('../src/engine'), G = require('../src/game'), P = require('../src/play'), DD = require('../src/dd');
P.ready.then(() => {
  const found = { def: [], decl: [], late: [] };
  for (let k = 1; k <= 400 && (found.def.length < 3 || found.decl.length < 3 || found.late.length < 3); k++) {
    let x = 5000 + k * 31; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const b = G.newBoard(k, rng);
    while (b.phase !== 'done') {
      if (b.trickComplete) { G.collectTrick(b); continue; }
      P.config.engine = 'heuristic';
      const a = G.botAction(b);
      if (b.phase === 'play' && b.tricks.length > 0) {
        const legal = E.legalCards(b.hands[b.turn], b.trick);
        if (legal.length > 1) {
          const sc = DD.solve(b.hands, b.contract.strain, b.trick, b.turn);
          const best = Math.max(...legal.map((c) => sc[c]));
          const goodAces = legal.filter((c) => c[1] === 'A' && sc[c] === best);
          if (best - sc[a.value] >= 1 && goodAces.length && a.value[1] !== 'A') {
            P.config.engine = 'sim'; P.config.budgetMs = 400;
            const snap = JSON.parse(JSON.stringify(b));
            const s2 = P.chooseCard(snap, b.turn);
            const K = P.knowledge(b, b.turn);
            if (sc[s2] === best) {
              const cls = b.tricks.length >= 9 ? 'late' : K.role === 'defender' ? 'def' : 'decl';
              if (found[cls].length < 3) found[cls].push({ cls, board: snap, seat: b.turn, classic: a.value, sim: s2, best: legal.filter((c) => sc[c] === best), cost: best - sc[a.value] });
            }
          }
        }
      }
      G.applyCard ? (a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value)) : 0;
    }
  }
  const all = [...found.def, ...found.decl, ...found.late];
  require('fs').writeFileSync(__dirname + '/../test/fixtures/cash-ace.json', JSON.stringify(all));
  for (const f of all) console.log(f.cls, 'bd', f.board.number, E.contractStr(f.board.contract), 'by', f.board.contract.declarer, 'turn', f.seat, 'trick', f.board.tricks.length + 1, 'classic', f.classic, 'sim', f.sim, 'best', f.best.join(','), 'cost', f.cost);
});
