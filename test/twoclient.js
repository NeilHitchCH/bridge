'use strict';
// Two real WebSocket clients (North + South) play full boards against computer East/West.
// Usage: node test/twoclient.js            (starts its own server on a random port)
//        node test/twoclient.js wss://host  (runs against a deployed server, e.g. through the tunnel)
const WebSocket = require('ws');
const E = require('../src/engine');
const B = require('../src/bidding');
const BOARDS = 2;

function client(url, label) {
  const ws = new WebSocket(url);
  const c = { ws, label, view: null, seat: null, token: null, code: null, errors: [], waiters: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'state') c.view = m.view;
    if (m.t === 'joined') { c.code = m.code; c.seat = m.seat; c.token = m.token; }
    if (m.t === 'error') c.errors.push(m.message);
    for (const w of c.waiters.slice()) if (w.pred(m, c)) { c.waiters.splice(c.waiters.indexOf(w), 1); w.res(m); }
    if (c.onMsg) c.onMsg(m);
  });
  c.send = (m) => ws.send(JSON.stringify(m));
  c.wait = (pred, ms = 20000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(label + ': timeout')), ms); c.waiters.push({ pred, res: (m) => { clearTimeout(t); res(m); } }); });
  c.open = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  return c;
}

function checkPrivacy(c) {
  const b = c.view && c.view.board; if (!b) return;
  const shown = Object.keys(b.hands);
  if (b.phase !== 'done') {
    for (const s of shown) if (s !== c.seat && !(b.exposed && s === b.dummy) && !(b.youPlay || []).includes(s)) throw new Error(`${c.label} can see ${s}'s hand`);
    if (b.practice) throw new Error('practice view must not work with a human partner');
    if (b.phase === 'play' && !b.exposed && shown.some((s) => s !== c.seat && !(b.youPlay || []).includes(s))) throw new Error('dummy shown before the opening lead');
  }
  if (b.suggestion && !(b.phase === 'auction' && b.turn === c.seat)) throw new Error('suggestion leaked to the wrong seat');
}

