/**
 * measure.mjs — automated layout diagnostics for the manager pages.
 *
 * Pairs with screenshot.mjs. Screenshots show what a layout looks like; this
 * reports what it *measures*, which catches overflow and collapsed elements
 * that are easy to miss by eye.
 *
 * Per page and width it reports:
 *   - horizontal overflow (scrollWidth > clientWidth)
 *   - any element extending past the right edge
 *   - the width of key elements, so a collapsed one shows up as ~0
 *
 * Usage:
 *   BING_EMAIL=... BING_PASSWORD=... node scripts/measure.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API = process.env.BING_API || 'http://127.0.0.1:5000/api';
const APP = process.env.BING_APP || 'http://localhost:5173';
const EMAIL = process.env.BING_EMAIL;
const PASSWORD = process.env.BING_PASSWORD;
const PORT = 9334;

const WIDTHS = [390, 768, 1440, 2560];
const ROUTES = [
  ['dashboard', '/manager/dashboard'],
  ['sales', '/manager/sales'],
  ['menu', '/manager/menu'],
  ['kitchen', '/manager/kitchen'],
  ['stocks', '/manager/stocks'],
  ['delivery', '/manager/delivery'],
];

if (!EMAIL || !PASSWORD) {
  console.error('Set BING_EMAIL and BING_PASSWORD.');
  process.exit(1);
}

/* ── login ───────────────────────────────────────────────────────────────── */
const res = await fetch(`${API}/auth/staff/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!res.ok) { console.error(`login failed: ${res.status}`); process.exit(1); }
const session = await res.json();
console.log(`logged in as ${session.user.email}\n`);

/* ── launch ──────────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), 'bingnondo-edge-m-'));
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });
const kill = () => { try { edge.kill(); } catch {} };
process.on('exit', kill);

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
}
if (!wsUrl) { console.error('debug port never opened'); kill(); process.exit(1); }

/* ── cdp ─────────────────────────────────────────────────────────────────── */
let id = 0;
const pending = new Map();
const ws = new WebSocket(wsUrl);
await new Promise((res2, rej) => { ws.onopen = res2; ws.onerror = rej; });
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  setTimeout(() => { if (pending.has(n)) { pending.delete(n); reject(new Error(`${method} timeout`)); } }, 30000);
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (m, p) => send(m, p, sessionId);
await cdp('Page.enable');
await cdp('Runtime.enable');

await cdp('Page.navigate', { url: `${APP}/login` });
await sleep(1200);
await cdp('Runtime.evaluate', {
  expression: `
    localStorage.setItem('bingnondo_access_token', ${JSON.stringify(session.accessToken)});
    localStorage.setItem('bingnondo_refresh_token', ${JSON.stringify(session.refreshToken)});
    localStorage.setItem('bingnondo_user', ${JSON.stringify(JSON.stringify({
      id: session.user.id, full_name: session.user.full_name,
      email: session.user.email, role: session.user.role, status: session.user.status,
    }))});
    'ok'`,
});

/* The probe: measure overflow and key element widths in one round trip. */
const PROBE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const overflowing = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Right edge past the viewport by more than a rounding error.
    if (r.right > vw + 1) {
      // Ignore nodes inside a deliberate horizontal scroller.
      let p = el, inScroller = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) { inScroller = true; break; }
        p = p.parentElement;
      }
      if (!inScroller) {
        overflowing.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
          right: Math.round(r.right), width: Math.round(r.width),
        });
      }
    }
  }
  const w = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect(); return Math.round(r.width); };
  return JSON.stringify({
    vw,
    scrollWidth: de.scrollWidth,
    hOverflow: de.scrollWidth > de.clientWidth + 1,
    mainWidth: w('.ml-main'),
    contentWidth: w('.ml-main > *'),
    switcher: w('.ml-topbar .ds-wrap'),
    brand: w('.ml-topbar__brand'),
    conn: w('.ml-topbar .ml-conn'),
    burger: w('.ml-topbar__menu'),
    overflowing: overflowing.slice(0, 6),
  });
})()`;

const rows = [];
for (const [name, route] of ROUTES) {
  for (const width of WIDTHS) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: width <= 480,
    });
    await cdp('Page.navigate', { url: `${APP}${route}` });
    await sleep(1600);
    let probe = null;
    try {
      const r = await cdp('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      probe = JSON.parse(r.result.value);
    } catch (e) { probe = { error: e.message }; }
    rows.push({ name, width, ...probe });
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */
console.log('page       width  overflow  main   content  switcher brand conn burger');
for (const r of rows) {
  if (r.error) { console.log(`${r.name.padEnd(10)} ${String(r.width).padEnd(6)} ERROR ${r.error}`); continue; }
  console.log(
    `${r.name.padEnd(10)} ${String(r.width).padEnd(6)} ${(r.hOverflow ? 'YES ' + r.scrollWidth : 'no').padEnd(9)} ` +
    `${String(r.mainWidth).padEnd(6)} ${String(r.contentWidth).padEnd(8)} ` +
    `${String(r.switcher ?? '-').padEnd(9)} ${String(r.brand ?? '-').padEnd(5)} ` +
    `${String(r.conn ?? '-').padEnd(4)} ${r.burger ?? '-'}`
  );
}

const anyOverflow = rows.filter((r) => !r.error && r.overflowing?.length);
console.log('\n--- elements past the right edge (excluding deliberate scrollers) ---');
if (!anyOverflow.length) console.log('none');
for (const r of anyOverflow) {
  console.log(`  ${r.name} @${r.width}:`);
  for (const o of r.overflowing) console.log(`     ${o.sel}  right=${o.right} w=${o.width}`);
}

kill();
process.exit(0);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }