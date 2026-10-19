'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine');
const B = require('../src/bidding');
const { resolveSystem, SYSTEMS } = require('../src/systems');

// 'AKQ2.K32.Q32.432' = spades.hearts.diamonds.clubs
function H(str) {
  const out = [];
  str.split('.').forEach((part, i) => { for (const r of part) out.push(['S', 'H', 'D', 'C'][i] + (r === '1' ? 'T' : r)); });
  assert.equal(out.length, 13, 'hand needs 13 cards: ' + str);
  return out;
}
const sys = (ns, ew = ns, conv) => ({ NS: resolveSystem(ns, conv), EW: resolveSystem(ew, conv) });
// bid for `seat` after calls (dealer N, calls listed from dealer)
function bid(system, hand, calls = [], dealer = 'N', conv) {
  const auction = []; let s = dealer;
  for (const c of calls) { auction.push({ seat: s, call: c }); s = E.nextSeat(s); }
  return B.chooseCall(H(hand), s, dealer, auction, { systems: sys(system, system, conv), debug: true });
}
function meaning(system, calls, dealer = 'N') {
  const auction = []; let s = dealer;
  for (const c of calls) { auction.push({ seat: s, call: c }); s = E.nextSeat(s); }
  const ann = B.annotate(dealer, auction, sys(system));
  return ann[ann.length - 1];
}

// ---------- rules ----------
test('scoring', () => {
  const sc = (level, strain, dbl, tricks, vul) => E.scoreContract({ level, strain, doubled: dbl }, tricks, vul);
  assert.equal(sc(4, 'H', 0, 10, false), 420);
  assert.equal(sc(3, 'N', 0, 9, true), 600);
  assert.equal(sc(3, 'N', 0, 10, false), 430);
  assert.equal(sc(2, 'S', 0, 8, false), 110);
  assert.equal(sc(1, 'N', 0, 7, false), 90);
  assert.equal(sc(6, 'S', 0, 12, true), 1430);
  assert.equal(sc(7, 'N', 0, 13, false), 1520);
  assert.equal(sc(2, 'H', 1, 8, false), 470); // doubled into game
  assert.equal(sc(1, 'N', 2, 7, true), 760);
  assert.equal(sc(3, 'N', 1, 6, true), -800);
  assert.equal(sc(4, 'S', 1, 7, false), -500);
  assert.equal(sc(4, 'S', 0, 8, true), -200);
  assert.equal(sc(3, 'C', 1, 10, false), 570);
});
test('bid legality', () => {
  const a = [{ seat: 'N', call: '1H' }];
  assert.ok(E.isLegalCall('N', a, '1S'));
  assert.ok(!E.isLegalCall('N', a, '1D'));
  assert.ok(!E.isLegalCall('N', a, 'XX'));
  assert.ok(E.isLegalCall('N', a, 'X'));
  assert.ok(!E.isLegalCall('N', [...a, { seat: 'E', call: 'P' }], 'X')); // can't double partner
  assert.ok(E.isLegalCall('N', [...a, { seat: 'E', call: 'X' }], 'XX'));
  assert.ok(!E.isLegalCall('N', [...a, { seat: 'E', call: 'X' }], 'X'));
  const done = [{ seat: 'N', call: '1C' }, { seat: 'E', call: 'P' }, { seat: 'S', call: 'P' }, { seat: 'W', call: 'P' }];
  assert.ok(E.auctionComplete(done));
  assert.ok(E.auctionComplete(['P', 'P', 'P', 'P'].map((c, i) => ({ seat: E.SEATS[i], call: c }))));
  assert.ok(!E.auctionComplete(['P', 'P', 'P'].map((c, i) => ({ seat: E.SEATS[i], call: c }))));
  const c = E.contractOf('N', [{ seat: 'N', call: '1H' }, { seat: 'E', call: 'P' }, { seat: 'S', call: '4H' }, { seat: 'W', call: 'X' }, { seat: 'N', call: 'P' }, { seat: 'E', call: 'P' }, { seat: 'S', call: 'P' }]);
  assert.equal(c.declarer, 'N'); assert.equal(c.level, 4); assert.equal(c.doubled, 1);
});
test('follow suit and trick winner', () => {
  const hand = ['SA', 'S2', 'HK', 'C3'];
  assert.deepEqual(E.legalCards(hand, [{ seat: 'W', card: 'S9' }]).sort(), ['S2', 'SA']);
  assert.deepEqual(E.legalCards(hand, [{ seat: 'W', card: 'D9' }]).sort(), [...hand].sort());
  const t = [{ seat: 'N', card: 'HQ' }, { seat: 'E', card: 'HK' }, { seat: 'S', card: 'S2' }, { seat: 'W', card: 'HA' }];
  assert.equal(E.trickWinner(t, 'S'), 'S');
  assert.equal(E.trickWinner(t, 'N'), 'W');
  assert.equal(E.trickWinner(t, 'C'), 'W');
});
test('vulnerability and dealer rotation', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => E.boardInfo(n).dealer), ['N', 'E', 'S', 'W', 'N']);
  assert.equal(E.boardInfo(1).vul, 'None'); assert.equal(E.boardInfo(2).vul, 'NS');
  assert.equal(E.boardInfo(3).vul, 'EW'); assert.equal(E.boardInfo(4).vul, 'Both');
  assert.equal(E.boardInfo(5).vul, 'NS');
});

