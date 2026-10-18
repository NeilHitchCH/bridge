'use strict';
// Core contract-bridge rules: cards, dealing, auction legality, play legality, scoring.
const crypto = require('crypto');

const SEATS = ['N', 'E', 'S', 'W'];
const SUITS = ['C', 'D', 'H', 'S'];          // ascending rank order
const STRAINS = ['C', 'D', 'H', 'S', 'N'];   // ascending bid order
const RANKS = '23456789TJQKA';
const SYM = { C: '♣', D: '♦', H: '♥', S: '♠', N: 'NT' };

const seatIdx = (s) => SEATS.indexOf(s);
const nextSeat = (s, n = 1) => SEATS[(seatIdx(s) + n) % 4];
const partnerOf = (s) => nextSeat(s, 2);
const sideOf = (s) => (s === 'N' || s === 'S' ? 'NS' : 'EW');
const sameSide = (a, b) => sideOf(a) === sideOf(b);

const suitOf = (c) => c[0];
const rankOf = (c) => RANKS.indexOf(c[1]) + 2; // 2..14
const makeCard = (suit, rank) => suit + RANKS[rank - 2];

function fullDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(makeCard(s, r));
  return d;
}

function randInt(n, rng) {
  if (rng) return Math.floor(rng() * n);
  return crypto.randomInt(n);
}

function sortHand(hand) {
  // Display order: spades, hearts, clubs, diamonds (alternating colours), high to low
  const order = { S: 0, H: 1, C: 2, D: 3 };
  return hand.slice().sort((a, b) => order[suitOf(a)] - order[suitOf(b)] || rankOf(b) - rankOf(a));
}

function deal(rng) {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng);
    [d[i], d[j]] = [d[j], d[i]];
  }
  const hands = {};
  SEATS.forEach((s, i) => { hands[s] = sortHand(d.slice(i * 13, i * 13 + 13)); });
  return hands;
}

// Standard duplicate board rotation
const VUL_TABLE = ['None', 'NS', 'EW', 'Both', 'NS', 'EW', 'Both', 'None', 'EW', 'Both', 'None', 'NS', 'Both', 'None', 'NS', 'EW'];
function boardInfo(n) {
  return { dealer: SEATS[(n - 1) % 4], vul: VUL_TABLE[(n - 1) % 16] };
}
function isVul(vul, seat) {
  return vul === 'Both' || vul === sideOf(seat);
}

// ---------- Auction ----------
// calls: 'P', 'X', 'XX', or level+strain e.g. '1C', '3N'
const isBid = (c) => /^[1-7][CDHSN]$/.test(c);
const bidLevel = (c) => +c[0];
const bidStrain = (c) => c[1];
const bidRank = (c) => (bidLevel(c) - 1) * 5 + STRAINS.indexOf(bidStrain(c));
const ALL_BIDS = [];
for (let l = 1; l <= 7; l++) for (const s of STRAINS) ALL_BIDS.push(l + s);

// auction: array of {seat, call}
function lastBidEntry(auction) {
  for (let i = auction.length - 1; i >= 0; i--) if (isBid(auction[i].call)) return auction[i];
  return null;
}
function lastNonPass(auction) {
  for (let i = auction.length - 1; i >= 0; i--) if (auction[i].call !== 'P') return auction[i];
  return null;
}

function auctionTurn(dealer, auction) {
  return nextSeat(dealer, auction.length);
}

function auctionComplete(auction) {
  if (auction.length < 4) return false;
  const last3 = auction.slice(-3).every((a) => a.call === 'P');
  if (!last3) return false;
  // all four passed, or a bid exists followed by three passes
  return auction.length >= 4;
}

function legalCalls(dealer, auction) {
  if (auctionComplete(auction)) return [];
  const seat = auctionTurn(dealer, auction);
  const calls = ['P'];
  const lb = lastBidEntry(auction);
  const lnp = lastNonPass(auction);
  for (const b of ALL_BIDS) if (!lb || bidRank(b) > bidRank(lb.call)) calls.push(b);
  if (lnp && isBid(lnp.call) && !sameSide(lnp.seat, seat)) calls.push('X');
  if (lnp && lnp.call === 'X' && !sameSide(lnp.seat, seat)) calls.push('XX');
  return calls;
}

