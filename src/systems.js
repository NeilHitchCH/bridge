'use strict';
// Bidding-system definitions. Each system is data: ranges, opening style, response style and
// default conventions, plus a quick-reference card written in our own words.
const CONVENTIONS = {
  stayman: 'Stayman (2♣ over 1NT asks for a major)',
  transfers: 'Jacoby transfers (2♦→♥, 2♥→♠ over 1NT)',
  jacoby2n: 'Jacoby 2NT (game-forcing raise of a major)',
  rkcb: 'Roman Key Card Blackwood 1430 (off = simple Blackwood)',
  weakTwos: 'Weak two openings',
  negDbl: 'Negative doubles',
  michaels: 'Michaels cue-bid',
  unusual: 'Unusual 2NT',
  splinters: 'Splinter raises',
};

const BASE = {
  nt: [15, 17], nt2: [20, 21], strong2C: 22, majorLen: 5, minorStyle: 'better', weakSuits: ['D', 'H', 'S'],
  twoOverOne: false, forcingNT: false, resp1NT: [6, 10], rebidNT1: [12, 14], rebidNT2: [18, 19],
  precision: false, sef: false,
};

const SYSTEMS = {
  sayc: {
    ...BASE, id: 'sayc', name: 'Standard American (SAYC)', short: 'SAYC', beta: false,
    summary: 'Five-card majors, strong 1NT 15–17, strong artificial 2♣, weak twos.',
    conv: { stayman: true, transfers: true, jacoby2n: true, rkcb: false, weakTwos: true, negDbl: true, michaels: true, unusual: true, splinters: false },
    card: [
      ['Openings', ['1♣/1♦: 12–21 HCP (or Rule of 20), no 5-card major; 1♦ with 4-4 minors, 1♣ with 3-3', '1♥/1♠: 5+ cards, 12–21', '1NT: 15–17 balanced', '2♣: 22+ (or 9 tricks), artificial, forcing', '2♦/2♥/2♠: weak, good 6-card suit, 5–10', '2NT: 20–21 balanced', '3-level: 7-card pre-empt']],
      ['Responses to 1 of a major', ['Single raise 6–9 with 3+', 'Limit raise 3M: 10–12 with 3+', 'Jacoby 2NT: 13+ with 4+ support', 'Jump to 4M: weak, 5+ trumps', 'New suit at 1 level: 6+, forcing; at 2 level: 10+', '1NT: 6–10, no fit']],
      ['Over 1NT', ['2♣ Stayman (8+ with a 4-card major)', '2♦/2♥ transfers to ♥/♠ (any strength)', '2NT invite 8–9, 3NT 10–15', '4NT quantitative']],
      ['Competition', ['Overcall: 8–16 with a good 5-card suit', '1NT overcall: 15–18 with a stopper', 'Takeout double: 12+, short in their suit', 'Negative double by responder after an overcall', 'Michaels (both majors over a minor), Unusual 2NT (both minors)']],
      ['Slams', ['Blackwood 4NT: 5♣ 0/4, 5♦ 1, 5♥ 2, 5♠ 3 aces']],
    ],
  },
  twoOverOne: {
    ...BASE, id: 'twoOverOne', name: '2/1 Game Forcing', short: '2/1 GF', beta: false, twoOverOne: true, forcingNT: true, resp1NT: [6, 12],
    summary: 'SAYC base; a new suit at the two level over 1♥/1♠ forces to game; 1NT response to a major is forcing.',
    conv: { stayman: true, transfers: true, jacoby2n: true, rkcb: true, weakTwos: true, negDbl: true, michaels: true, unusual: true, splinters: true },
    card: [
      ['Openings', ['As SAYC: 5-card majors, 1NT 15–17, 2♣ strong, weak twos, 2NT 20–21']],
      ['Responses to 1♥/1♠', ['2-level new suit (unpassed hand): 13+, game forcing', '1NT: forcing for one round, 6–12', 'Single raise 6–9, limit raise 10–12, Jacoby 2NT 13+ with 4 trumps', 'Splinter: double jump in a new suit = 4+ trumps, game values, singleton/void there']],
      ['Opener after a forcing 1NT', ['Rebid a 6-card suit, show a second suit, or bid a 3-card minor with 5-3-3-2', '2NT = 18–19 balanced']],
      ['Slams', ['RKCB 1430: 5♣ 1 or 4 key cards, 5♦ 0 or 3, 5♥ 2 without the trump Q, 5♠ 2 with it']],
    ],
  },
  acol: {
    ...BASE, id: 'acol', name: 'Acol (UK)', short: 'Acol', beta: false, nt: [12, 14], nt2: [20, 22], strong2C: 23, majorLen: 4, minorStyle: 'acol', resp1NT: [6, 9], rebidNT1: [15, 16], rebidNT2: [17, 18],
    summary: 'Four-card majors, weak 1NT 12–14, strong 2♣, weak twos; balanced 15–19 opens a suit and rebids no-trumps.',
    conv: { stayman: true, transfers: true, jacoby2n: false, rkcb: false, weakTwos: true, negDbl: true, michaels: true, unusual: true, splinters: false },
    card: [
      ['Openings', ['1 of a suit: 12–19, 4+ cards; longest suit first; with two 4-card suits open the lower', '1NT: 12–14 balanced', '2♣: 23+ or game-going, artificial', '2♦/2♥/2♠: weak, 6-card suit', '2NT: 20–22 balanced']],
      ['Opener\'s no-trump rebids', ['1NT rebid: 15–16 balanced', '2NT rebid: 17–18 balanced', 'Jump to 3NT: 19']],
      ['Responses', ['Raise with 4-card support: 6–9 single, 10–12 jump', '1NT response: 6–9', 'New suit at 2 level: 9+ (we use 10+)', 'Over 1NT: Stayman 11+ with a major (game values or invite), transfers any strength, 2NT invite 11–12, 3NT 13+']],
      ['Competition & slams', ['Takeout and negative doubles as in Standard American', 'Simple Blackwood']],
    ],
  },
  precision: {
    ...BASE, id: 'precision', name: 'Precision Club', short: 'Precision', beta: false, precision: true, nt: [13, 15], nt2: [22, 23], strong2C: null, weakSuits: ['H', 'S'],
    summary: 'Strong artificial 1♣ (16+); limited openings 11–15: 1♦ (2+), 1♥/1♠ (5+), 1NT 13–15, 2♣ (6+ clubs), 2♦ (short diamonds, 4-4 majors).',
    conv: { stayman: true, transfers: true, jacoby2n: true, rkcb: true, weakTwos: true, negDbl: true, michaels: true, unusual: true, splinters: false },
    card: [
      ['Openings', ['1♣: 16+ any shape, artificial, forcing', '1♦: 11–15, 2+ diamonds, no 5-card major', '1♥/1♠: 11–15, 5+ cards', '1NT: 13–15 balanced', '2♣: 11–15, 6+ clubs', '2♦: 11–15, short diamonds with both majors (4-4-1-4, 4-4-0-5, 4-3-1-5, 3-4-1-5)', '2♥/2♠: weak twos', '2NT: 22–23 balanced']],
      ['Responses to 1♣', ['1♦: negative, 0–7', '1♥/1♠/2♣/2♦: 8+, 5+ cards, game forcing', '1NT: 8–13 balanced', '2NT: 14+ balanced']],
      ['Opener after 1♣–1♦', ['1♥/1♠/2♣/2♦: natural 5+', '1NT: 16–18 balanced, 2NT: 19–21 balanced']],
      ['Other', ['Responses to 1♦/1♥/1♠ much as in Standard American (opener is limited to 15)', 'RKCB 1430 for slams']],
    ],
  },
  sef: {
    ...BASE, id: 'sef', name: 'Standard French (SEF)', short: 'SEF', beta: true, sef: true, weakSuits: ['H', 'S'],
    summary: 'Five-card majors, 1NT 15–17, 2♣ strong forcing, 2♦ game forcing, weak 2♥/2♠. Beta: responses follow the Standard American model.',
    conv: { stayman: true, transfers: true, jacoby2n: false, rkcb: true, weakTwos: true, negDbl: true, michaels: true, unusual: true, splinters: false },
    card: [
      ['Openings', ['1♣ with 3-3 minors, 1♦ with 4-4 minors (5-card majors)', '1NT: 15–17', '2♣: strong and forcing (20+ unbalanced or 22–23 balanced)', '2♦: game forcing (24+)', '2♥/2♠: weak twos', '2NT: 20–21']],
      ['Responses', ['Over 2♣: 2♦ relay/waiting; over 2♦: 2♥ relay', 'Otherwise as Standard American in this app (beta)']],
    ],
  },
  beginner: {
    ...BASE, id: 'beginner', name: 'Beginner Standard American', short: 'Beginner', beta: false, weakSuits: [],
    summary: 'Five-card majors, 1NT 15–17, strong 2♣, with only Stayman, Blackwood and takeout doubles.',
    conv: { stayman: true, transfers: false, jacoby2n: false, rkcb: false, weakTwos: false, negDbl: false, michaels: false, unusual: false, splinters: false },
    card: [
      ['Openings', ['1 of a suit: 13+ (or Rule of 20); 5-card majors', '1NT: 15–17 balanced', '2♣: 22+', '2NT: 20–21', '3-level: 7-card pre-empt with a weak hand']],
      ['Responses', ['6–9: raise with 3+ support or bid 1NT', '10–12: jump raise (invitational)', '13+: bid game or a new suit', 'Over 1NT: 2♣ Stayman, 2NT invite, 3NT game']],
      ['Competition & slams', ['Overcall with a good 5-card suit, takeout double with 12+ and shortness', 'Blackwood 4NT for aces']],
    ],
  },
};

function resolveSystem(id, convOverrides) {
  const base = SYSTEMS[id] || SYSTEMS.sayc;
  const conv = { ...base.conv, ...(convOverrides || {}) };
  if (!conv.weakTwos) conv.weakTwos = false;
  return { ...base, conv };
}
function listSystems() {
  return Object.values(SYSTEMS).map((s) => ({ id: s.id, name: s.name, short: s.short, beta: s.beta, summary: s.summary, conv: s.conv, card: s.card }));
}

module.exports = { SYSTEMS, CONVENTIONS, resolveSystem, listSystems };
