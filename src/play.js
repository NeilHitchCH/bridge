'use strict';
// Computer card play. Follows bridgeplaybook.com declarer-play, defence, opening-lead and
// signalling guides (see STRATEGY.md). Uses only information a real player would have:
// own hand, dummy once exposed, the auction and the cards played so far.
const E = require('./engine');
const { annotate } = require('./bidding');
const R = E.rankOf, S = E.suitOf;

const bySuit = (cards, s) => cards.filter((c) => S(c) === s).sort((a, b) => R(b) - R(a));
const lowest = (cards) => cards.slice().sort((a, b) => R(a) - R(b))[0];
const highest = (cards) => cards.slice().sort((a, b) => R(b) - R(a))[0];

function beats(card, cur, led, trump) {
  if (S(card) === S(cur)) return R(card) > R(cur);
  return trump !== 'N' && S(card) === trump && S(cur) !== trump;
}

// ---------------------------------------------------------------- knowledge
function knowledge(board, me) {
  const c = board.contract;
  const declarer = c.declarer, dummy = E.partnerOf(declarer);
  const ctrl = me === dummy ? declarer : me;
  const role = ctrl === declarer ? 'declarer' : 'defender';
  const trump = c.strain;
  const trick = board.trick;
  const played = new Set();
  const showedOut = { N: new Set(), E: new Set(), S: new Set(), W: new Set() };
  const allTricks = board.tricks.concat(trick.length ? [{ cards: trick, partial: true }] : []);
  for (const t of allTricks) {
    const led = S(t.cards[0].card);
    for (const tc of t.cards) { played.add(tc.card); if (S(tc.card) !== led) showedOut[tc.seat].add(led); }
  }
  const dummyVisible = board.tricks.length > 0 || trick.length > 0;
  const visible = { [me]: board.hands[me].slice() };
  if (role === 'declarer') { visible[declarer] = board.hands[declarer].slice(); visible[dummy] = board.hands[dummy].slice(); }
  else if (dummyVisible) visible[dummy] = board.hands[dummy].slice();
  const ourSeats = role === 'declarer' ? [declarer, dummy] : [me];
  const gone = new Set(played);
  for (const s of ourSeats) for (const x of visible[s]) gone.add(x);
  let ourTricks = 0, theirTricks = 0;
  for (const t of board.tricks) { if (E.sameSide(t.winner, ctrl)) ourTricks++; else theirTricks++; }
  const target = role === 'declarer' ? c.level + 6 : 14 - (c.level + 6);
  const ann = annotate(board.dealer, board.auction, board.systems).map((a, i) => ({ ...a, seat: board.auction[i].seat, call: board.auction[i].call }));
  return {
    board, me, ctrl, role, trump, contract: c, declarer, dummy, trick, played, showedOut, visible, gone,
    hand: board.hands[me].slice(), ourTricks, theirTricks, need: target - ourTricks, remaining: 13 - board.tricks.length,
    ann, partner: E.partnerOf(me), tricks: board.tricks,
  };
}

const isBoss = (K, card) => {
  for (let r = R(card) + 1; r <= 14; r++) if (!K.gone.has(E.makeCard(S(card), r))) return false;
  return true;
};
// Lowest card in `cards` equivalent to `card` (all ranks between are gone)
function cheapestEquivalent(K, card, cards) {
  let best = card;
  for (let r = R(card) - 1; r >= 2; r--) {
    const x = E.makeCard(S(card), r);
    if (cards.includes(x)) best = x;
    // a card still lying in the current trick is not "gone": dropping below it would lose to it
    else if (!K.gone.has(x) || K.trick.some((t) => t.card === x)) break;
  }
  return best;
}
const outstanding = (K, s) => {
  let n = 0;
  for (let r = 2; r <= 14; r++) if (!K.gone.has(E.makeCard(s, r))) n++;
  return n;
};
const oppsOf = (seat) => [E.nextSeat(seat), E.nextSeat(seat, 3)];

// ---------------------------------------------------------------- entry point
function chooseCard(board, me) {
  const legal = E.legalCards(board.hands[me], board.trick);
  if (legal.length === 1) return legal[0];
  const K = knowledge(board, me);
  let card;
  try {
    if (K.role === 'declarer') card = K.trick.length === 0 ? declarerLead(K) : declarerFollow(K, legal);
    else if (K.board.tricks.length === 0 && K.trick.length === 0) card = openingLead(K);
    else card = K.trick.length === 0 ? defenderLead(K) : defenderFollow(K, legal);
  } catch (e) { card = null; if (process.env.BRIDGE_DEBUG) throw e; }
  if (!card || !legal.includes(card)) card = lowest(legal);
  return card;
}

