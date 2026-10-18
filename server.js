'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./src/room');

function startServer(opts = {}) {
  const port = opts.port ?? (+process.env.PORT || 8787);
  const dataFile = opts.dataFile === undefined ? path.join(__dirname, 'data', 'rooms.json') : opts.dataFile;
  if (opts.playMs) require('./src/play').config.budgetMs = opts.playMs;
  if (opts.playEngine) require('./src/play').config.engine = opts.playEngine;
  const app = express();
  app.disable('x-powered-by');
  const { listSystems, CONVENTIONS } = require('./src/systems');
  app.get('/api/systems', (req, res) => res.json({ systems: listSystems(), conventions: CONVENTIONS }));
  const VERSION = require('./package.json').version;
  app.get('/version', (req, res) => res.json({ version: VERSION }));
  app.get('/api/history', (req, res) => {
    const room = mgr.get(req.query.code);
    if (!room) return res.status(404).json({ error: 'No table with that code' });
    res.json({ code: room.code, boards: mgr.history(room) });
  });
  app.get('/api/bench', (req, res) => {
    // one full-deal double-dummy solve, to see how fast the host is
    const DD = require('./src/dd'); const E = require('./src/engine');
    if (!DD.isReady()) return res.json({ ready: false });
    const h = E.deal(); const t = Date.now(); DD.solve(h, 'N', [], 'W');
    res.json({ ready: true, fullSolveMs: Date.now() - t, budgetMs: require('./src/play').config.budgetMs });
  });
  app.get('/healthz', (req, res) => res.json({ ok: true, rooms: mgr.rooms.size }));
  app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders(res, p) {
      if (/\.(html|js|css|webmanifest)$/.test(p)) res.setHeader('Cache-Control', 'no-cache');
      if (p.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
    },
  }));
  app.get(/^\/r\/[A-Za-z0-9]+$/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();
  let saveTimer = null;
  const persist = () => {
    if (!dataFile) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.writeFileSync(dataFile + '.tmp', JSON.stringify(mgr.serialize())); fs.renameSync(dataFile + '.tmp', dataFile); } catch (e) { console.error('save failed', e.message); }
    }, 500);
  };
  const mgr = new RoomManager({
    botDelay: opts.botDelay, bidDelay: opts.bidDelay, trickPause: opts.trickPause, persist,
    onChange(room) { for (const c of clients) if (c.room === room) send(c, { t: 'state', view: viewFor(c) }); },
  });
  if (dataFile && fs.existsSync(dataFile)) { try { mgr.load(JSON.parse(fs.readFileSync(dataFile, 'utf8'))); } catch (e) { console.error('load failed', e.message); } }

  function viewFor(c) { return mgr.view(c.room, c.seat, { practice: c.practice }); }
  function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }

  wss.on('connection', (ws) => {
    const c = { ws, room: null, seat: null, alive: true };
    clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      try { handle(c, m); } catch (e) { send(c, { t: 'error', message: e.message, ref: m.t }); }
    });
    ws.on('close', () => {
      clients.delete(c);
      if (c.room && c.seat && ![...clients].some((o) => o.room === c.room && o.seat === c.seat)) mgr.setConnected(c.room, c.seat, false);
    });
  });

  function attach(c, room, seat) {
    if (c.room && c.seat && (c.room !== room || c.seat !== seat)) {
      const prev = c.room, ps = c.seat;
      c.seat = null;
      if (![...clients].some((o) => o.room === prev && o.seat === ps)) mgr.setConnected(prev, ps, false);
    }
    c.room = room; c.seat = seat;
    if (seat) mgr.setConnected(room, seat, true);
    send(c, { t: 'state', view: viewFor(c) });
  }

  function handle(c, m) {
    switch (m.t) {
      case 'ping': return send(c, { t: 'pong' });
      case 'practice': c.practice = !!m.on; if (c.room) send(c, { t: 'state', view: viewFor(c) }); return;
      case 'create': {
        const { room, seat, token } = mgr.create({ name: m.name, seat: m.seat, partner: m.partner, system: m.system, oppSystem: m.oppSystem, conv: m.conv });
        send(c, { t: 'joined', code: room.code, seat, token });
        return attach(c, room, seat);
      }
      case 'join': {
        const room = mgr.get(m.code);
        if (!room) throw new Error('Game not found. Check the code.');
        const seat = mgr.seatByToken(room, m.token);
        if (seat) send(c, { t: 'joined', code: room.code, seat, token: m.token });
        return attach(c, room, seat);
      }
      case 'sit': {
        const room = c.room; if (!room) throw new Error('Join a game first');
        const r = mgr.sit(room, m.seat, m.name, m.token);
        send(c, { t: 'joined', code: room.code, seat: r.seat, token: r.token });
        return attach(c, room, r.seat);
      }
      case 'setSeat': if (!c.room) return; return mgr.setSeat(c.room, c.seat, m.seat, m.mode);
      case 'call': if (!c.room || !c.seat) throw new Error('Not seated'); return mgr.call(c.room, c.seat, m.call);
      case 'play': if (!c.room || !c.seat) throw new Error('Not seated'); return mgr.play(c.room, c.seat, m.card);
      case 'setSystem': if (!c.room) return; return mgr.setSystem(c.room, c.seat, { NS: m.NS, EW: m.EW });
      case 'ready': if (!c.room || !c.seat) return; return mgr.ready(c.room, c.seat);
      case 'leave': if (c.room && c.seat) { const r = c.room, s = c.seat; c.seat = null; mgr.leave(r, s); } c.room = null; return;
      default: throw new Error('Unknown message');
    }
  }

  const hb = setInterval(() => {
    for (const c of clients) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch {} }
  }, 25000);

  return require('./src/play').ready.then(() => new Promise((resolve) => server.listen(port, opts.host || '0.0.0.0', () => {
    const close = () => new Promise((r) => { clearInterval(hb); for (const c of clients) c.ws.terminate(); wss.close(); server.close(() => r()); });
    resolve({ server, port: server.address().port, mgr, close });
  })));
}

if (require.main === module) {
  startServer().then(({ port }) => console.log(`Bridge server listening on http://localhost:${port}`));
}
module.exports = { startServer };