// ---------- SAYC ----------
test('SAYC openings', () => {
  assert.equal(bid('sayc', 'AQ3.KJ4.Q943.K32'), '1N'); // 16 balanced
  assert.equal(bid('sayc', 'AQ3.KJ4.Q943.432'), '1D'); // 12 HCP balanced: opens (system card: 12-21)
  assert.equal(bid('sayc', 'Q93.KJ4.Q943.432'), 'P'); // 10 HCP, Rule of 20 = 17: pass
  assert.equal(bid('sayc', 'AQ3.KJ4.K943.432'), '1D'); // 13
  assert.equal(bid('sayc', 'AKJ54.K32.Q3.432'), '1S');
  assert.equal(bid('sayc', 'AK54.K32.Q3.J432'), '1C'); // no 5-card major, longer minor clubs
  assert.equal(bid('sayc', 'AKQ2.AKJ.KQ3.AQ2'), '2C');
  assert.equal(bid('sayc', 'AK2.AQ3.KQ32.QJ2'), '2N'); // 21 balanced
  assert.equal(bid('sayc', 'KQJ984.32.32.432'), '2S');
  assert.equal(bid('sayc', 'K3.32.32.AQJ9832'), '3C');
});
test('SAYC responses to 1NT: Stayman and transfers', () => {
  assert.equal(bid('sayc', 'KJ32.Q432.K32.32', ['1N', 'P']), '2C');
  assert.equal(bid('sayc', 'KJ932.432.432.32', ['1N', 'P']), '2H'); // transfer to spades
  assert.equal(bid('sayc', '32.QJ932.432.432', ['1N', 'P']), '2D');
  assert.equal(bid('sayc', 'K32.Q32.KJ32.Q32', ['1N', 'P']), '3N');
  assert.equal(bid('sayc', 'K32.Q32.J432.Q32', ['1N', 'P']), '2N');
  assert.equal(meaning('sayc', ['1N', 'P', '2D']).conv, 'transfer');
  assert.equal(meaning('sayc', ['1N', 'P', '2C']).conv, 'stayman');
});
test('SAYC major responses', () => {
  assert.equal(bid('sayc', 'K32.Q432.K32.432', ['1H', 'P']), '2H'); // simple raise
  assert.equal(bid('sayc', 'K32.KQ32.A32.Q32', ['1H', 'P']), '2N'); // Jacoby 2NT, 4 trumps GF
  assert.equal(bid('sayc', 'K32.KQ32.A32.432', ['1H', 'P']), '3H'); // limit raise
  assert.equal(bid('sayc', 'AQ32.43.K32.5432', ['1H', 'P']), '1S');
  assert.equal(bid('sayc', 'Q2.432.K432.Q432', ['1S', 'P']), '1N');
  assert.equal(meaning('sayc', ['1H', 'P', '2N']).conv, 'jacoby2n');
});
test('SAYC 2C waiting and negative double', () => {
  assert.equal(bid('sayc', '432.432.5432.432', ['2C', 'P']), '2D');
  assert.equal(bid('sayc', 'K432.Q432.32.K32', ['1C', '1D']), 'X');
  assert.equal(meaning('sayc', ['1C', '1D', 'X']).conv, 'negative');
});
test('SAYC competitive conventions', () => {
  assert.equal(bid('sayc', 'KQ932.AJ932.2.32', ['1C']), '2C'); // Michaels over a minor
  assert.equal(bid('sayc', '2.32.KQ932.AJ932', ['1S']), '2N'); // Unusual 2NT
  assert.equal(bid('sayc', 'AQ32.K432.2.KJ32', ['1D']), 'X'); // takeout double
});

// ---------- Beginner ----------
test('Beginner: no transfers, no weak twos, still Stayman', () => {
  assert.equal(bid('beginner', 'KQJ984.32.32.432'), 'P');
  assert.equal(bid('beginner', 'KJ32.Q432.K32.32', ['1N', 'P']), '2C');
  const r = bid('beginner', 'KJ932.432.432.32', ['1N', 'P']);
  assert.notEqual(r, '2H');
  assert.equal(r, '2S'); // natural sign-off
  assert.notEqual(bid('beginner', 'K32.KQ32.A32.432', ['1H', 'P']), '2N');
});

