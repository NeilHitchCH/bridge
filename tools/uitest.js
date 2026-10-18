// Browser (iPhone-emulated, touch) check: solo table, the human taps cards for both declaring hands.
const { chromium, devices } = require('playwright');
const { startServer } = require('../server');
(async () => {
  const srv = await startServer({ port: 0, dataFile: null, botDelay: 30, bidDelay: 30, trickPause: 120 });
  const base = process.env.BASE || `http://localhost:${srv.port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exit(1); });
  await page.goto(base + '/');
  await page.fill('#nameInput', 'Neil');
  await page.tap('#partnerSeg [data-v="bot"]');
  await page.tap('#createBtn');
  const facts = { self: 0, partner: 0, tapsOwn: 0, tapsTop: 0, boards: 0, shots: [] };
  const seenDecl = new Set();
  for (let i = 0; i < 12000 && facts.boards < 30 && !(facts.self && facts.partner && facts.boards >= 2); i++) {
    const v = await page.evaluate(() => window.__bridge.view);
    const b = v && v.board;
    if (!b) { await page.waitForTimeout(100); continue; }
    if (b.phase === 'auction') {
      if (!b.legalCalls.length) { await page.waitForTimeout(60); continue; }
      const ourBid = b.auction.some((a) => (a.seat === 'S' || a.seat === 'N') && /^[1-7]/.test(a.call));
      let call = 'P';
      if (b.number % 2 && !ourBid) call = b.legalCalls.find((c) => /^[1-7]N$/.test(c)) || 'P';
      if (call !== 'P') await page.tap(`#bidbox [data-l="${call[0]}"]`);
      await page.tap(`#bidbox [data-c="${call}"]`);
      await page.waitForTimeout(80);
      continue;
    }
    if (b.phase === 'play') {
      const ours = b.contract.declarer === 'S' || b.contract.declarer === 'N';
      if (ours && !seenDecl.has(b.number)) { seenDecl.add(b.number); b.contract.declarer === 'S' ? facts.self++ : facts.partner++; }
      if (!b.legalCards.length || b.trickComplete) { await page.waitForTimeout(50); continue; }
      const top = b.turn !== 'S';
      if (top && !(ours && b.youPlay.includes(b.turn))) throw new Error('legal cards for a hand we do not play');
      const sel = top ? '#dummyArea.myturn .hand.myturn .card.legal' : '#handArea .hand.myturn .card.legal';
      const status = await page.textContent('#status');
      if (!/Your turn/.test(status)) throw new Error('status does not say it is our turn: ' + status);
      if (top && facts.shots.length < 2 && b.trick.length) { const f = `screenshots/11-play-${b.turn === b.dummy ? 'dummy' : 'declarer'}-hand.png`; if (!facts.shots.includes(f)) { await page.screenshot({ path: f }); facts.shots.push(f); } }
      const els = await page.$$(sel);
      if (!els.length) throw new Error('no tappable card in ' + sel);
      await els[els.length - 1].tap();
      top ? facts.tapsTop++ : facts.tapsOwn++;
      await page.waitForFunction((n) => { const x = window.__bridge.view.board; return !x || x.phase !== 'play' || (x.trickNo * 4 + x.trick.length) !== n; }, b.trickNo * 4 + b.trick.length, { timeout: 5000 }).catch(async () => { await page.screenshot({ path: '/tmp/fail.png' }); console.log(JSON.stringify(await page.evaluate(() => ({ p: window.__bridge.pendingPlay, b: window.__bridge.view.board.legalCards, turn: window.__bridge.view.board.turn, st: document.getElementById('status').textContent, toast: document.getElementById('toast').textContent })))); throw new Error('tap did not play a card ' + sel); });
      continue;
    }
    if (b.phase === 'done') {
      if (b.contract && (b.contract.declarer === 'N') && !facts.shots.includes('dn')) {}
      facts.boards++;
      await page.waitForTimeout(400);
      await page.evaluate(() => { const n = document.getElementById('rNext') || document.getElementById('sNext'); n && n.click(); });
      await page.waitForFunction((n) => { const x = window.__bridge.view.board; return x && x.number !== n; }, b.number, { timeout: 8000 });
    }
  }
  console.log('ui test', JSON.stringify(facts));
  if (!facts.self || !facts.partner || !facts.tapsTop) { console.error('UI TEST FAILED: scenarios not covered'); process.exit(1); }
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error('UI TEST FAILED', e.message); process.exit(1); });