// ---------------------------------------------------------------- opening lead
function leadCardFrom(cards, trump) {
  const r = cards.map(R);
  if (cards.length === 1) return cards[0];
  if (r[0] === 14 && r[1] === 13) return trump === 'N' ? cards[1] : cards[0]; // AK: K vs NT, A vs suit
  if (r[0] >= 11 && r[0] - r[1] === 1) return cards[0];              // top of a sequence (KQ, QJ, J10)
  if (r.length >= 3 && r[0] >= 11 && r[0] - r[2] === 2 && r[1] < r[0]) { /* broken sequence e.g. KJ10? */ }
  // interior sequences (KJ10 -> J, K109 -> 10, Q109 -> 10; AQJ / AJ10 -> Q / J against notrump only)
  if (r.length >= 3 && r[0] >= 12 && r[0] - r[1] >= 2 && r[1] - r[2] === 1 && r[1] >= 9 && (r[0] !== 14 || trump === 'N')) return cards[1];
  if (cards.length === 2) return cards[0];                             // doubleton: top
  if (r[0] === 10 && r[1] === 9) return cards[0];
  if (cards.length === 3) return r[0] >= 11 ? cards[2] : cards[1];    // honour-third: low; three small: MUD
  return cards[3];                                                      // fourth best
}

function openingLead(K) {
  const { hand, trump, ann } = K;
  const partnerSuits = new Set(ann.filter((a) => a.seat === K.partner && a.shows && a.shows !== 'N' && !a.art).map((a) => a.shows));
  for (const a of ann) if (a.seat === K.partner && (a.conv === 'michaels' || a.conv === 'unusual')) a.two.forEach((s) => partnerSuits.add(s));
  const declSide = [K.declarer, K.dummy];
  const oppSuits = new Set(ann.filter((a) => declSide.includes(a.seat) && a.shows && a.shows !== 'N' && !a.art).map((a) => a.shows));
  const quickEntry = hand.some((c) => R(c) === 14) || (trump !== 'N' && bySuit(hand, trump).some((c) => R(c) >= 13));
  let best = null, bestScore = -1e9;
  for (const s of E.SUITS) {
    const cs = bySuit(hand, s);
    if (!cs.length) continue;
    const r = cs.map(R);
    const len = cs.length;
    const seq3 = len >= 3 && r[0] >= 11 && r[0] - r[1] === 1 && r[1] - r[2] === 1;
    const seq2 = len >= 2 && r[0] >= 11 && r[0] - r[1] === 1;
    const ak = r[0] === 14 && r[1] === 13;
    let sc = 0;
    if (trump === 'N') {
      sc += len * 2;
      if (seq3) sc += 6; else if (seq2) sc += 3;
      if (partnerSuits.has(s)) sc += 8;
      if (oppSuits.has(s)) sc -= 6;
      if (len <= 2 && !partnerSuits.has(s)) sc -= 4;
    } else {
      if (s === trump) {
        const declBidSuits = new Set([...oppSuits].filter((x) => x !== trump));
        sc = declBidSuits.size >= 2 && len >= 2 && r[0] < 12 ? 6 : -5;
        if (len === 1) sc -= 6;
      } else {
        if (seq3 || ak) sc += 8; else if (seq2) sc += 6;
        if (partnerSuits.has(s)) sc += 6;
        if (len === 1) sc += quickEntry && bySuit(hand, trump).length >= 1 && bySuit(hand, trump).length <= 3 ? 5 : 1;
        if (len === 2 && !seq2) sc += 1;
        if (r[0] === 14 && r[1] !== 13) sc -= 7;                 // avoid unsupported ace
        if (r[0] === 13 && r[1] !== 12 && len >= 2) sc -= 3;      // leading away from a king
        if (r[0] === 12 && r[1] !== 11 && len >= 2 && !seq2) sc -= 1;
        if (oppSuits.has(s)) sc -= 4;
        sc += 0.3 * len;
      }
    }
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return leadCardFrom(bySuit(hand, best), trump);
}

// ---------------------------------------------------------------- signals
// Standard carding (bridgeplaybook): high spot = encourage / even count, low = discourage / odd
function spotCards(cs) { const sp = cs.filter((c) => R(c) < 11); return sp.length ? sp : cs; }
function attitudeCard(cs, like) {
  if (!cs.some((c) => R(c) < 11)) return lowest(cs); // only honours: never signal with one, play the cheapest
  const sp = spotCards(cs).sort((a, b) => R(b) - R(a));
  return like ? sp[0] : sp[sp.length - 1];
}
function countCard(cs) {
  if (!cs.some((c) => R(c) < 11)) return lowest(cs);
  const sp = spotCards(cs).sort((a, b) => R(b) - R(a));
  return cs.length % 2 === 0 ? sp[0] : sp[sp.length - 1];
}

function currentWinner(K) {
  const t = K.trick;
  const seat = E.trickWinner(t, K.trump);
  return t.find((x) => x.seat === seat);
}

// ---------------------------------------------------------------- defence
function defenderFollow(K, legal) {
  const t = K.trick, pos = t.length; // number already played
  const led = S(t[0].card);
  const win = currentWinner(K);
  const partnerWinning = win.seat === K.partner;
  const fourth = pos === 3 ? null : E.nextSeat(K.me); // next to play after me (if pos <3 there are more)
  const lastSeat = E.nextSeat(t[0].seat, 3);
  const dummyAfter = pos < 3 && [E.nextSeat(K.me), lastSeat].includes(K.dummy) && K.dummy !== K.me && K.visible[K.dummy] && t.every((x) => x.seat !== K.dummy);
  const dummyCards = K.visible[K.dummy] ? bySuit(K.visible[K.dummy], led) : [];
  const following = legal.some((c) => S(c) === led);
  const winners = legal.filter((c) => beats(c, win.card, led, K.trump));
  const setting = K.need <= 1; // K.need already counts the tricks we have won

  if (following) {
    const cs = bySuit(legal, led);
    const likeSuit = cs.some((c) => R(c) >= 12) || (cs.some((c) => R(c) === 11) && cs.some((c) => R(c) === 10));
    if (pos === 1) {
      // Second hand
      const leadCard = t[0].card;
      const dummyLed = t[0].seat === K.dummy;
      if (R(leadCard) >= 10 && winners.length) {
        // cover an honour with an honour, unless dummy led from a sequence (holds the next card)
        const nextLower = E.makeCard(led, R(leadCard) - 1);
        const fromSeq = dummyLed && K.visible[K.dummy].includes(nextLower);
        if (!fromSeq) return lowest(winners);
      }
      // grab the setting trick if a card of ours wins for sure
      if (setting && winners.length) {
        const sure = winners.filter((c) => isBoss(K, c) && (!dummyAfter || !dummyCards.some((d) => R(d) > R(c))) && !(K.trump !== 'N' && dummyAfter && !dummyCards.length && bySuit(K.visible[K.dummy], K.trump).length));
        if (sure.length) return lowest(sure);
      }
      return t[0].seat === K.declarer || t[0].seat === K.dummy ? countCard(cs) : lowest(cs);
    }
    if (pos === 2) {
      // Third hand: partner led
      const pl = t[0].card;
      const firstRound = !K.tricks.some((x) => S(x.cards[0].card) === led);
      // Unblock (Work 1930 glossary; bridgeplaybook entries): doubleton honour under partner's honour lead vs NT
      if (K.trump === 'N' && firstRound && R(pl) >= 12 && cs.length === 2 && R(cs[0]) >= 11 && R(cs[0]) !== R(pl) - 1 && !(dummyAfter && dummyCards.some((d) => R(d) > R(cs[0])))) return cs[0];
      // Rule of Eleven on partner's fourth-best spot lead (bridgeplaybook opening-leads; Whitehead 1929)
      if (K.trump === 'N' && firstRound && R(pl) <= 9) {
        const higherSeen = [...(K.visible[K.dummy] || []), ...K.hand, ...t.map((x) => x.card)].filter((c) => S(c) === led && R(c) > R(pl) && t[0].card !== c).length + K.tricks.length * 0;
        if (11 - R(pl) <= higherSeen) {
          // declarer has no card above partner's: just beat whatever is winning / dummy
          const need = dummyAfter && dummyCards.length ? Math.max(R(dummyCards[0]), R(win.card)) : R(win.card);
          if (partnerWinning && !(dummyAfter && dummyCards.length && R(dummyCards[0]) > R(win.card))) return lowest(cs);
          const over = cs.filter((c) => R(c) > need);
          if (over.length) return lowest(over);
        }
      }
      if (partnerWinning) {
        if (dummyAfter) {
          const dTop = dummyCards[0];
          const dummyCanRuff = !dummyCards.length && K.trump !== 'N' && bySuit(K.visible[K.dummy], K.trump).length > 0;
          if ((!dTop || R(dTop) < R(win.card)) && !dummyCanRuff) return attitudeCard(cs, likeSuit);
          if (!dTop) return attitudeCard(cs, likeSuit);
          const over = cs.filter((c) => R(c) > R(dTop) && R(c) > R(win.card));
          if (over.length && !dummyCanRuff) return cheapestEquivalent(K, lowest(over), cs);
          return attitudeCard(cs, likeSuit);
        }
        // partner's honour (10 or higher) is probably top of a sequence: don't overtake it
        if (isBoss(K, win.card) || R(win.card) >= 10) return attitudeCard(cs, likeSuit);
      }
      if (dummyAfter && dummyCards.length) {
        const dTop = dummyCards[0];
        const over = cs.filter((c) => R(c) > R(dTop) && beats(c, win.card, led, K.trump));
        if (over.length) return cheapestEquivalent(K, lowest(over), cs);
      }
      // third hand high (cheapest of equals)
      const top = highest(cs);
      if (beats(top, win.card, led, K.trump)) return cheapestEquivalent(K, top, cs);
      return attitudeCard(cs, false);
    }
    // Fourth hand
    if (partnerWinning) return lowest(cs);
    if (winners.length) return lowest(winners);
    return lowest(cs);
  }
  // void in the led suit
  const trumps = K.trump !== 'N' ? bySuit(legal, K.trump) : [];
  const partnerSafe = partnerWinning && (pos === 3 || (dummyAfter && (!dummyCards.length ? !bySuit(K.visible[K.dummy], K.trump).length || K.trump === 'N' : R(dummyCards[0]) < R(win.card))) || isBoss(K, win.card));
  if (trumps.length && !partnerSafe) {
    const ruffs = trumps.filter((c) => beats(c, win.card, led, K.trump));
    if (ruffs.length) return lowest(ruffs);
  }
  return discard(K, legal.filter((c) => K.trump === 'N' || S(c) !== K.trump).length ? legal.filter((c) => K.trump === 'N' || S(c) !== K.trump) : legal);
}

function discard(K, cards) {
  let best = null, bestV = 1e9;
  const dummyHand = K.visible[K.dummy] && K.me !== K.dummy ? K.visible[K.dummy] : [];
  for (const s of E.SUITS) {
    const cs = bySuit(cards, s);
    if (!cs.length) continue;
    let v = 0;
    for (const c of cs) if (isBoss(K, c)) v += 10;
    if (cs.some((c) => R(c) === 13) && cs.length >= 2) v += 5;
    if (cs.some((c) => R(c) === 12) && cs.length >= 3) v += 4;
    if (cs.length >= 4 && K.trump === 'N') v += 3;
    const dl = bySuit(dummyHand, s).length;
    if (dl >= 3 && cs.length <= dl && cs.length >= dl - 1) v += 4; // keep length to guard dummy's suit
    if (K.role === 'declarer' && K.trump !== 'N' && s === K.trump) v += 20;
    v += cs.length * 0.2;
    if (v < bestV) { bestV = v; best = s; }
  }
  return lowest(bySuit(cards, best));
}

function defenderLead(K) {
  const hand = K.hand;
  const trump = K.trump;
  const declSide = [K.declarer, K.dummy];
  const dummyHand = K.visible[K.dummy] || [];
  const dummyLHO = E.nextSeat(K.me) === K.dummy;
  const oppTrumpsLeft = trump !== 'N' && declSide.some((s) => !K.showedOut[s].has(trump));
  const ruffable = (s) => trump !== 'N' && s !== trump && oppTrumpsLeft && (K.showedOut[K.declarer].has(s) || (bySuit(dummyHand, s).length === 0 && bySuit(dummyHand, trump).length > 0));
  // 1. cash setting tricks
  const bosses = hand.filter((c) => isBoss(K, c) && !ruffable(S(c)) && (trump === 'N' || S(c) === trump || !K.showedOut[K.declarer].has(S(c))));
  if (bosses.length && K.ourTricks + bosses.length >= K.need) return bosses.sort((a, b) => R(b) - R(a))[0];
  // history
  const ledBy = (seat) => K.tricks.filter((t) => t.cards[0].seat === seat).map((t) => S(t.cards[0].card));
  const partnerLed = ledBy(K.partner);
  const myLed = ledBy(K.me);
  // 2. give partner a ruff
  if (trump !== 'N' && !K.showedOut[K.partner].has(trump)) {
    for (const s of E.SUITS) if (s !== trump && K.showedOut[K.partner].has(s) && bySuit(hand, s).length) {
      const cs = bySuit(hand, s); return cs[0];
    }
  }
  // 3. return partner's suit
  for (const s of partnerLed) {
    const cs = bySuit(hand, s);
    if (!cs.length || ruffable(s)) continue;
    if (trump !== 'N' && bySuit(dummyHand, s).some((c) => isBoss(K, c))) continue;
    if (cs.length === 1) return cs[0];
    if (isBoss(K, cs[0])) return cs[0];
    return cs.length === 2 ? cs[0] : cs[cs.length - 1];
  }
  // 4. continue my suit if partner encouraged (or NT establishment)
  for (const s of myLed) {
    const cs = bySuit(hand, s);
    if (!cs.length || ruffable(s)) continue;
    const t = K.tricks.find((x) => x.cards[0].seat === K.me && S(x.cards[0].card) === s);
    const pc = t && t.cards.find((x) => x.seat === K.partner);
    const encouraged = pc && S(pc.card) === s && R(pc.card) >= 7;
    if (encouraged || (trump === 'N' && cs.length >= 3) || isBoss(K, cs[0])) return isBoss(K, cs[0]) ? cs[0] : leadCardFrom(cs, trump);
  }
  // 5. trump lead when dummy has ruffing values
  if (trump !== 'N' && bySuit(hand, trump).length >= 2 && oppTrumpsLeft) {
    const dT = bySuit(dummyHand, trump).length;
    const shortSide = E.SUITS.some((s) => s !== trump && bySuit(dummyHand, s).length <= 1 && bySuit(K.visible[K.declarer] || [], s).length === 0);
    if (dT >= 1 && E.SUITS.some((s) => s !== trump && bySuit(dummyHand, s).length <= 1) && !shortSide) return lowest(bySuit(hand, trump));
  }
  // 6. through strength / up to weakness
  let best = null, bestSc = -1e9;
  for (const s of E.SUITS) {
    const cs = bySuit(hand, s);
    if (!cs.length) continue;
    let sc = 0;
    const d = bySuit(dummyHand, s);
    const dHon = d.filter((c) => R(c) >= 11 && !isBoss(K, c)).length;
    if (dummyLHO) sc += dHon * 2; else sc -= dHon * 2;
    if (d.some((c) => isBoss(K, c))) sc -= 3;
    if (ruffable(s)) sc -= 8;
    if (trump !== 'N' && s === trump) sc -= 3;
    const r = cs.map(R);
    if (r[0] >= 11 && r.length >= 2 && r[0] - r[1] === 1) sc += 4;
    if (r[0] === 14 && r[1] !== 13) sc -= 2;
    if (r[0] === 13 && r[1] !== 12 && !isBoss(K, cs[0])) sc -= 3;
    if (trump === 'N') sc += cs.length;
    if (K.ann.some((a) => declSide.includes(a.seat) && a.shows === s)) sc -= 2;
    if (K.ann.some((a) => a.seat === K.partner && a.shows === s)) sc += 4;
    if (sc > bestSc) { bestSc = sc; best = s; }
  }
  const cs = bySuit(hand, best);
  if (isBoss(K, cs[0]) && (trump === 'N' || !ruffable(best))) return cs[0];
  return leadCardFrom(cs, trump);
}

// ---------------------------------------------------------------- declarer
function sides(K) {
  const other = K.me === K.declarer ? K.dummy : K.declarer;
  return { A: K.visible[K.me], B: K.visible[other], other };
}

function sureTricks(K, s, A, B) {
  const a = bySuit(A, s), b = bySuit(B, s);
  const ours = a.concat(b).sort((x, y) => R(y) - R(x));
  let t = 0;
  for (const c of ours) { if (isBossAmong(K, c, ours, t)) t++; else break; }
  const maxLen = Math.max(a.length, b.length);
  const out = outstanding(K, s);
  if (t >= out && t > 0) return maxLen;
  return Math.min(t, maxLen);
}
// card is a sure winner after the first `k` of our top cards are played
function isBossAmong(K, card, ours, k) {
  for (let r = R(card) + 1; r <= 14; r++) {
    const x = E.makeCard(S(card), r);
    if (!K.gone.has(x)) return false;
  }
  return true;
}

function oppTrumpCount(K) {
  if (K.trump === 'N') return 0;
  const [o1, o2] = oppsOf(K.declarer);
  if (K.showedOut[o1].has(K.trump) && K.showedOut[o2].has(K.trump)) return 0;
  return outstanding(K, K.trump);
}

function declarerLead(K) {
  const { A, B } = sides(K);
  const trump = K.trump;
  let sure = 0;
  const sureBy = {};
  for (const s of E.SUITS) { sureBy[s] = sureTricks(K, s, A, B); sure += sureBy[s]; }
  const oppT = oppTrumpCount(K);
  if (trump !== 'N' && oppT > 0) {
    const tA = bySuit(A, trump), tB = bySuit(B, trump);
    const ourT = tA.concat(tB);
    // all remaining enemy trumps are boss -> stop drawing
    const enemyTopIsAboveOurs = ourT.length && outstanding(K, trump) === 1 && !ourT.some((c) => isBoss(K, c));
    // ruff losers in the short hand first if needed (bridgeplaybook: ruff first, draw trumps after)
    const ruffPlan = planRuff(K, A, B, sure);
    if (ruffPlan) return ruffPlan;
    if (ourT.length && !enemyTopIsAboveOurs) return leadSuitToWin(K, trump, A, B, true);
  }
  // enough top tricks: cash them (unblock from the short hand)
  const needed = K.need;
  if (sure >= needed) {
    const c = cashFrom(K, A, B, sureBy);
    if (c) return c;
  }
  // develop extra tricks: pick the best suit
  let best = null, bestSc = -1e9;
  for (const s of E.SUITS) {
    if (s === trump) continue;
    const a = bySuit(A, s), b = bySuit(B, s);
    if (!a.length) continue;
    const comb = a.length + b.length;
    const maxLen = Math.max(a.length, b.length);
    const potential = maxLen - sureBy[s];
    if (potential <= 0 && sureBy[s] === 0) continue;
    let sc = potential * 2 + comb * 0.5;
    if (b.length === 0 && trump !== 'N' && bySuit(B, trump).length && oppT === 0) sc += 1; // can ruff
    const honours = a.concat(b).filter((c) => R(c) >= 11).length;
    sc += honours;
    if (potential <= 0) sc -= 5;
    if (sc > bestSc) { bestSc = sc; best = s; }
  }
  if (best) return leadSuitToWin(K, best, A, B, false);
  // cash anything left or ruff in the other hand
  const c = cashFrom(K, A, B, sureBy);
  if (c) return c;
  if (trump !== 'N') {
    for (const s of E.SUITS) if (s !== trump && bySuit(A, s).length && !bySuit(B, s).length && bySuit(B, trump).length) return lowest(bySuit(A, s));
  }
  // lose a trick cheaply: lowest card from a non-trump suit
  const nonTrump = A.filter((c) => S(c) !== trump);
  return lowest(nonTrump.length ? nonTrump : A);
}

function planRuff(K, A, B, sure) {
  const trump = K.trump;
  const affordable = K.remaining - K.need;
  const losers = K.remaining - sure;
  if (losers <= affordable) return null;
  // find long trump hand (L) and short trump hand (Sh)
  const decl = K.visible[K.declarer], dum = K.visible[K.dummy];
  const tD = bySuit(decl, trump).length, tM = bySuit(dum, trump).length;
  const [Lh, Sh, shortSeat] = tD >= tM ? [decl, dum, K.dummy] : [dum, decl, K.declarer];
  if (!bySuit(Sh, trump).length) return null;
  for (const s of E.SUITS) {
    if (s === trump) continue;
    const l = bySuit(Lh, s), sh = bySuit(Sh, s);
    if (l.length > sh.length && l.length > 0 && sh.length <= 1) {
      const meIsLong = K.visible[K.me] === Lh || (K.me !== shortSeat);
      if (sh.length === 0) {
        if (meIsLong) return lowest(l);           // lead toward the void to ruff
        continue;
      }
      // short hand has a singleton: play it out first (cash if boss, else concede)
      if (!meIsLong) return sh[0];
      if (isBoss(K, l[0])) return l[0];
      return lowest(l);
    }
  }
  return null;
}

function cashFrom(K, A, B, sureBy) {
  // prefer suits where the hand on lead is the shorter one holding a boss, else lead low to partner's boss
  let best = null, bestSc = -1e9;
  for (const s of E.SUITS) {
    if (!sureBy[s]) continue;
    const a = bySuit(A, s), b = bySuit(B, s);
    if (!a.length) continue;
    let sc = sureBy[s];
    if (K.trump !== 'N' && s === K.trump && oppTrumpCount(K) === 0) sc -= 2; // keep trumps for control
    if (a.length <= b.length) sc += 1;
    if (sc > bestSc) { bestSc = sc; best = s; }
  }
  if (!best) return null;
  const a = bySuit(A, best), b = bySuit(B, best);
  const aBoss = a.filter((c) => isBoss(K, c));
  const bBoss = b.filter((c) => isBoss(K, c));
  // unblock: honours from the short hand first
  if (a.length < b.length && aBoss.length) return aBoss[0];
  if (a.length >= b.length && bBoss.length && b.length < a.length && !aBoss.length) return lowest(a);
  if (a.length > b.length && bBoss.length && b.length <= bBoss.length) return lowest(a);
  if (aBoss.length) return aBoss[aBoss.length - 1] === undefined ? aBoss[0] : cheapestEquivalent(K, aBoss[0], a);
  if (bBoss.length) return lowest(a);
  return null;
}

function hasTenace(K, cs) {
  // e.g. AQ (K missing), KJ (Q missing, A gone/ours?), AJ10: card just below a missing honour
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const above = E.makeCard(S(c), R(c) + 1);
    if (R(c) < 14 && !K.gone.has(above) && R(c) >= 10) {
      // we hold something higher than the missing card?
      if (cs.some((x) => R(x) > R(c) + 1) || R(c) + 1 === 14) return true;
    }
  }
  return false;
}