// ---------- 2/1 ----------
test('2/1: forcing 1NT and game-forcing two-over-one', () => {
  assert.equal(bid('twoOverOne', 'Q2.K32.K432.Q432', ['1S', 'P']), '1N'); // 10 HCP, no fit -> forcing NT
  assert.equal(meaning('twoOverOne', ['1S', 'P', '1N']).conv, 'forcingNT');
  assert.equal(bid('twoOverOne', '32.K32.KQ32.AQ32', ['1S', 'P']), '2D'); // 14: GF 2/1 (prefers the longer/better minor)
  assert.ok(meaning('twoOverOne', ['1S', 'P', '2D']).gf);
  // opener must not pass the forcing 1NT
  assert.notEqual(bid('twoOverOne', 'AKJ32.K32.432.32', ['1S', 'P', '1N', 'P']), 'P');
  // 2/1 auction must reach game
  const r = bid('twoOverOne', 'AKJ32.K32.432.32', ['1S', 'P', '2D', 'P']);
  assert.notEqual(r, 'P');
});
test('2/1: splinter and RKCB', () => {
  assert.equal(bid('twoOverOne', 'K432.2.AQ32.K432', ['1S', 'P']), '4H'); // splinter in hearts
  assert.equal(meaning('twoOverOne', ['1S', 'P', '4H']).conv, 'splinter');
  // RKCB 1430 answers with spades agreed
  const kc = (hand) => bid('twoOverOne', hand, ['1S', 'P', '2N', 'P', '4N', 'P'], 'N');
  // N opened 1S, S Jacoby, N 3S... simplified: N answers RKCB after S's 4NT
  assert.equal(kc('AQ432.K32.K32.32'), '5C'); // 1 key card (A)... + SK? no -> SA only =1
  assert.equal(kc('KQ432.K32.K32.32'), '5C'); // SK = 1
  assert.equal(kc('AQ432.A32.K32.32'), '5S'); // 2 + queen
  assert.equal(kc('AJ432.A32.K32.32'), '5H'); // 2, no queen
  assert.equal(kc('QJ432.K32.K32.32'), '5D'); // 0
  assert.equal(meaning('twoOverOne', ['1S', 'P', '2N', 'P', '4N', 'P', '5S']).conv, 'rkcresp');
});

// ---------- Acol ----------
test('Acol: weak NT and four-card majors', () => {
  assert.equal(bid('acol', 'K32.QJ4.Q943.A32'), '1N'); // 12
  assert.equal(bid('acol', 'AQ3.KJ4.Q943.K32'), '1D'); // 16 too strong for weak NT
  assert.equal(bid('acol', 'AQ32.KJ32.K32.Q2'), '1H'); // 15 balanced, too strong for weak NT: 4-4 majors open the lower
  assert.equal(bid('acol', 'AQ32.32.KJ2.KQ32'), '1C'); // 4-4 black, 15: lower
  assert.equal(meaning('acol', ['1S']).minLen, 4);
  assert.equal(meaning('sayc', ['1S']).minLen, 5);
  assert.equal(bid('acol', 'K32.Q32.J432.Q32', ['1N', 'P']), 'P'); // 8 opposite 12-14: pass
  assert.equal(bid('acol', 'K32.Q32.KJ32.Q32', ['1N', 'P']), '2N'); // 11 invites
  assert.equal(bid('acol', 'K32.Q32.KJ32.A32', ['1N', 'P']), '3N'); // 14
  const m = meaning('acol', ['1N']); assert.equal(m.lo, 12); assert.equal(m.hi, 14);
  // raise of a 4-card major needs 4 trumps
  assert.notEqual(bid('acol', 'K32.Q32.K432.432', ['1H', 'P']), '2H');
});

// ---------- Precision ----------
test('Precision openings', () => {
  assert.equal(bid('precision', 'AKJ54.K32.Q3.K32'), '1C'); // 17
  assert.equal(bid('precision', 'AK54.KQ2.Q32.K32'), '1C'); // 17 balanced
  assert.equal(bid('precision', 'AQ3.KJ4.K943.432'), '1N'); // 13 balanced
  assert.equal(bid('precision', 'AKJ54.K32.Q3.432'), '1S');
  assert.equal(bid('precision', 'A3.K32.32.AQJ432'), '2C'); // 6 clubs
  assert.equal(bid('precision', 'AQ32.K432.2.KJ32'), '2D'); // short diamonds
  assert.equal(bid('precision', 'AQ3.K32.QJ32.Q32'), '1N');
  assert.equal(bid('precision', 'AQ32.K3.QJ432.32'), '1D'); // 12, 5 diamonds: 1D (2+)
  assert.equal(meaning('precision', ['1C']).conv, 'strongClub');
  assert.equal(meaning('precision', ['1D']).minLen, 2);
});
test('Precision responses to 1C', () => {
  assert.equal(bid('precision', '432.Q432.K32.432', ['1C', 'P']), '1D'); // 5: negative
  assert.equal(meaning('precision', ['1C', 'P', '1D']).conv, 'precNeg');
  assert.equal(bid('precision', 'KQ432.K32.32.432', ['1C', 'P']), '1S'); // 8+ with 5 spades
  assert.equal(bid('precision', 'K32.Q32.KJ32.Q32', ['1C', 'P']), '1N'); // 11 balanced
  assert.equal(bid('precision', 'K32.Q32.KJ32.AQ2', ['1C', 'P']), '2N'); // 16 balanced
  // opener's rebid after a negative
  assert.equal(bid('precision', 'AK54.KQ2.Q32.K32', ['1C', 'P', '1D', 'P']), '1N');
  assert.equal(bid('precision', 'AKJ54.K32.Q3.K32', ['1C', 'P', '1D', 'P']), '1S');
});

