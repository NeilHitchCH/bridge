// Browser check of 1.2.0 UI: partner/opponent labels, practice view toggle, hand review.
const { chromium, devices } = require('playwright');
const { startServer } = require('../server');
(async () => {
  const srv = await startServer({ port: 0, dataFile: null, botDelay: 5, bidDelay: 5, trickPause: 30, playMs: 30 });
  const base = `http://localhost:${srv.port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exit(1); });
  await page.addInitScript(() => localStorage.setItem('bridge.introSeen', '1'));
  await page.goto(base + '/');
  await page.fill('#nameInput', 'Neil');
  await page.tap('#partnerSeg [data-v="bot"]');
  await page.tap('#createBtn');
  await page.waitForSelector('#plate-top .role-partner');
  if (!(await page.$('#plate-left .role-opp')) || !(await page.$('#plate-top.ours'))) throw new Error('role labels missing');
  await page.tap('#menuBtn');
  await page.tap('[data-a="practice"]');
  await page.waitForSelector('#practiceBar.show', { timeout: 5000 });
  await page.screenshot({ path: 'screenshots/12-practice-view.png' });
  // play the board out quickly: pass every bid, play the first legal card
  for (let i = 0; i < 3000; i++) {
    const b = await page.evaluate(() => window.__bridge.view.board);
    if (b.phase === 'done') break;
    if (b.phase === 'auction' && b.legalCalls.length) { await page.tap('#bidbox [data-c="P"]'); await page.waitForTimeout(40); continue; }
    if (b.phase === 'play' && b.legalCards.length && !b.trickComplete) {
      const els = await page.$$('.hand.myturn .card.legal'); if (els.length) await els[els.length - 1].tap(); await page.waitForTimeout(40); continue;
    }
    await page.waitForTimeout(40);
  }
  await page.waitForSelector('#rReview', { timeout: 10000 });
  await page.tap('#rReview');
  await page.waitForSelector('.rv-nav', { timeout: 5000 });
  await page.screenshot({ path: 'screenshots/13-hand-review.png', fullPage: false });
  const trickRows = await page.$$eval('.rv-play tbody tr', (r) => r.length).catch(() => 0);
  console.log('ui2 OK, review trick rows:', trickRows);
  await browser.close(); await srv.close(); process.exit(0);
})().catch((e) => { console.error('UI2 FAILED', e.message); process.exit(1); });
