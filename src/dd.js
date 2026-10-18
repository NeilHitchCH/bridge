'use strict';
// Double-dummy solving through DDS (Bo Haglund & Soren Hein's solver, compiled to WebAssembly by the
// bridge-dds project, Apache-2.0, vendored in vendor/dds). Loaded once, asynchronously; callers fall
// back to heuristics until `isReady()`.
const path = require('path');
const { pathToFileURL } = require('url');
const SEATS = ['N', 'E', 'S', 'W'];
const DDS_SUIT = { S: 0, H: 1, D: 2, C: 3 };
const SUIT_OF = ['S', 'H', 'D', 'C'];
const DDS_TRUMP = { S: 0, H: 1, D: 2, C: 3, N: 4 };
const RANKS = '23456789TJQKA';
let dds = null, loadErr = null;
const ready = import(pathToFileURL(path.join(__dirname, '..', 'vendor', 'dds', 'api.mjs')).href)
  .then(async ({ loadDds, Dds }) => { dds = new Dds(await loadDds()); return true; })
  .catch((e) => { loadErr = e; console.error('DDS unavailable, using heuristic play only:', e.message); return false; });

const rankOf = (c) => RANKS.indexOf(c[1]) + 2;
function handPbn(cards) {
  return SUIT_OF.map((s) => cards.filter((c) => c[0] === s).sort((a, b) => rankOf(b) - rankOf(a)).map((c) => c[1]).join('')).join('.');
}
// hands: {N:[..],E:[..],S:[..],W:[..]} remaining cards (current-trick cards removed);
// trick: [{seat, card}] cards already played to the current trick. Returns {card: tricks} for the
// side to move (tricks from here on, current trick included).
function solve(hands, trump, trick, turn) {
  if (!dds) throw new Error('DDS not loaded');
  const first = trick.length ? trick[0].seat : turn;
  const deal = {
    trump: DDS_TRUMP[trump],
    first: SEATS.indexOf(first),
    currentTrickSuit: [0, 1, 2].map((i) => (trick[i] ? DDS_SUIT[trick[i].card[0]] : 0)),
    currentTrickRank: [0, 1, 2].map((i) => (trick[i] ? rankOf(trick[i].card) : 0)),
    remainCards: 'N:' + SEATS.map((s) => handPbn(hands[s])).join(' '),
  };
  const r = dds.SolveBoardPBN(deal, -1, 3, 1);
  const out = {};
  for (let i = 0; i < r.cards; i++) {
    const s = SUIT_OF[r.suit[i]];
    out[s + RANKS[r.rank[i] - 2]] = r.score[i];
    for (let k = 2; k <= 14; k++) if (r.equals[i] & (1 << k)) out[s + RANKS[k - 2]] = r.score[i];
  }
  return out;
}
module.exports = { ready, isReady: () => !!dds, loadError: () => loadErr, solve };
