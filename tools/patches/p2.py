p='src/bidding.js'
s=open(p).read()
def rep(old,new,count=1):
    global s
    assert old in s, old[:90]
    s=s.replace(old,new,count)

rep("""    if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise') info.len[a.support] = Math.max(info.len[a.support], a.conv === 'jacoby2n' ? 4 : 3);""","""    if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise' || a.conv === 'splinter') info.len[a.support] = Math.max(info.len[a.support], a.conv === 'cuebidRaise' ? 3 : 4);
    if (a.len) for (const s of Object.keys(a.len)) info.len[s] = Math.max(info.len[s], a.len[s]);
    if (a.gf) info.gf = true;""")
rep("""    if (a.conv === 'bwresp') info.aces = a.aces;""","""    if (a.conv === 'bwresp') info.aces = a.aces;
    if (a.conv === 'rkcresp') info.kc = a.kc;""")
rep("""    if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise') return a.support;
    if (a.conv === 'transferDone'""","""    if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise' || a.conv === 'splinter') return a.support;
    if (a.conv === 'transferDone'""")
rep("""  for (const a of ctx.my) if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise') return a.support;""","""  for (const a of ctx.my) if (a.conv === 'jacoby2n' || a.conv === 'cuebidRaise' || a.conv === 'splinter') return a.support;""")
rep("""function chooseCall(hand, seat, dealer, auction, opts = {}) {
  const ann = annotate(dealer, auction);
  const ctx = buildCtx(dealer, auction, seat, ann);""","""function chooseCall(hand, seat, dealer, auction, opts = {}) {
  const systems = normSystems(opts.systems);
  const ann = annotate(dealer, auction, systems);
  SY = sysFor(systems, seat);
  const ctx = buildCtx(dealer, auction, seat, ann);""")
rep("""!['jacoby2n', 'strong2c', 'blackwood', 'cuebid'].includes(p.conv)""","""!['jacoby2n', 'strong2c', 'blackwood', 'cuebid', 'strongClub', 'gf2d', 'splinter'].includes(p.conv)""")
rep("""  if (p && p.conv === 'blackwood' && ctx.lastBid.call === '4N' && ctx.lastBid.seat === ctx.partner) {
    return legal(ctx, ['5C', '5D', '5H', '5S'][ev.aces % 4]);
  }
  if (ctx.myLast && ctx.myLast.conv === 'blackwood' && p && p.conv === 'bwresp') return afterBlackwood(ev, ctx);""","""  if (p && p.conv === 'blackwood' && ctx.lastBid.call === '4N' && ctx.lastBid.seat === ctx.partner) {
    if (SY.conv.rkcb) {
      const trump = agreedSuit(ctx) || [...ctx.pc].reverse().map((a) => a.shows).find((x) => x && x !== 'N') || ev.longest;
      const kc = ev.aces + (ev.has(trump, 13) ? 1 : 0);
      if (kc === 1 || kc === 4) return legal(ctx, '5C');
      if (kc === 0 || kc === 3) return legal(ctx, '5D');
      return legal(ctx, ev.has(trump, 12) ? '5S' : '5H');
    }
    return legal(ctx, ['5C', '5D', '5H', '5S'][ev.aces % 4]);
  }
  if (ctx.myLast && ctx.myLast.conv === 'blackwood' && p && (p.conv === 'bwresp' || p.conv === 'rkcresp')) return afterBlackwood(ev, ctx);""")
rep("""  const pOpened = ctx.opening.seat === ctx.partner;
  const iOpened = ctx.opening.seat === ctx.seat;""","""  const pOpened = ctx.opening.seat === ctx.partner;
  const iOpened = ctx.opening.seat === ctx.seat;
  if (SY.precision && iOpened && ctx.my.length === 1 && ctx.my[0].conv === 'strongClub') { const r = precisionRebid(ev, ctx); if (r) return r; }""")
