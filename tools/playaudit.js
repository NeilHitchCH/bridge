// Audit play suggestions over random deals: every tip must be legal and follow basic principles.
const E = require('../src/engine'), G = require('../src/game'), T = require('../src/tips'), P = require('../src/play');
const R = E.rankOf, S = E.suitOf;
const N = +process.argv[2] || 300; const VERB = process.argv[3];
let x = +process.argv[4] || 7; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
const issues = {}; let checks = 0;
const flag = (k, info) => { (issues[k] = issues[k] || []).push(info); };
const beats = (c, w, tr) => (S(c) === S(w) ? R(c) > R(w) : tr !== 'N' && S(c) === tr && S(w) !== tr);
const fmtH = (h) => ['S', 'H', 'D', 'C'].map((t) => h.filter((q) => q[0] === t).map((q) => q[1]).join('') || '-').join('.');
for (let k = 1; k <= N; k++) {
  const b = G.newBoard(k, rng);
  while (b.phase !== 'done') {
    if (b.trickComplete) { G.collectTrick(b); continue; }
    const a = G.botAction(b);
    if (b.phase === 'play') {
      const turn = b.turn, ctrl = G.controllerOf(b, turn);
      const tip = T.playTip(b, ctrl); checks++;
      const legal = E.legalCards(b.hands[turn], b.trick);
      const c = tip.card;
      const ctx = () => `bd${k} ${E.contractStr(b.contract)} by ${b.contract.declarer} turn ${turn} hand ${fmtH(b.hands[turn])} trick [${b.trick.map((t) => t.seat + t.card).join(' ')}] tip ${c} | ${tip.text}`;
      if (!legal.includes(c)) flag('illegal', ctx());
      if (!tip.text.includes(T.cardTxt(c))) flag('text-mismatch', ctx());
      if (c !== a.value) flag('tip-differs-from-bot', ctx());
      const t = b.trick, pos = t.length, tr = b.contract.strain;
      if (pos === 0 && E.sameSide(turn, b.contract.declarer) && tr !== 'N') {
        const K = P.knowledge(b, turn);
        const ours = [...K.visible[K.declarer], ...K.visible[K.dummy]];
        let out = 0; for (let r = 2; r <= 14; r++) if (!K.gone.has(E.makeCard(tr, r))) out++;
        let sure = 0; for (const su of E.SUITS) sure += P.sureTricks(K, su, K.visible[K.declarer], K.visible[K.dummy]);
        const ourTop = ours.filter((q) => S(q) === tr).some((q) => { for (let r = R(q) + 1; r <= 14; r++) if (!K.gone.has(E.makeCard(tr, r))) return false; return true; });
        if (out > 0 && ourTop && sure >= K.need && S(c) !== tr && b.hands[turn].some((q) => S(q) === tr)) flag('declarer-not-drawing-trumps', ctx() + ' sure=' + sure + ' need=' + K.need + ' oppTrumps=' + out);
      }
      if (b.tricks.length === 0 && pos === 0) {
        const cs = P.bySuit(b.hands[turn], S(c));
        if (P.leadCardFrom(cs, tr) !== c) flag('lead-card-not-standard', ctx());
        const i = cs.indexOf(c);
        if (/fourth highest/.test(tip.text) && i !== 3) flag('lead-text-mismatch', ctx());
        if (/top of a (sequence|doubleton)/.test(tip.text) && i !== 0) flag('lead-text-mismatch', ctx());
        if (/middle of three/.test(tip.text) && i !== 1) flag('lead-text-mismatch', ctx());
        if (/low from an honour/.test(tip.text) && i !== cs.length - 1) flag('lead-text-mismatch', ctx());
        if (/interior/.test(tip.text) && i !== 1) flag('lead-text-mismatch', ctx());
        if (/cash the ace/.test(tip.text) && R(c) !== 14) flag('lead-text-mismatch', ctx());
        if (/the king asks/.test(tip.text) && R(c) !== 13) flag('lead-text-mismatch', ctx());
      }
      if (pos > 0 && legal.length > 1) {
        const led = S(t[0].card);
        const wseat = E.trickWinner(t, tr); const win = t.find((q) => q.seat === wseat).card;
        const sideWinning = E.sameSide(wseat, turn);
        const follows = legal.some((q) => S(q) === led);
        const winners = legal.filter((q) => beats(q, win, tr));
        if (pos === 3) {
          if (sideWinning && beats(c, win, tr) && legal.some((q) => !beats(q, win, tr))) flag(follows ? '4th-overtakes-partner' : '4th-ruffs-partner', ctx());
          if (!sideWinning && winners.length && !beats(c, win, tr)) flag(tr === 'N' && turn === b.contract.declarer || tr==='N' && turn===G.dummyOf(b) ? '4th-holdup(info)' : '4th-fails-to-win', ctx());
          if (!sideWinning && beats(c, win, tr)) { const low = winners.filter((q) => S(q) === S(c)).sort((p, q) => R(p) - R(q))[0]; if (R(low) < R(c)) { // equivalent?
              let eq = true; for (let r = R(low) + 1; r < R(c); r++) { const m = E.makeCard(S(c), r); if (!legal.includes(m) && !b.tricks.some((tt) => tt.cards.some((cc) => cc.card === m)) && !t.some((tt) => tt.card === m)) eq = false; }
              if (!eq) flag('4th-wins-too-high', ctx()); } }
          if (!winners.length && follows && S(c) === led) { const lo = legal.filter((q) => S(q) === led).sort((p, q) => R(p) - R(q))[0]; if (c !== lo) flag('4th-wastes-card', ctx()); }
        }
        if (pos === 1 && follows && R(t[0].card) < 10 && R(c) >= 11 && S(c) === led) flag(E.sameSide(turn, b.contract.declarer) ? '2nd-hand-high-declarer(info)' : '2nd-hand-high-defender', ctx() + ' need=' + P.knowledge(b, turn).need);
        if (pos === 1 && follows && !E.sameSide(turn, b.contract.declarer) && R(t[0].card) >= 11 && R(t[0].card) <= 13) {
          const cover = legal.find((q) => S(q) === led && R(q) === R(t[0].card) + 1) || legal.find((q) => S(q) === led && R(q) > R(t[0].card) && R(q) <= 13);
          const dummyLedSeq = t[0].seat === G.dummyOf(b) && b.hands[t[0].seat].some((q) => S(q) === led && R(q) === R(t[0].card) - 1);
          if (cover && !beats(c, win, tr) && !dummyLedSeq) flag('2nd-no-cover', ctx());
        }
        if (pos === 2 && sideWinning && follows && beats(c, win, tr) && legal.some((q) => !beats(q, win, tr))) {
          // overtaking partner's card in third seat: ok only if partner's card isn't top
          flag('3rd-overtakes-partner(info)', ctx());
        }
        if (pos === 2 && !sideWinning && follows && winners.some((q) => S(q) === led) && !beats(c, win, tr)) flag('3rd-hand-not-high(info)', ctx());
      }
    }
    a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value);
  }
}
console.log('checks', checks);
for (const [k, v] of Object.entries(issues)) { console.log(k, v.length); if (VERB) for (const s of v.slice(0, +VERB)) console.log('   ', s); }