function leadSuitToWin(K, s, A, B, drawing) {
  const a = bySuit(A, s), b = bySuit(B, s);
  if (!a.length) {
    // need to get to the other hand: lead a low card to partner's boss in another suit
    for (const t of E.SUITS) { const bb = bySuit(B, t), aa = bySuit(A, t); if (aa.length && bb.some((c) => isBoss(K, c)) && !aa.some((c) => isBoss(K, c))) return lowest(aa); }
    return lowest(A.filter((c) => S(c) !== K.trump).length ? A.filter((c) => S(c) !== K.trump) : A);
  }
  const aBoss = a.filter((c) => isBoss(K, c));
  if (aBoss.length && (!b.length || b.length >= a.length || drawing)) return cheapestEquivalent(K, aBoss[0], a);
  // the other hand holds a tenace: lead low towards it (finesse)
  if (b.length && hasTenace(K, b) && a.length) return lowest(a);
  // the other hand has the boss: lead low to it
  if (b.some((c) => isBoss(K, c)) && a.length) return lowest(a);
  if (aBoss.length) return aBoss[0];
  // sequence of honours: lead top to knock out the stopper
  if (a.length >= 2 && R(a[0]) >= 10 && R(a[0]) - R(a[1]) === 1) return a[0];
  if (a.length >= 1 && R(a[0]) >= 11 && b.some((c) => R(c) === R(a[0]) - 1)) return a[0];
  // lead towards honours in the other hand
  return lowest(a);
}

