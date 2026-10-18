'use strict';
// Rooms: seats, players, board flow, bot scheduling, per-seat views.
const crypto = require('crypto');
const E = require('./engine');
const G = require('./game');
const B = require('./bidding');
const T = require('./tips');
const { SYSTEMS, CONVENTIONS, listSystems } = require('./systems');
const SYSTEM_LIST = listSystems();
function cleanSide(x, fallback) {
  const id = x && SYSTEMS[x.id || x] ? (x.id || x) : fallback;
  const conv = {};
  if (x && x.convOverrides) for (const k of Object.keys(CONVENTIONS)) if (typeof x.convOverrides[k] === 'boolean') conv[k] = x.convOverrides[k];
  return { id, convOverrides: conv };
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
const newToken = () => crypto.randomBytes(18).toString('base64url');

class RoomManager {
  constructor(opts = {}) {
    this.rooms = new Map();
    this.botDelay = opts.botDelay ?? 750;
    this.bidDelay = opts.bidDelay ?? 600;
    this.trickPause = opts.trickPause ?? 1300;
    this.onChange = opts.onChange || (() => {});
    this.persist = opts.persist || (() => {});
  }

  create({ name, seat = 'S', partner = 'open', system, oppSystem, conv }) {
    let code; do code = newCode(); while (this.rooms.has(code));
    if (!E.SEATS.includes(seat)) seat = 'S';
    const seats = {};
    for (const s of E.SEATS) seats[s] = { type: 'bot', name: botName(s) };
    seats[E.partnerOf(seat)] = partner === 'bot' ? { type: 'bot', name: botName(E.partnerOf(seat)) } : { type: 'open', name: '' };
    const token = newToken();
    seats[seat] = { type: 'human', name: clean(name) || 'Player', token, connected: false, ready: false };
    const mine = E.sideOf(seat), theirs = mine === 'NS' ? 'EW' : 'NS';
    const settings = {};
    settings[mine] = cleanSide({ id: system, convOverrides: conv }, 'sayc');
    settings[theirs] = cleanSide({ id: oppSystem || settings[mine].id }, settings[mine].id);
    const room = { code, created: Date.now(), updated: Date.now(), seats, owner: token, settings, boardNo: 0, board: null, history: [], totals: { NS: 0, EW: 0 }, timer: null, log: [], feedback: {} };
    this.rooms.set(code, room);
    this.maybeStart(room);
    this.changed(room);
    return { room, seat, token };
  }

  get(code) { return this.rooms.get(String(code || '').toUpperCase()); }

  seatByToken(room, token) {
    if (!token) return null;
    return E.SEATS.find((s) => room.seats[s].type === 'human' && room.seats[s].token === token) || null;
  }

  sit(room, seat, name, token) {
    const cur = this.seatByToken(room, token);
    if (cur) return { seat: cur, token };
    const st = room.seats[seat];
    if (!st) throw new Error('No such seat');
    if (st.type === 'human') throw new Error('That seat is taken');
    const t = newToken();
    room.seats[seat] = { type: 'human', name: clean(name) || 'Player', token: t, connected: false, ready: false };
    this.maybeStart(room);
    this.changed(room);
    return { seat, token: t };
  }

  setSeat(room, bySeat, seat, mode) {
    if (!bySeat) throw new Error('Take a seat first');
    const st = room.seats[seat];
    if (!st) throw new Error('No such seat');
    if (st.type === 'human' && st.connected && seat !== bySeat) throw new Error('A player is sitting there');
    if (seat === bySeat) throw new Error('That is your seat');
    room.seats[seat] = mode === 'bot' ? { type: 'bot', name: botName(seat) } : { type: 'open', name: '' };
    this.maybeStart(room);
    this.changed(room);
  }

  leave(room, seat) {
    if (!seat) return;
    room.seats[seat] = { type: 'open', name: '' };
    this.changed(room);
  }

  setConnected(room, seat, on) {
    const st = room.seats[seat];
    if (st && st.type === 'human') { st.connected = on; this.changed(room, false); }
  }

  maybeStart(room) {
    if (room.board) return;
    if (E.SEATS.some((s) => room.seats[s].type === 'open')) return;
    this.nextBoard(room);
  }

  setSystem(room, bySeat, { NS, EW }) {
    if (!bySeat) throw new Error('Take a seat first');
    const ownerSeat = this.seatByToken(room, room.owner);
    if (ownerSeat && ownerSeat !== bySeat) throw new Error('Only the player who created the table can change systems');
    if (!room.settings) room.settings = { NS: { id: 'sayc', convOverrides: {} }, EW: { id: 'sayc', convOverrides: {} } };
    if (NS) room.settings.NS = cleanSide(NS, room.settings.NS.id);
    if (EW) room.settings.EW = cleanSide(EW, room.settings.EW.id);
    const b = room.board;
    // apply at once if nobody has bid yet on this board, otherwise from the next board
    if (b && b.phase === 'auction' && b.auction.length === 0) b.systems = JSON.parse(JSON.stringify(room.settings));
    this.changed(room);
  }

  nextBoard(room) {
    room.boardNo += 1;
    if (!room.settings) room.settings = { NS: { id: 'sayc', convOverrides: {} }, EW: { id: 'sayc', convOverrides: {} } };
    room.board = G.newBoard(room.boardNo, undefined, JSON.parse(JSON.stringify(room.settings)));
    room.feedback = {};
    for (const s of E.SEATS) if (room.seats[s].type === 'human') room.seats[s].ready = false;
    this.schedule(room);
  }

  call(room, seat, call) {
    const b = room.board;
    if (!b) throw new Error('The game has not started');
    const before = b.auction.slice();
    G.applyCall(b, seat, call);
    try {
      if (!room.feedback) room.feedback = {};
      room.feedback[seat] = { board: b.number, idx: before.length, call, ...(B.feedback(b.hands[seat], seat, b.dealer, before, call, b.systems) || { ok: true }) };
    } catch (e) { console.error('feedback error', e); }
    this.afterAction(room);
  }

  play(room, seat, card) {
    const b = room.board;
    if (!b) throw new Error('The game has not started');
    G.applyCard(b, seat, card);
    this.afterAction(room);
  }

  ready(room, seat) {
    const b = room.board;
    if (!b || b.phase !== 'done') return;
    room.seats[seat].ready = true;
    const humans = E.SEATS.filter((s) => room.seats[s].type === 'human' && room.seats[s].connected);
    if (humans.every((s) => room.seats[s].ready)) this.nextBoard(room);
    this.changed(room);
  }

  afterAction(room) {
    const b = room.board;
    if (b.phase === 'done' && !b.recorded) this.record(room);
    this.schedule(room);
    this.changed(room);
  }

  record(room) {
    const b = room.board;
    b.recorded = true;
    const nsScore = b.result.nsScore;
    if (nsScore > 0) room.totals.NS += nsScore; else room.totals.EW += -nsScore;
    room.history.push({
      number: b.number, dealer: b.dealer, vul: b.vul,
      contract: b.contract ? E.contractStr(b.contract) : 'Pass', declarer: b.contract ? b.contract.declarer : '',
      tricks: b.result.tricks, text: G.resultText(b), nsScore,
    });
  }

  schedule(room) {
    if (room.timer) return;
    const b = room.board;
    if (!b || b.phase === 'done') return;
    if (b.trickComplete) {
      room.timer = setTimeout(() => { room.timer = null; G.collectTrick(b); this.afterAction(room); }, this.trickPause);
      return;
    }
    const ctrl = G.controllerOf(b, b.turn);
    if (room.seats[ctrl].type !== 'bot') return;
    const delay = b.phase === 'auction' ? this.bidDelay : this.botDelay;
    room.timer = setTimeout(() => {
      room.timer = null;
      try {
        const a = G.botAction(b);
        if (a && a.type === 'call') G.applyCall(b, a.actor, a.value);
        else if (a) G.applyCard(b, a.actor, a.value);
      } catch (e) { console.error('bot error', e); }
      this.afterAction(room);
    }, delay);
  }

  changed(room, persist = true) {
    room.updated = Date.now();
    this.onChange(room);
    if (persist) this.persist();
  }

  // ---------- per-seat view (never leaks hidden cards)
  view(room, seat) {
    const b = room.board;
    const seats = E.SEATS.map((s) => {
      const st = room.seats[s];
      return { seat: s, type: st.type, name: st.type === 'open' ? '' : st.name, connected: st.type === 'bot' ? true : !!st.connected, ready: !!st.ready };
    });
    const ownerSeat = this.seatByToken(room, room.owner);
    const v = {
      code: room.code, you: seat, seats, history: room.history, totals: room.totals, board: null,
      settings: room.settings, owner: ownerSeat, canChangeSystem: !!seat && (!ownerSeat || ownerSeat === seat),
      systemsList: SYSTEM_LIST, conventions: CONVENTIONS,
    };
    if (!b) return v;
    const dummy = G.dummyOf(b);
    const exposed = b.phase === 'play' && (b.tricks.length > 0 || b.trick.length > 0);
    const hands = {};
    if (b.phase === 'done') Object.assign(hands, b.original);
    else {
      if (seat) hands[seat] = b.hands[seat];
      if (exposed) hands[dummy] = b.hands[dummy];
    }
    const counts = {};
    for (const s of E.SEATS) counts[s] = b.hands[s].length;
    const ann = B.annotate(b.dealer, b.auction, b.systems);
    const turnCtrl = b.turn ? G.controllerOf(b, b.turn) : null;
    const lastTrick = b.tricks.length ? b.tricks[b.tricks.length - 1] : null;
    v.board = {
      number: b.number, dealer: b.dealer, vul: b.vul, phase: b.phase,
      auction: b.auction.map((a, i) => ({ seat: a.seat, call: a.call, explain: B.explain(ann[i]) })),
      contract: b.contract, dummy, exposed, turn: b.turn, controller: turnCtrl,
      trick: b.trick, trickComplete: b.trickComplete, lastTrick, trickNo: b.tricks.length + (b.trick.length ? 1 : 0),
      tricksWon: G.tricksWon(b), hands, counts, result: b.result, resultText: G.resultText(b),
      legalCalls: b.phase === 'auction' && seat && b.turn === seat ? E.legalCalls(b.dealer, b.auction) : [],
      legalCards: b.phase === 'play' && seat && !b.trickComplete && turnCtrl === seat ? E.legalCards(b.hands[b.turn], b.trick) : [],
      systems: b.systems,
    };
    // learning mode (computed only for the viewer, from the viewer's own legitimate information)
    try {
      if (seat && b.phase === 'auction' && b.turn === seat) v.board.suggestion = B.suggest(b.hands[seat], seat, b.dealer, b.auction, b.systems);
      if (seat && b.phase === 'play' && turnCtrl === seat) v.board.playTip = T.playTip(b, seat);
      const fb = room.feedback && room.feedback[seat];
      if (fb && fb.board === b.number) v.board.feedback = fb;
    } catch (e) { console.error('tip error', e); }
    return v;
  }

  serialize() {
    return [...this.rooms.values()].map((r) => ({ ...r, timer: null }));
  }
  load(list) {
    for (const r of list || []) {
      if (Date.now() - r.updated > 3 * 24 * 3600e3) continue;
      r.timer = null;
      for (const s of E.SEATS) if (r.seats[s].type === 'human') r.seats[s].connected = false;
      this.rooms.set(r.code, r);
      this.schedule(r);
    }
  }
}

function botName(s) { return { N: 'North', E: 'East', S: 'South', W: 'West' }[s] + ' (computer)'; }
function clean(n) { return String(n || '').replace(/[<>&"'`]/g, '').trim().slice(0, 20); }

module.exports = { RoomManager };
