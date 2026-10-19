'use strict';
// Hard follow-suit check: many boards with the double-dummy engine on, through the real RoomManager
// (server validation, declarer control, per-seat views), with mixed human/computer seats:
// solo (computer partner, incl. human playing dummy and a computer declarer's hand), two humans,
// and all-computer tables. "Humans" pick random cards from the legal cards the server offers them.
// Every card is audited against the ORIGINAL deal: any revoke fails the test.
// Usage: node test/revoke.js [boards=1000] [workers=8]
const { fork } = require('child_process');
const N = +process.argv[2] || 1000, W = +process.argv[3] || Math.min(8, require('os').cpus().length);
const E = require('../src/engine'), G = require('../src/game'), P = require('../src/play');

function audit(original, tricks, label) {
  const hands = JSON.parse(JSON.stringify(original));
  const errs = [];
  tricks.forEach((t, i) => {
    const led = t.cards[0].card[0];
    for (const tc of t.cards) {
      const h = hands[tc.seat];
      if (!h.includes(tc.card)) errs.push(`${label} trick ${i + 1}: ${tc.seat} played ${tc.card} it did not hold`);
      if (tc.card[0] !== led && h.some((c) => c[0] === led)) errs.push(`${label} trick ${i + 1}: ${tc.seat} REVOKED ${tc.card} on a ${led} lead holding ${h.filter((c) => c[0] === led)}`);
      h.splice(h.indexOf(tc.card), 1);
    }
  });
  return errs;
}

if (process.env.REVOKE_CHILD) {
  const { RoomManager } = require('../src/room');
  const [from, to] = JSON.parse(process.env.REVOKE_CHILD);
  Object.assign(P.config, { engine: 'sim', budgetMs: 4, minSamples: 1, maxSamples: 2 });
  const SYS = ['sayc', 'twoOverOne', 'acol', 'precision', 'beginner', 'sef'];
  P.ready.then(() => {
    const out = { boards: 0, cards: 0, botCards: 0, humanCards: 0, dummyByHuman: 0, strains: {}, errors: [], rejected: 0 };
    let x = 424242 + from; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    for (let k = from; k < to; k++) {
      const mgr = new RoomManager({ botDelay: 1e9, bidDelay: 1e9, trickPause: 1e9 });
      const seat = E.SEATS[k % 4];
      const mode = ['solo', 'two', 'bots'][k % 3];
      const { room } = mgr.create({ name: 'H', seat, partner: mode === 'two' ? 'open' : 'bot', system: SYS[k % 6], oppSystem: SYS[(k + 2) % 6] });
      if (mode === 'two') mgr.sit(room, E.partnerOf(seat), 'H2');
      if (mode === 'bots') room.seats[seat] = { type: 'bot', name: 'x' };
      clearTimeout(room.timer); room.timer = null;
      const b = room.board;
      let steps = 0;
      while (b.phase !== 'done' && steps++ < 400) {
        clearTimeout(room.timer); room.timer = null;
        if (b.trickComplete) { G.collectTrick(b); continue; }
        if (b.phase === 'auction') { const a = G.botAction(b); G.applyCall(b, a.actor, a.value); continue; }
        mgr.syncControl(room);
        const ctrl = G.controllerOf(b, b.turn);
        const legal = E.legalCards(b.hands[b.turn], b.trick);
        if (room.seats[ctrl].type === 'human') {
          const v = mgr.view(room, ctrl);
          if (JSON.stringify(v.board.legalCards.slice().sort()) !== JSON.stringify(legal.slice().sort())) out.errors.push(`board ${k}: view legal cards differ from the rules`);
          // try an illegal card first: the server must refuse it
          const bad = b.hands[b.turn].find((c) => !legal.includes(c));
          if (bad) { try { mgr.play(room, ctrl, bad); out.errors.push(`board ${k}: server accepted illegal ${bad}`); } catch { out.rejected++; } clearTimeout(room.timer); room.timer = null; }
          if (b.turn !== ctrl) out.dummyByHuman++;
          mgr.play(room, ctrl, v.board.legalCards[Math.floor(rng() * v.board.legalCards.length)]);
          out.humanCards++;
        } else {
          const a = G.botAction(b);
          if (!legal.includes(a.value)) out.errors.push(`board ${k}: computer chose illegal ${a.value} for ${b.turn} (legal ${legal})`);
          mgr.play(room, a.actor, a.value); // the same validated path as human plays
          out.botCards++;
        }
        clearTimeout(room.timer); room.timer = null;
        out.cards++;
      }
      clearTimeout(room.timer);
      if (b.phase !== 'done') { out.errors.push(`board ${k}: did not finish`); continue; }
      out.boards++;
      if (b.contract) { out.strains[b.contract.strain] = (out.strains[b.contract.strain] || 0) + 1; out.errors.push(...audit(b.original, b.tricks, `board ${k}`)); }
    }
    process.send(out); process.exit(0);
  });
} else if (require.main === module) {
  const t0 = Date.now(); const per = Math.ceil(N / W); const tot = { boards: 0, cards: 0, botCards: 0, humanCards: 0, dummyByHuman: 0, rejected: 0, strains: {}, errors: [] };
  let done = 0, n = 0;
  for (let i = 0; i < W; i++) {
    const from = 1 + i * per, to = Math.min(N + 1, from + per); if (from >= to) continue; n++;
    const c = fork(__filename, [], { env: { ...process.env, REVOKE_CHILD: JSON.stringify([from, to]) } });
    c.on('message', (m) => { for (const k of ['boards', 'cards', 'botCards', 'humanCards', 'dummyByHuman', 'rejected']) tot[k] += m[k]; for (const s in m.strains) tot.strains[s] = (tot.strains[s] || 0) + m.strains[s]; tot.errors.push(...m.errors); });
    c.on('exit', (code) => { if (code) tot.errors.push('worker crashed'); if (++done === n) finish(); });
  }
  function finish() {
    const summary = { ...tot, errors: tot.errors.length, seconds: Math.round((Date.now() - t0) / 1000) };
    if (tot.errors.length || tot.boards !== N) { console.error('REVOKE TEST FAILED', JSON.stringify(summary)); for (const e of tot.errors.slice(0, 20)) console.error('  ' + e); process.exit(1); }
    console.log('follow-suit test OK', JSON.stringify(summary));
  }
}
module.exports = { audit };
