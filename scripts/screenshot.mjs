/**
 * screenshot.mjs — capture the manager pages at several viewport widths.
 *
 * Zero dependencies on purpose: Node 24 ships global fetch AND a global
 * WebSocket, so this drives the installed Edge directly over the Chrome
 * DevTools Protocol instead of pulling in Playwright/Puppeteer.
 *
 * Why a script at all: the manager pages sit behind a login, so a plain
 * `msedge --headless --screenshot` would photograph the login screen. This
 * logs in via the real API, plants the session in localStorage on the app's
 * origin, then navigates and captures.
 *
 * Usage:
 *   BING_EMAIL=... BING_PASSWORD=... node scripts/screenshot.mjs
 *
 * Reads credentials from the environment — never from this file, and never
 * writes them anywhere.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const API = process.env.BING_API || 'http://127.0.0.1:5000/api';
const APP = process.env.BING_APP || 'http://localhost:5173';
const EMAIL = process.env.BING_EMAIL;
const PASSWORD = process.env.BING_PASSWORD;
const OUT = process.env.BING_OUT || join(tmpdir(), 'bingnondo-shots');
const PORT = 9333;

// [label, route, width, height] — 2560 is included because it settles the
// "empty panel on the right" question on Sales Reports empirically.
const SHOTS = [
  ['dashboard', '/manager/dashboard', 1440, 900],
  ['dashboard', '/manager/dashboard', 390, 844],
  ['sales', '/manager/sales', 1440, 900],
  ['sales', '/manager/sales', 2560, 1200],
  ['sales', '/manager/sales', 768, 1024],
  ['sales', '/manager/sales', 390, 844],
  ['menu', '/manager/menu', 1440, 900],
  ['menu', '/manager/menu', 390, 844],
  ['kitchen', '/manager/kitchen', 1440, 900],
  ['kitchen', '/manager/kitchen', 390, 844],
  ['stocks', '/manager/stocks', 1440, 900],
  ['stocks', '/manager/stocks', 390, 844],
  ['delivery', '/manager/delivery', 1440, 900],
  ['delivery', '/manager/delivery', 390, 844],
];

if (!EMAIL || !PASSWORD) {
  console.error('Set BING_EMAIL and BING_PASSWORD (environment variables).');
  process.exit(1);
}

/* ── 1. Log in for real ─────────────────────────────────────────────────── */
const loginRes = await fetch(`${API}/auth/staff/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  process.exit(1);
}
const session = await loginRes.json();
console.log(`logged in as ${session.user.email} (${session.user.role})`);

const user = {
  id: session.user.id,
  full_name: session.user.full_name,
  email: session.user.email,
  role: session.user.role,
  status: session.user.status,
};

/* ── 2. Launch a private headless Edge ──────────────────────────────────── */
// A separate --user-data-dir is required whenever Edge is already running on
// the machine: otherwise the new process just forwards to the open window and
// exits without ever binding the debug port.
const profile = mkdtempSync(join(tmpdir(), 'bingnondo-edge-'));
const edge = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const cleanup = () => { try { edge.kill(); } catch {} };
process.on('exit', cleanup);

/* ── 3. Wait for the debug port ─────────────────────────────────────────── */
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    wsUrl = v.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) {
  console.error('Edge debug port never opened.');
  cleanup();
  process.exit(1);
}

/* ── 4. Minimal CDP client ──────────────────────────────────────────────── */
let msgId = 0;
const pending = new Map();
const events = [];

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) {
    events.push(msg.method);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} timed out`)); }
    }, 30000);
  });

// Attach to a fresh tab and talk to it over a flattened session.
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => send(method, params, sessionId);

await cdp('Page.enable');
await cdp('Runtime.enable');

/* ── 5. Plant the session on the app's origin ───────────────────────────── */
// Must happen on the app origin or localStorage writes are discarded.
await cdp('Page.navigate', { url: `${APP}/login` });
await waitFor(cdp, () => 'document.readyState', 'complete');
await cdp('Runtime.evaluate', {
  expression: `
    localStorage.setItem('bingnondo_access_token', ${JSON.stringify(session.accessToken)});
    localStorage.setItem('bingnondo_refresh_token', ${JSON.stringify(session.refreshToken)});
    localStorage.setItem('bingnondo_user', ${JSON.stringify(JSON.stringify(user))});
    'ok'`,
  returnByValue: true,
});

/* ── 6. Capture ─────────────────────────────────────────────────────────── */
mkdirSync(OUT, { recursive: true });
const manifest = [];

for (const [name, route, width, height] of SHOTS) {
  await cdp('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width <= 480,
  });
  await cdp('Page.navigate', { url: `${APP}${route}` });
  await waitFor(cdp, () => 'document.readyState', 'complete');

  // Recharts animates in; a fixed settle beats racing the paint.
  await new Promise((r) => setTimeout(r, 1500));

  const { data } = await cdp('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,   // include below-the-fold layout
  });
  const file = join(OUT, `${name}-${width}x${height}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  manifest.push({ name, route, width, height, file });
  console.log(`captured ${name} @ ${width}x${height}`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} images -> ${OUT}`);
cleanup();
process.exit(0);

/**
 * Poll a JS expression until it equals `want`. Polling beats a fixed sleep:
 * it survives a slow API response without hard-coding a guess.
 */
async function waitFor(cdpFn, expr, want) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await cdpFn('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.result?.value === want) return;
    } catch { /* navigating; target may be mid-swap */ }
    await new Promise((r) => setTimeout(r, 125));
  }
}