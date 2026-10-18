// Headless iPhone-viewport screenshots of lobby, bidding and play screens.
const { chromium, devices } = require('playwright');
const { startServer } = require('../server');
const B = require('../src/bidding');
const out = __dirname + '/../screenshots/';
(async () => {
  const srv = await startServer({ port: 0, dataFile: null, botDelay: 250, bidDelay: 200, trickPause: 600 });
  const base = process.env.BASE || `http://localhost:${srv.port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent });
  await ctx.addInitScript(() => { localStorage.setItem('bridge.reveal', '1'); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  await page.goto(base + '/');
  await page.fill('#nameInput', 'Neil');
  await page.waitForFunction(() => document.querySelectorAll('#sysSel option').length > 3);
  await page.screenshot({ path: out + '01-lobby.png' });
  // invite-a-friend flow: waiting screen
  await page.click('#createBtn');
  await page.waitForSelector('.waiting-card');
  await page.screenshot({ path: out + '02-waiting-for-partner.png' });
  const code = await page.evaluate(() => window.__bridge.view.code);
  // partner joins from a second phone
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto(base + '/?r=' + code);
  await p2.waitForSelector('#seatpick.active');
  await p2.fill('#spName', 'Partner');
  await p2.screenshot({ path: out + '03-partner-seat-picker.png' });
  await p2.click('.seat-btn.open');
  await page.waitForSelector('#bidbox.show, .auction.show', { timeout: 15000 });
  // drive both humans with the computer's own choices until we have screenshots
  const st = { done: false };
  const drive = async (pg, shotBid, shotPlay) => {
    let bidShot = false, playShot = false, fbShot = !shotBid;
    for (let i = 0; i < 2000; i++) {
      const v = await pg.evaluate(() => window.__bridge.view);
      const b = v.board;
      if (!b) { await pg.waitForTimeout(200); continue; }
      if (b.phase === 'auction' && b.legalCalls.length) {
        if (shotBid && !bidShot && b.auction.length >= 1 && b.suggestion) { await pg.waitForSelector('#tipBar.show'); await pg.waitForTimeout(300); await pg.screenshot({ path: out + shotBid }); bidShot = true; }
        let call = B.chooseCall(b.hands[v.you], v.you, b.dealer, b.auction.map((a) => ({ seat: a.seat, call: a.call })), { systems: b.systems });
        let deviate = false;
        if (!fbShot && bidShot && call !== 'P' && b.legalCalls.includes('P') && b.auction.length < 6) { call = 'P'; deviate = true; }
        if (call.length === 2 && call !== 'XX') { await pg.click(`.bb[data-l="${call[0]}"]`); }
        await pg.click(`.bb[data-c="${call}"]`);
        await pg.waitForTimeout(150);
        if (deviate) { await pg.waitForFunction(() => window.__bridge.view.board.feedback && !window.__bridge.view.board.feedback.ok, null, { timeout: 5000 }).catch(() => {}); await pg.waitForTimeout(500); await pg.screenshot({ path: out + '04b-bid-feedback.png' }); fbShot = true; }
        continue;
      }
      if (b.phase === 'play' && b.legalCards.length) {
        if (shotPlay && !playShot && b.trickNo >= 2 && b.trick.length >= 1 && b.playTip) { await pg.waitForTimeout(400); await pg.screenshot({ path: out + shotPlay }); playShot = true; }
        const card = b.playTip && b.legalCards.includes(b.playTip.card) ? b.playTip.card : b.legalCards[0];
        await pg.click(`.card.legal[data-card="${card}"]`, { position: { x: 8, y: 22 } });
        await pg.waitForTimeout(150);
        continue;
      }
      if (b.phase === 'done') {
        if (shotPlay ? playShot : st.done) return true;
        const me = v.seats.find((x) => x.seat === v.you);
        if (!me.ready) { await pg.evaluate(() => document.querySelector('#rNext') && document.querySelector('#rNext').click()); }
        await pg.waitForTimeout(300); continue;
      }
      await pg.waitForTimeout(120);
    }
    return false;
  };
  const [ok1] = await Promise.all([drive(page, '04-bidding.png', '05-play.png').then((r) => { st.done = true; return r; }), drive(p2, null, null)]);
  await page.waitForSelector('.sheet-wrap.show', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: out + '06-result.png' });
  await page.click('#rScore').catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '07-score-sheet.png' });
  // system settings + system card
  await page.evaluate(() => { document.querySelector('#sheetWrap').click(); });
  await page.waitForTimeout(300);
  await page.click('#menuBtn'); await page.waitForTimeout(250);
  await page.click('[data-a="system"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { const d = document.querySelector('#sheet details'); if (d) d.open = true; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '09-system-settings.png' });
  await page.click('#openCard'); await page.waitForTimeout(300);
  await page.screenshot({ path: out + '10-system-card.png' });
  // desktop check
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p3 = await ctx3.newPage();
  await p3.goto(base + '/');
  await p3.screenshot({ path: out + '08-desktop-lobby.png' });
  console.log('board finished:', ok1);
  await browser.close(); await srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
