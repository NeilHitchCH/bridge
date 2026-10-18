'use strict';
// Computer bidding: simplified Standard American (SAYC) following the bridgeplaybook.com
// bidding cheat sheet / conventions pages (see STRATEGY.md for the rule-by-rule mapping).
const E = require('./engine');
const { evalHand } = require('./hand');
const { resolveSystem } = require('./systems');

// Current system for the side whose call is being interpreted/decided (set synchronously).
let SY = resolveSystem('sayc');
const DEFAULT_SYSTEMS = { NS: resolveSystem('sayc'), EW: resolveSystem('sayc') };
function normSystems(systems) {
  if (!systems) return DEFAULT_SYSTEMS;
  const f = (x) => (x && x.conv ? x : resolveSystem(x && x.id ? x.id : x, x && x.convOverrides));
  return { NS: f(systems.NS), EW: f(systems.EW || systems.NS) };
}
const sysFor = (systems, seat) => systems[E.sideOf(seat)];
const ntLo = () => SY.nt[0], ntHi = () => SY.nt[1];
const raiseMin = () => (SY.majorLen === 4 ? 4 : 3);

const MAJORS = ['H', 'S'];
const isMajor = (s) => s === 'H' || s === 'S';
const GAME = { C: 5, D: 5, H: 4, S: 4, N: 3 };
const sRank = (s) => E.STRAINS.indexOf(s);

// ---------------------------------------------------------------- context
function buildCtx(dealer, auction, seat, ann) {
  const partner = E.partnerOf(seat), lho = E.nextSeat(seat), rho = E.nextSeat(seat, 3);
  const entries = auction.map((a, i) => ({ ...a, ...(ann[i] || {}), idx: i }));
  const bids = entries.filter((a) => E.isBid(a.call));
  const opening = bids[0] || null;
  const by = (s) => entries.filter((a) => a.seat === s);
  const nonPass = (arr) => arr.filter((a) => a.call !== 'P');
  const lastBid = E.lastBidEntry(auction);
  const oppSuits = new Set();
  for (const a of entries) if (!E.sameSide(a.seat, seat) && a.shows && a.shows !== 'N') oppSuits.add(a.shows);
  const ourSuits = new Set();
  for (const a of entries) if (E.sameSide(a.seat, seat) && a.shows && a.shows !== 'N') ourSuits.add(a.shows);
  return {
    dealer, auction, seat, partner, lho, rho, entries, bids, opening,
    my: nonPass(by(seat)), myAll: by(seat), pc: nonPass(by(partner)), pAll: by(partner),
    opp: entries.filter((a) => !E.sameSide(a.seat, seat) && a.call !== 'P'),
    lastBid, oppSuits, ourSuits,
    rhoLast: by(rho).slice(-1)[0] || null,
    pLast: nonPass(by(partner)).slice(-1)[0] || null,
    myLast: nonPass(by(seat)).slice(-1)[0] || null,
    legal: E.legalCalls(dealer, auction),
    ourSideOpened: opening ? E.sameSide(opening.seat, seat) : false,
  };
}

const cheapestLevel = (ctx, strain) => {
  const lb = ctx.lastBid;
  if (!lb) return 1;
  const l = E.bidLevel(lb.call), s = E.bidStrain(lb.call);
  return sRank(strain) > sRank(s) ? l : l + 1;
};
const isJump = (ctx, call) => E.isBid(call) && E.bidLevel(call) > cheapestLevel(ctx, E.bidStrain(call));

// ---------------------------------------------------------------- interpretation
// Annotate each call with what it shows: {shows, minLen, lo, hi, bal, art, forcing, conv}
function annotate(dealer, auction, systems) {
  const sys = normSystems(systems);
  const saved = SY;
  const ann = [];
  for (let i = 0; i < auction.length; i++) {
    const { seat, call } = auction[i];
    SY = sysFor(sys, seat);
    const ctx = buildCtx(dealer, auction.slice(0, i), seat, ann);
    let a;
    try { a = interpret(ctx, call); } catch (e) { if (process.env.BRIDGE_DEBUG) throw e; a = {}; }
    ann.push(a);
  }
  SY = saved;
  return ann;
}

function nat(suit, minLen, lo, hi, extra = {}) { return { shows: suit, minLen, lo, hi, ...extra }; }

