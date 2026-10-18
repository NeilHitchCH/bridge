// Old (heuristic) vs new (simulation + double-dummy) card play on the same deals and auctions.
// Measures, against a double-dummy oracle, the tricks each engine gives away per board, and the
// declarer's result when the engines play against each other.
// Usage: node tools/compare.js [boards=200] [workers=8] [budgetMs=150]
const { fork } = require('child_process');
const N = +process.argv[2] || 200, W = +process.argv[3] || 8, BUDGET = +process.argv[4] || 150;
if (process.env.CMP_CHILD) {
  const E = require('../src/engine'), G = require('../src/game'), P = require('../src/play'), DD = require('../src/dd');
  P.config.budgetMs = BUDGET; P.config.maxSamples = 16;
  const [from, to] = JSON.parse(process.env.CMP_CHILD);
  P.ready.then(() => {
    const res = [];
    for (let k = from; k < to; k++) {
      let x = 1000 + k * 7919; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
      const base = G.newBoard(k, rng);
      while (base.phase === 'auction') { const a = G.botAction(base); G.applyCall(base, a.actor, a.value); }
      if (base.phase !== 'play') continue;
      const declSide = E.sideOf(base.contract.declarer);
      const lead = DD.solve(base.hands, base.contract.strain, [], base.turn);
      const ddDecl = 13 - Math.max(...Object.values(lead));
      const row = { k, contract: E.contractStr(base.contract), ddDecl };
      for (const [name, declEng, defEng] of [['old', 'heuristic', 'heuristic'], ['new', 'sim', 'sim'], ['newDecl', 'sim', 'heuristic'], ['newDef', 'heuristic', 'sim']]) {
        const b = JSON.parse(JSON.stringify(base));
        const cost = { decl: 0, def: 0 }, fourthMiss = { decl: 0, def: 0 };
        while (b.phase !== 'done') {
          if (b.trickComplete) { G.collectTrick(b); continue; }
          const side = E.sideOf(b.turn) === declSide ? 'decl' : 'def';
          P.config.engine = side === 'decl' ? declEng : defEng;
          const a = G.botAction(b);
          if (name === 'old' || name === 'new') {
            const legal = E.legalCards(b.hands[b.turn], b.trick);
            if (legal.length > 1) {
              const sc = DD.solve(b.hands, b.contract.strain, b.trick, b.turn);
              const best = Math.max(...legal.map((c) => sc[c]));
              const lost = best - sc[a.value];
              cost[side] += lost;
              if (lost > 0 && b.trick.length === 3) {
                const tr = b.contract.strain, w = E.trickWinner(b.trick, tr), wc = b.trick.find((q) => q.seat === w).card;
                const bt = (c) => (c[0] === wc[0] ? E.rankOf(c) > E.rankOf(wc) : tr !== 'N' && c[0] === tr && wc[0] !== tr);
                if (!E.sameSide(w, b.turn) && legal.some(bt) && !bt(a.value)) fourthMiss[side]++;
              }
            }
          }
          G.applyCard(b, a.actor, a.value);
        }
        row[name] = { tricks: b.result.tricks, made: b.result.made, cost, fourthMiss };
      }
      res.push(row);
    }
    process.send(res); process.exit(0);
  });
} else {
  const t0 = Date.now(); const all = []; let done = 0;
  const per = Math.ceil(N / W);
  for (let i = 0; i < W; i++) {
    const from = 1 + i * per, to = Math.min(N + 1, from + per);
    if (from >= to) { done++; continue; }
    const c = fork(__filename, process.argv.slice(2), { env: { ...process.env, CMP_CHILD: JSON.stringify([from, to]) } });
    c.on('message', (m) => all.push(...m));
    c.on('exit', () => { if (++done === W) report(); });
  }
  function report() {
    const n = all.length, avg = (f) => (all.reduce((t, r) => t + f(r), 0) / n).toFixed(3);
    const pct = (f) => ((100 * all.filter(f).length) / n).toFixed(1) + '%';
    console.log(`${n} boards played, ${((Date.now() - t0) / 1000).toFixed(0)}s, budget ${BUDGET}ms/card`);
    console.log('tricks given away vs double dummy, per board (lower is better):');
    console.log(`  old engine:  declarer ${avg((r) => r.old.cost.decl)}  defence ${avg((r) => r.old.cost.def)}`);
    console.log(`  new engine:  declarer ${avg((r) => r.new.cost.decl)}  defence ${avg((r) => r.new.cost.def)}`);
    console.log('fourth hand not winning a trick it could win, when that cost a trick (per 100 boards):');
    console.log(`  old: ${(100 * avg((r) => r.old.fourthMiss.decl + r.old.fourthMiss.def)).toFixed(1)}  new: ${(100 * avg((r) => r.new.fourthMiss.decl + r.new.fourthMiss.def)).toFixed(1)}`);
    console.log('declarer tricks minus double-dummy par:');
    for (const k of ['old', 'new', 'newDecl', 'newDef']) console.log(`  ${k.padEnd(8)} ${avg((r) => r[k].tricks - r.ddDecl)}   contracts made ${pct((r) => r[k].made)}`);
    console.log('  (newDecl = new engine declares vs old defence; newDef = old declarer vs new defence)');
    require('fs').writeFileSync('/tmp/compare.json', JSON.stringify(all));
  }
}
