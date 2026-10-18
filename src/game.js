'use strict';
// Board state machine shared by the server and the simulators.
const E = require('./engine');
const B = require('./bidding');
const P = require('./play');

function newBoard(number, rng, systems) {
  const { dealer, vul } = E.boardInfo(number);
  const hands = E.deal(rng);
  return {
    number, dealer, vul, hands, original: JSON.parse(JSON.stringify(hands)),
    auction: [], phase: 'auction', contract: null, trick: [], tricks: [], turn: dealer,
    trickComplete: false, result: null, systems: systems || { NS: { id: 'sayc' }, EW: { id: 'sayc' } },
  };
}

const dummyOf = (b) => (b.contract ? E.partnerOf(b.contract.declarer) : null);
// Seat that makes the decision for the hand whose turn it is.
// During the play the declaring side's two hands are both run by one seat: normally the declarer,
// but b.declCtrl (set by the room) can hand both to the dummy seat, e.g. a human whose computer
// partner won the contract plays the hand themselves.
function controllerOf(b, seat) {
  if (b.phase === 'play' && b.contract) {
    const decl = b.contract.declarer, dummy = dummyOf(b);
    if (seat === dummy || seat === decl) return b.declCtrl === dummy ? dummy : decl;
  }
  return seat;
}

function applyCall(b, seat, call) {
  if (b.phase !== 'auction') throw new Error('Not in the auction');
  if (E.auctionTurn(b.dealer, b.auction) !== seat) throw new Error('Not your turn to bid');
  if (!E.isLegalCall(b.dealer, b.auction, call)) throw new Error('Illegal call ' + call);
  b.auction.push({ seat, call });
  if (E.auctionComplete(b.auction)) {
    b.contract = E.contractOf(b.dealer, b.auction);
    if (!b.contract) {
      b.phase = 'done';
      b.result = { passedOut: true, score: 0, nsScore: 0, tricks: 0 };
      b.turn = null;
    } else {
      b.phase = 'play';
      b.turn = E.nextSeat(b.contract.declarer);
    }
  } else b.turn = E.auctionTurn(b.dealer, b.auction);
}

// actor = the seat of the person acting; hand seat is b.turn
function applyCard(b, actor, card) {
  if (b.phase !== 'play') throw new Error('Not in the play');
  if (b.trickComplete) throw new Error('Trick is being collected');
  const seat = b.turn;
  if (controllerOf(b, seat) !== actor) throw new Error('Not your turn to play');
  const hand = b.hands[seat];
  if (!hand.includes(card)) throw new Error('Card not in hand');
  if (!E.legalCards(hand, b.trick).includes(card)) throw new Error('You must follow suit');
  hand.splice(hand.indexOf(card), 1);
  b.trick.push({ seat, card });
  if (b.trick.length === 4) {
    b.trickComplete = true;
    b.turn = null;
  } else b.turn = E.nextSeat(seat);
}

function collectTrick(b) {
  if (!b.trickComplete) return;
  const winner = E.trickWinner(b.trick, b.contract.strain);
  b.tricks.push({ leader: b.trick[0].seat, cards: b.trick, winner });
  b.trick = [];
  b.trickComplete = false;
  if (b.tricks.length === 13) finish(b);
  else b.turn = winner;
}

function tricksWon(b) {
  const t = { NS: 0, EW: 0 };
  for (const x of b.tricks) t[E.sideOf(x.winner)]++;
  return t;
}

function finish(b) {
  const tw = tricksWon(b);
  const c = b.contract;
  const side = E.sideOf(c.declarer);
  const declTricks = tw[side];
  const score = E.scoreContract(c, declTricks, E.isVul(b.vul, c.declarer));
  b.phase = 'done';
  b.turn = null;
  b.result = { passedOut: false, tricks: declTricks, score, nsScore: side === 'NS' ? score : -score, made: score >= 0, diff: declTricks - (c.level + 6) };
}

// Bot decision for whoever's turn it is (returns {type, seat, value})
function botAction(b) {
  if (b.phase === 'auction') {
    const seat = b.turn;
    return { type: 'call', actor: seat, value: B.chooseCall(b.hands[seat], seat, b.dealer, b.auction, { vul: b.vul, systems: b.systems }) };
  }
  if (b.phase === 'play' && !b.trickComplete) {
    const seat = b.turn;
    return { type: 'card', actor: controllerOf(b, seat), value: P.chooseCard(b, seat) };
  }
  return null;
}

function resultText(b) {
  if (!b.result) return '';
  if (b.result.passedOut) return 'Passed out';
  const d = b.result.diff;
  return E.contractStr(b.contract) + ' ' + b.contract.declarer + (d === 0 ? ' =' : d > 0 ? ' +' + d : ' ' + d);
}

module.exports = { newBoard, controllerOf, dummyOf, applyCall, applyCard, collectTrick, tricksWon, botAction, resultText };