rep("""function openingBid(ev, ctx) {
  const { hcp, len } = ev;
  const seatPos = ctx.auction.length; // 0 = first seat
  if (hcp >= 22) return '2C';
  if (ev.balanced && hcp >= 20 && hcp <= 21) return '2N';
  if (ev.balanced && hcp >= 15 && hcp <= 17) return '1N';
  const opens = hcp >= 13 || (hcp >= 11 && ev.rule20 >= 20);
  if (opens) return oneLevelSuit(ev);
  if (seatPos === 3) return 'P'; // no pre-empts in fourth seat
  // weak twos 6-10 with a good six-card suit; preempts at 3/4 level
  for (const s of ['S', 'H', 'D']) {
    if (len[s] === 6 && hcp >= 5 && hcp <= 10 && ev.goodSuit(s) && !MAJORS.some((m) => m !== s && len[m] >= 4)) return '2' + s;
  }""","""function openingBid(ev, ctx) {
  const { hcp, len } = ev;
  const seatPos = ctx.auction.length; // 0 = first seat
  const opens = hcp >= 13 || (hcp >= 11 && ev.rule20 >= 20) || (SY.precision && hcp >= 11 && ev.rule20 >= 19);
  if (SY.precision) {
    if (hcp >= 16) return ev.balanced && hcp >= SY.nt2[0] && hcp <= SY.nt2[1] ? '2N' : '1C';
    if (ev.balanced && hcp >= ntLo() && hcp <= ntHi()) return '1N';
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
  }""")
rep("""function oneLevelSuit(ev) {
  const { len } = ev;""","""function oneLevelSuit(ev) {
  const { len } = ev;
  if (SY.minorStyle === 'acol') {
    // four-card suits: longest first; equal 5-5/6-6 higher; two four-card suits: the lower-ranking
    const max = Math.max(...E.SUITS.map((s) => len[s]));
    const longs = E.SUITS.filter((s) => len[s] === max);
    if (longs.length === 1) return '1' + longs[0];
    return '1' + (max >= 5 ? longs[longs.length - 1] : longs[0]);
  }""")
rep("""  if (o === '2C') {
    if (interfered) return generic(ev, ctx);
    return '2D'; // waiting
  }""","""  if (SY.precision && o === '1C') {
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
  }""")
rep("""  if (isMajor(oS)) {
    if (len[oS] >= 4 && supportPts >= 13 && !interfered) return '2N';""","""  if (isMajor(oS)) {
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
    }""")
rep("""    if (len[oS] >= 3 && supportPts >= 10 && supportPts <= 12) return bidAt(ctx, 3, oS) || (interfered ? 'P' : null);
    if (len[oS] >= 3 && supportPts >= 6 && supportPts <= 9) return bidAt(ctx, 2, oS) || (interfered && len[oS] >= 4 ? bidAt(ctx, 3, oS) : 'P');
  }""","""    if (len[oS] >= raiseMin() && supportPts >= 10 && supportPts <= 12) return bidAt(ctx, 3, oS) || (interfered ? 'P' : null);
    if (len[oS] >= raiseMin() && supportPts >= 6 && supportPts <= 9) return bidAt(ctx, 2, oS) || (interfered && len[oS] >= 4 ? bidAt(ctx, 3, oS) : 'P');
  }""")
rep("""  if (interfered && lb.seat === ctx.rho && E.isBid(lb.call) && E.bidLevel(lb.call) <= 2 && E.bidStrain(lb.call) !== 'N') {""","""  if (SY.conv.negDbl && interfered && lb.seat === ctx.rho && E.isBid(lb.call) && E.bidLevel(lb.call) <= 2 && E.bidStrain(lb.call) !== 'N') {""")
rep("""  // two-level new suit with 10+
  if (hcp >= 10) {""","""  // 2/1 game force: a two-level new suit needs an opening hand; 10-12 without a fit bids a forcing 1NT
  if (SY.twoOverOne && isMajor(oS) && !interfered && hcp >= 6 && hcp <= 12) {
    if (!(len[oS] >= 3 && hcp >= 6)) { const b = bidAt(ctx, 1, 'N'); if (b) return b; }
  }
  // two-level new suit with 10+
  if (hcp >= (SY.twoOverOne && isMajor(oS) && !interfered ? 13 : 10)) {""")