function interpret(ctx, call) {
  const p = ctx.pLast;
  if (call === 'P') {
    if (!ctx.opening) return { lo: 0, hi: 11, pass: true };
    if (ctx.ourSideOpened && ctx.my.length === 0 && ctx.pc.length === 1 && ctx.opp.length === 0) return { lo: 0, hi: 5, pass: true };
    return { pass: true };
  }
  if (call === 'X') {
    const lb = ctx.lastBid;
    if (ctx.pLast && ctx.pLast.conv === 'blackwood') return { conv: 'other' };
    // takeout double: opponents opened, our side silent, low level
    if (!ctx.ourSideOpened && ctx.my.length === 0 && ctx.pc.length === 0 && E.bidLevel(lb.call) <= 3)
      return { conv: 'takeout', lo: 12, hi: 40, forcing: true, short: E.bidStrain(lb.call) };
    // negative double: partner opened, RHO overcalled, my first call
    if (SY.conv.negDbl && ctx.ourSideOpened && ctx.my.length === 0 && ctx.pc.length === 1 && E.bidLevel(lb.call) <= 2 && E.bidStrain(lb.call) !== 'N')
      return { conv: 'negative', lo: 6, hi: 40, forcing: true, unbidMajors: MAJORS.filter((m) => !ctx.oppSuits.has(m) && !ctx.ourSuits.has(m)) };
    return { conv: 'penalty' };
  }
  if (call === 'XX') return { conv: 'redouble', lo: 10, hi: 40 };

  const L = E.bidLevel(call), S = E.bidStrain(call);
  const jump = isJump(ctx, call);
  // ---- opening
  if (!ctx.opening) {
    if (call === '1N') return nat('N', 0, ntLo(), ntHi(), { bal: true });
    if (call === '2N') return nat('N', 0, SY.nt2[0], SY.nt2[1], { bal: true });
    if (SY.precision) {
      if (call === '1C') return { art: true, conv: 'strongClub', lo: 16, hi: 40, forcing: true };
      if (call === '1D') return nat('D', 2, 11, 15, { opening: true, nebulous: true });
      if (L === 1) return nat(S, 5, 11, 15, { opening: true });
      if (call === '2C') return nat('C', 6, 11, 15, { opening: true });
      if (call === '2D') return { art: true, conv: 'prec2d', lo: 11, hi: 15, len: { H: 3, S: 3, C: 4 } };
    }
    if (SY.sef && call === '2D') return { art: true, conv: 'gf2d', lo: 24, hi: 40, forcing: true };
    if (SY.sef && call === '2C') return { art: true, conv: 'strong2c', lo: 20, hi: 40, forcing: true };
    if (call === '2C' && !SY.precision) return { art: true, conv: 'strong2c', lo: SY.strong2C, hi: 40, forcing: true };
    if (L === 1) return nat(S, isMajor(S) ? SY.majorLen : SY.majorLen === 4 ? 4 : 3, 11, SY.majorLen === 4 ? 19 : 21, { opening: true });
    if (L === 2) return nat(S, 6, 5, 11, { weak: true });
    if (L === 3) return nat(S, 7, 5, 10, { weak: true });
    return nat(S, 8, 4, 10, { weak: true });
  }
  // ---- conventional continuations
  if (p) {
    if (p.conv === 'blackwood' && L === 5 && S !== 'N' && ctx.lastBid.call === '4N') {
      if (SY.conv.rkcb) return { art: true, conv: 'rkcresp', kc: { C: [1, 4], D: [0, 3], H: [2], S: [2] }[S], tq: S === 'S' ? true : S === 'H' ? false : null };
      return { art: true, conv: 'bwresp', aces: { C: 0, D: 1, H: 2, S: 3 }[S] };
    }
    if (call === '4N' && ctx.ourSideOpened !== undefined) {
      const agreed = agreedSuit(ctx);
      const pNT = p.shows === 'N';
      if (pNT && !agreed) return { conv: 'quant', shows: 'N', lo: 15, hi: 17 };
      return { art: true, conv: 'blackwood', rkcb: !!SY.conv.rkcb, forcing: true };
    }
    if ((p.conv === 'stayman') && ctx.my.length && ctx.lastBid.seat === ctx.partner) {
      // opener answering Stayman
      if (S === 'D' && L === p.lvl) return { art: true, conv: 'staymanResp', noMajor: true };
      if (S === 'H' || S === 'S') return nat(S, 4, 0, 40, { conv: 'staymanResp' });
    }
    if (p.conv === 'transfer' && ctx.my.length && S === p.target) return nat(S, 2, 0, 40, { art: true, conv: 'transferDone', superAccept: L > p.lvl });
    if (p.conv === 'strong2c' && call === '2D' && ctx.my.length === 0) return { art: true, conv: 'waiting', lo: 0, hi: 40 };
    if (p.conv === 'gf2d' && call === '2H' && ctx.my.length === 0) return { art: true, conv: 'waiting', lo: 0, hi: 40 };
    if (p.conv === 'strongClub' && ctx.my.length === 0 && ctx.opp.length === 0) {
      if (call === '1D') return { art: true, conv: 'precNeg', lo: 0, hi: 7 };
      if (call === '1N') return nat('N', 0, 8, 13, { bal: true, gf: true });
      if (call === '2N') return nat('N', 0, 14, 40, { bal: true, gf: true });
      return nat(S, 5, 8, 40, { gf: true, forcing: true });
    }
    if (p.conv === 'splinter') { /* opener's reply natural */ }
    if (p.conv === 'jacoby2n') return nat(ctx.pc[0] && agreedSuit(ctx) || S, 0, 0, 40, { jac: true, extra: L === 3 });
  }
  // ---- responses to partner's opening (my first call)
  const pOpened = ctx.opening && ctx.opening.seat === ctx.partner && ctx.my.length === 0;
  if (pOpened && ctx.pc.length === 1) {
    const o = ctx.opening.call, oL = E.bidLevel(o), oS = E.bidStrain(o);
    const interfered = ctx.opp.length > 0;
    if (!interfered && (o === '1N' || o === '2N')) {
      const base = oL + 1;
      const one = o === '1N';
      const g = one ? 25 - ntLo() : 25 - SY.nt2[0];
      if (L === base && S === 'C' && SY.conv.stayman) return { art: true, conv: 'stayman', lvl: base, lo: one ? g - 2 : 4, hi: 40, forcing: true };
      if (L === base && (S === 'D' || S === 'H') && SY.conv.transfers) return { art: true, conv: 'transfer', lvl: base, target: S === 'D' ? 'H' : 'S', shows: S === 'D' ? 'H' : 'S', minLen: 5, lo: 0, hi: 40, forcing: true };
      if (call === '2N') return nat('N', 0, g - 2, g - 1, { bal: true });
      if (call === '3N') return nat('N', 0, g, one ? g + 5 : g + 6);
      if (call === '4N') return { conv: 'quant', shows: 'N', lo: g + 6, hi: g + 7 };
      if (call === '6N') return nat('N', 0, g + 8, g + 9);
      if (L === 2) return nat(S, 5, 0, g - 3, { weak: true });
      return nat(S, 5, g, 40, { forcing: true });
    }
    if (o === '2C' && !interfered) return nat(S, 5, 8, 40);
    if (oL === 1 && oS !== 'N' && !(SY.precision && oS === 'C')) {
      if (S === oS) {
        if (L === 2) return nat(S, isMajor(S) ? raiseMin() : 4, 6, 9, { raise: true });
        if (L === 3) return nat(S, isMajor(S) ? raiseMin() : 4, 10, 12, { raise: true });
        if (L === 4) return nat(S, 5, 0, 9, { raise: true });
      }
      if (call === '2N' && isMajor(oS) && !interfered && SY.conv.jacoby2n) return { art: true, conv: 'jacoby2n', support: oS, lo: 13, hi: 40, forcing: true };
      if (SY.conv.splinters && isMajor(oS) && !interfered && S !== oS && S !== 'N' && L === cheapestLevel(ctx, S) + 2 && L <= 4) return { art: true, conv: 'splinter', support: oS, short: S, lo: 12, hi: 15, forcing: true };
      if (call === '1N' && SY.forcingNT && isMajor(oS) && !interfered) return nat('N', 0, 6, 12, { forcing: true, conv: 'forcingNT' });
      if (call === '1N') return nat('N', 0, interfered ? 8 : SY.resp1NT[0], interfered ? 11 : SY.resp1NT[1]);
      if (call === '2N') return nat('N', 0, 11, 12, { bal: true });
      if (call === '3N') return nat('N', 0, 13, 15, { bal: true });
      if (interfered && ctx.oppSuits.has(S)) return { art: true, conv: 'cuebidRaise', support: oS, lo: 10, hi: 40, forcing: true };
      if (L === 1) return nat(S, 4, 6, 40, { forcing: true });
      if (!jump && SY.twoOverOne && !interfered && L === 2 && (isMajor(oS) || (oS === 'D' && S === 'C')) && ctx.myAll.length === 0)
        return nat(S, S === 'H' && oS === 'S' ? 5 : 4, 13, 40, { forcing: true, gf: true });
      if (!jump) return nat(S, isMajor(S) && S === 'H' && oS === 'S' ? 5 : (interfered ? 5 : 4), 10, 40, { forcing: true });
      return nat(S, 6, 5, 9, { weak: true });
    }
    // weak openings
    if (S === oS) return nat(S, 3, 0, 40, { raise: true });
    return nat(S, 5, 14, 40);
  }
  // ---- overcalls / defensive bidding: opponents opened, our side has not bid
  if (!ctx.ourSideOpened && ctx.my.length === 0 && ctx.pc.length === 0) {
    const oS = E.bidStrain(ctx.opening.call);
    if (call === '1N') return nat('N', 0, 15, 18, { bal: true, stopper: oS });
    if (SY.conv.michaels && L === 2 && S === oS && ctx.opening.call[0] === '1' && !isMajor(oS)) return { art: true, conv: 'michaels', two: ['H', 'S'], lo: 7, hi: 40 };
    if (SY.conv.unusual && call === '2N' && jump) return { art: true, conv: 'unusual', two: E.SUITS.filter((x) => x !== oS && !isMajor(x) || false).length === 2 ? ['C', 'D'] : ['C', 'D'], lo: 7, hi: 40 };
    if (jump) return nat(S, 6, 5, 10, { weak: true });
    return nat(S, 5, L === 1 ? 8 : 11, 17);
  }
  // ---- advancing partner's takeout double / overcall
  if (ctx.my.length === 0 && ctx.pc.length >= 1 && !ctx.ourSideOpened) {
    const pf = ctx.pc[0];
    if (pf.conv === 'takeout') {
      if (ctx.oppSuits.has(S)) return { art: true, conv: 'cuebid', lo: 12, hi: 40, forcing: true };
      if (S === 'N') return nat('N', 0, L === 1 ? 6 : L === 2 ? 11 : 13, L === 1 ? 10 : L === 2 ? 12 : 16, { stopper: true });
      return nat(S, 4, jump ? 9 : 0, jump ? 11 : 8);
    }
    if (pf.conv === 'michaels' || pf.conv === 'unusual') return nat(S, 3, 0, 40, { preference: true });
    if (pf.shows && pf.shows !== 'N') {
      if (S === pf.shows) return nat(S, 3, jump ? 8 : 6, jump ? 11 : 9, { raise: true });
      if (ctx.oppSuits.has(S)) return { art: true, conv: 'cuebidRaise', support: pf.shows, lo: 10, hi: 40, forcing: true };
      if (S === 'N') return nat('N', 0, L <= 2 ? 8 : 11, L <= 2 ? 11 : 15);
      return nat(S, 5, 10, 40);
    }
  }
  // ---- generic natural continuation
  if (S === 'N') return nat('N', 0, 0, 40, { bal: true });
  const prevMine = ctx.my.filter((a) => a.shows === S);
  if (prevMine.length) return nat(S, Math.min(7, Math.max(...prevMine.map((a) => a.minLen || 4)) + 1), 0, 40);
  if (ctx.pc.some((a) => a.shows === S)) {
    const pMin = Math.max(...ctx.pc.filter((a) => a.shows === S).map((a) => a.minLen || 4));
    return nat(S, Math.max(2, Math.min(4, 8 - pMin)), 0, 40, { raise: true });
  }
  if (ctx.oppSuits.has(S)) return { art: true, conv: 'cuebid', forcing: true };
  // new suit by opener at 2-level higher than first suit = reverse
  const forcing = ctx.my.length >= 1 && ctx.opening && (ctx.opening.seat === ctx.seat) && ctx.my[0].shows && L === 2 && sRank(S) > sRank(ctx.my[0].shows);
  // new suit by responder is forcing (unpassed hand, no game reached)
  const respNew = ctx.opening && ctx.opening.seat === ctx.partner && L < 4;
  return nat(S, 4, forcing ? 16 : 0, 40, { forcing: forcing || respNew, reverse: forcing });
}

