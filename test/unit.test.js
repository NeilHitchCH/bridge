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
  assert.equal(bid('sayc', 'AQ3.KJ4.Q943.432'), 'P'); // 12 HCP, Rule of 20 = 19: pass
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