// ---------- SEF (beta) ----------
test('SEF: 2D game force and 2C strong', () => {
  assert.equal(bid('sef', 'AKQ2.AKJ.KQ3.AQ2'), '2D');
  assert.equal(meaning('sef', ['2D']).conv, 'gf2d');
  assert.equal(bid('sef', 'AKQJ32.AK3.K3.32'), '2C');
  assert.equal(bid('sef', '432.432.5432.432', ['2D', 'P']), '2H');
  assert.equal(bid('sef', 'KQJ984.32.32.432'), '2S');
  assert.notEqual(bid('sef', '32.32.KQJ984.432'), '2D'); // no weak 2D in SEF
});

// ---------- convention toggles ----------
test('convention toggles change behaviour', () => {
  assert.equal(bid('sayc', 'KJ932.432.432.32', ['1N', 'P'], 'N', { transfers: false }), '2S');
  assert.notEqual(bid('sayc', 'KQJ984.32.32.432', [], 'N', { weakTwos: false }), '2S');
  assert.notEqual(bid('sayc', 'K432.Q432.32.K32', ['1C', '1D'], 'N', { negDbl: false }), 'X');
  assert.notEqual(bid('sayc', 'KQ932.AJ932.2.32', ['1C'], 'N', { michaels: false }), '2C');
  assert.notEqual(bid('sayc', 'K32.KQ32.A32.Q32', ['1H', 'P'], 'N', { jacoby2n: false }), '2N');
});

// ---------- tips ----------
test('suggestions and feedback are produced in plain English', () => {
  const s = B.suggest(H('AQ3.KJ4.Q943.K32'), 'N', 'N', [], sys('sayc'));
  assert.equal(s.call, '1N'); assert.match(s.text, /15–17|15-17/);
  const f = B.feedback(H('AQ3.KJ4.Q943.K32'), 'N', 'N', [], '1D', sys('sayc'));
  assert.ok(f && f.suggested === '1N' && f.text.length > 20);
  assert.equal(B.feedback(H('AQ3.KJ4.Q943.K32'), 'N', 'N', [], '1N', sys('sayc')), null);
  for (const id of Object.keys(SYSTEMS)) assert.ok(SYSTEMS[id].card && SYSTEMS[id].card.length, id + ' has a reference card');
});

// ---------- per-system auction simulation ----------
test('per-system simulation: auctions legal and terminate', () => {
  for (const id of Object.keys(SYSTEMS)) {
    const systems = sys(id, id === 'sayc' ? 'precision' : 'sayc');
    for (let k = 0; k < 400; k++) {
      const h = E.deal(); const d = E.SEATS[k % 4]; const a = [];
      while (!E.auctionComplete(a)) {
        const s = E.auctionTurn(d, a);
        const c = B.chooseCall(h[s], s, d, a, { systems, debug: true });
        assert.ok(E.isLegalCall(d, a, c), `${id}: illegal ${c}`);
        a.push({ seat: s, call: c });
        assert.ok(a.length < 40, id + ': auction too long');
      }
    }
  }
});

// ---------- card play & tips ----------
const G = require('../src/game');
const P = require('../src/play');
const T = require('../src/tips');
const { RoomManager } = require('../src/room');
// play position: hands by seat (as H()), contract, trick so far [[seat, card], ...]
function position({ hands, contract, declarer, trick = [], auction }) {
  const b = G.newBoard(1);
  for (const s of E.SEATS) b.hands[s] = E.sortHand(H(hands[s]));
  b.original = JSON.parse(JSON.stringify(b.hands));
  b.auction = auction || [];
  b.phase = 'play';
  b.contract = { level: +contract[0], strain: contract[1], doubled: 0, declarer };
  for (const [seat, card] of trick) { b.trick.push({ seat, card }); b.hands[seat].splice(b.hands[seat].indexOf(card), 1); }
  b.turn = trick.length ? E.nextSeat(trick[trick.length - 1][0]) : E.nextSeat(declarer);
  return b;
}