function agreedSuit(ctx) {
  // A suit both partners have bid naturally (or a raise)
  const mine = new Set(ctx.my.filter((a) => a.shows && a.shows !== 'N' && !a.art).map((a) => a.shows));
  for (const a of ctx.pc) {
    if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise' || a.conv === 'splinter') return a.support;
    if (a.conv === 'transferDone' || a.conv === 'staymanResp') { if (a.shows && mine.has(a.shows)) return a.shows; }
    if (a.shows && a.shows !== 'N' && mine.has(a.shows)) return a.shows;
  }
  for (const a of ctx.my) if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise' || a.conv === 'splinter') return a.support;
  return null;
}

// What we know about a seat from its calls
function inferSeat(entries, seat) {
  const info = { lo: 0, hi: 37, len: { C: 0, D: 0, H: 0, S: 0 }, bal: false, aces: null };
  for (const a of entries) {
    if (a.seat !== seat) continue;
    if (typeof a.lo === 'number') info.lo = Math.max(info.lo, a.lo);
    if (typeof a.hi === 'number' && a.hi < info.hi) info.hi = Math.max(info.lo, a.hi);
    if (a.shows && a.shows !== 'N' && a.minLen) info.len[a.shows] = Math.max(info.len[a.shows], a.minLen);
    if (a.conv === 'staymanResp' && a.noMajor) { /* nothing */ }
    if (a.conv === 'takeout') for (const s of E.SUITS) if (s !== a.short) info.len[s] = Math.max(info.len[s], 3);
    if (a.conv === 'negative') for (const s of a.unbidMajors || []) info.len[s] = Math.max(info.len[s], 4);
    if (a.conv === 'michaels' || a.conv === 'unusual') for (const s of a.two) info.len[s] = Math.max(info.len[s], 5);
    if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise' || a.conv === 'splinter') info.len[a.support] = Math.max(info.len[a.support], a.conv === 'cuebidRaise' ? 3 : 4);
    if (a.len) for (const s of Object.keys(a.len)) info.len[s] = Math.max(info.len[s], a.len[s]);
    if (a.gf) info.gf = true;
    if (a.bal) info.bal = true;
    if (a.conv === 'bwresp') info.aces = a.aces;
    if (a.conv === 'rkcresp') info.kc = a.kc;
  }
  return info;
}

// ---------------------------------------------------------------- decision
function chooseCall(hand, seat, dealer, auction, opts = {}) {
  const systems = normSystems(opts.systems);
  const ann = annotate(dealer, auction, systems);
  SY = sysFor(systems, seat);
  const ctx = buildCtx(dealer, auction, seat, ann);
  const ev = evalHand(hand);
  ctx.vul = opts.vul || 'None';
  let call;
  try { call = decide(ev, ctx); } catch (e) { call = null; if (opts.debug) throw e; }
  if (!call || !ctx.legal.includes(call)) call = forcedFallback(ev, ctx) || 'P';
  if (!ctx.legal.includes(call)) call = 'P';
  return call;
}

function legal(ctx, call) { return ctx.legal.includes(call) ? call : null; }
function bidAt(ctx, level, strain) {
  const c = level + strain;
  return level <= 7 && ctx.legal.includes(c) ? c : null;
}
function cheapBid(ctx, strain, maxLevel = 7) {
  const l = cheapestLevel(ctx, strain);
  return l <= maxLevel ? bidAt(ctx, l, strain) : null;
}

function partnerForcing(ctx) {
  const p = ctx.pLast;
  if (!p || !p.forcing) return false;
  // forcing relieved if RHO bid/doubled after partner (except game-forcing conventions)
  const after = ctx.entries.filter((a) => a.idx > p.idx && a.seat === ctx.rho);
  if (after.some((a) => a.call !== 'P') && !['jacoby2n', 'strong2c', 'blackwood', 'cuebid', 'strongClub', 'gf2d', 'splinter'].includes(p.conv)) return false;
  return true;
}

function forcedFallback(ev, ctx) {
  if (!partnerForcing(ctx)) return null;
  // cheapest sensible bid: longest suit, else NT
  const order = E.SUITS.slice().sort((a, b) => ev.len[b] - ev.len[a]);
  for (const s of order) { const b = cheapBid(ctx, s, 5); if (b && !ctx.oppSuits.has(s)) return b; }
  return cheapBid(ctx, 'N', 5);
}

function decide(ev, ctx) {
  if (!ctx.opening) return openingBid(ev, ctx);
  const p = ctx.pLast;
  // Blackwood answers
  if (p && p.conv === 'blackwood' && ctx.lastBid.call === '4N' && ctx.lastBid.seat === ctx.partner) {
    if (SY.conv.rkcb) {
      const trump = agreedSuit(ctx) || [...ctx.pc].reverse().map((a) => a.shows).find((x) => x && x !== 'N') || ev.longest;
      const kc = ev.aces + (ev.has(trump, 13) ? 1 : 0);
      if (kc === 1 || kc === 4) return legal(ctx, '5C');
      if (kc === 0 || kc === 3) return legal(ctx, '5D');
      return legal(ctx, ev.has(trump, 12) ? '5S' : '5H');
    }
    return legal(ctx, ['5C', '5D', '5H', '5S'][ev.aces % 4]);
  }
  if (ctx.myLast && ctx.myLast.conv === 'blackwood' && p && (p.conv === 'bwresp' || p.conv === 'rkcresp')) return afterBlackwood(ev, ctx);
  if (p && p.conv === 'quant' && ctx.lastBid.seat === ctx.partner) {
    const myHi = ctx.my[0] && ctx.my[0].hi ? ctx.my[0].hi : 17;
    return ev.hcp >= myHi - 1 ? bidAt(ctx, 6, 'N') : 'P';
  }

  const pOpened = ctx.opening.seat === ctx.partner;
  const iOpened = ctx.opening.seat === ctx.seat;
  if (SY.precision && iOpened && ctx.my.length === 1 && ctx.my[0].conv === 'strongClub') { const r = precisionRebid(ev, ctx); if (r) return r; }
  if (pOpened && ctx.my.length === 0) return respond(ev, ctx);
  if (!ctx.ourSideOpened && ctx.my.length === 0 && ctx.pc.length === 0) return overcall(ev, ctx);
  if (!ctx.ourSideOpened && ctx.my.length === 0 && ctx.pc.length >= 1) return advance(ev, ctx);
  if (iOpened && ctx.my.length === 1) { const r = openerRebid(ev, ctx); if (r) return r; }
  if (pOpened && ctx.my.length === 1) { const r = responderRebid(ev, ctx); if (r) return r; }
  if (ctx.my.length === 1 && ctx.my[0].conv === 'takeout') { const r = doublerRebid(ev, ctx); if (r) return r; }
  return generic(ev, ctx);
}

// ---------------- opening (bridgeplaybook opening-bids + cheat sheet)
function openingBid(ev, ctx) {
  const { hcp, len } = ev;
  const seatPos = ctx.auction.length; // 0 = first seat
  const opens = hcp >= 12 || (hcp >= 11 && ev.rule20 >= 20) || (SY.precision && hcp >= 11 && ev.rule20 >= 19);
  if (SY.precision) {
    if (hcp >= 16) return ev.balanced && hcp >= SY.nt2[0] && hcp <= SY.nt2[1] ? '2N' : '1C';
    if (ev.balanced && hcp >= ntLo() && hcp <= ntHi() && len.S < 5 && len.H < 5) return '1N';
    if (opens) {
      if (len.S >= 5 || len.H >= 5) return len.S >= len.H ? '1S' : '1H';
      if (len.C >= 6) return '2C';
      if (len.D <= 1 && len.H >= 3 && len.S >= 3 && len.H + len.S >= 7 && len.C >= 4) return '2D';
      return '1D';
    }
  } else {
    if (SY.sef && hcp >= 24) return '2D';
    if (SY.sef && hcp >= 20 && !ev.balanced) return '2C';
    if (hcp >= SY.strong2C && !(ev.balanced && hcp <= SY.nt2[1])) return '2C';
    if (ev.balanced && hcp >= SY.nt2[0] && hcp <= SY.nt2[1]) return '2N';
    if (ev.balanced && hcp >= ntLo() && hcp <= ntHi()) return '1N';
    if (opens) return oneLevelSuit(ev);
  }
  if (seatPos === 3) return 'P'; // no pre-empts in fourth seat
  // weak twos 6-10 with a good six-card suit; preempts at 3/4 level
  for (const s of ['S', 'H', 'D']) {
    if (!SY.conv.weakTwos || !SY.weakSuits.includes(s)) continue;
    if (len[s] === 6 && hcp >= 5 && hcp <= 10 && ev.goodSuit(s) && !MAJORS.some((m) => m !== s && len[m] >= 4)) return '2' + s;
  }
  for (const s of ['S', 'H', 'D', 'C']) {
    if (len[s] >= 8 && hcp >= 4 && hcp <= 10 && ev.decentSuit(s)) return (isMajor(s) ? '4' : '4') + s;
    if (len[s] === 7 && hcp >= 5 && hcp <= 10 && ev.decentSuit(s)) return '3' + s;
  }
  return 'P';
}
function oneLevelSuit(ev) {
  const { len } = ev;
  if (SY.minorStyle === 'acol') {
    // four-card suits: longest first; equal 5-5/6-6 higher; two four-card suits: the lower-ranking
    const max = Math.max(...E.SUITS.map((s) => len[s]));
    const longs = E.SUITS.filter((s) => len[s] === max);
    if (longs.length === 1) return '1' + longs[0];
    return '1' + (max >= 5 ? longs[longs.length - 1] : longs[0]);
  }
  if (len.S >= 5 || len.H >= 5) return len.S >= len.H ? '1S' : '1H';
  if (len.D > len.C) return '1D';
  if (len.C > len.D) return '1C';
  return len.C === 3 ? '1C' : '1D';
}

