'use strict';
(() => {
  const SEATS = ['N', 'E', 'S', 'W'];
  const SEAT_NAME = { N: 'North', E: 'East', S: 'South', W: 'West' };
  const SYM = { C: '♣', D: '♦', H: '♥', S: '♠', N: 'NT' };
  const RANKS = '23456789TJQKA';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const idx = (s) => SEATS.indexOf(s);
  const partnerOf = (s) => SEATS[(idx(s) + 2) % 4];
  const sideOf = (s) => (s === 'N' || s === 'S' ? 'NS' : 'EW');
  const rankOf = (c) => RANKS.indexOf(c[1]) + 2;

  const store = {
    get tokens() { try { return JSON.parse(localStorage.getItem('bridge.tokens') || '{}'); } catch { return {}; } },
    setToken(code, t) { const o = this.tokens; o[code] = t; localStorage.setItem('bridge.tokens', JSON.stringify(o)); },
    get name() { return localStorage.getItem('bridge.name') || ''; },
    set name(v) { localStorage.setItem('bridge.name', v); },
    get tips() { return localStorage.getItem('bridge.tips') !== '0'; },
    set tips(v) { localStorage.setItem('bridge.tips', v ? '1' : '0'); },
    get reveal() { return localStorage.getItem('bridge.reveal') === '1'; },
    set reveal(v) { localStorage.setItem('bridge.reveal', v ? '1' : '0'); },
    get system() { return localStorage.getItem('bridge.system') || 'sayc'; },
    set system(v) { localStorage.setItem('bridge.system', v); },
  };
  let SYSTEMS = [];
  const sysById = (id) => SYSTEMS.find((x) => x.id === id) || (st.view && st.view.systemsList || []).find((x) => x.id === id);

  const st = { ws: null, view: null, code: null, connected: false, retry: 0, selLevel: null, prevTrick: [], collecting: false, resultShownFor: null, explainIdx: null, homeSeat: 'S', homePartner: 'open', sheetKind: null };

  // ---------------------------------------------------------------- connection
  function wsUrl() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
  function connect() {
    const ws = new WebSocket(wsUrl());
    st.ws = ws;
    ws.onopen = () => {
      st.connected = true; st.retry = 0; st.lastMsg = Date.now(); $('conn').classList.remove('show');
      if (st.code) send({ t: 'join', code: st.code, token: store.tokens[st.code] });
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'state') onState(m.view);
      else if (m.t === 'joined') { st.code = m.code; store.setToken(m.code, m.token); setUrl(m.code); }
      else if (m.t === 'pong') st.lastMsg = Date.now();
      else if (m.t === 'error') {
        if (m.ref === 'play') { st.pendingPlay = null; clearTimeout(st.playTimer); for (const el of document.querySelectorAll('.hand .card.leaving')) el.classList.remove('leaving'); }
        toast(m.message);
        if (m.ref === 'join') { st.code = null; setUrl(null); show('home'); }
        render();
      }
    };
    ws.onclose = () => {
      if (st.ws !== ws) return;
      st.connected = false;
      if (st.code) $('conn').classList.add('show');
      const d = Math.min(8000, 500 * Math.pow(1.7, st.retry++));
      setTimeout(() => { if (st.ws === ws) connect(); }, d);
    };
  }
  // Drop a socket that has gone quiet (iOS suspends pages in the background and the socket can look
  // open while being dead) and reconnect; the server then sends a fresh view.
  function forceReconnect() {
    const ws = st.ws;
    if (ws) { ws.onclose = null; try { ws.close(); } catch {} }
    st.connected = false;
    connect();
  }
  function send(m) { if (st.ws && st.ws.readyState === 1) { st.ws.send(JSON.stringify(m)); return true; } toast('Connecting…'); return false; }
  function checkAlive() {
    if (!st.ws || st.ws.readyState > 1) { if (!st.ws || st.ws.readyState === 3) connect(); return; }
    if (st.ws.readyState !== 1) return;
    const sent = Date.now();
    st.ws.send('{"t":"ping"}');
    setTimeout(() => { if (document.visibilityState === 'visible' && (st.lastMsg || 0) < sent) forceReconnect(); }, 5000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAlive(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) checkAlive(); });
  window.addEventListener('online', checkAlive);
  setInterval(() => { if (document.visibilityState === 'visible') checkAlive(); }, 20000);

  function setUrl(code) {
    const u = code ? '/?r=' + code : '/';
    if (location.pathname + location.search !== u) history.replaceState(null, '', u);
  }

  // ---------------------------------------------------------------- screens
  function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id); }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function onState(view) {
    const prev = st.view;
    st.view = view;
    st.lastMsg = Date.now();
    if (st.pendingPlay) {
      const nb0 = view.board;
      const key = nb0 ? nb0.number + ':' + nb0.trickNo + ':' + nb0.trick.length : '';
      if (key !== st.pendingPlay.key || !nb0 || nb0.phase !== 'play') { st.pendingPlay = null; clearTimeout(st.playTimer); }
    }
    // trick collection animation
    const pb = prev && prev.board, nb = view.board;
    if (pb && nb && pb.number === nb.number && pb.trick.length === 4 && nb.trick.length < 4 && nb.lastTrick) {
      animateCollect(nb.lastTrick);
    }
    if (nb && pb && pb.number !== nb.number) { st.selLevel = null; st.explainIdx = null; closeSheet(); }
    render();
    if (nb && nb.phase === 'done' && st.resultShownFor !== nb.number && view.you) {
      st.resultShownFor = nb.number;
      setTimeout(() => openResult(), st.collecting ? 700 : 300);
    }
    if (st.sheetKind && st.sheetKind !== 'result') refreshSheet();
    if (st.sheetKind === 'result') refreshSheet();
  }

  function render() {
    const v = st.view;
    if (!st.code || !v) { show('home'); return; }
    if (!v.you) { renderSeatPick(); show('seatpick'); return; }
    show('table');
    renderTable();
  }

  // ---------------------------------------------------------------- home
  function initHome() {
    $('nameInput').value = store.name;
    segment('seatSeg', (v) => { st.homeSeat = v; });
    segment('partnerSeg', (v) => { st.homePartner = v; });
    segment('tipsSeg', (v) => { store.tips = v === '1'; });
    for (const b of $('tipsSeg').children) b.classList.toggle('on', b.dataset.v === (store.tips ? '1' : '0'));
    fetch('/api/systems').then((r) => r.json()).then((d) => {
      SYSTEMS = d.systems;
      const opts = SYSTEMS.map((x) => `<option value="${x.id}">${esc(x.name)}${x.beta ? ' (beta)' : ''}</option>`).join('');
      $('sysSel').innerHTML = opts;
      $('oppSel').innerHTML = '<option value="">Same as us</option>' + opts;
      $('sysSel').value = sysById(store.system) ? store.system : 'sayc';
      const sum = () => { const x = sysById($('sysSel').value); $('sysSum').textContent = x ? x.summary : ''; };
      $('sysSel').onchange = () => { store.system = $('sysSel').value; sum(); };
      sum();
    }).catch(() => {});
    $('createBtn').onclick = () => {
      const name = $('nameInput').value.trim();
      if (!name) { $('nameInput').focus(); toast('Enter your name'); return; }
      store.name = name;
      send({ t: 'create', name, seat: st.homeSeat, partner: st.homePartner, system: $('sysSel').value || 'sayc', oppSystem: $('oppSel').value || undefined });
    };
    $('joinBtn').onclick = () => {
      const code = $('codeInput').value.trim().toUpperCase();
      if (code.length < 4) { toast('Enter the table code'); return; }
      st.code = code; send({ t: 'join', code, token: store.tokens[code] });
    };
    $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
    $('spBack').onclick = () => { send({ t: 'leave' }); st.code = null; st.view = null; setUrl(null); show('home'); };
  }
  function segment(id, cb) {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      for (const x of el.children) x.classList.toggle('on', x === b);
      cb(b.dataset.v);
    });
  }

  function renderSeatPick() {
    const v = st.view;
    $('spCode').textContent = v.code;
    if (!$('spName').value) $('spName').value = store.name;
    const order = ['N', 'W', 'E', 'S'];
    $('spSeats').innerHTML = order.map((s) => {
      const x = v.seats.find((q) => q.seat === s);
      let sub, cls = '', dis = '';
      if (x.type === 'open') { sub = 'Open seat — tap to sit'; cls = 'open'; }
      else if (x.type === 'bot') sub = 'Computer — tap to replace';
      else { sub = esc(x.name) + (x.connected ? ' · online' : ' · away'); dis = 'disabled'; }
      return `<button class="seat-btn ${cls}" data-seat="${s}" ${dis}><b>${SEAT_NAME[s]}</b><small>${sub}</small></button>`;
    }).join('');
    for (const b of $('spSeats').querySelectorAll('.seat-btn')) b.onclick = () => {
      const name = $('spName').value.trim();
      if (!name) { $('spName').focus(); toast('Enter your name'); return; }
      store.name = name;
      send({ t: 'sit', seat: b.dataset.seat, name, token: store.tokens[v.code] });
    };
  }

  // ---------------------------------------------------------------- cards
  function cardHTML(c, extra = '') {
    const s = c[0], r = c[1] === 'T' ? '10' : c[1];
    const red = s === 'H' || s === 'D';
    const center = 'JQK'.includes(c[1]) ? `<span class="face">${r}</span>` : `<span class="pip">${SYM[s]}</span>`;
    return `<div class="card ${red ? 'red' : ''} ${extra}" data-card="${c}"><span class="ci"><span class="r">${r}</span><span class="s">${SYM[s]}</span></span>${center}</div>`;
  }
  function suitSpan(s) { return `<span class="suit-${s.toLowerCase()}">${SYM[s]}</span>`; }
  function callHTML(c) {
    if (c === 'P') return '<span class="p">Pass</span>';
    if (c === 'X') return '<span class="x">X</span>';
    if (c === 'XX') return '<span class="xx">XX</span>';
    return c[0] + (c[1] === 'N' ? '<span style="font-size:14px">NT</span>' : suitSpan(c[1]));
  }
  function contractHTML(ct) {
    if (!ct) return 'Passed out';
    return ct.level + (ct.strain === 'N' ? 'NT' : suitSpan(ct.strain)) + (ct.doubled === 2 ? 'XX' : ct.doubled ? 'X' : '');
  }
  function trickWinner(trick, trump) {
    let best = trick[0];
    for (const t of trick.slice(1)) {
      if (t.card[0] === best.card[0]) { if (rankOf(t.card) > rankOf(best.card)) best = t; }
      else if (trump !== 'N' && t.card[0] === trump) best = t;
    }
    return best.seat;
  }

  // ---------------------------------------------------------------- table
  function rel(seat) { return ['bottom', 'left', 'top', 'right'][(idx(seat) - idx(st.view.you) + 4) % 4]; }
  function seatInfo(s) { return st.view.seats.find((x) => x.seat === s); }
  function displayName(s) {
    const x = seatInfo(s);
    if (s === st.view.you) return 'You';
    if (x.type === 'open') return 'Open seat';
    return x.type === 'bot' ? SEAT_NAME[s] : x.name;
  }
  const vulText = (v) => ({ None: 'None vul', NS: 'N-S vul', EW: 'E-W vul', Both: 'All vul' }[v]);
  const isVul = (vul, s) => vul === 'Both' || vul === sideOf(s);

  function renderTable() {
    const v = st.view, b = v.board, you = v.you;
    // header
    $('hBoard').textContent = b ? b.number : '–';
    const vc = $('hVul');
    vc.textContent = b ? vulText(b.vul) : '—';
    vc.classList.toggle('v', !!b && isVul(b.vul, you));
    let mid = '<span class="muted">Waiting for players</span>';
    if (b) {
      if (b.phase === 'auction') mid = `<span class="muted">Dealer ${SEAT_NAME[b.dealer]}</span>`;
      else if (b.phase === 'play') mid = `${contractHTML(b.contract)} <span class="by">by ${SEAT_NAME[b.contract.declarer]}</span>`;
      else mid = b.result && b.result.passedOut ? 'Passed out' : `${contractHTML(b.contract)} <span class="by">${esc(resultShort(b))}</span>`;
    }
    const sy = (b && b.systems) || v.settings;
    if (sy) {
      const a = sysById(sy[sideOf(you)].id), o = sysById(sy[sideOf(you) === 'NS' ? 'EW' : 'NS'].id);
      if (a) mid = `<div class="mid-main">${mid}</div><div class="mid-sub"><span class="sys-chip" id="sysChip">${esc(a.short)}${o && o.id !== a.id ? ' v ' + esc(o.short) : ''}</span></div>`;
    }
    $('hContract').innerHTML = mid;
    const chip = $('sysChip'); if (chip) chip.onclick = openSystemCard;
    const ours = sideOf(you);
    $('hTricks').innerHTML = b && b.phase !== 'auction' && b.contract ? ['NS', 'EW'].map((s) => `<span class="${s === ours ? 'us' : ''}">${s === 'NS' ? 'NS' : 'EW'} ${b.tricksWon[s]}</span>`).join('') : '';

    // plates
    for (const s of SEATS) {
      const p = $('plate-' + rel(s));
      const x = seatInfo(s);
      const badges = [];
      if (b && b.dealer === s && b.phase === 'auction') badges.push('<span class="badge">D</span>');
      if (b && b.contract && b.phase !== 'auction') {
        if (b.contract.declarer === s) badges.push('<span class="badge">Decl</span>');
        if (b.dummy === s && !b.exposed) badges.push('<span class="badge" style="background:#cfe3d8">Dummy</span>');
      }
      const dot = x.type === 'bot' ? 'bot' : x.type === 'open' ? 'off' : x.connected ? '' : 'off';
      const cnt = b && b.phase === 'play' && s !== you && !(b.exposed && s === b.dummy) ? `<span class="cnt">${b.counts[s]}🂠</span>` : '';
      p.innerHTML = `<span class="seat">${s}</span><span class="dot ${dot}" title="${x.type === 'bot' ? 'Computer' : x.connected ? 'Online' : 'Offline'}"></span><span class="nm">${esc(displayName(s))}</span>${badges.join('')}${cnt}`;
      p.classList.toggle('turn', !!(b && b.turn === s && b.phase !== 'done'));
      p.classList.toggle('vul', !!(b && isVul(b.vul, s)));
    }

    const felt = document.querySelector('.felt');
    const auctionEl = $('auction'), trickEl = $('trick'), statusEl = $('status');
    if (!b) {
      auctionEl.classList.remove('show'); trickEl.classList.remove('show');
      $('dummyArea').classList.remove('show'); felt.classList.remove('with-dummy');
      statusEl.innerHTML = waitingHTML();
      bindWaiting();
      $('handArea').innerHTML = '';
      $('bidbox').classList.remove('show');
      return;
    }

    // the second hand shown on the table: dummy once it is face up, or (when you run the declaring
    // side for a computer partner) your partner's hand, which you play as well as your own
    const youPlay = b.youPlay || [];
    const otherMine = youPlay.length === 2 ? youPlay[1] : null;
    const topSeat = b.phase === 'play' ? (otherMine && b.hands[otherMine] ? otherMine : (b.exposed && b.dummy !== you && b.hands[b.dummy] ? b.dummy : null)) : null;
    felt.classList.toggle('with-dummy', !!topSeat);
    const da = $('dummyArea');
    if (topSeat) {
      const canPlay = b.turn === topSeat && !b.trickComplete && b.legalCards.length > 0;
      const label = topSeat === b.dummy ? `Dummy · ${SEAT_NAME[topSeat]}` : `Declarer · ${SEAT_NAME[topSeat]}`;
      const mineTxt = otherMine === topSeat ? ' · you play these cards' : '';
      setHTML(da, `<div class="dummy-label">${label}${mineTxt}</div>` + handHTML(b.hands[topSeat], canPlay ? b.legalCards : null, true));
      da.classList.add('show');
      da.classList.toggle('myturn', canPlay);
      sizeHand(da.querySelector('.hand'), b.hands[topSeat].length, true);
    } else { da.classList.remove('show', 'myturn'); setHTML(da, ''); }

    // center
    if (b.phase === 'auction') {
      auctionEl.classList.add('show'); trickEl.classList.remove('show');
      auctionEl.innerHTML = auctionHTML(b, true);
      bindAuction(auctionEl);
      const sc = auctionEl.querySelector('.auction-scroll'); if (sc) sc.scrollTop = sc.scrollHeight;
    } else {
      auctionEl.classList.remove('show');
      trickEl.classList.add('show');
      if (!st.collecting) renderTrick(b);
    }
    statusEl.innerHTML = statusHTML(b);
    if (b.phase === 'done') bindDoneStatus();

    // own hand
    const myHand = b.hands[you] || [];
    const myTurnCards = b.phase === 'play' && b.turn === you && !b.trickComplete && b.legalCards.length ? b.legalCards : null;
    const amDummy = b.phase === 'play' && b.dummy === you && youPlay.length === 0;
    setHTML($('handArea'), b.phase === 'done' ? '' : (amDummy ? '<div class="dummy-note">Your partner is declarer — you are dummy this hand. Your partner plays your cards.</div>' : '') + handHTML(myHand, myTurnCards, false));
    $('handArea').classList.toggle('myturn', !!myTurnCards);
    const he = $('handArea').querySelector('.hand');
    if (he) sizeHand(he, myHand.length, false);

    // bidding box + learning tips
    renderBidBox(b);
    renderTips(b);
  }

  // ---------------------------------------------------------------- learning tips
  function callWords(c) { return c === 'P' ? 'Pass' : c === 'X' ? 'Double' : c === 'XX' ? 'Redouble' : callHTML(c); }
  function cardWords(c) { return (c[1] === 'T' ? '10' : c[1]) + suitSpan(c[0]); }
  function renderTips(b) {
    const el = $('tipBar');
    const rows = [];
    st.hintCard = null;
    if (store.tips && b && b.phase !== 'done') {
      const fb = b.feedback;
      const fbKey = fb ? b.number + ':' + fb.idx : null;
      if (fb && !fb.ok && st.fbDismissed !== fbKey && b.phase === 'auction') {
        rows.push(`<div class="tip-row"><span class="tip-ico fb">!</span><div class="tip-txt">${esc(fb.text)}</div><button class="tip-btn ghost" data-a="fbx">OK</button></div>`);
      }
      if (b.phase === 'auction' && b.suggestion) {
        const sg = b.suggestion;
        rows.push(store.reveal
          ? `<div class="tip-row"><span class="tip-ico">?</span><div class="tip-txt"><b>Suggested (${esc(sg.system)}): ${callWords(sg.call)}</b> — ${esc(sg.text.replace(/^[^:]+:\s*/, ''))}</div><button class="tip-btn ghost" data-a="hide">Hide</button></div>`
          : `<div class="tip-row"><span class="tip-ico">?</span><div class="tip-txt tip-hidden">Decide your bid, then check the suggestion.</div><button class="tip-btn" data-a="show">Show hint</button></div>`);
      }
      if (b.phase === 'play' && b.playTip) {
        const pt = b.playTip;
        for (const n of pt.notes || []) rows.push(`<div class="tip-row"><span class="tip-ico">i</span><div class="tip-txt">${esc(n)}</div></div>`);
        if (store.reveal) {
          st.hintCard = pt.card;
          rows.push(`<div class="tip-row"><span class="tip-ico">?</span><div class="tip-txt">${esc(pt.text).replace(/(Suggested[^:]*:) (\S+)/, (m0, a) => `<b>${a} ${cardWords(pt.card)}</b>`)}</div><button class="tip-btn ghost" data-a="hide">Hide</button></div>`);
        } else rows.push(`<div class="tip-row"><span class="tip-ico">?</span><div class="tip-txt tip-hidden">Pick your card, or ask for a hint.</div><button class="tip-btn" data-a="show">Show hint</button></div>`);
      }
    }
    el.innerHTML = rows.join('');
    el.classList.toggle('show', rows.length > 0);
    for (const x of el.querySelectorAll('[data-a]')) x.onclick = () => {
      const a = x.dataset.a;
      if (a === 'show') store.reveal = true;
      if (a === 'hide') store.reveal = false;
      if (a === 'fbx') st.fbDismissed = b.number + ':' + b.feedback.idx;
      renderTable();
    };
    for (const c of document.querySelectorAll('.hand .card.hint')) c.classList.remove('hint');
    if (st.hintCard) for (const c of document.querySelectorAll(`.hand .card[data-card="${st.hintCard}"]`)) c.classList.add('hint');
  }

  function resultShort(b) {
    if (!b.result) return '';
    const d = b.result.diff;
    const t = d === 0 ? 'made' : d > 0 ? `+${d}` : `${d}`;
    const sc = b.result.nsScore;
    return `${b.contract.declarer} ${t} · NS ${sc > 0 ? '+' : ''}${sc}`;
  }

  function waitingHTML() {
    const v = st.view;
    const open = v.seats.filter((s) => s.type === 'open');
    return `<div class="waiting-card">
      <div style="font-weight:700">Table code</div>
      <div class="code">${esc(v.code)}</div>
      <div style="font-size:14px;color:#53625a">${open.length ? `Waiting for ${open.map((s) => SEAT_NAME[s.seat]).join(', ')} to join` : 'Starting…'}</div>
      <button class="btn primary" id="wShare">Invite partner</button>
      ${open.length ? '<button class="btn" id="wFill">Fill empty seats with computer</button>' : ''}
    </div>`;
  }
  function bindWaiting() {
    const s = $('wShare'); if (s) s.onclick = share;
    const f = $('wFill'); if (f) f.onclick = () => { for (const x of st.view.seats) if (x.type === 'open') send({ t: 'setSeat', seat: x.seat, mode: 'bot' }); };
  }

  function statusHTML(b) {
    const you = st.view.you;
    if (b.phase === 'auction') {
      if (b.turn === you) return '<span class="you">Your bid</span>';
      return `${esc(nameOrSeat(b.turn))} to bid…`;
    }
    if (b.phase === 'play') {
      if (b.trickComplete) return `Trick to ${esc(nameOrSeat(trickWinner(b.trick, b.contract.strain)))}`;
      const ctrl = b.controller;
      if (ctrl === you) {
        if (b.turn === you) return '<span class="you">Your turn — play from your hand</span>';
        return b.turn === b.dummy ? `<span class="you">Your turn — tap a card in dummy (${SEAT_NAME[b.turn]}) ▲</span>` : `<span class="you">Your turn — play from ${SEAT_NAME[b.turn]}'s hand ▲</span>`;
      }
      if (b.dummy === you && (b.turn === you || b.turn === b.contract.declarer)) return `You're dummy — ${esc(nameOrSeat(ctrl))} is playing${b.turn === you ? ' your cards' : ''}…`;
      if (b.turn === b.dummy) return `${esc(nameOrSeat(ctrl))} playing dummy…`;
      const x = seatInfo(b.turn);
      if (x.type === 'human' && !x.connected) return `Waiting for ${esc(x.name)} (offline)…`;
      if (x.type === 'open') return `${SEAT_NAME[b.turn]} seat is empty`;
      return `${esc(nameOrSeat(b.turn))} to play…`;
    }
    const me = seatInfo(you);
    return `<div style="margin-top:6px"><button class="btn primary" id="sNext">${me.ready ? 'Waiting for partner…' : 'Next deal'}</button> <button class="btn" id="sRes">Result</button></div>`;
  }
  function bindDoneStatus() {
    const n = $('sNext'); if (n) n.onclick = () => send({ t: 'ready' });
    const r = $('sRes'); if (r) r.onclick = openResult;
  }
  function nameOrSeat(s) { return s === st.view.you ? 'You' : displayName(s); }

  function handHTML(cards, legal, isDummy) {
    let prev = null;
    const html = cards.map((c) => {
      const cls = [];
      if (prev && prev !== c[0]) cls.push('gap');
      prev = c[0];
      if (legal) cls.push(legal.includes(c) ? 'legal' : 'dim');
      return cardHTML(c, cls.join(' '));
    }).join('');
    return `<div class="hand ${legal ? 'myturn' : ''} ${isDummy ? 'dummy' : ''}">${html}</div>`;
  }
  function sizeHand(el, n, isDummy) {
    if (!el || !n) return;
    const cw = parseFloat(getComputedStyle(el.querySelector('.card')).width) || 60;
    const avail = Math.min(window.innerWidth, 900) - 16;
    const gaps = new Set([...el.children].map((c) => c.dataset.card[0])).size - 1;
    let step = (avail - cw - gaps * 6) / Math.max(1, n - 1);
    step = Math.min(step, cw * (isDummy ? 0.72 : 0.68));
    el.style.setProperty('--ov', (step - cw).toFixed(1) + 'px');
  }
  // Only touch the DOM when the markup really changes, so a state push (or an iOS toolbar resize)
  // arriving mid-tap does not replace the card under the player's finger and swallow the tap.
  function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }
  // One delegated handler per hand container (they are never re-created), for taps on legal cards.
  function onCardTap(e) {
    const el = e.target.closest('.card');
    if (!el || !el.classList.contains('legal') || !el.closest('.hand.myturn')) return;
    const b = st.view && st.view.board;
    if (!b || b.phase !== 'play' || !b.legalCards.includes(el.dataset.card) || st.pendingPlay) return;
    if (!send({ t: 'play', card: el.dataset.card })) return;
    st.pendingPlay = { card: el.dataset.card, at: Date.now(), key: b.number + ':' + b.trickNo + ':' + b.trick.length };
    el.classList.add('leaving');
    // if no answer arrives the connection is probably dead (phone was asleep): reconnect and resync
    clearTimeout(st.playTimer);
    st.playTimer = setTimeout(() => { if (st.pendingPlay) { st.pendingPlay = null; forceReconnect(); } }, 4000);
  }
  $('handArea').addEventListener('click', onCardTap);
  $('dummyArea').addEventListener('click', onCardTap);

  function renderTrick(b) {
    const el = $('trick');
    el.className = 'trick show';
    const prevKeys = st.prevTrick;
    const winner = b.trickComplete ? trickWinner(b.trick, b.contract.strain) : null;
    el.innerHTML = b.trick.map((t) => cardHTML(t.card, `t-${rel(t.seat)} ${prevKeys.includes(t.card) ? '' : 'enter'} ${winner === t.seat ? 'win' : ''}`)).join('');
    st.prevTrick = b.trick.map((t) => t.card);
  }
  function animateCollect(last) {
    const el = $('trick');
    st.collecting = true;
    el.innerHTML = last.cards.map((t) => cardHTML(t.card, `t-${rel(t.seat)} ${t.seat === last.winner ? 'win' : ''}`)).join('');
    requestAnimationFrame(() => { el.classList.add('collect-' + rel(last.winner)); });
    setTimeout(() => {
      st.collecting = false; st.prevTrick = [];
      if (st.view && st.view.board) renderTrick(st.view.board);
    }, 380);
  }

  // ---------------------------------------------------------------- auction
  function auctionHTML(b, interactive) {
    const order = ['W', 'N', 'E', 'S'];
    const head = order.map((s) => `<th class="${isVul(b.vul, s) ? 'v' : ''}">${s}<span class="nm">${esc(s === st.view.you ? 'You' : displayName(s))}</span></th>`).join('');
    const cells = [];
    const start = order.indexOf(b.dealer);
    for (let i = 0; i < start; i++) cells.push('<td></td>');
    b.auction.forEach((a, i) => cells.push(`<td class="call ${st.explainIdx === i ? 'sel' : ''}" data-i="${i}">${callHTML(a.call)}</td>`));
    if (b.phase === 'auction') cells.push('<td class="q">?</td>');
    while (cells.length % 4) cells.push('<td></td>');
    let rows = '';
    for (let i = 0; i < cells.length; i += 4) rows += '<tr>' + cells.slice(i, i + 4).join('') + '</tr>';
    const ex = st.explainIdx != null && b.auction[st.explainIdx] ? b.auction[st.explainIdx] : null;
    const exText = ex ? `<b>${callHTML(ex.call)}</b> · ${SEAT_NAME[ex.seat]}: ${esc(ex.explain || 'Natural')}` : '<span style="color:#8a978f">Tap a bid to see what it means</span>';
    return `<div class="auction-scroll"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>${interactive ? `<div class="explain">${exText}</div>` : ''}`;
  }
  function bindAuction(el) {
    for (const td of el.querySelectorAll('td.call')) td.onclick = () => {
      st.explainIdx = +td.dataset.i === st.explainIdx ? null : +td.dataset.i;
      el.innerHTML = auctionHTML(st.view.board, true); bindAuction(el);
    };
  }

  function renderBidBox(b) {
    const bb = $('bidbox');
    const legal = b.legalCalls || [];
    if (!legal.length) { bb.classList.remove('show'); bb.innerHTML = ''; st.selLevel = null; return; }
    const levels = [1, 2, 3, 4, 5, 6, 7].filter((l) => legal.some((c) => c[0] === String(l)));
    if (!st.selLevel || !levels.includes(st.selLevel)) st.selLevel = levels[0] || null;
    const L = st.selLevel;
    const lv = [1, 2, 3, 4, 5, 6, 7].map((l) => `<button class="bb ${l === L ? 'sel' : ''}" data-l="${l}" ${levels.includes(l) ? '' : 'disabled'}>${l}</button>`).join('');
    const sv = ['C', 'D', 'H', 'S', 'N'].map((s) => {
      const call = L + s;
      return `<button class="bb st-${s.toLowerCase()}" data-c="${call}" ${legal.includes(call) ? '' : 'disabled'}>${s === 'N' ? 'NT' : suitSpan(s)}</button>`;
    }).join('');
    const calls = `<button class="bb pass" data-c="P">Pass</button><button class="bb dbl" data-c="X" ${legal.includes('X') ? '' : 'disabled'}>X</button><button class="bb rdbl" data-c="XX" ${legal.includes('XX') ? '' : 'disabled'}>XX</button>`;
    bb.innerHTML = `<div class="bb-row bb-levels">${lv}</div><div class="bb-row bb-strains">${sv}</div><div class="bb-row bb-calls">${calls}</div>`;
    bb.classList.add('show');
    for (const x of bb.querySelectorAll('[data-l]')) x.onclick = () => { st.selLevel = +x.dataset.l; renderBidBox(st.view.board); };
    for (const x of bb.querySelectorAll('[data-c]')) x.onclick = () => {
      if (x.disabled) return;
      bb.querySelectorAll('button').forEach((q) => { q.disabled = true; });
      send({ t: 'call', call: x.dataset.c });
    };
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(kind, html, bind) {
    const same = st.sheetKind === kind;
    st.sheetKind = kind;
    $('sheet').innerHTML = '<div class="grab"></div>' + html;
    if (!same) $('sheet').scrollTop = 0;
    $('sheetWrap').classList.add('show');
    if (bind) bind($('sheet'));
  }
  function closeSheet() { st.sheetKind = null; $('sheetWrap').classList.remove('show'); }
  $('sheetWrap').addEventListener('click', (e) => { if (e.target.id === 'sheetWrap') closeSheet(); });
  function refreshSheet() {
    const k = st.sheetKind;
    if (k === 'seats') openSeats();
    else if (k === 'score') openScore();
    else if (k === 'result') openResult(true);
    else if (k === 'auction') openAuction();
    else if (k === 'system') openSystem(true);
  }

  // ---------------------------------------------------------------- systems
  function openSystem(refresh) {
    const v = st.view; if (!v.settings) return;
    if (refresh && st.sysEditing) return; // don't clobber an open select
    const list = v.systemsList || SYSTEMS;
    const can = v.canChangeSystem;
    const b = v.board;
    const live = b && b.systems;
    const pending = live && JSON.stringify(live) !== JSON.stringify(v.settings);
    const ours = sideOf(v.you), theirs = ours === 'NS' ? 'EW' : 'NS';
    const sideBlock = (side, label) => {
      const cur = v.settings[side];
      const sys = list.find((x) => x.id === cur.id) || list[0];
      const conv = { ...sys.conv, ...(cur.convOverrides || {}) };
      const opts = list.map((x) => `<option value="${x.id}" ${x.id === cur.id ? 'selected' : ''}>${esc(x.name)}${x.beta ? ' (beta)' : ''}</option>`).join('');
      const toggles = Object.keys(v.conventions).map((k) => `<label class="conv-item"><span>${esc(v.conventions[k])}</span><span class="switch"><input type="checkbox" data-side="${side}" data-k="${k}" ${conv[k] ? 'checked' : ''} ${can ? '' : 'disabled'}><span></span></span></label>`).join('');
      return `<h3>${label}</h3><select class="sel" data-side="${side}" ${can ? '' : 'disabled'}>${opts}</select><p class="sys-sum">${esc(sys.summary)}${sys.beta ? ' <span class="beta">BETA</span>' : ''}</p>
        <details><summary style="font-size:14px;font-weight:700;padding:6px 0;cursor:pointer">Conventions</summary><div class="conv-list">${toggles}</div></details>`;
    };
    const html = `<h2>Bidding system</h2>
      <div class="note">${can ? (b && b.phase === 'auction' && b.auction.length === 0 ? 'Changes apply straight away (no one has bid yet).' : 'Changes apply from the next board.') : 'Only the player who created the table can change systems.'}${pending ? ' <b>A change is waiting for the next board.</b>' : ''}</div>
      ${sideBlock(ours, `Your side (${ours === 'NS' ? 'N-S' : 'E-W'})`)}
      ${sideBlock(theirs, `Opponents (${theirs === 'NS' ? 'N-S' : 'E-W'})`)}
      <div style="margin-top:14px"><button class="btn" id="openCard" style="width:100%">Open the system card</button></div>`;
    openSheet('system', html, (el) => {
      const push = (side) => {
        const sel = el.querySelector(`select[data-side="${side}"]`);
        const id = sel.value;
        const sys = list.find((x) => x.id === id);
        const conv = {};
        const same = id === v.settings[side].id;
        for (const cb of el.querySelectorAll(`input[data-side="${side}"]`)) if (same && cb.checked !== !!sys.conv[cb.dataset.k]) conv[cb.dataset.k] = cb.checked;
        send({ t: 'setSystem', [side]: { id, convOverrides: conv } });
      };
      for (const sel of el.querySelectorAll('select')) { sel.onfocus = () => { st.sysEditing = true; }; sel.onblur = () => { st.sysEditing = false; }; sel.onchange = () => { st.sysEditing = false; push(sel.dataset.side); toast('System updated'); }; }
      for (const cb of el.querySelectorAll('input[type=checkbox]')) cb.onchange = () => push(cb.dataset.side);
      el.querySelector('#openCard').onclick = openSystemCard;
    });
  }
  function openSystemCard() {
    const v = st.view; if (!v || !v.settings) return;
    const b = v.board;
    const sy = (b && b.systems) || v.settings;
    const ours = sideOf(v.you), theirs = ours === 'NS' ? 'EW' : 'NS';
    const list = v.systemsList || SYSTEMS;
    const block = (side, label) => {
      const x = list.find((q) => q.id === sy[side].id); if (!x) return '';
      const conv = { ...x.conv, ...(sy[side].convOverrides || {}) };
      const on = Object.keys(v.conventions).filter((k) => conv[k]).map((k) => v.conventions[k].split(' (')[0]);
      return `<h3>${label}: ${esc(x.name)}${x.beta ? '<span class="beta">BETA</span>' : ''}</h3><p class="sys-sum">${esc(x.summary)}</p>
        <div class="ref">${x.card.map(([h, items]) => `<h4>${esc(h)}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}
        <h4>Conventions on</h4><ul><li>${on.length ? on.map(esc).join(', ') : 'None (natural bidding)'}</li></ul></div>`;
    };
    openSheet('card', `<h2>System card</h2>${block(ours, 'Your side')}${sy[theirs].id !== sy[ours].id ? block(theirs, 'Opponents') : '<p class="note">Opponents play the same system.</p>'}`);
  }

  function openMenu() {
    const b = st.view && st.view.board;
    openSheet('menu', `<h2>Table ${esc(st.view.code)}</h2><div class="menu-list">
      <button class="btn" data-a="share">Invite partner (share link)</button>
      ${b && b.phase !== 'auction' ? '<button class="btn" data-a="auction">Show the auction</button>' : ''}
      ${b && b.lastTrick && b.phase === 'play' ? '<button class="btn" data-a="last">Last trick</button>' : ''}
      <button class="btn" data-a="score">Score sheet</button>
      <button class="btn" data-a="system">Bidding system &amp; conventions</button>
      <button class="btn" data-a="card">System card (quick reference)</button>
      <button class="btn" data-a="tips">Learning tips: ${store.tips ? 'On' : 'Off'}</button>
      <button class="btn" data-a="seats">Seats &amp; players</button>
      <button class="btn danger" data-a="leave">Leave table</button>
    </div>`, (el) => {
      for (const x of el.querySelectorAll('[data-a]')) x.onclick = () => {
        const a = x.dataset.a;
        if (a === 'share') share();
        if (a === 'auction') openAuction();
        if (a === 'last') openLastTrick();
        if (a === 'score') openScore();
        if (a === 'seats') openSeats();
        if (a === 'system') openSystem();
        if (a === 'card') openSystemCard();
        if (a === 'tips') { store.tips = !store.tips; toast(store.tips ? 'Learning tips on' : 'Learning tips off'); closeSheet(); renderTable(); }
        if (a === 'leave') { if (confirm('Leave this table? Your seat will be opened for someone else.')) { send({ t: 'leave' }); closeSheet(); st.code = null; st.view = null; setUrl(null); show('home'); } }
      };
    });
  }
  function openAuction() {
    const b = st.view.board; if (!b) return;
    openSheet('auction', `<h2>Auction</h2><div class="auction show" style="box-shadow:none;border:1px solid #e6ebe8">${auctionHTML(b, true)}</div>`, (el) => bindAuction(el.querySelector('.auction')));
  }
  function openLastTrick() {
    const b = st.view.board; if (!b || !b.lastTrick) return;
    const t = b.lastTrick;
    openSheet('last', `<h2>Last trick</h2><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">${t.cards.map((c) => `<div style="text-align:center">${cardHTML(c.card, c.seat === t.winner ? 'win' : '')}<div style="font-size:12px;margin-top:4px;font-weight:700">${SEAT_NAME[c.seat]}</div></div>`).join('')}</div><p style="text-align:center;color:#53625a">Won by ${SEAT_NAME[t.winner]}</p>`);
  }
  function openScore() {
    const v = st.view;
    const rows = v.history.slice().reverse().map((h) => `<tr><td>${h.number}</td><td>${h.contract === 'Pass' ? 'Passed out' : esc(h.contract.replace('NT', 'NT')) + ' ' + h.declarer}</td><td>${h.contract === 'Pass' ? '' : esc(h.text.split(' ').pop())}</td><td class="n">${h.nsScore > 0 ? h.nsScore : ''}</td><td class="n">${h.nsScore < 0 ? -h.nsScore : ''}</td></tr>`).join('');
    openSheet('score', `<h2>Score sheet</h2><table class="score-table"><thead><tr><th>Bd</th><th>Contract</th><th>Res</th><th class="n">N-S</th><th class="n">E-W</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="color:#8a978f">No boards finished yet</td></tr>'}</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${v.totals.NS}</td><td class="n">${v.totals.EW}</td></tr></tfoot></table>`);
  }
  function openSeats() {
    const v = st.view;
    const rows = SEATS.map((s) => {
      const x = seatInfo(s);
      let status = x.type === 'bot' ? 'Computer' : x.type === 'open' ? 'Open' : `${esc(x.name)} · ${x.connected ? 'online' : 'offline'}`;
      let action = '';
      if (s !== v.you) {
        if (x.type === 'open') action = `<button class="btn" data-s="${s}" data-m="bot">Use computer</button>`;
        else if (x.type === 'bot') action = `<button class="btn" data-s="${s}" data-m="open">Open for a player</button>`;
        else if (!x.connected) action = `<button class="btn" data-s="${s}" data-m="bot">Replace with computer</button>`;
      }
      return `<div class="seat-row"><div><b>${SEAT_NAME[s]}${s === v.you ? ' (you)' : ''}</b><div style="font-size:13px;color:#5c6b63">${status}</div></div>${action}</div>`;
    }).join('');
    openSheet('seats', `<h2>Seats</h2>${rows}<h3>Invite link</h3><div class="share-box"><span style="flex:1">${esc(inviteLink())}</span><button class="btn" id="cpy">Copy</button></div>`, (el) => {
      for (const x of el.querySelectorAll('[data-s]')) x.onclick = () => send({ t: 'setSeat', seat: x.dataset.s, mode: x.dataset.m });
      el.querySelector('#cpy').onclick = share;
    });
  }
  function handDiagram(hands, s) {
    const h = hands[s] || [];
    const lines = ['S', 'H', 'D', 'C'].map((su) => {
      const cs = h.filter((c) => c[0] === su).sort((a, b) => rankOf(b) - rankOf(a)).map((c) => (c[1] === 'T' ? '10' : c[1])).join(' ');
      return `<div class="sl">${suitSpan(su)} ${cs || '—'}</div>`;
    }).join('');
    return `<div class="dd dd-${s.toLowerCase()}"><div class="who">${SEAT_NAME[s]}${s === st.view.you ? ' (you)' : ''}</div>${lines}</div>`;
  }
  function openResult(refresh) {
    const v = st.view, b = v.board;
    if (!b || b.phase !== 'done') { if (refresh) closeSheet(); return; }
    const r = b.result;
    let head;
    if (r.passedOut) head = `<div class="big">Passed out</div><div class="score">0</div>`;
    else {
      const ours = sideOf(v.you);
      const ourScore = ours === 'NS' ? r.nsScore : -r.nsScore;
      const d = r.diff;
      head = `<div class="big">${contractHTML(b.contract)} by ${SEAT_NAME[b.contract.declarer]}</div>
        <div style="color:#53625a">${r.tricks} tricks · ${d === 0 ? 'made exactly' : d > 0 ? `made with ${d} overtrick${d > 1 ? 's' : ''}` : `down ${-d}`}</div>
        <div class="score ${ourScore >= 0 ? 'pos' : 'neg'}">${ourScore >= 0 ? '+' : ''}${ourScore} to your side</div>`;
    }
    const me = seatInfo(v.you);
    const humans = v.seats.filter((s) => s.type === 'human' && s.connected);
    const readyTxt = humans.length > 1 ? humans.map((s) => `${esc(s.seat === v.you ? 'You' : s.name)}: ${s.ready ? 'ready' : 'reviewing'}`).join(' · ') : '';
    openSheet('result', `<div class="result-head">${head}</div>
      <div class="deal-diagram">${['N', 'W', 'E', 'S'].map((s) => handDiagram(b.hands, s)).join('')}<div class="dd-c">Board ${b.number}<br>${vulText(b.vul)}<br>Dealer ${b.dealer}</div></div>
      <div class="auction show" style="box-shadow:none;border:1px solid #e6ebe8;margin-bottom:12px">${auctionHTML(b, false)}</div>
      <div style="display:flex;gap:8px"><button class="btn primary big" style="flex:1" id="rNext" ${me.ready ? 'disabled' : ''}>${me.ready ? 'Waiting for partner…' : 'Next deal'}</button><button class="btn big" id="rScore">Scores</button></div>
      <div class="ready-list">${readyTxt}</div>
      <div style="text-align:center;margin-top:8px;font-size:13px;color:#53625a">Running total · N-S ${v.totals.NS} · E-W ${v.totals.EW}</div>`, (el) => {
      el.querySelector('#rNext').onclick = () => { send({ t: 'ready' }); };
      el.querySelector('#rScore').onclick = openScore;
    });
  }

  function inviteLink() { return location.origin + '/?r=' + st.view.code; }
  async function share() {
    const url = inviteLink();
    const text = `Join my bridge table (code ${st.view.code})`;
    if (navigator.share) { try { await navigator.share({ title: 'Bridge Club', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { prompt('Copy this link', url); }
  }

  $('menuBtn').onclick = openMenu;
  window.addEventListener('resize', () => {
    // just re-fit the cards; a full re-render here could swallow a tap on iOS (toolbar show/hide fires resize)
    for (const [id, dummy] of [['handArea', false], ['dummyArea', true]]) { const h = $(id).querySelector('.hand'); if (h) sizeHand(h, h.children.length, dummy); }
  });

  // ---------------------------------------------------------------- boot
  initHome();
  const params = new URLSearchParams(location.search);
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]+)/);
  const code = (params.get('r') || (m && m[1]) || '').toUpperCase();
  if (code) st.code = code;
  render();
  connect();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.__bridge = st; // for automated tests
})();
