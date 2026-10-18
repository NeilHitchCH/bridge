'use strict';
// Declarer control over real WebSockets.
//  1. Solo (human + computer partner) in every seat: whenever the human's side wins the contract the
//     human plays BOTH hands (declarer and dummy), and the computer never plays a card for that side.
//  2. Two humans (N + S): the declarer plays dummy's cards from their own device; the dummy gets no
//     playable cards and is told they are dummy; nobody else plays either hand.
// Usage: node test/declarer.js [wss://host]
const WebSocket = require('ws');
const E = require('../src/engine');
const B = require('../src/bidding');

function client(url, label) {
  const ws = new WebSocket(url);
  const c = { ws, label, view: null, seat: null, code: null, errors: [], waiters: [], sent: new Set(), seen: new Set() };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'state') c.view = m.view;
    if (m.t === 'joined') { c.code = m.code; c.seat = m.seat; }
    if (m.t === 'error') c.errors.push(m.message);
    for (const w of c.waiters.slice()) if (w.pred(m)) { c.waiters.splice(c.waiters.indexOf(w), 1); w.res(m); }
    if (c.onMsg) c.onMsg(m);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.wait = (pred, ms = 30000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(label + ': timeout')), ms); c.waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } }); });
  c.open = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  return c;
}

// strategy: 'bid' = grab the contract (bid notrump at once), 'pass' = always pass (partner may declare)
function chooseCall(b, seat, strategy) {
  const legal = b.legalCalls;
  if (strategy === 'pass') return 'P';
  const ourBid = b.auction.some((a) => E.sameSide(a.seat, seat) && E.isBid(a.call));
  if (!ourBid) { const nt = legal.find((c) => /^[1-7]N$/.test(c)); if (nt) return nt; }
  return 'P';
}