// ---------------- responding to partner's opening
function respond(ev, ctx) {
  const o = ctx.opening.call, oL = E.bidLevel(o), oS = E.bidStrain(o);
  const { hcp, len } = ev;
  const interfered = ctx.opp.length > 0;
  const lb = ctx.lastBid;
  if (o === '1N' || o === '2N') {
    if (interfered) return generic(ev, ctx);
    return respondNT(ev, ctx, o);
  }
  if (SY.precision && o === '1C') {
    if (interfered) return hcp >= 8 ? generic(ev, ctx) : 'P';
    if (hcp < 8) return '1D';
    const five = ['S', 'H', 'C', 'D'].filter((s) => len[s] >= 5).sort((a, b) => len[b] - len[a])[0];
    if (five) return five === 'S' || five === 'H' ? '1' + five : '2' + five;
    return hcp <= 13 ? '1N' : '2N';
  }
  if (SY.sef && o === '2D') return interfered ? generic(ev, ctx) : '2H';
  if (o === '2C' && !SY.precision) {
    if (interfered) return generic(ev, ctx);
    return '2D'; // waiting
  }
  if (SY.precision && o === '2C') {
    if (interfered) return generic(ev, ctx);
    if (len.C >= 3 && hcp >= 11 && hcp <= 13) return bidAt(ctx, 3, 'C');
    if (hcp >= 14 && ev.balanced) return bidAt(ctx, 3, 'N');
    return 'P';
  }
  if (SY.precision && o === '2D') {
    if (interfered) return generic(ev, ctx);
    if (hcp >= 14) return generic(ev, ctx);
    const m = len.S >= len.H ? 'S' : 'H';
    if (hcp >= 11 && len[m] >= 4) return bidAt(ctx, 3, m);
    if (len[m] >= 3) return bidAt(ctx, 2, m);
    return len.C >= 4 ? bidAt(ctx, 3, 'C') : bidAt(ctx, 2, m);
  }
  if (oL >= 2) { // partner pre-empted
    const fitLen = len[oS] + (oL === 2 ? 6 : oL === 3 ? 7 : 8);
    if (oS !== 'N' && isMajor(oS) && len[oS] >= 3 && (hcp >= 15 || (fitLen >= 10 && ev.void))) return bidAt(ctx, 4, oS) || 'P';
    if (len[oS] >= 3 && fitLen >= 9 && oL === 2) return bidAt(ctx, 3, oS) || 'P'; // law of total tricks: compete to 3
    if (hcp >= 16 && ev.balanced && ctx.oppSuits.size === 0) return bidAt(ctx, 3, 'N') || 'P';
    return 'P';
  }
  // partner opened one of a suit
  const supportPts = hcp + ev.shortPts(oS);
  if (interfered && lb.call === 'X' && lb.seat === ctx.rho) {
    if (hcp >= 10) return 'XX';
  }
  if (isMajor(oS)) {
    // splinter: 4+ trumps, game values, singleton or void in a side suit
    if (SY.conv.splinters && len[oS] >= 4 && supportPts >= 13 && hcp <= 15 && !interfered) {
      const sh = E.SUITS.find((s) => s !== oS && len[s] <= 1);
      if (sh) { const b = bidAt(ctx, cheapestLevel(ctx, sh) + 2, sh); if (b && E.bidLevel(b) <= 4) return b; }
    }
    if (len[oS] >= 4 && supportPts >= 13 && !interfered && SY.conv.jacoby2n) return '2N';
    if (len[oS] >= 4 && supportPts >= 13 && !interfered && !SY.conv.jacoby2n) {
      // no Jacoby 2NT: show a side suit first (forcing), otherwise bid game
      const side = E.SUITS.filter((s) => s !== oS && len[s] >= 4 && sRank(s) < sRank(oS)).sort((a, b) => len[b] - len[a])[0];
      if (side && supportPts >= 15) { const b = bidAt(ctx, 2, side); if (b) return b; }
      return bidAt(ctx, 4, oS);
    }
    if (len[oS] >= 4 && supportPts >= 13 && interfered) return bidAt(ctx, 4, oS) || cheapBid(ctx, oS);
    if (len[oS] >= 5 && hcp < 10 && supportPts >= 7) return bidAt(ctx, 4, oS) || 'P';
    if (len[oS] >= raiseMin() && supportPts >= 10 && supportPts <= 12) return bidAt(ctx, 3, oS) || (interfered ? 'P' : null);
    if (len[oS] >= raiseMin() && supportPts >= 6 && supportPts <= 9) return bidAt(ctx, 2, oS) || (interfered && len[oS] >= 4 ? bidAt(ctx, 3, oS) : 'P');
  }
  if (hcp < 6) return interfered && lb.seat === ctx.rho ? 'P' : 'P';
  // negative double after an overcall (Seagram & Smith; bridgeplaybook conventions hub)
  if (SY.conv.negDbl && interfered && lb.seat === ctx.rho && E.isBid(lb.call) && E.bidLevel(lb.call) <= 2 && E.bidStrain(lb.call) !== 'N') {
    const unbidMaj = MAJORS.filter((m) => !ctx.oppSuits.has(m) && m !== oS);
    if (unbidMaj.length && unbidMaj.every((m) => len[m] >= 4) && hcp >= (E.bidLevel(lb.call) === 1 ? 6 : 8)) return 'X';
    if (unbidMaj.length && unbidMaj.some((m) => len[m] >= 4) && hcp >= 8 && !unbidMaj.some((m) => len[m] >= 5)) return 'X';
  }
  // 1-level new suit, up the line majors (bridgeplaybook: always respond in a four-card major)
  if (!interfered || E.bidLevel(lb.call) === 1) {
    const cands = [];
    if (oS === 'C' && len.D >= 4 && len.D > Math.max(len.H, len.S) && hcp >= 6 && len.D >= 5) cands.push('D');
    if (len.H >= 4 && len.S >= 4) cands.push(len.S > len.H ? 'S' : 'H');
    else if (len.S >= 4 && len.S >= len.H) cands.push('S');
    else if (len.H >= 4) cands.push('H');
    for (const s of cands) {
      if (sRank(s) > sRank(oS) && !ctx.oppSuits.has(s)) {
        const b = bidAt(ctx, 1, s);
        if (b) return b;
      }
    }
    if (oS === 'C' && len.D >= 4 && !ctx.oppSuits.has('D')) { const b = bidAt(ctx, 1, 'D'); if (b && len.H < 4 && len.S < 4) return b; }
  }
  // 2/1 game force: a two-level new suit needs an opening hand; 10-12 without a fit bids a forcing 1NT
  if (SY.twoOverOne && isMajor(oS) && !interfered && hcp >= 6 && hcp <= 12) {
    if (!(len[oS] >= 3 && hcp >= 6)) { const b = bidAt(ctx, 1, 'N'); if (b) return b; }
  }
  // two-level new suit with 10+
  if (hcp >= (SY.twoOverOne && isMajor(oS) && !interfered ? 13 : 10)) {
    const order = E.SUITS.slice().sort((a, b) => len[b] - len[a] || sRank(b) - sRank(a));
    for (const s of order) {
      if (s === oS || ctx.oppSuits.has(s)) continue;
      const need = s === 'H' && oS === 'S' ? 5 : interfered ? 5 : 4;
      if (len[s] < need) continue;
      const l = cheapestLevel(ctx, s);
      if (l <= 2) { const b = bidAt(ctx, l, s); if (b) return b; }
    }
  }
  // minor raises
  if (!isMajor(oS) && len[oS] >= (oS === 'C' ? 5 : 4)) {
    if (hcp >= 6 && hcp <= 9) return bidAt(ctx, 2, oS) || 'P';
    if (hcp >= 10 && hcp <= 12 && !ev.balanced) return bidAt(ctx, 3, oS) || 'P';
  }
  const stopped = [...ctx.oppSuits].every((s) => ev.stopper(s));
  if (stopped) {
    if (hcp >= 13 && hcp <= 15 && ev.semiBalanced) return bidAt(ctx, 3, 'N') || generic(ev, ctx);
    if (hcp >= 11 && hcp <= 12 && ev.balanced) return bidAt(ctx, 2, 'N') || 'P';
    if (hcp >= 6 && hcp <= SY.resp1NT[1]) return bidAt(ctx, 1, 'N') || (interfered ? 'P' : null);
  }
  if (isMajor(oS) && len[oS] >= raiseMin() && supportPts >= 6) return cheapBid(ctx, oS, 3) || 'P';
  if (interfered) return hcp >= 13 ? generic(ev, ctx) : 'P';
  return hcp >= 13 ? generic(ev, ctx) : bidAt(ctx, 1, 'N') || 'P';
}