async function main() {
  let url = process.argv[2], srv;
  if (!url) {
    const { startServer } = require('../server');
    srv = await startServer({ port: 0, dataFile: null, botDelay: 5, bidDelay: 5, trickPause: 20, playMs: 60 });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  } else if (!url.endsWith('/ws')) url = url.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const A = client(url, 'South'), Bc = client(url, 'North');
  await Promise.all([A.open, Bc.open]);
  A.send({ t: 'practice', on: true }); // asks for partner's cards: must be refused (partner is human)
  A.send({ t: 'create', name: 'Neil', seat: 'S', partner: 'open', system: 'acol', oppSystem: 'sayc' });
  if (!A.code) await A.wait((m) => m.t === 'joined');
  Bc.send({ t: 'join', code: A.code });
  await Bc.wait((m) => m.t === 'state');
  if (Bc.view.you) throw new Error('joiner should not have a seat yet');
  Bc.send({ t: 'sit', seat: 'N', name: 'Partner' });
  await Bc.wait((m) => m.t === 'joined');
  if (!(A.view && A.view.board)) await A.wait((m) => m.t === 'state' && m.view.board);
  const settings = A.view.settings;
  if (settings.NS.id !== 'acol' || settings.EW.id !== 'sayc') throw new Error('systems not stored: ' + JSON.stringify(settings));
  // non-owner may not change the system
  Bc.send({ t: 'setSystem', NS: { id: 'precision' } });
  await Bc.wait((m) => m.t === 'error');
  let stats = { boards: 0, calls: 0, cards: 0, suggestions: 0, playTips: 0, feedback: 0, reconnect: false, privacyChecks: 0 };
  let reconnectDone = false;

  const act = (c) => {
    checkPrivacy(c); stats.privacyChecks++;
    const b = c.view && c.view.board; if (!b) return;
    if (b.phase === 'auction' && b.legalCalls.length) {
      if (b.suggestion) stats.suggestions++;
      const key = 'a' + b.number + ':' + b.auction.length; if (c.last === key) return; c.last = key;
      let call = B.chooseCall(b.hands[c.seat], c.seat, b.dealer, b.auction, { systems: b.systems });
      if (c.label === 'North' && b.auction.length < 4 && b.legalCalls.includes('P') && call !== 'P' && Math.random() < 0.3) call = 'P';
      c.send({ t: 'call', call }); stats.calls++;
    } else if (b.phase === 'play' && b.legalCards.length) {
      if (b.playTip) stats.playTips++;
      const key = 'p' + b.number + ':' + b.trickNo + ':' + b.trick.length; if (c.last === key) return; c.last = key;
      const card = b.playTip && b.legalCards.includes(b.playTip.card) ? b.playTip.card : b.legalCards[0];
      c.send({ t: 'play', card }); stats.cards++;
    } else if (b.phase === 'done') {
      const me = c.view.seats.find((s) => s.seat === c.seat);
      const key = 'd' + b.number; if (c.last === key || me.ready) return; c.last = key;
      c.send({ t: 'ready' });
    }
    if (b.feedback && !b.feedback.ok) stats.feedback++;
  };
  const finished = new Promise((res, rej) => {
    const onMsg = (c) => (m) => {
      try {
        if (m.t !== 'state') return;
        const b = m.view.board;
        if (b && b.phase === 'done' && !c['done' + b.number]) { c['done' + b.number] = true; if (c === A) stats.boards++; }
        if (stats.boards >= BOARDS) return res();
        act(c);
      } catch (e) { rej(e); }
    };
    A.onMsg = onMsg(A); Bc.onMsg = onMsg(Bc);
  });
  act(A); act(Bc);
  // mid-game reconnect of North with its stored token
  setTimeout(async () => {
    const tok = Bc.token, code = Bc.code;
    Bc.ws.close();
    await new Promise((r) => setTimeout(r, 300));
    const vA = A.view.seats.find((s) => s.seat === 'N');
    const N2 = client(url, 'North');
    await N2.open;
    N2.token = tok; N2.code = code; N2.seat = 'N';
    N2.onMsg = Bc.onMsg; Object.assign(Bc, { ws: N2.ws, send: N2.send, wait: N2.wait });
    N2.ws.removeAllListeners('message');
    N2.ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'state') Bc.view = m.view; if (m.t === 'joined') Bc.seat = m.seat; Bc.onMsg(m); });
    N2.send({ t: 'join', code, token: tok });
    stats.reconnect = { offlineSeenByPartner: vA && vA.connected === false };
    reconnectDone = true;
  }, 400);
  const t = setTimeout(() => { console.error('TIMEOUT', JSON.stringify(stats), A.view && A.view.board && A.view.board.phase); process.exit(1); }, +process.env.TWOCLIENT_TIMEOUT || 300000);
  await finished;
  clearTimeout(t);
  if (!reconnectDone || Bc.seat !== 'N' || Bc.view.you !== 'N') throw new Error('reconnect did not resume North');
  stats.reconnect.resumedSeat = Bc.view.you;
  // hand history over HTTP
  const httpBase = url.replace(/^ws/, 'http').replace(/\/ws$/, '');
  const hist = await (await fetch(httpBase + '/api/history?code=' + A.code)).json();
  if (!hist.boards || hist.boards.length < BOARDS) throw new Error('history missing boards: ' + JSON.stringify(hist).slice(0, 200));
  const hb = hist.boards[0];
  if (!hb.hands || Object.values(hb.hands).flat().length !== 52) throw new Error('history board lacks the deal');
  if (hb.contract && hb.tricks.length !== 13) throw new Error('history board lacks the play');
  stats.history = hist.boards.length + ' boards in /api/history';
  const ver = await (await fetch(httpBase + '/version')).json(); stats.version = ver.version;
  stats.totals = A.view.totals; stats.results = A.view.history.map((h) => `${h.number}: ${h.contract} ${h.declarer} ${h.text}`);
  console.log('two-client test OK', JSON.stringify(stats, null, 1));
  A.ws.close(); Bc.ws.close();
  if (srv) await srv.close();
  process.exit(0);
}
main().catch((e) => { console.error('two-client test FAILED:', e.message); process.exit(1); });