// classic (heuristic) engine tests: deterministic, independent of the double-dummy solver
const htest = (name, fn) => test(name, () => { const e = P.config.engine; P.config.engine = 'heuristic'; try { return fn(); } finally { P.config.engine = e; } });
htest('third hand high plays a card that really beats dummy, not a "cheaper equivalent" below it', () => {
  // 3NT by E (dummy W). South leads the 3 of clubs, dummy plays the singleton queen.
  // North's K wins; the old code offered the 10 (treating the queen on the table as already gone).
  const b = position({
    hands: { N: 'J732.K97.6.KJT86', E: 'AKQ.AQ64.QT75.74', S: 'T8.T53.K42.A9532', W: '9654.J82.AJ983.Q' },
    contract: '3N', declarer: 'E', trick: [['S', 'C3'], ['W', 'CQ']],
  });
  assert.equal(P.chooseCard(b, 'N'), 'CK');
  assert.equal(T.playTip(b, 'N').card, 'CK');
});
htest('second hand low: never "signal" with an honour from honours-only holdings', () => {
  // 4H by E. Declarer leads a low trump; South holds AJ doubleton and must not rise with the ace.
  const b = position({
    hands: { N: 'T974.7.9852.A952', E: 'K.Q965432.AJ7.K6', S: 'AQJ53.AJ.63.QJT3', W: '862.KT8.KQT4.874' },
    contract: '4H', declarer: 'E', trick: [['E', 'H2']],
  });
  assert.equal(P.chooseCard(b, 'S'), 'HJ');
});
htest("third hand does not overtake partner's 10 when the jack gains nothing", () => {
  // 1NT by W (dummy E). North leads the 10 of hearts, dummy plays low; South with J874 encourages/discourages with a spot.
  const b = position({
    hands: { N: 'A64.QT93.J84.J63', E: 'QJT5.K5.QT2.9854', S: 'K87.J874.K653.KT', W: '932.A62.A97.AQ72' },
    contract: '1N', declarer: 'W', trick: [['N', 'HT'], ['E', 'H5']],
  });
  const c = P.chooseCard(b, 'S');
  assert.notEqual(c, 'HJ');
  assert.equal(c[0], 'H');
});
htest('play tips name the hand being played (dummy vs own) and match the suggested card', () => {
  const b = position({
    hands: { N: 'AK32.K32.A32.432', E: 'QJT9.QJT.QJT.QJT', S: '8765.A54.K54.AK5', W: '4.9876.9876.9876' },
    contract: '4S', declarer: 'S', trick: [['W', 'H9']],
  });
  const tip = T.playTip(b, 'S'); // N (dummy) to play, South controls it
  assert.ok(b.hands.N.includes(tip.card));
  assert.match(tip.text, /from dummy/);
  assert.ok(tip.text.includes(T.cardTxt(tip.card)));
  assert.equal(T.playTip(b, 'N'), null); // the dummy seat itself gets no tip
});
htest('random positions: every suggested card is legal and follows basic play principles', () => {
  let x = 4242; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const beats = (c, w, tr) => (c[0] === w[0] ? E.rankOf(c) > E.rankOf(w) : tr !== 'N' && c[0] === tr && w[0] !== tr);
  let checked = 0;
  for (let k = 1; k <= 120; k++) {
    const b = G.newBoard(k, rng);
    while (b.phase !== 'done') {
      if (b.trickComplete) { G.collectTrick(b); continue; }
      const a = G.botAction(b);
      if (b.phase === 'play') {
        const tip = T.playTip(b, G.controllerOf(b, b.turn));
        const legal = E.legalCards(b.hands[b.turn], b.trick);
        assert.ok(legal.includes(tip.card), 'illegal tip ' + tip.card);
        assert.ok(tip.text.includes(T.cardTxt(tip.card)), 'text/card mismatch: ' + tip.text);
        assert.equal(tip.card, a.value, 'tip and computer choice differ');
        const t = b.trick, tr = b.contract.strain;
        if (t.length === 3 && legal.length > 1) {
          const w = E.trickWinner(t, tr), wc = t.find((q) => q.seat === w).card;
          const ours = E.sameSide(w, b.turn);
          if (ours && legal.some((q) => !beats(q, wc, tr))) assert.ok(!beats(tip.card, wc, tr), "4th hand overtook/ruffed partner's winner");
          const holdup = tr === 'N' && E.sameSide(b.turn, b.contract.declarer);
          if (!ours && !holdup && legal.some((q) => beats(q, wc, tr))) assert.ok(beats(tip.card, wc, tr), '4th hand failed to win');
        }
        if (t.length === 2 && legal.length > 1) {
          // when third hand plays to beat the current card, the card chosen must really beat it
          const w = E.trickWinner(t, tr), wc = t.find((q) => q.seat === w).card;
          if (!E.sameSide(w, b.turn) && legal.some((q) => q[0] === t[0].card[0] && beats(q, wc, tr)) && tip.card[0] === t[0].card[0] && E.rankOf(tip.card) >= 10)
            assert.ok(beats(tip.card, wc, tr), 'third hand played a high card that loses');
        }
        checked++;
      }
      a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value);
    }
  }
  assert.ok(checked > 3000);
});
htest('declarer control: the human runs both hands of their side, the computer never plays dummy for a human', () => {
  const mgr = new RoomManager({ botDelay: 1, bidDelay: 1, trickPause: 1 });
  const { room } = mgr.create({ name: 'Neil', seat: 'S', partner: 'bot' });
  clearTimeout(room.timer); room.timer = null;
  const b = room.board;
  // computer partner (N) declares: South (human dummy) plays both N and S
  b.phase = 'play'; b.contract = { level: 4, strain: 'S', doubled: 0, declarer: 'N' }; b.turn = 'N'; b.trick = [];
  mgr.syncControl(room);
  assert.equal(G.controllerOf(b, 'N'), 'S');
  assert.equal(G.controllerOf(b, 'S'), 'S');
  assert.equal(G.controllerOf(b, 'E'), 'E');
  mgr.schedule(room);
  assert.equal(room.timer, null, 'no computer move scheduled for the human side');
  const v = mgr.view(room, 'S');
  assert.deepEqual(v.board.youPlay, ['S', 'N']);
  assert.ok(v.board.hands.N && v.board.legalCards.length > 0);
  assert.throws(() => G.applyCard(b, 'N', b.hands.N[0]), /Not your turn/);
  // human declarer: plays dummy's cards too
  b.contract.declarer = 'S'; b.turn = 'N';
  mgr.syncControl(room);
  assert.equal(G.controllerOf(b, 'N'), 'S');
  // two humans: North declares, South is dummy and cannot play
  room.seats.N = { type: 'human', name: 'P', token: 'x', connected: true };
  b.contract.declarer = 'N'; b.turn = 'S';
  mgr.syncControl(room);
  assert.equal(G.controllerOf(b, 'S'), 'N');
  const vs = mgr.view(room, 'S');
  assert.equal(vs.board.legalCards.length, 0);
  assert.deepEqual(vs.board.youPlay, []);
  assert.ok(mgr.view(room, 'N').board.legalCards.length > 0);
  clearTimeout(room.timer);
});
htest('fourth hand takes the ace when it already has the tricks it needs (no hold-up)', () => {
  // 3NT by S with 11 top tricks. West leads the DK; South holds A32 and must win, not duck
  // ("rule of 7" hold-up used to fire regardless of the trick count).
  const b = position({
    hands: { N: '5432.5432.54.432', E: '876.876.876.8765', S: 'AKQ.AKQ.A32.AKQJ', W: 'JT9.JT9.KQJT9.T9' },
    contract: '3N', declarer: 'S', trick: [['W', 'DK'], ['N', 'D4'], ['E', 'D6']],
  });
  assert.equal(P.chooseCard(b, 'S'), 'DA');
});
htest('fourth hand never lets the making/setting trick or a late trick go when it can win it', () => {
  let x = 777; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const beats = (c, w, tr) => (c[0] === w[0] ? E.rankOf(c) > E.rankOf(w) : tr !== 'N' && c[0] === tr && w[0] !== tr);
  let checked = 0;
  for (let k = 1; k <= 300; k++) {
    const b = G.newBoard(k, rng);
    while (b.phase !== 'done') {
      if (b.trickComplete) { G.collectTrick(b); continue; }
      if (b.phase === 'play' && b.trick.length === 3) {
        const tr = b.contract.strain, w = E.trickWinner(b.trick, tr), wc = b.trick.find((q) => q.seat === w).card;
        const legal = E.legalCards(b.hands[b.turn], b.trick);
        const can = legal.filter((q) => beats(q, wc, tr));
        const K = P.knowledge(b, b.turn);
        if (!E.sameSide(w, b.turn) && can.length && (K.need <= 1 || K.remaining <= 4)) {
          const c = P.chooseCard(b, b.turn);
          assert.ok(beats(c, wc, tr), `fourth hand ducked a needed trick: ${b.trick.map((q) => q.seat + q.card).join(' ')} hand ${legal} -> ${c}`);
          const cheapest = can.filter((q) => q[0] === c[0]).sort((p, q) => E.rankOf(p) - E.rankOf(q))[0];
          assert.equal(E.rankOf(c) <= E.rankOf(cheapest) || c === cheapest, true);
          checked++;
        }
      }
      const a = G.botAction(b);
      a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value);
    }
  }
  assert.ok(checked > 50, 'checked ' + checked);
});