function respondNT(ev, ctx, o) {
  const { hcp, len } = ev;
  const two = o === '1N';
  const b = two ? 2 : 3;
  const gameMin = two ? 25 - ntLo() : 25 - SY.nt2[0];
  const invMin = two ? gameMin - 2 : 99;
  // Jacoby transfers with any five-card major (any strength)
  if ((len.S >= 5 || len.H >= 5) && SY.conv.transfers) {
    if (!two && hcp < 4) return 'P';
    const m = len.S >= len.H ? 'S' : 'H';
    return b + (m === 'H' ? 'D' : 'H');
  }
  // Stayman: invitational values with a four-card major
  if ((len.H >= 4 || len.S >= 4) && hcp >= (two ? invMin : 5) && SY.conv.stayman && !(ev.lens.join('') === '4333')) return b + 'C';
  if (!SY.conv.transfers && (len.S >= 5 || len.H >= 5)) {
    const m = len.S >= len.H ? 'S' : 'H';
    if (hcp < invMin && two && len[m] >= 5) return bidAt(ctx, 2, m);
    if (hcp >= gameMin) return len[m] >= 6 ? bidAt(ctx, 4, m) : bidAt(ctx, 3, m);
  }
  if (hcp >= gameMin) {
    if (hcp >= gameMin + 8 && hcp <= gameMin + 9) return '6N';
    if (hcp >= gameMin + 10) return '7N';
    if (hcp >= gameMin + 6) return '4N';
    return '3N';
  }
  if (hcp >= invMin) return '2N';
  return 'P';
}

// ---------------- opener's rebid
function openerRebid(ev, ctx) {
  const o = ctx.opening.call, oS = E.bidStrain(o);
  const p = ctx.pLast; if (!p) return null;
  const { hcp, len } = ev;
  const interfered = ctx.opp.length > 0;
  const fitL = (s) => len[s];
  // NT openings
  if (p.conv === 'stayman') {
    if (len.H >= 4) return bidAt(ctx, p.lvl, 'H');
    if (len.S >= 4) return bidAt(ctx, p.lvl, 'S');
    return bidAt(ctx, p.lvl, 'D');
  }
  if (p.conv === 'transfer') {
    if (o === '1N' && fitL(p.target) >= 4 && hcp >= 17) return bidAt(ctx, 3, p.target) || cheapBid(ctx, p.target);
    return cheapBid(ctx, p.target);
  }
  if ((o === '1N') && p.call === '2N') return hcp >= ntHi() - 1 ? '3N' : 'P';
  if (p.conv === 'splinter') {
    const wasted = ev.suitHcp[p.short] - (ev.has(p.short, 14) ? 4 : 0);
    if (hcp - wasted >= 17 && !ev.void && legal(ctx, '4N')) return '4N';
    return bidAt(ctx, 4, oS) || 'P';
  }
  if (p.conv === 'forcingNT') {
    if (len[oS] >= 6) return hcp >= 16 ? bidAt(ctx, 3, oS) : bidAt(ctx, 2, oS);
    if (ev.balanced && hcp >= 18) return bidAt(ctx, 2, 'N');
    const second = E.SUITS.filter((s) => s !== oS && len[s] >= 4 && sRank(s) < sRank(oS)).sort((a, b) => len[b] - len[a])[0];
    if (second) return bidAt(ctx, 2, second) || bidAt(ctx, 3, second);
    return bidAt(ctx, 2, len.C >= len.D ? 'C' : 'D');
  }
  if (o === '1N' || o === '2N') return null;
  if (o === '2D' && SY.sef) return ev.balanced ? cheapBid(ctx, 'N') : cheapBid(ctx, ev.longest);
  if (SY.precision && (o === '1C' || o === '2C' || o === '2D' || o === '1N')) return null;
  if (o === '2C') {
    if (ev.balanced && hcp <= 24) return cheapBid(ctx, 'N');
    if (ev.balanced) return bidAt(ctx, 3, 'N');
    return cheapBid(ctx, ev.longest) || null;
  }
  if (p.conv === 'jacoby2n') return hcp >= 16 ? bidAt(ctx, 3, oS) : bidAt(ctx, 4, oS);
  if (p.conv === 'negative') {
    for (const m of p.unbidMajors || []) if (len[m] >= 4) return hcp >= 16 ? (bidAt(ctx, cheapestLevel(ctx, m) + 1, m) || cheapBid(ctx, m)) : cheapBid(ctx, m);
    if (len[oS] >= 6) return cheapBid(ctx, oS);
    if ([...ctx.oppSuits].every((s) => ev.stopper(s))) return cheapBid(ctx, 'N', 2);
    return cheapBid(ctx, oS, 3) || 'P';
  }
  const ltcTricks = 24 - ev.ltc; // LTC (bridgeplaybook): 24 - (our losers) ~ tricks
  if (p.raise && p.shows === oS) {
    const L = E.bidLevel(p.call);
    if (L === 2) {
      const lt = (24 - (ev.ltc + 9)); // partner single raise ~ 9 losers
      if (lt >= 10 || hcp >= 19) return bidAt(ctx, GAME[oS] <= 4 ? 4 : 3, isMajor(oS) ? oS : 'N') || 'P';
      if (hcp >= 16 || lt >= 9) return bidAt(ctx, 3, oS) || 'P';
      return 'P';
    }
    if (L === 3) return (hcp >= 14 || ev.ltc <= 6) ? (isMajor(oS) ? bidAt(ctx, 4, oS) : (ev.balanced ? bidAt(ctx, 3, 'N') : bidAt(ctx, 5, oS))) || 'P' : 'P';
    return 'P';
  }
  if (p.call === '1N' && !interfered) {
    if (len[oS] >= 6) return hcp >= 16 ? bidAt(ctx, 3, oS) : bidAt(ctx, 2, oS);
    const second = E.SUITS.filter((s) => s !== oS && len[s] >= 4 && sRank(s) < sRank(oS)).sort((a, b) => len[b] - len[a])[0];
    if (SY.majorLen === 4 && ev.balanced && hcp >= 17) return hcp >= 19 ? '3N' : '2N';
    if (hcp >= 18 && ev.balanced) return '2N';
    if (second) return bidAt(ctx, 2, second);
    return 'P';
  }
  if (p.shows === 'N' && (p.call === '2N' || p.call === '3N') && !interfered) {
    if (p.call === '3N') return isMajor(oS) && len[oS] >= 6 ? bidAt(ctx, 4, oS) : 'P';
    return hcp >= 14 ? '3N' : 'P';
  }
  if (p.shows && p.shows !== 'N' && p.shows !== oS && !p.art) {
    const r = p.shows;
    const L = E.bidLevel(p.call);
    // support partner's major with four cards (or three after a 2-level response)
    if (len[r] >= 4 || (len[r] >= 3 && L === 2 && isMajor(r) && p.minLen >= 5)) {
      const pts = hcp + ev.shortPts(r);
      if (isMajor(r) || L === 2) {
        if (pts >= 19) return bidAt(ctx, GAME[r] <= 4 ? 4 : (ev.balanced ? 3 : 5), GAME[r] <= 4 ? r : (ev.balanced ? 'N' : r));
        if (pts >= 16) return bidAt(ctx, cheapestLevel(ctx, r) + 1, r) || cheapBid(ctx, r);
        return cheapBid(ctx, r);
      }
    }
    // new major at the one level
    for (const m of ['H', 'S']) if (len[m] >= 4 && sRank(m) > sRank(r) && m !== oS && !ctx.oppSuits.has(m)) { const b = bidAt(ctx, 1, m); if (b) return b; }
    const [r1lo, r1hi] = SY.rebidNT1, [r2lo, r2hi] = SY.rebidNT2;
    if (ev.balanced && hcp >= r1lo - (SY.majorLen === 4 ? 0 : 1) && hcp <= r1hi && L === 1) { const b = bidAt(ctx, 1, 'N'); if (b && [...ctx.oppSuits].every((s) => ev.stopper(s))) return b; }
    if (ev.balanced && hcp >= r2lo && hcp <= r2hi && L === 1) return bidAt(ctx, 2, 'N') || null;
    if (ev.balanced && hcp > r2hi && L === 1 && SY.majorLen === 4) return bidAt(ctx, 3, 'N') || null;
    if (ev.balanced && hcp >= 12 && hcp <= 14 && L === 2) return bidAt(ctx, 2, 'N') || null;
    if (ev.balanced && hcp >= 15 && L === 2) return bidAt(ctx, 3, 'N') || null;
    if (len[oS] >= 6) return hcp >= 16 ? (bidAt(ctx, cheapestLevel(ctx, oS) + 1, oS) || cheapBid(ctx, oS)) : cheapBid(ctx, oS);
    const second = E.SUITS.filter((s) => s !== oS && s !== r && len[s] >= 4 && !ctx.oppSuits.has(s)).sort((a, b) => len[b] - len[a] || sRank(b) - sRank(a))[0];
    if (second) {
      const l = cheapestLevel(ctx, second);
      const reverse = l === 2 && sRank(second) > sRank(oS);
      if (l <= 2 && (!reverse || hcp >= 16)) return bidAt(ctx, l, second);
    }
    if (len[oS] >= 5) return cheapBid(ctx, oS, 3);
    if (hcp >= 12) return cheapBid(ctx, 'N', 2) || cheapBid(ctx, oS, 3);
  }
  return null;
}

// ---------------- responder's rebid
function responderRebid(ev, ctx) {
  const o = ctx.opening.call;
  const me = ctx.my[0], p = ctx.pLast;
  if (!p) return null;
  const { hcp, len } = ev;
  if (me.conv === 'stayman') {
    const two = o === '1N';
    const fit = p.shows && p.shows !== 'N' && len[p.shows] >= 4 ? p.shows : null;
    const gameMin = two ? 25 - ntLo() : 5;
    if (fit) return hcp >= gameMin ? bidAt(ctx, 4, fit) : bidAt(ctx, 3, fit);
    if (hcp >= gameMin) return bidAt(ctx, 3, 'N');
    return cheapBid(ctx, 'N', 2) || 'P';
  }
  if (me.conv === 'transfer') {
    const m = me.target;
    if (p.superAccept) return hcp >= 6 ? bidAt(ctx, 4, m) : 'P';
    const two = o === '1N';
    if (!two) return len[m] >= 6 ? bidAt(ctx, 4, m) : bidAt(ctx, 3, 'N');
    const g = 25 - ntLo();
    if (hcp <= g - 3) return 'P';
    if (hcp <= g - 1) return len[m] >= 6 ? bidAt(ctx, 3, m) : bidAt(ctx, 2, 'N');
    if (hcp >= g + 6 && len[m] >= 6) return '4N';
    return len[m] >= 6 ? bidAt(ctx, 4, m) : bidAt(ctx, 3, 'N');
  }
  if (o === '2C' && me.conv === 'waiting') {
    if (p.shows === 'N') {
      if (len.S >= 5 || len.H >= 5) return bidAt(ctx, 3, len.S >= len.H ? 'H' : 'D'); // transfers over 2NT rebid
      if (hcp >= 3) return bidAt(ctx, 3, 'N');
      return 'P';
    }
    return null;
  }
  return null;
}

// ---------------- overcalls (bridgeplaybook defensive bidding table)
function overcall(ev, ctx) {
  const lb = ctx.lastBid;
  const { hcp, len } = ev;
  if (lb.seat !== ctx.rho && ctx.rhoLast && ctx.rhoLast.call !== 'P') return generic(ev, ctx);
  const oS = E.bidStrain(lb.call), oL = E.bidLevel(lb.call);
  const opened = E.bidStrain(ctx.opening.call);
  const balancing = lb.seat === ctx.rho ? false : true; // LHO opened, two passes
  const adj = balancing ? 3 : 0; // balancing seat: borrow a king
  if (oS === 'N') {
    if (hcp >= 15 + (oL > 1 ? 2 : 0)) return 'X';
    for (const s of ['S', 'H', 'D', 'C']) if (len[s] >= 6 && ev.goodSuit(s) && hcp >= 8) return cheapBid(ctx, s, 3) || 'P';
    return 'P';
  }
  // Michaels (both majors over a minor), Unusual 2NT (both minors over a major)
  if (SY.conv.michaels && oL === 1 && !isMajor(oS) && len.H >= 5 && len.S >= 5 && (hcp >= 7 && hcp <= 11 || hcp >= 16)) return bidAt(ctx, 2, oS);
  if (SY.conv.unusual && oL === 1 && isMajor(oS) && len.C >= 5 && len.D >= 5 && (hcp >= 7 && hcp <= 11 || hcp >= 16)) return bidAt(ctx, 2, 'N');
  // 1NT overcall 15-18 with a stopper
  if (ev.balanced && hcp >= 15 - adj && hcp <= 18 && ev.stopper(oS) && oL === 1) return bidAt(ctx, 1, 'N');
  // takeout double 12+, short in their suit, 3+ in the unbid suits (or 17+ any shape)
  const unbid = E.SUITS.filter((s) => s !== oS && !ctx.oppSuits.has(s));
  const shapeOK = len[oS] <= 2 && unbid.every((s) => len[s] >= 3);
  if ((hcp >= 12 - adj && shapeOK && oL <= 3) || (hcp >= 17 && oL <= 2 && !(ev.balanced && ev.stopper(oS)))) return 'X';
  // simple overcall: good 5+ suit, 1-level 8/10-16, 2-level 12-16
  const cands = E.SUITS.filter((s) => s !== oS && len[s] >= 5).sort((a, b) => len[b] - len[a] || sRank(b) - sRank(a));
  for (const s of cands) {
    const l = cheapestLevel(ctx, s);
    const min = l === 1 ? 8 : 11;
    if (hcp >= min - adj && hcp <= 17 && (ev.goodSuit(s) || (l === 1 && ev.decentSuit(s) && hcp >= 10)) && l <= 2) return bidAt(ctx, l, s);
  }
  // weak jump overcall: 6+ suit 5-10
  for (const s of cands) {
    if (len[s] >= 6 && hcp >= 5 && hcp <= 10 && ev.goodSuit(s) && !balancing) {
      const l = cheapestLevel(ctx, s) + 1;
      if (l <= 3) return bidAt(ctx, l, s);
    }
  }
  if (hcp >= 15 && ev.stopper(oS)) return cheapBid(ctx, 'N', 2) || 'P';
  void opened;
  return 'P';
}

// ---------------- advancing partner's takeout double / overcall
function advance(ev, ctx) {
  const pf = ctx.pc[0];
  const { hcp, len } = ev;
  const rhoActed = ctx.rhoLast && ctx.rhoLast.call !== 'P' && ctx.rhoLast.idx > pf.idx;
  if (pf.conv === 'takeout') {
    const theirs = [...ctx.oppSuits];
    if (!rhoActed && theirs.length === 1 && len[theirs[0]] >= 5 && ev.suitHcp[theirs[0]] >= 6) return 'P'; // penalty pass
    if (hcp >= 12 && !rhoActed) { const c = cheapBid(ctx, theirs[0], 3); if (c) return c; }
    const unbid = E.SUITS.filter((s) => !ctx.oppSuits.has(s));
    const best = unbid.slice().sort((a, b) => (len[b] + (isMajor(b) ? 0.5 : 0)) - (len[a] + (isMajor(a) ? 0.5 : 0)))[0];
    if (ev.balanced && theirs.every((s) => ev.stopper(s)) && !(isMajor(best) && len[best] >= 4)) {
      if (hcp >= 6 && hcp <= 10) { const b = cheapBid(ctx, 'N', 2); if (b && !rhoActed) return b; }
      if (hcp >= 11 && hcp <= 12) return bidAt(ctx, 2, 'N') || cheapBid(ctx, best);
      if (hcp >= 13) return bidAt(ctx, 3, 'N') || cheapBid(ctx, best);
    }
    if (rhoActed && hcp < 6) return 'P';
    const l = cheapestLevel(ctx, best);
    if (hcp >= 9 && hcp <= 11 && l <= 2) return bidAt(ctx, l + 1, best) || cheapBid(ctx, best);
    if (hcp >= 12 && isMajor(best) && len[best] >= 5) return bidAt(ctx, 4, best) || cheapBid(ctx, best);
    return cheapBid(ctx, best, 3) || 'P';
  }
  if (pf.conv === 'michaels' || pf.conv === 'unusual') {
    const [a, b] = pf.two;
    const pick = len[b] >= len[a] ? b : a;
    if (hcp >= 12 && len[pick] >= 4 && isMajor(pick)) return bidAt(ctx, 4, pick) || cheapBid(ctx, pick);
    if (rhoActed && hcp < 6) return 'P';
    return cheapBid(ctx, pick, 4) || 'P';
  }
  if (pf.shows && pf.shows !== 'N') {
    const s = pf.shows;
    const pts = hcp + (len[s] >= 3 ? ev.shortPts(s) : 0);
    const fit = len[s] + (pf.minLen || 5);
    if (len[s] >= 3) {
      if (pts >= 10 && !rhoActed) { const theirs = [...ctx.oppSuits][0]; const c = theirs && cheapBid(ctx, theirs, 3); if (c && pts <= 12) return c; }
      if (pts >= 13 && isMajor(s)) return bidAt(ctx, 4, s) || cheapBid(ctx, s);
      // Law of Total Tricks: bid to the level of combined trumps minus six
      const lott = fit - 6;
      if (pts >= 6 || fit >= 9) { const l = cheapestLevel(ctx, s); if (l <= Math.max(2, lott)) return bidAt(ctx, l, s); }
      return 'P';
    }
    if (hcp >= 10) {
      for (const t of E.SUITS) if (t !== s && len[t] >= 5 && ev.goodSuit(t) && !ctx.oppSuits.has(t)) { const b = cheapBid(ctx, t, 2); if (b) return b; }
      if ([...ctx.oppSuits].every((x) => ev.stopper(x))) return cheapBid(ctx, 'N', hcp >= 13 ? 3 : 2) || 'P';
    }
    return 'P';
  }
  if (pf.shows === 'N') {
    if (hcp >= 10) return bidAt(ctx, 3, 'N') || 'P';
    if (hcp >= 8) return bidAt(ctx, 2, 'N') || 'P';
    return 'P';
  }
  return generic(ev, ctx);
}