rep("""    if (hcp >= 6 && hcp <= 10) return bidAt(ctx, 1, 'N') || (interfered ? 'P' : null);
  }
  if (isMajor(oS) && len[oS] >= 3 && supportPts >= 6) return cheapBid(ctx, oS, 3) || 'P';""","""    if (hcp >= 6 && hcp <= SY.resp1NT[1]) return bidAt(ctx, 1, 'N') || (interfered ? 'P' : null);
  }
  if (isMajor(oS) && len[oS] >= raiseMin() && supportPts >= 6) return cheapBid(ctx, oS, 3) || 'P';""")
rep("""function respondNT(ev, ctx, o) {
  const { hcp, len } = ev;
  const two = o === '1N';
  const b = two ? 2 : 3;
  const gameMin = two ? 10 : 5;
  const invMin = two ? 8 : 99;
  // Jacoby transfers with any five-card major (any strength)
  if (len.S >= 5 || len.H >= 5) {
    if (!two && hcp < 4) return 'P';
    const m = len.S >= len.H ? 'S' : 'H';
    return b + (m === 'H' ? 'D' : 'H');
  }
  // Stayman: 8+ (1NT) with a four-card major
  if ((len.H === 4 || len.S === 4) && hcp >= (two ? 8 : 5) && !(ev.lens.join('') === '4333')) return b + 'C';
  if (hcp >= gameMin) {
    if (two && hcp >= 18 && hcp <= 19) return '6N';
    if (two && hcp >= 20) return '7N';
    if (two && hcp >= 15) return '4N';
    if (!two && hcp >= 12) return '6N';
    if (!two && hcp >= 11) return '4N';
    return '3N';
  }
  if (hcp >= invMin) return '2N';
  // weak with a long minor: escape to 3 of it? keep simple: pass
  return 'P';
}""","""function respondNT(ev, ctx, o) {
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
}""")
rep("""    const two = o === '1N';
    const fit = p.shows && p.shows !== 'N' && len[p.shows] >= 4 ? p.shows : null;
    const gameMin = two ? 10 : 5;""","""    const two = o === '1N';
    const fit = p.shows && p.shows !== 'N' && len[p.shows] >= 4 ? p.shows : null;
    const gameMin = two ? 25 - ntLo() : 5;""")
rep("""    if (!two) return len[m] >= 6 ? bidAt(ctx, 4, m) : bidAt(ctx, 3, 'N');
    if (hcp <= 7) return 'P';
    if (hcp <= 9) return len[m] >= 6 ? bidAt(ctx, 3, m) : bidAt(ctx, 2, 'N');
    if (hcp >= 16 && len[m] >= 6) return '4N';""","""    if (!two) return len[m] >= 6 ? bidAt(ctx, 4, m) : bidAt(ctx, 3, 'N');
    const g = 25 - ntLo();
    if (hcp <= g - 3) return 'P';
    if (hcp <= g - 1) return len[m] >= 6 ? bidAt(ctx, 3, m) : bidAt(ctx, 2, 'N');
    if (hcp >= g + 6 && len[m] >= 6) return '4N';""")
rep("""  if ((o === '1N') && p.call === '2N') return hcp >= 16 ? '3N' : 'P';""","""  if ((o === '1N') && p.call === '2N') return hcp >= ntHi() - 1 ? '3N' : 'P';
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
  }""")
rep("""  if (o === '2C') {
    if (ev.balanced && hcp <= 24) return cheapBid(ctx, 'N');""","""  if (o === '2D' && SY.sef) return ev.balanced ? cheapBid(ctx, 'N') : cheapBid(ctx, ev.longest);
  if (SY.precision && (o === '1C' || o === '2C' || o === '2D' || o === '1N')) return null;
  if (o === '2C') {
    if (ev.balanced && hcp <= 24) return cheapBid(ctx, 'N');""")
