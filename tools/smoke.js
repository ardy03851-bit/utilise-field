/* tools/smoke.js — headless browser smoke test.
   Serves the game, loads it, captures console errors and screenshots.
   Usage: node tools/smoke.js [screenshot-name] [url-path] [wait-ms] [clicks-json]
   Clicks JSON: array of {x, y, delay} in CSS pixels, applied after load. */

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.md': 'text/plain',
};

const server = http.createServer((req, res) => {
  let file = req.url.split('?')[0];
  if (file === '/') file = '/index.html';
  const p = path.join(root, file);
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const [name, urlPath = '/', waitMs = '4000', clicksJson = '[]', evalExpr = ''] = process.argv.slice(2);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/user/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--enable-webgl', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); else logs.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.goto(`http://localhost:${port}${urlPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(parseInt(waitMs));
  for (const c of JSON.parse(clicksJson)) {
    if (c.eval) { try { await page.evaluate(c.eval); } catch (e) { console.log('EVALSTEP ERROR:', e.message); } }
    else await page.mouse.click(c.x, c.y);
    if (c.delay) await page.waitForTimeout(c.delay);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, `shot-${name || 'boot'}.png`) });
  console.log('--- console errors/warnings ---');
  console.log(errors.slice(0, 20).join('\n---\n') || '(none)');
  console.log('--- logs ---');
  console.log(logs.slice(0, 10).join('\n') || '(none)');
  if (evalExpr) {
    try { console.log('--- eval ---'); console.log(await page.evaluate(evalExpr)); }
    catch (e) { console.log('EVAL ERROR:', e.message); }
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