// ---------------- Precision: opener's rebid after 1C
function precisionRebid(ev, ctx) {
  const p = ctx.pLast;
  if (!p || ctx.opp.length) return null;
  const { hcp, len } = ev;
  if (p.conv === 'precNeg') {
    if (ev.balanced && len.S < 5 && len.H < 5) {
      if (hcp <= 18) return bidAt(ctx, 1, 'N');
      if (hcp <= 21) return bidAt(ctx, 2, 'N');
      return bidAt(ctx, 3, 'N');
    }
    const s = ['S', 'H', 'D', 'C'].filter((x) => len[x] >= 5).sort((a, b) => len[b] - len[a])[0] || ev.longest;
    const l = cheapestLevel(ctx, s);
    if (hcp >= 22 && len[s] >= 6) return bidAt(ctx, l + 1, s) || cheapBid(ctx, s);
    return cheapBid(ctx, s);
  }
  return null;
}

// ---------------- takeout doubler's rebid (bridgeplaybook: double then bid = strong one-suiter 17+)
function doublerRebid(ev, ctx) {
  const { hcp, len } = ev;
  const p = ctx.pLast;
  const theirs = [...ctx.oppSuits];
  if (p && p.conv === 'cuebid') return null;
  const pSuit = p && p.shows && p.shows !== 'N' ? p.shows : null;
  if (pSuit && len[pSuit] >= 4) {
    const pts = hcp + ev.shortPts(pSuit) + (p.lo >= 9 ? 3 : 0);
    if (pts >= 19 && isMajor(pSuit)) return bidAt(ctx, 4, pSuit) || 'P';
    if (pts >= 16) return bidAt(ctx, cheapestLevel(ctx, pSuit) + (E.lastBidEntry(ctx.auction).seat === ctx.partner ? 1 : 0), pSuit) || 'P';
    return 'P';
  }
  if (hcp >= 17) {
    const own = E.SUITS.filter((s) => len[s] >= 5 && !theirs.includes(s) && s !== pSuit).sort((a, b) => len[b] - len[a])[0];
    if (own) return cheapBid(ctx, own, 3) || 'P';
    if (ev.balanced && theirs.every((s) => ev.stopper(s))) return cheapBid(ctx, 'N', 3) || 'P';
  }
  if (!p) return null;
  return 'P';
}

// ---------------- Blackwood continuation
function afterBlackwood(ev, ctx) {
  const trump = agreedSuit(ctx) || ctx.my.concat(ctx.pc).map((a) => a.shows).filter((s) => s && s !== 'N').pop() || 'N';
  const pInfo = inferSeat(ctx.entries, ctx.partner);
  const combined = ev.hcp + ev.shortPts(trump) + pInfo.lo;
  if (ctx.pLast.conv === 'rkcresp') {
    const mine = ev.aces + (trump !== 'N' && ev.has(trump, 13) ? 1 : 0);
    const opts = ctx.pLast.kc;
    let theirs = opts[0];
    if (opts.length > 1 && mine + opts[1] <= 5 && mine <= 1) theirs = opts[1];
    const missing = 5 - (mine + theirs);
    if (missing >= 2) return bidAt(ctx, 5, trump) || 'P';
    if (missing === 0 && combined >= 37) return bidAt(ctx, 7, trump) || bidAt(ctx, 6, trump) || 'P';
    return bidAt(ctx, 6, trump) || 'P';
  }
  const shown = ctx.pLast.aces;
  let total = ev.aces + shown;
  if (shown === 0 && ev.aces === 0) total = 4; // 5C = 0 or 4
  if (total <= 2) return bidAt(ctx, 5, trump) || 'P';
  if (total === 4 && combined >= 37) return bidAt(ctx, 7, trump) || bidAt(ctx, 6, trump) || 'P';
  return bidAt(ctx, 6, trump) || 'P';
}

// ---------------- generic placement engine
function generic(ev, ctx) {
  const pInfo = inferSeat(ctx.entries, ctx.partner);
  const { len, hcp } = ev;
  const myInfo = inferSeat(ctx.entries, ctx.seat);
  const gfOn = pInfo.gf || myInfo.gf;
  const forced = partnerForcing(ctx);
  const combo = {};
  for (const s of E.SUITS) combo[s] = len[s] + pInfo.len[s];
  const majors = MAJORS.filter((s) => combo[s] >= 8).sort((a, b) => combo[b] - combo[a]);
  const minors = ['C', 'D'].filter((s) => combo[s] >= 8).sort((a, b) => combo[b] - combo[a]);
  const oppS = [...ctx.oppSuits];
  const stopped = oppS.every((s) => ev.stopper(s) || ctx.pc.some((a) => a.shows === 'N'));
  let strain;
  if (majors.length) strain = majors[0];
  else if ((ev.semiBalanced || pInfo.bal) && stopped) strain = 'N';
  else if (minors.length) strain = minors[0];
  else if (len[ev.longest] >= 6) strain = ev.longest;
  else if (stopped) strain = 'N';
  else strain = ev.longest;

  if (gfOn) { pInfo.lo = Math.max(pInfo.lo, 12); }
  const pRange = pInfo.hi - pInfo.lo;
  const pEst = pInfo.lo + Math.min(3, Math.floor(pRange / 3));
  const myPts = hcp + (strain !== 'N' && combo[strain] >= 8 ? ev.shortPts(strain) : 0) + (strain !== 'N' ? Math.max(0, len[strain] - 5) : 0);
  const total = myPts + pEst;
  const lb = ctx.lastBid;
  const oursLast = lb && E.sameSide(lb.seat, ctx.seat);
  const competitive = ctx.opp.length > 0;

  // Penalty double when opponents are overreaching
  if (lb && !oursLast && E.bidLevel(lb.call) >= 2 && ctx.legal.includes('X')) {
    const theirStrain = E.bidStrain(lb.call);
    const defNeed = 8 - E.bidLevel(lb.call);
    const ourHcp = hcp + pInfo.lo;
    let defTricks = ev.qt + Math.max(0, (pInfo.lo - 6) / 4) + (theirStrain !== 'N' && len[theirStrain] >= 4 ? 1 : 0);
    if (ourHcp >= 23 && defTricks >= defNeed + 0.5 && !(combo[strain] >= 9 && total >= 25)) return 'X';
  }

  let target;
  const fitted = strain === 'N' || combo[strain] >= 8;
  if (total >= 37 && fitted && strain !== 'N') target = 7;
  else if (total >= 33 && fitted) target = 6;
  else if (total >= (strain === 'C' || strain === 'D' ? 29 : 25)) target = GAME[strain];
  else if ((strain === 'C' || strain === 'D') && total >= 25 && stopped) { strain = 'N'; target = 3; }
  else if (total >= 23 && pRange >= 3 && !ctx.pAll.slice(-1).some((a) => a.call === 'P' && ctx.my.length)) target = GAME[strain] - 1;
  else target = 0; // part score: cheapest

  // Slam: Blackwood (not with a void - bridgeplaybook)
  if (target >= 6 && strain !== 'N' && !ev.void && !ctx.my.some((a) => a.conv === 'blackwood') && ctx.legal.includes('4N') && !(ctx.pLast && ctx.pLast.conv === 'bwresp')) {
    if (!lb || E.bidRank(lb.call) < E.bidRank('4N')) return '4N';
  }

  const curL = lb ? E.bidLevel(lb.call) : 0;
  const curS = lb ? E.bidStrain(lb.call) : null;
  if (gfOn && oursLast && target < GAME[strain] && curL < GAME[curS] && !competitive) {
    // game-forcing auction: never stop below game
    target = Math.max(target, GAME[strain]);
    if ((strain === 'C' || strain === 'D') && stopped && cheapestLevel(ctx, 'N') <= 3) { strain = 'N'; target = 3; }
  }
  // Already at or above our target in our strain -> pass (unless forced)
  if (oursLast && curS === strain && curL >= Math.max(target, 1)) return forced ? null : 'P';
  // Partner set a game in a strain we fit, and we are not in slam zone -> pass
  if (oursLast && lb.seat === ctx.partner && curL >= GAME[curS] && target < 6) {
    if (curS === 'N' || combo[curS] >= 7 || len[curS] >= 2) return 'P';
  }
  // accept partner's part-score/strain when we have no better
  if (oursLast && lb.seat === ctx.partner && target === 0 && !forced) {
    if (curS === strain || combo[curS] >= 7 || curS === 'N') return 'P';
  }
  const cheap = cheapestLevel(ctx, strain);
  let level;
  if (target === 0) {
    // part score: compete per Law of Total Tricks in competitive auctions
    const expFit = strain !== 'N' ? len[strain] + Math.max(pInfo.len[strain], Math.floor((13 - len[strain]) / 4)) : 0;
    const lott = strain !== 'N' ? expFit - 6 : 1;
    const cap = competitive ? Math.max(1, Math.min(lott, 3)) : (strain === 'N' ? 2 : 3);
    if (cheap > cap) return forced ? null : 'P';
    if (competitive && oursLast) return 'P';
    if (!competitive && oursLast && !forced) return 'P';
    level = cheap;
  } else {
    if (cheap > target) {
      if (forced) return null;
      return 'P';
    }
    level = target;
    // invitation: if partner already passed an invitation, don't re-invite
  }
  return bidAt(ctx, level, strain) || (forced ? null : 'P');
}

