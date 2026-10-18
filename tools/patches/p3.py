p='src/bidding.js'
s=open(p).read()
def rep(old,new,count=1):
    global s
    assert old in s, old[:90]
    s=s.replace(old,new,count)
rep("""// ---------------- takeout doubler's rebid""","""// ---------------- Precision: opener's rebid after 1C
function precisionRebid(ev, ctx) {
  const p = ctx.pLast;
  if (!p || ctx.opp.length) return null;
  const { hcp, len } = ev;
  if (p.conv === 'precNeg') {
    if (ev.balanced) {
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

// ---------------- takeout doubler's rebid""")
rep("""  if (a.conv === 'cuebid' || a.conv === 'cuebidRaise') return 'Cue-bid: strong, forcing';""","""  if (a.conv === 'cuebid' || a.conv === 'cuebidRaise') return 'Cue-bid: strong, forcing';
  if (a.conv === 'strongClub') return 'Strong club: 16+ HCP, any shape (artificial, forcing)';
  if (a.conv === 'precNeg') return 'Negative: 0–7 HCP (artificial)';
  if (a.conv === 'prec2d') return '11–15 HCP, short diamonds, 3+ cards in each major';
  if (a.conv === 'gf2d') return 'Game forcing: 24+ HCP (artificial)';
  if (a.conv === 'splinter') return `Splinter: 4+ ${S(a.support)}, game values, singleton or void in ${S(a.short)}`;
  if (a.conv === 'forcingNT') return 'Forcing 1NT: 6–12 HCP, no fit (opener must bid again)';
  if (a.conv === 'rkcresp') return `${a.kc.join(' or ')} key card${a.kc.length > 1 || a.kc[0] !== 1 ? 's' : ''}${a.tq === true ? ', with the trump queen' : a.tq === false ? ', no trump queen' : ''}`;
  if (a.conv === 'blackwood' && a.rkcb) return 'Roman Key Card Blackwood: asks for key cards (aces + trump king)';""")
rep("""  if (a.forcing) parts.push('forcing');""","""  if (a.gf) parts.push('game forcing'); else if (a.forcing) parts.push('forcing');""")
rep("""module.exports = { chooseCall, annotate, inferSeat, explain, evalHand };""","""// ---------------- learning-mode suggestion & feedback (plain English, original wording)
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
  if (p && ctx.lastBid && ctx.lastBid.seat === ctx.partner) return 'Partner\\'s bid already describes a good contract for your hand';
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

module.exports = { chooseCall, annotate, inferSeat, explain, evalHand, suggest, feedback, callText, normSystems };""")
open(p,'w').write(s)
print('ok')
