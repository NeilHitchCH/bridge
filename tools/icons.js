// Generates PWA icons from an original SVG design using headless Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const svg = (maskable) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1a7a53"/><stop offset=".65" stop-color="#0b4a33"/><stop offset="1" stop-color="#062a1d"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d98a"/><stop offset="1" stop-color="#b8943c"/></linearGradient></defs>
<rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="url(#g)"/>
<g transform="translate(256 262) scale(${maskable ? 0.78 : 1}) translate(-256 -262)">
<g transform="rotate(-12 256 280)"><rect x="128" y="120" width="190" height="270" rx="22" fill="#fff" stroke="#d9d4c4" stroke-width="3"/>
<text x="150" y="182" font-family="Georgia,serif" font-weight="700" font-size="56" fill="#d3172f">A</text><text x="223" y="330" font-size="120" text-anchor="middle" fill="#d3172f" font-family="Arial">♥</text></g>
<g transform="rotate(10 256 280)"><rect x="196" y="122" width="190" height="270" rx="22" fill="#fff" stroke="#d9d4c4" stroke-width="3"/>
<text x="218" y="184" font-family="Georgia,serif" font-weight="700" font-size="56" fill="#111418">A</text><text x="291" y="334" font-size="128" text-anchor="middle" fill="#111418" font-family="Arial">♠</text></g>
<rect x="150" y="408" width="212" height="12" rx="6" fill="url(#gold)"/>
</g></svg>`;
(async () => {
  fs.mkdirSync('public/icons', { recursive: true });
  fs.writeFileSync('public/icons/icon.svg', svg(false));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['apple-touch-icon.png', 180, true], ['icon-maskable-512.png', 512, true]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(mask).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: 'public/icons/' + name, omitBackground: !mask });
  }
  await browser.close();
  console.log('icons done');
})();