// Explain a call in plain words for the UI
function explain(a) {
  if (!a) return '';
  const S = (s) => E.SYM[s];
  if (a.conv === 'stayman') return 'Stayman: asks for a 4-card major';
  if (a.conv === 'transfer') return `Transfer: 5+ ${S(a.target)}`;
  if (a.conv === 'transferDone') return a.superAccept ? 'Super-accept: 4-card support, maximum' : 'Completes the transfer';
  if (a.conv === 'staymanResp') return a.noMajor ? 'No 4-card major' : `4+ ${S(a.shows)}`;
  if (a.conv === 'strong2c') return 'Strong, artificial: 22+ HCP';
  if (a.conv === 'waiting') return 'Waiting response';
  if (a.conv === 'jacoby2n') return `Jacoby 2NT: 4+ ${S(a.support)}, game force`;
  if (a.conv === 'blackwood') return 'Blackwood: asks for aces';
  if (a.conv === 'bwresp') return `${a.aces === 0 ? '0 or 4' : a.aces} ace${a.aces === 1 ? '' : 's'}`;
  if (a.conv === 'quant') return 'Quantitative: bid 6NT with a maximum';
  if (a.conv === 'takeout') return 'Takeout double: 12+, short in their suit';
  if (a.conv === 'negative') return 'Negative double: shows the unbid major(s)';
  if (a.conv === 'penalty') return 'Penalty double';
  if (a.conv === 'redouble') return 'Redouble: 10+ HCP';
  if (a.conv === 'michaels') return 'Michaels: 5-5 in both majors';
  if (a.conv === 'unusual') return 'Unusual 2NT: 5-5 in the minors';
  if (a.conv === 'cuebid' || a.conv === 'cuebidRaise') return 'Cue-bid: strong, forcing';
  if (a.conv === 'strongClub') return 'Strong club: 16+ HCP, any shape (artificial, forcing)';
  if (a.conv === 'precNeg') return 'Negative: 0–7 HCP (artificial)';
  if (a.conv === 'prec2d') return '11–15 HCP, short diamonds, 3+ cards in each major';
  if (a.conv === 'gf2d') return 'Game forcing: 24+ HCP (artificial)';
  if (a.conv === 'splinter') return `Splinter: 4+ ${S(a.support)}, game values, singleton or void in ${S(a.short)}`;
  if (a.conv === 'forcingNT') return 'Forcing 1NT: 6–12 HCP, no fit (opener must bid again)';
  if (a.conv === 'rkcresp') return `${a.kc.join(' or ')} key card${a.kc.length > 1 || a.kc[0] !== 1 ? 's' : ''}${a.tq === true ? ', with the trump queen' : a.tq === false ? ', no trump queen' : ''}`;
  if (a.conv === 'blackwood' && a.rkcb) return 'Roman Key Card Blackwood: asks for key cards (aces + trump king)';
  if (a.pass) return '';
  const parts = [];
  if (a.weak) parts.push('Pre-emptive');
  if (a.shows === 'N' && typeof a.lo === 'number') parts.push(`${a.lo}–${Math.min(a.hi, 37)} HCP${a.bal ? ', balanced' : ''}`);
  else if (a.shows) parts.push(`${a.minLen || 4}+ ${S(a.shows)}${typeof a.lo === 'number' && (a.lo > 0 || a.hi < 37) ? `, ${a.lo}–${Math.min(a.hi, 37)} HCP` : ''}`);
  if (a.gf) parts.push('game forcing'); else if (a.forcing) parts.push('forcing');
  return parts.join(', ');
}

// ---------------- learning-mode suggestion & feedback (plain English, original wording)
const SUIT_WORD = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };
function callText(c) {
  if (c === 'P') return 'Pass';
  if (c === 'X') return 'Double';
  if (c === 'XX') return 'Redouble';
  return c[0] + (c[1] === 'N' ? 'NT' : E.SYM[c[1]]);
}
function describeHand(ev) {
  const shape = ['S', 'H', 'D', 'C'].map((s) => ev.len[s]).join('-');
  const longs = ['S', 'H', 'D', 'C'].filter((s) => ev.len[s] >= 5).map((s) => `${ev.len[s]} ${SUIT_WORD[s]}`);
  return `${ev.hcp} HCP, ${ev.balanced ? 'balanced' : 'unbalanced'} (${shape})${longs.length ? ', ' + longs.join(' and ') : ''}`;
}
function passReason(ev, ctx) {
  if (!ctx.opening) return ev.hcp >= 11 ? `Not quite an opening: Rule of 20 gives ${ev.rule20} (needs 20)` : 'Not enough strength to open';
  const p = ctx.pLast;
  if (p && ctx.lastBid && ctx.lastBid.seat === ctx.partner) return 'Partner\'s bid already describes a good contract for your hand';
  if (ctx.opp.length && !ctx.ourSideOpened && !ctx.my.length) return 'No suitable overcall or takeout double';
  return 'No bid improves the contract with this hand';
}
function suggest(hand, seat, dealer, auction, systems) {
  const sys = normSystems(systems);
  const call = chooseCall(hand, seat, dealer, auction, { systems: sys });
  const ann = annotate(dealer, auction.concat([{ seat, call }]), sys);
  const ev = evalHand(hand);
  SY = sysFor(sys, seat);
  const ctx = buildCtx(dealer, auction, seat, annotate(dealer, auction, sys));
  const meaning = explain(ann[ann.length - 1]);
  const why = call === 'P' ? passReason(ev, ctx) : (meaning || 'Natural');
  return { call, text: `${callText(call)}: ${why}. You have ${describeHand(ev)}.`, meaning: why, system: sys[E.sideOf(seat)].short };
}
function feedback(hand, seat, dealer, auctionBefore, myCall, systems) {
  const rec = suggest(hand, seat, dealer, auctionBefore, systems);
  if (rec.call === myCall) return null;
  const sys = normSystems(systems);
  const ann = annotate(dealer, auctionBefore.concat([{ seat, call: myCall }]), sys);
  const mine = explain(ann[ann.length - 1]) || (myCall === 'P' ? 'no further action' : 'a natural bid');
  return { suggested: rec.call, text: `${rec.system} would bid ${callText(rec.call)} here (${rec.meaning}). Your ${callText(myCall)} tells partner: ${mine}. ${rec.text.split('. ').slice(1).join('. ')}` };
}

module.exports = { chooseCall, annotate, inferSeat, explain, evalHand, suggest, feedback, callText, normSystems };