function isLegalCall(dealer, auction, call) {
  return legalCalls(dealer, auction).includes(call);
}

// Returns null for pass-out, else contract {level, strain, doubled(0/1/2), declarer}
function contractOf(dealer, auction) {
  const lb = lastBidEntry(auction);
  if (!lb) return null;
  const strain = bidStrain(lb.call);
  let doubled = 0;
  const idx = auction.lastIndexOf(lb);
  for (let i = idx + 1; i < auction.length; i++) {
    if (auction[i].call === 'X') doubled = 1;
    if (auction[i].call === 'XX') doubled = 2;
  }
  const side = sideOf(lb.seat);
  const first = auction.find((a) => isBid(a.call) && bidStrain(a.call) === strain && sideOf(a.seat) === side);
  return { level: bidLevel(lb.call), strain, doubled, declarer: first.seat };
}

// ---------- Play ----------
function legalCards(hand, trickCards) {
  if (!trickCards.length) return hand.slice();
  const led = suitOf(trickCards[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand.slice();
}

function trickWinner(trickCards, trump) {
  const led = suitOf(trickCards[0].card);
  let best = trickCards[0];
  for (const tc of trickCards.slice(1)) {
    const s = suitOf(tc.card), bs = suitOf(best.card);
    if (s === bs) { if (rankOf(tc.card) > rankOf(best.card)) best = tc; }
    else if (trump !== 'N' && s === trump) best = tc;
    // otherwise discard, cannot win
    void led;
  }
  return best.seat;
}

// ---------- Scoring (duplicate) ----------
// Returns score from the declaring side's perspective (positive = made)
function scoreContract(contract, tricksTaken, vulnerable) {
  const { level, strain, doubled } = contract;
  const need = level + 6;
  const mult = doubled === 2 ? 4 : doubled === 1 ? 2 : 1;
  if (tricksTaken >= need) {
    const per = strain === 'C' || strain === 'D' ? 20 : 30;
    let trickPts = per * level + (strain === 'N' ? 10 : 0);
    trickPts *= mult;
    let score = trickPts;
    score += trickPts >= 100 ? (vulnerable ? 500 : 300) : 50;
    if (level === 6) score += vulnerable ? 750 : 500;
    if (level === 7) score += vulnerable ? 1500 : 1000;
    if (doubled === 1) score += 50;
    if (doubled === 2) score += 100;
    const over = tricksTaken - need;
    if (doubled === 0) score += over * per;
    else score += over * (vulnerable ? 200 : 100) * (doubled === 2 ? 2 : 1);
    return score;
  }
  const down = need - tricksTaken;
  if (doubled === 0) return -down * (vulnerable ? 100 : 50);
  let pen = 0;
  for (let i = 1; i <= down; i++) {
    if (vulnerable) pen += i === 1 ? 200 : 300;
    else pen += i === 1 ? 100 : i <= 3 ? 200 : 300;
  }
  if (doubled === 2) pen *= 2;
  return -pen;
}

function contractStr(c) {
  if (!c) return 'Passed out';
  return c.level + SYM[c.strain] + (c.doubled === 2 ? 'XX' : c.doubled === 1 ? 'X' : '');
}

module.exports = {
  SEATS, SUITS, STRAINS, RANKS, SYM, seatIdx, nextSeat, partnerOf, sideOf, sameSide,
  suitOf, rankOf, makeCard, fullDeck, sortHand, deal, boardInfo, isVul, VUL_TABLE,
  isBid, bidLevel, bidStrain, bidRank, ALL_BIDS, lastBidEntry, lastNonPass, auctionTurn,
  auctionComplete, legalCalls, isLegalCall, contractOf, legalCards, trickWinner, scoreContract, contractStr,
};