// ---------- double-dummy simulation engine ----------
// Build an ending: `remaining` = the cards still held (S.H.D.C strings, 1 spade + 1 heart + 5 diamonds
// + 5 clubs in total across the four hands), after 10 tricks in which every seat followed suit,
// N-S won `nsWon` of them and E-W the rest. `leader` is on lead to trick 11.
function ending({ remaining, contract, declarer, nsWon, leader, trick = [] }) {
  const b = G.newBoard(1);
  b.phase = 'play'; b.auction = [];
  b.contract = { level: +contract[0], strain: contract[1], doubled: 0, declarer };
  const Hs = (str) => str.split('.').flatMap((part, i) => [...part.replace('-', '')].map((r) => ['S', 'H', 'D', 'C'][i] + r));
  for (const s of E.SEATS) b.hands[s] = E.sortHand(Hs(remaining[s]));
  const held = new Set(E.SEATS.flatMap((s) => b.hands[s]));
  const per = { S: 3, H: 3, D: 2, C: 2 };
  let won = 0;
  b.tricks = [];
  for (const su of ['S', 'H', 'D', 'C']) {
    const gone = E.fullDeck().filter((c) => c[0] === su && !held.has(c)).sort((a, c) => E.rankOf(c) - E.rankOf(a));
    assert.equal(gone.length, per[su] * 4, 'ending needs the right number of ' + su);
    for (let t = 0; t < per[su]; t++) {
      const four = gone.slice(t * 4, t * 4 + 4);
      const winner = won < nsWon ? (won % 2 ? 'S' : 'N') : (won % 2 ? 'W' : 'E');
      won++;
      const order = [winner, ...E.SEATS.filter((s) => s !== winner)];
      const cards = order.map((s, i) => ({ seat: s, card: four[i] }));
      b.tricks.push({ leader: winner, cards, winner });
    }
  }
  b.original = JSON.parse(JSON.stringify(b.hands));
  for (const t of b.tricks) for (const c of t.cards) b.original[c.seat].push(c.card);
  for (const [seat, card] of trick) { b.trick.push({ seat, card }); b.hands[seat].splice(b.hands[seat].indexOf(card), 1); }
  b.turn = trick.length ? E.nextSeat(trick[trick.length - 1][0]) : leader;
  return b;
}
const simCard = (b, seat) => { const e = P.config.engine; P.config.engine = process.env.SIMCHK || 'sim'; try { return P.chooseCard(b, seat); } finally { P.config.engine = e; } };