// Play with one or more clients until each scenario has been seen. Returns per-board facts.
async function run(url, { seats, partnerHuman }) {
  const owner = client(url, 'owner');
  await owner.open;
  const mySeat = seats[0];
  owner.send({ t: 'practice', on: true }); // practice view on: only honoured with a computer partner
  owner.send({ t: 'create', name: 'Neil', seat: mySeat, partner: partnerHuman ? 'open' : 'bot', system: 'sayc' });
  await owner.wait((m) => m.t === 'joined');
  const cls = [owner];
  if (partnerHuman) {
    const p = client(url, 'partner'); await p.open;
    p.send({ t: 'join', code: owner.code }); await p.wait((m) => m.t === 'state');
    p.send({ t: 'sit', seat: E.partnerOf(mySeat), name: 'Partner' }); await p.wait((m) => m.t === 'joined');
    cls.push(p);
  }
  const facts = { boards: 0, humanSideDeclared: 0, partnerDeclared: 0, selfDeclared: 0, dummyTurnsPlayedByHuman: 0, declTurnsPlayedByDummyHuman: 0, dummyNoticeOK: 0 };
  const side = E.sideOf(mySeat);
  const want = partnerHuman ? (f) => f.selfDeclared >= 1 && f.partnerDeclared >= 1 : (f) => f.selfDeclared >= 1 && f.partnerDeclared >= 1;
  const checkedBoards = new Set();
  return new Promise((resolve, reject) => {
    const fail = (e) => { clearTimeout(timer); for (const c of cls) c.ws.close(); reject(e); };
    const timer = setTimeout(() => fail(new Error(`timeout ${JSON.stringify(facts)} seats=${seats} partnerHuman=${partnerHuman}`)), 150000);
    const act = (c) => {
      const v = c.view; const b = v && v.board; if (!b) return;
      if (b.phase !== 'done') {
        const p = E.partnerOf(c.seat);
        for (const s of Object.keys(b.hands)) {
          if (s === c.seat || (b.exposed && s === b.dummy) || (b.youPlay || []).includes(s)) continue;
          if (s === p && !partnerHuman && c === owner && b.practice) { facts.practiceSeen = (facts.practiceSeen || 0) + 1; continue; }
          return fail(new Error(`${c.label} (${c.seat}) can see ${s}'s hand`));
        }
        if (partnerHuman && b.practice) return fail(new Error('practice view granted with a human partner'));
      }
      const strategy = b.number % 2 ? 'bid' : 'pass';
      // 1. audit every card that has been played by our side this board
      if (b.phase !== 'auction' && b.contract) {
        const declSide = E.sideOf(b.contract.declarer);
        const cards = [...(b.lastTrick ? b.lastTrick.cards : []), ...b.trick];
        for (const pc of cards) {
          const k = b.number + pc.card; if (c.seen.has(k)) continue; c.seen.add(k);
          if (E.sideOf(pc.seat) !== side) continue;
          const ourDecl = declSide === side;
          // who should have played this card?
          let shouldBe;
          if (ourDecl) shouldBe = partnerHuman ? b.contract.declarer : 'me';
          else shouldBe = partnerHuman ? pc.seat : (pc.seat === c.seat ? 'me' : 'bot');
          if (shouldBe === 'me' || shouldBe === c.seat) {
            if (!cls.some((x) => x.sent.has(k))) return fail(new Error(`board ${b.number}: ${pc.seat}'s ${pc.card} was played without a human choosing it (declarer ${b.contract.declarer}, viewer ${c.seat})`));
            if (shouldBe === c.seat && !c.sent.has(k) && pc.seat !== c.seat && ourDecl) return fail(new Error(`board ${b.number}: ${pc.card} from ${pc.seat} not played by declarer ${c.seat}`));
          }
        }
      }
      if (b.phase === 'auction' && b.legalCalls.length) {
        const key = 'a' + b.number + ':' + b.auction.length; if (c.last === key) return; c.last = key;
        let call = c === owner ? chooseCall(b, c.seat, strategy) : chooseCall(b, c.seat, strategy === 'bid' ? 'pass' : 'bid');
        if (!b.legalCalls.includes(call)) call = 'P';
        c.send({ t: 'call', call });
      } else if (b.phase === 'play') {
        const decl = b.contract.declarer, dummy = b.dummy, ourDecl = E.sideOf(decl) === side;
        if (ourDecl && !checkedBoards.has(c.label + b.number)) {
          checkedBoards.add(c.label + b.number);
          if (c === owner) { facts.humanSideDeclared++; if (decl === c.seat) facts.selfDeclared++; else facts.partnerDeclared++; }
        }
        // the hand on turn belongs to our side: exactly the right client must be able to play it
        if (ourDecl && (b.turn === decl || b.turn === dummy) && !b.trickComplete) {
          const controller = partnerHuman ? decl : c.seat;
          const can = b.legalCards.length > 0;
          if (c.seat === controller && !can) return; // wait for the next view (may be mid-update)
          if (c.seat !== controller && can) return fail(new Error(`board ${b.number}: ${c.seat} may play for ${b.turn} but declarer is ${decl}`));
          if (c.seat !== controller) {
            if (!(b.dummy === c.seat && b.youPlay.length === 0)) return fail(new Error('dummy view inconsistent'));
            facts.dummyNoticeOK++;
            return;
          }
          if (b.exposed && !b.hands[dummy]) return fail(new Error('dummy hand not visible to declarer'));
          if (b.turn !== c.seat && !b.hands[b.turn]) return fail(new Error(`controller cannot see ${b.turn}'s cards`));
          if (!b.youPlay.includes(b.turn)) return fail(new Error('youPlay missing the hand on turn'));
        }
        if (!b.legalCards.length) return;
        const key = 'p' + b.number + ':' + b.trickNo + ':' + b.trick.length; if (c.last === key) return; c.last = key;
        const card = b.playTip && b.legalCards.includes(b.playTip.card) ? b.playTip.card : b.legalCards[0];
        if (b.turn !== c.seat) { if (b.turn === dummy) facts.dummyTurnsPlayedByHuman++; else facts.declTurnsPlayedByDummyHuman++; }
        c.sent.add(b.number + card);
        c.send({ t: 'play', card });
      } else if (b.phase === 'done') {
        const me = v.seats.find((s) => s.seat === c.seat);
        const key = 'd' + b.number; if (c.last === key || me.ready) return; c.last = key;
        if (c === owner) { facts.boards++; if (want(facts) || facts.boards >= 40) { clearTimeout(timer); for (const x of cls) x.ws.close(); return resolve(facts); } }
        c.send({ t: 'ready' });
      }
    };
    for (const c of cls) { c.onMsg = (m) => { if (m.t === 'state') { try { act(c); } catch (e) { fail(e); } } }; act(c); }
  });
}

async function main() {
  let url = process.argv[2], srv;
  if (!url) {
    const { startServer } = require('../server');
    srv = await startServer({ port: 0, dataFile: null, botDelay: 2, bidDelay: 2, trickPause: 5, playEngine: 'heuristic' });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  } else if (!url.endsWith('/ws')) url = url.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const out = {};
  const seatsToTest = process.argv[3] ? process.argv[3].split(',') : ['S', 'N', 'E', 'W'];
  for (const s of seatsToTest) {
    const f = await run(url, { seats: [s], partnerHuman: false });
    if (!f.practiceSeen) throw new Error('practice view never showed the computer partner');
    if (!f.selfDeclared || !f.partnerDeclared || !f.dummyTurnsPlayedByHuman || !f.declTurnsPlayedByDummyHuman) throw new Error(`solo ${s}: scenarios not all covered ${JSON.stringify(f)}`);
    out['solo-' + s] = f;
  }
  const f2 = await run(url, { seats: ['S'], partnerHuman: true });
  if (!f2.selfDeclared || !f2.partnerDeclared || !f2.dummyTurnsPlayedByHuman || !f2.dummyNoticeOK) throw new Error('two humans: scenarios not covered ' + JSON.stringify(f2));
  out['two-humans'] = f2;
  console.log('declarer-control test OK', JSON.stringify(out));
  if (srv) await srv.close();
  process.exit(0);
}
main().catch((e) => { console.error('declarer-control test FAILED:', e.message); process.exit(1); });
