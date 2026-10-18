'use strict';
// Learning-mode play tips. All wording is original. Uses only what the player can legitimately see.
const E = require('./engine');
const P = require('./play');
const R = E.rankOf, S = E.suitOf;
const NAME = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
const RN = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
const cardTxt = (c) => (RN[R(c)] || String(R(c))) + E.SYM[S(c)];

function leadReason(hand, card, trump, K) {
  const s = S(card);
  const cs = P.bySuit(hand, s); const r = cs.map(R); const i = cs.indexOf(card);
  const partnerBid = K.ann.some((a) => a.seat === K.partner && a.shows === s && !a.art);
  const bits = [];
  if (partnerBid) bits.push(`partner bid ${NAME[s]}`);
  if (s === trump) bits.push('a trump lead cuts down ruffs in dummy');
  if (cs.length === 1) bits.push('a singleton, hoping to ruff later');
  else if (r[0] === 14 && r[1] === 13) bits.push(trump === 'N' ? 'from A-K, the king asks partner to unblock or give count' : 'from A-K, cash the ace and look at dummy');
  else if (i === 0 && r[0] >= 10 && r[0] - r[1] === 1) bits.push('top of a sequence: safe, and it tells partner you hold the card below');
  else if (i === 1 && r[1] - r[2] === 1 && r[1] >= 9 && r[0] - r[1] >= 2) bits.push('top of an interior sequence');
  else if (cs.length === 2) bits.push('top of a doubleton');
  else if (cs.length === 3 && i === 1 && r[0] < 11) bits.push('middle of three small (MUD)');
  else if (cs.length >= 4 && i === 3) bits.push(`fourth highest from your ${cs.length}-card suit, to build tricks with length`);
  else if (cs.length === 3 && i === 2) bits.push('low from an honour, keeping the honour to capture theirs');
  if (!bits.length) bits.push('the least risky choice here');
  return bits.join('; ');
}

function plan(K) {
  const { declarer, dummy, trump } = K;
  const A = K.visible[declarer], B = K.visible[dummy];
  const need = K.need;
  let sure = 0; const per = [];
  for (const s of ['S', 'H', 'D', 'C']) { const t = P.sureTricks(K, s, A, B); sure += t; if (t) per.push(`${E.SYM[s]}${t}`); }
  let txt = `You need ${need} more trick${need === 1 ? '' : 's'}. Sure winners now: ${sure}${per.length ? ' (' + per.join(' ') + ')' : ''}.`;
  if (trump !== 'N') {
    const main = P.bySuit(A, trump).length >= P.bySuit(B, trump).length ? A : B;
    let losers = 0;
    for (const s of ['S', 'H', 'D', 'C']) {
      const mine = P.bySuit(main, s), other = P.bySuit(main === A ? B : A, s);
      const n = Math.min(mine.length, 3);
      let cover = 0;
      for (let k = 0; k < n; k++) if (mine.concat(other).some((c) => R(c) === 14 - k) || K.played.has(s + 'AKQ'[k])) cover++;
      losers += Math.max(0, n - cover);
    }
    txt += ` About ${losers} loser${losers === 1 ? '' : 's'} in the long-trump hand.`;
    const theirTrumps = 13 - P.bySuit(A.concat(B), trump).length - [...K.played].filter((c) => S(c) === trump).length;
    if (sure >= need) txt += theirTrumps > 0 ? ' You have enough winners: draw trumps, then cash them.' : ' Enough winners: cash them, high card from the short hand first.';
    else if (losers > 0 && P.bySuit(B, trump).length && P.bySuit(B, trump).length < P.bySuit(A, trump).length) txt += ' Short of winners: ruffing losers in dummy or a finesse may supply the extra tricks.';
    else txt += ' Short of winners: look to set up a long suit or take a finesse, and keep trump control.';
  } else {
    txt += sure >= need ? ' Enough winners: cash them, unblocking the short hand first.' : ' Build extra tricks in your longest suit before cashing winners, and hold up in the suit they lead.';
  }
  return txt;
}