test('solver: defender cashes the side-suit ace that beats the contract (last chance)', async () => {
  assert.ok(await P.ready, 'double-dummy solver loaded');
  // 3NT by S, declarer has 6 tricks, defence 4. West must cash the DA now; a club lets dummy run AKQ.
  const b = ending({ remaining: { N: '-.-.-.AKQ', E: '-.-.987.-', S: 'A.A.2.-', W: '-.-.A.32' }, contract: '3N', declarer: 'S', nsWon: 6, leader: 'W' });
  assert.equal(simCard(b, 'W'), 'DA');
});
test('solver: declarer cashes winners before giving up the lead', async () => {
  await P.ready;
  // 3NT by S with 7 tricks in: cash the two aces first; leading the diamond lets West run AKQ.
  const b = ending({ remaining: { N: '-.-.-.432', E: '-.-.3.65', S: 'A.A.2.-', W: '-.-.AKQ.-' }, contract: '3N', declarer: 'S', nsWon: 7, leader: 'S' });
  const c = simCard(b, 'S');
  assert.ok(c === 'SA' || c === 'HA', 'cashed ' + c);
});
test('solver: fourth hand wins with the ace at the end of the hand instead of ducking', async () => {
  await P.ready;
  // 1NT by S: E-W need one more trick. S leads the DK, W and N low:
  // East must take the DA now (it is the setting trick), not discard or duck.
  const b = ending({ remaining: { N: '-.-.2.43', E: '-.-.A9.2', S: 'A.A.K.-', W: '-.-.8.65' }, contract: '1N', declarer: 'S', nsWon: 3, leader: 'S', trick: [['S', 'DK'], ['W', 'D8'], ['N', 'D2']] });
  assert.equal(simCard(b, 'E'), 'DA');
});
test('solver engine: every card legal, fourth hand never gives away a trick it needs (random deals)', async () => {
  await P.ready;
  const save = { ...P.config }; Object.assign(P.config, { engine: 'sim', budgetMs: 20, maxSamples: 6, minSamples: 3 });
  try {
    let x = 31337; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const beats = (c, w, tr) => (c[0] === w[0] ? E.rankOf(c) > E.rankOf(w) : tr !== 'N' && c[0] === tr && w[0] !== tr);
    let n = 0;
    for (let k = 1; k <= 25; k++) {
      const b = G.newBoard(k, rng);
      while (b.phase !== 'done') {
        if (b.trickComplete) { G.collectTrick(b); continue; }
        const a = G.botAction(b);
        if (b.phase === 'play') {
          const legal = E.legalCards(b.hands[b.turn], b.trick);
          assert.ok(legal.includes(a.value));
          const tip = T.playTip(b, G.controllerOf(b, b.turn));
          assert.equal(tip.card, a.value, 'tip and computer agree');
          if (b.trick.length === 3) {
            const tr = b.contract.strain, w = E.trickWinner(b.trick, tr), wc = b.trick.find((q) => q.seat === w).card;
            const K = P.knowledge(b, b.turn);
            if (!E.sameSide(w, b.turn) && legal.some((q) => beats(q, wc, tr)) && K.need <= 1 && K.need > 0) assert.ok(beats(a.value, wc, tr), 'fourth hand ducked the needed trick');
          }
          n++;
        }
        a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value);
      }
    }
    assert.ok(n > 400);
  } finally { Object.assign(P.config, save); }
});
test('hand history and practice view', () => {
  const mgr = new RoomManager({ botDelay: 1, bidDelay: 1, trickPause: 1 });
  const { room } = mgr.create({ name: 'Neil', seat: 'S', partner: 'bot' });
  clearTimeout(room.timer); room.timer = null;
  const b = room.board;
  // practice: computer partner's cards only when asked
  assert.equal(mgr.view(room, 'S').board.hands.N, undefined);
  const pv = mgr.view(room, 'S', { practice: true });
  assert.deepEqual(pv.board.hands.N, b.hands.N);
  assert.equal(pv.board.hands.E, undefined);
  assert.equal(pv.practiceAvailable, true);
  // never with a human partner
  room.seats.N = { type: 'human', name: 'P', token: 't', connected: true };
  const hv = mgr.view(room, 'S', { practice: true });
  assert.equal(hv.board.hands.N, undefined);
  assert.equal(hv.practiceAvailable, false);
  room.seats.N = { type: 'bot', name: 'North (computer)' };
  // play the board out with the computer for everyone, then check the log
  room.seats.S = { type: 'bot', name: 'x' };
  while (b.phase !== 'done') {
    if (b.trickComplete) { G.collectTrick(b); continue; }
    const a = G.botAction(b); a.type === 'call' ? G.applyCall(b, a.actor, a.value) : G.applyCard(b, a.actor, a.value);
  }
  mgr.record(room);
  const h = mgr.history(room);
  assert.equal(h.length, 1);
  assert.equal(h[0].number, b.number);
  assert.deepEqual(h[0].hands, b.original);
  assert.equal(h[0].auction.length, b.auction.length);
  if (b.contract) { assert.equal(h[0].tricks.length, 13); assert.equal(h[0].tricks.flatMap((t) => t.cards).length, 52); }
  for (let i = 0; i < 60; i++) mgr.record(room);
  assert.equal(room.boardLog.length, 50);
});
test('solver: real positions where the classic engine failed to cash an ace (fixtures)', async () => {
  await P.ready;
  const DD = require('../src/dd');
  const fx = require('./fixtures/cash-ace.json');
  const save = { ...P.config }; Object.assign(P.config, { engine: 'sim', budgetMs: 60000, maxSamples: 24, minSamples: 24 });
  try {
    for (const f of fx) {
      const b = JSON.parse(JSON.stringify(f.board));
      const legal = E.legalCards(b.hands[f.seat], b.trick);
      const sc = DD.solve(b.hands, b.contract.strain, b.trick, b.turn);
      const best = Math.max(...legal.map((c) => sc[c]));
      const c = P.chooseCard(b, f.seat);
      assert.equal(sc[c], best, `${f.cls} board ${b.number}: ${c} gives away a trick (best ${f.best})`);
      assert.ok(sc[f.classic] < best, 'fixture still documents a classic-engine error');
    }
  } finally { Object.assign(P.config, save); }
});
test('follow suit is enforced for every source of a card, and the history audit flags revokes', () => {
  const b = position({
    hands: { N: '5432.5432.54.432', E: '876.876.876.8765', S: 'AKQ.AKQ.A32.AKQJ', W: 'JT9.JT9.KQJT9.T9' },
    contract: '3N', declarer: 'S', trick: [['W', 'DK']],
  });
  // North (dummy, run by South) holds diamonds: a club is refused whoever sends it
  assert.throws(() => G.applyCard(b, 'S', 'C4'), /follow suit/);
  assert.throws(() => G.applyCard(b, 'N', 'D5'), /Not your turn/);
  G.applyCard(b, 'S', 'D5');
  const { revokesIn } = require('../src/room');
  const orig = { N: ['D2', 'C3'], E: ['D5', 'C4'], S: ['DQ', 'C5'], W: ['D7', 'C6'] };
  assert.deepEqual(revokesIn(orig, [{ cards: [{ seat: 'S', card: 'DQ' }, { seat: 'W', card: 'D7' }, { seat: 'N', card: 'C3' }, { seat: 'E', card: 'D5' }] }]).map((r) => r.seat), ['N']);
  assert.deepEqual(revokesIn({ N: ['C3', 'C2'], E: ['D5', 'C4'], S: ['DQ', 'C5'], W: ['D7', 'C6'] }, [{ cards: [{ seat: 'S', card: 'DQ' }, { seat: 'W', card: 'D7' }, { seat: 'N', card: 'C3' }, { seat: 'E', card: 'D5' }] }]), []);
});
