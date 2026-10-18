'use strict';
const E = require('./engine');
const HCPV = { A: 4, K: 3, Q: 2, J: 1 };

function evalHand(hand) {
  const len = { C: 0, D: 0, H: 0, S: 0 };
  const suitHcp = { C: 0, D: 0, H: 0, S: 0 };
  const cards = { C: [], D: [], H: [], S: [] };
  let hcp = 0;
  for (const c of hand) {
    const s = E.suitOf(c);
    len[s]++;
    const v = HCPV[c[1]] || 0;
    hcp += v; suitHcp[s] += v;
    cards[s].push(E.rankOf(c));
  }
  for (const s of E.SUITS) cards[s].sort((a, b) => b - a);
  const lens = E.SUITS.map((s) => len[s]).sort((a, b) => b - a);
  const balanced = lens[3] >= 2 && lens.filter((l) => l === 2).length <= 1;
  const semiBalanced = lens[3] >= 2 && lens[0] <= 6;
  const has = (s, r) => cards[s].includes(r);
  const stopper = (s) => has(s, 14) || (has(s, 13) && len[s] >= 2) || (has(s, 12) && len[s] >= 3) || (has(s, 11) && len[s] >= 4);
  // Short-suit (dummy) points once a fit is found (bridgeplaybook: void 3, singleton 2, doubleton 1)
  const shortPts = (trump) => E.SUITS.reduce((t, s) => t + (s === trump ? 0 : len[s] === 0 ? 3 : len[s] === 1 ? 2 : len[s] === 2 ? 1 : 0), 0);
  const longest = E.SUITS.slice().sort((a, b) => len[b] - len[a] || E.SUITS.indexOf(b) - E.SUITS.indexOf(a))[0];
  const aces = E.SUITS.filter((s) => has(s, 14)).length;
  const kings = E.SUITS.filter((s) => has(s, 13)).length;
  const topHonours = (s) => [14, 13, 12].filter((r) => has(s, r)).length;
  const goodSuit = (s) => topHonours(s) >= 2 || (topHonours(s) >= 1 && has(s, 11) && has(s, 10)) || suitHcp[s] >= 5;
  const decentSuit = (s) => topHonours(s) >= 1 && suitHcp[s] >= 3 || topHonours(s) >= 2;
  const void_ = E.SUITS.some((s) => len[s] === 0);
  // Losing trick count (bridgeplaybook LTC page): per suit, missing A/K/Q among top min(len,3) cards
  const ltc = E.SUITS.reduce((t, s) => {
    const n = Math.min(3, len[s]);
    let l = 0;
    const top = cards[s].slice(0, n);
    const need = [14, 13, 12].slice(0, n);
    for (const r of need) if (!top.includes(r)) l++;
    return t + l;
  }, 0);
  const rule20 = hcp + lens[0] + lens[1];
  // quick tricks
  const qt = E.SUITS.reduce((t, s) => {
    const A = has(s, 14), K = has(s, 13), Q = has(s, 12);
    if (A && K) return t + 2; if (A && Q) return t + 1.5; if (A) return t + 1; if (K && Q) return t + 1; if (K && len[s] >= 2) return t + 0.5; return t;
  }, 0);
  return { hcp, len, suitHcp, cards, balanced, semiBalanced, stopper, shortPts, longest, aces, kings, has, topHonours, goodSuit, decentSuit, void: void_, ltc, rule20, lens, qt };
}

module.exports = { evalHand };