rep("""  if (p.call === '1N' && !interfered) {
    if (len[oS] >= 6) return hcp >= 16 ? bidAt(ctx, 3, oS) : bidAt(ctx, 2, oS);
    const second = E.SUITS.filter((s) => s !== oS && len[s] >= 4 && sRank(s) < sRank(oS)).sort((a, b) => len[b] - len[a])[0];
    if (hcp >= 18 && ev.balanced) return '2N';""","""  if (p.call === '1N' && !interfered) {
    if (len[oS] >= 6) return hcp >= 16 ? bidAt(ctx, 3, oS) : bidAt(ctx, 2, oS);
    const second = E.SUITS.filter((s) => s !== oS && len[s] >= 4 && sRank(s) < sRank(oS)).sort((a, b) => len[b] - len[a])[0];
    if (SY.majorLen === 4 && ev.balanced && hcp >= 17) return hcp >= 19 ? '3N' : '2N';
    if (hcp >= 18 && ev.balanced) return '2N';""")
rep("""    if (ev.balanced && hcp <= 14 && L === 1) { const b = bidAt(ctx, 1, 'N'); if (b && [...ctx.oppSuits].every((s) => ev.stopper(s))) return b; }
    if (ev.balanced && hcp >= 18 && hcp <= 19 && L === 1) return bidAt(ctx, 2, 'N') || null;""","""    const [r1lo, r1hi] = SY.rebidNT1, [r2lo, r2hi] = SY.rebidNT2;
    if (ev.balanced && hcp >= r1lo - (SY.majorLen === 4 ? 0 : 1) && hcp <= r1hi && L === 1) { const b = bidAt(ctx, 1, 'N'); if (b && [...ctx.oppSuits].every((s) => ev.stopper(s))) return b; }
    if (ev.balanced && hcp >= r2lo && hcp <= r2hi && L === 1) return bidAt(ctx, 2, 'N') || null;
    if (ev.balanced && hcp > r2hi && L === 1 && SY.majorLen === 4) return bidAt(ctx, 3, 'N') || null;""")
rep("""  if (oL === 1 && !isMajor(oS) && len.H >= 5 && len.S >= 5""","""  if (SY.conv.michaels && oL === 1 && !isMajor(oS) && len.H >= 5 && len.S >= 5""")
rep("""  if (oL === 1 && isMajor(oS) && len.C >= 5 && len.D >= 5""","""  if (SY.conv.unusual && oL === 1 && isMajor(oS) && len.C >= 5 && len.D >= 5""")
rep("""function afterBlackwood(ev, ctx) {
  const shown = ctx.pLast.aces;
  let total = ev.aces + shown;
  if (shown === 0 && ev.aces === 0) total = 4; // 5C = 0 or 4
  const trump = agreedSuit(ctx) || ctx.my.concat(ctx.pc).map((a) => a.shows).filter((s) => s && s !== 'N').pop() || 'N';
  const pInfo = inferSeat(ctx.entries, ctx.partner);
  const combined = ev.hcp + ev.shortPts(trump) + pInfo.lo;""","""function afterBlackwood(ev, ctx) {
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
  if (shown === 0 && ev.aces === 0) total = 4; // 5C = 0 or 4""")
rep("""  const forced = partnerForcing(ctx);
  const combo = {};""","""  const myInfo = inferSeat(ctx.entries, ctx.seat);
  const gfOn = pInfo.gf || myInfo.gf;
  const forced = partnerForcing(ctx);
  const combo = {};""")
rep("""  const pRange = pInfo.hi - pInfo.lo;""","""  if (gfOn) { pInfo.lo = Math.max(pInfo.lo, 12); }
  const pRange = pInfo.hi - pInfo.lo;""")
rep("""  const curL = lb ? E.bidLevel(lb.call) : 0;
  const curS = lb ? E.bidStrain(lb.call) : null;""","""  const curL = lb ? E.bidLevel(lb.call) : 0;
  const curS = lb ? E.bidStrain(lb.call) : null;
  if (gfOn && oursLast && target < GAME[strain] && curL < GAME[curS] && !competitive) {
    // game-forcing auction: never stop below game
    target = Math.max(target, GAME[strain]);
    if ((strain === 'C' || strain === 'D') && stopped && cheapestLevel(ctx, 'N') <= 3) { strain = 'N'; target = 3; }
  }""")
open(p,'w').write(s)
print('ok')