function lastPartnerCard(K) {
  const tr = K.tricks.concat(K.trick.length ? [{ cards: K.trick }] : []);
  for (let t = tr.length - 1; t >= 0; t--) {
    const cards = tr[t].cards; const idx = cards.findIndex((c) => c.seat === K.partner);
    if (idx >= 0) return { card: cards[idx].card, led: cards[0], idx, leader: cards[0].seat, trickNo: t };
  }
  return null;
}
function signalMeaning(K) {
  const pc = lastPartnerCard(K);
  if (!pc) return '';
  const c = pc.card, rank = R(c);
  const spot = rank <= 9 ? (rank >= 6 ? 'high' : 'low') : null;
  if (pc.idx === 0) {
    if (rank >= 10) return `Partner led the ${cardTxt(c)}: probably top of a sequence (or a doubleton).`;
    return `Partner led the ${cardTxt(c)}: often fourth best (try the Rule of Eleven) or top of a short suit.`;
  }
  if (S(c) !== S(pc.led.card)) {
    if (S(c) === K.trump) return `Partner ruffed with the ${cardTxt(c)}.`;
    return spot ? `Partner discarded the ${cardTxt(c)}: a ${spot} card ${spot === 'high' ? 'asks for' : 'says no interest in'} ${NAME[S(c)]}.` : `Partner discarded an honour (${cardTxt(c)}): likely the top of a sequence they want led.`;
  }
  if (!spot) return '';
  if (pc.leader === K.me) return `Partner's ${cardTxt(c)} is attitude: ${spot === 'high' ? 'encouraging, keep going in this suit' : 'discouraging, consider a switch'}.`;
  if (pc.leader === K.declarer || pc.leader === K.dummy) return `Partner's ${cardTxt(c)} on declarer's lead gives count: ${spot === 'high' ? 'high usually shows an even number' : 'low usually shows an odd number'}.`;
  return '';
}

// Tip for the player who controls the hand to play. Returns {card, text} or null.
function playTip(board, seat) {
  if (board.phase !== 'play' || board.trickComplete) return null;
  const turn = board.turn;
  const decl = board.contract.declarer, dummy = E.partnerOf(decl);
  const ctrl = turn === decl || turn === dummy ? (board.declCtrl === dummy ? dummy : decl) : turn;
  if (ctrl !== seat) return null;
  const card = P.chooseCard(board, turn);
  const K = P.knowledge(board, turn);
  const lines = [];
  let why = '';
  if (K.role === 'defender' && board.tricks.length === 0 && board.trick.length === 0) why = leadReason(K.hand, card, K.trump, K);
  if (K.role === 'declarer') {
    if (board.tricks.length <= 1 || board.trick.length === 0) lines.push(plan(K));
  } else {
    const sig = signalMeaning(K); if (sig) lines.push(sig);
  }
  const SEATN = { N: 'North', E: 'East', S: 'South', W: 'West' };
  const who = turn === seat ? '' : turn === dummy ? ` from dummy (${SEATN[turn]})` : ` from declarer's hand (${SEATN[turn]})`;
  const info = P.choiceInfo(board, turn);
  if (!why && info && info.make && info.make[card] !== undefined) {
    const pct = Math.round(100 * info.make[card]);
    const goal = K.role === 'declarer' ? 'makes the contract' : 'beats the contract';
    why = `it ${goal} in ${pct}% of ${info.samples} likely layouts of the hidden cards`;
    const alt = Object.keys(info.make).filter((c) => c !== card && info.make[c] < info.make[card] - 0.15);
    if (alt.length && alt.length <= 3) why += `; ${alt.map(cardTxt).join(', ')} would do worse`;
  }
  return { card, text: `Suggested${who}: ${cardTxt(card)}${why ? ' (' + why + ')' : ''}.`, notes: lines };
}

module.exports = { playTip, leadReason, cardTxt };