function declarerFollow(K, legal) {
  const t = K.trick, pos = t.length;
  const led = S(t[0].card);
  const win = currentWinner(K);
  const ourSide = (seat) => seat === K.declarer || seat === K.dummy;
  const weAreWinning = ourSide(win.seat);
  const { B, other } = sides(K);
  const following = legal.some((c) => S(c) === led);
  const cs = bySuit(legal, led);
  const winners = legal.filter((c) => beats(c, win.card, led, K.trump));
  const otherToPlay = !t.some((x) => x.seat === other);
  const bCards = bySuit(B, led);

  if (following) {
    // No-trump hold-up (rule of 7, at most twice) with a single stopper in the suit the defence attacks
    if (K.trump === 'N' && !ourSide(t[0].seat)) {
      const ours = cs.concat(otherToPlay ? bCards : []);
      const comb = bySuit(K.visible[K.declarer], led).length + bySuit(K.visible[K.dummy], led).length + K.tricks.filter((x) => S(x.cards[0].card) === led).reduce((n, x) => n + x.cards.filter((y) => ourSide(y.seat)).length, 0);
      const stoppers = ours.filter((c) => isBoss(K, c)).length;
      const roundsPlayed = K.tricks.filter((x) => S(x.cards[0].card) === led).length;
      const holdups = Math.min(2, 7 - comb);
      const affordable = K.remaining - K.need;
      if (stoppers === 1 && roundsPlayed < holdups && affordable >= 2 && !ours.some((c) => R(c) === 13 && !isBoss(K, c))) {
        return lowest(cs);
      }
    }
    if (weAreWinning) {
      // partner's card is winning: if it's sure, play low (but overtake to unblock not modelled)
      if (pos === 3 || isBoss(K, win.card)) return lowest(cs);
      if (pos === 2 && win.seat === other) return lowest(cs);
      if (pos === 1) return lowest(cs);
    }
    if (pos === 1) {
      // second hand: if partner (4th) can beat everything cheaply, play low
      if (otherToPlay && bCards.length && bCards.some((c) => isBoss(K, c))) return lowest(cs);
      const leadCard = t[0].card;
      if (R(leadCard) >= 10 && winners.length) return lowest(winners); // cover an honour
      // second hand low, but take a sure trick if it's the contract-making trick
      const sureW = winners.filter((c) => isBoss(K, c));
      if (sureW.length && K.need <= 1) return lowest(sureW);
      if (sureW.length && !otherToPlay) return lowest(sureW);
      if (sureW.length && (!bCards.length || !bCards.some((c) => R(c) > R(win.card)))) {
        // nothing in partner hand: second hand low unless honour would be lost later
        return lowest(cs);
      }
      return lowest(cs);
    }
    if (pos === 2) {
      // third hand for our side: finesse or win cheaply
      if (!winners.length) return lowest(cs);
      const boss = winners.filter((c) => isBoss(K, c));
      const nonBoss = winners.filter((c) => !isBoss(K, c));
      const combined = bySuit(K.visible[K.declarer], led).length + bySuit(K.visible[K.dummy], led).length + t.filter((x) => ourSide(x.seat)).length;
      const missing = [];
      for (let r = 14; r >= 2; r--) { const x = E.makeCard(led, r); if (!K.gone.has(x)) missing.push(r); }
      // eight ever, nine never: with 9+ cards missing only the queen, play for the drop
      const dropPlay = combined >= 9 && missing.length && missing[0] === 12 && boss.length;
      let sure = 0;
      for (const s of E.SUITS) sure += sureTricks(K, s, K.visible[K.declarer], K.visible[K.dummy]);
      const needFinesse = sure < K.need;
      if (nonBoss.length && needFinesse && !dropPlay) {
        // finesse: play the cheapest card that wins if the missing honours sit with second hand
        return lowest(nonBoss);
      }
      if (boss.length) return cheapestEquivalent(K, lowest(boss), cs);
      return lowest(winners);
    }
    // fourth hand
    if (winners.length) return lowest(winners);
    return lowest(cs);
  }
  // void: ruff if the defence is winning
  const trumps = K.trump !== 'N' ? bySuit(legal, K.trump) : [];
  if (trumps.length && !weAreWinning) {
    const ruffs = trumps.filter((c) => beats(c, win.card, led, K.trump));
    // if partner hand still to play and can win with a boss, don't ruff
    if (otherToPlay && bCards.some((c) => isBoss(K, c) && beats(c, win.card, led, K.trump))) return discard(K, legal.filter((c) => S(c) !== K.trump).length ? legal.filter((c) => S(c) !== K.trump) : legal);
    if (ruffs.length) return lowest(ruffs);
  }
  if (weAreWinning && pos === 2 && win.seat === other && !isBoss(K, win.card) && trumps.length && K.trump !== 'N') {
    // partner's card may be overtaken by 4th hand; keep trumps unless needed
  }
  const nonTrump = legal.filter((c) => K.trump === 'N' || S(c) !== K.trump);
  return discard(K, nonTrump.length ? nonTrump : legal);
}

module.exports = { chooseCard, knowledge, leadCardFrom, sureTricks, bySuit };
