// THE DESK. `npm run audits`.
//
// Every audit in this repository was a separate terminal. Three pages, a system
// map and a studio the pages link into, all on ports nobody remembers, plus
// nine one-shot checks that were only reachable by knowing their npm script
// existed — which in practice meant each was run the week it was written and
// never again.
//
// This starts all of it and gives it one address. It is not a fourth audit: it
// holds no knowledge about the game and asserts nothing about it. It starts
// processes, asks each of them how it is doing, and runs the checks on request.
// Everything it knows about what exists comes out of ../registry.mjs.
//
// The studio and the system map are started too, and that is not a courtesy:
// every citation on every audit page is a link into the studio, and the pages
// say so at the bottom. Starting the audits without it produces three pages of
// dead links, which is the exact failure this command exists to remove.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import process from 'node:process';

import { ROOT, STYLES, escape } from '../shared.mjs';
import { AUDITS, AUDITS_INDEX_PORT, CHECKS, STUDIO_PORT, SYSTEM_MAP_PORT, checkById } from '../registry.mjs';

const flag = (name) => process.argv.includes(`--no-${name}`);
const WANT = { studio: !flag('studio'), map: !flag('map') };
const HOST = '127.0.0.1';
const PORT = Number(process.env.AUDITS_PORT || AUDITS_INDEX_PORT);

// Everything the desk starts, in the order it is useful in. The studio goes
// first because the pages link into it and it is the slowest to come up.
const SERVICES = [
  ...(WANT.studio ? [{ id: 'studio', title: 'The studio', port: STUDIO_PORT, entry: 'tools/narrative-studio/server.mjs',
    blurb: 'Where the writing is. Every citation on every audit page opens here.' }] : []),
  ...(WANT.map ? [{ id: 'system-map', title: 'The system map', port: SYSTEM_MAP_PORT, entry: 'tools/system-map/server.mjs',
    blurb: 'How the parts of the game reach each other, and which audit covers each part.' }] : []),
  ...AUDITS.map((audit) => ({ id: audit.id, title: audit.title, port: audit.port, entry: audit.entry, blurb: audit.blurb, audit })),
];

// ── the children ─────────────────────────────────────────────────────────────

const children = new Map();

function start(service) {
  const child = spawn(process.execPath, [service.entry], {
    cwd: ROOT,
    // AUDIT_NO_OPEN stops each audit opening its own browser tab. Nine tabs for
    // one command is the behaviour of a tool nobody runs twice.
    env: { ...process.env, AUDIT_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  const keep = (chunk) => { log.push(String(chunk)); if (log.length > 200) log.splice(0, log.length - 200); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('exit', (code) => { keep(`\n[exited ${code}]\n`); });
  children.set(service.id, { child, log, service });
  return child;
}

// Up means it answers, not that the process is alive: a server that threw while
// starting is still a process.
async function reach(port, path = '/') {
  try {
    const response = await fetch(`http://${HOST}:${port}${path}`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? response : null;
  } catch { return null; }
}

// How an audit says it is doing, in the desk's two words rather than its own.
// The mapping is declared per audit in the registry; an audit that answers in a
// shape the registry does not describe is reported as unreadable rather than as
// healthy, because silently calling it green is the one wrong answer.
async function health(service) {
  if (!service.audit) return { kind: 'plain' };
  const response = await reach(service.port, '/api/audit');
  if (!response) return { kind: 'down' };
  try {
    const body = await response.json();
    const count = (keys) => keys.reduce((sum, key) => sum + (Array.isArray(body.global?.[key]) ? body.global[key].length : 0), 0);
    return { kind: 'read', wrong: count(service.audit.health.wrong), outstanding: count(service.audit.health.outstanding) };
  } catch { return { kind: 'unreadable' }; }
}

// ── the checks ───────────────────────────────────────────────────────────────

const runs = new Map();

function runCheck(check) {
  const existing = runs.get(check.id);
  if (existing?.running) return existing;
  const record = { running: true, code: null, output: '', startedAt: Date.now() };
  runs.set(check.id, record);
  const child = spawn('npm', ['run', '--silent', check.npm], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const take = (chunk) => {
    record.output += String(chunk);
    // A check that prints a megabyte is a check nobody reads. Keep the end,
    // which is where a failure says what it was.
    if (record.output.length > 200000) record.output = `…\n${record.output.slice(-200000)}`;
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('error', (error) => { record.output += `\n${error.message}\n`; });
  child.on('close', (code) => { record.running = false; record.code = code; record.endedAt = Date.now(); });
  return record;
}

// ── the page ─────────────────────────────────────────────────────────────────

const DESK_STYLES = `
.desk{display:flex;flex-direction:column;gap:.9rem;margin:0 0 2.4rem}
.svc{display:grid;grid-template-columns:1fr auto;gap:.4rem 1.4rem;align-items:baseline;
  border-top:1px solid var(--rule,#0002);padding:.85rem 0}
.svc h3{margin:0;font-size:1.05rem;font-weight:500}
.svc p{margin:.25rem 0 0;opacity:.7;max-width:62ch}
.svc .state{font:.78rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;text-align:right;white-space:nowrap}
.up{color:#2b7a4b}.down{opacity:.5}.wrong{color:#a3312b;font-weight:600}
.check{display:grid;grid-template-columns:1fr auto;gap:.4rem 1.4rem;align-items:baseline;
  border-top:1px solid var(--rule,#0002);padding:.85rem 0}
.check button{font:inherit;font-size:.85rem;padding:.28rem .85rem;cursor:pointer;
  background:transparent;color:inherit;border:1px solid currentColor;border-radius:2px}
.check button[disabled]{opacity:.4;cursor:default}
.check pre{grid-column:1/-1;margin:.7rem 0 0;padding:.7rem .85rem;overflow:auto;max-height:26rem;
  font:.78rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:#0000000d;border-radius:3px;white-space:pre-wrap}
.slow{opacity:.6;font-size:.78rem}
h2.group{margin:2.2rem 0 .2rem;font-size:.8rem;letter-spacing:.09em;text-transform:uppercase;opacity:.55;font-weight:600}
`;

function servicePage(states) {
  const services = SERVICES.map((service) => {
    const state = states.get(service.id);
    const words = state.kind === 'down' ? '<span class="down">not answering</span>'
      : state.kind === 'unreadable' ? '<span class="wrong">answering, but not in a shape the desk knows</span>'
        : state.kind === 'plain' ? '<span class="up">up</span>'
          : state.wrong ? `<span class="wrong">${state.wrong} wrong</span>${state.outstanding ? ` · ${state.outstanding} outstanding` : ''}`
            : `<span class="up">clean</span>${state.outstanding ? ` · ${state.outstanding} outstanding` : ''}`;
    return `<div class="svc">
      <div>
        <h3><a href="http://${HOST}:${service.port}/" target="_blank" rel="noreferrer">${escape(service.title)}</a></h3>
        <p>${escape(service.blurb)}</p>
      </div>
      <div class="state">:${service.port}<br>${words}</div>
    </div>`;
  }).join('');

  const checks = CHECKS.map((check) => {
    const run = runs.get(check.id);
    const label = run?.running ? 'running…' : run ? 'run again' : 'run';
    const result = !run ? ''
      : `<pre data-check="${escape(check.id)}">${escape(run.running
        ? `${run.output}\n[still running]`
        : `${run.output}\n[${check.npm} exited ${run.code}]`)}</pre>`;
    return `<div class="check">
      <div>
        <h3>${escape(check.title)}</h3>
        <p>${escape(check.blurb)} <span class="slow">${escape(check.slow ? 'slow — drives the real game' : `npm run ${check.npm}`)}</span></p>
      </div>
      <div><button data-run="${escape(check.id)}"${run?.running ? ' disabled' : ''}>${label}</button></div>
      ${result}
    </div>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The desk</title>
<style>${STYLES}${DESK_STYLES}</style>
</head><body>
<div class="layout"><main>
  <header class="masthead">
    <h1>The desk.</h1>
    <p class="deck">Everything that reads this game back to you, running at once.
      The pages are live and reload honestly — each one rebuilds from the files on disk on every request,
      so after an edit you refresh rather than restart. The checks run when you ask them to.</p>
  </header>
  <h2 class="group">Running</h2>
  <div class="desk">${services}</div>
  <h2 class="group">Checks</h2>
  <div class="desk">${checks}</div>
  <p class="ident">Started by <code>npm run audits</code>. Ctrl-C in that terminal stops all of it.
    <code>--no-studio</code> and <code>--no-map</code> leave those two out.</p>
</main></div>
<script>
// The page polls only while something is running, and reloads in place so a
// scrolled-to check stays where it was.
async function refresh(){
  const html = await (await fetch('/', {headers:{'x-partial':'1'}})).text();
  const next = new DOMParser().parseFromString(html, 'text/html');
  document.querySelector('.layout main').replaceWith(next.querySelector('.layout main'));
  wire();
}
function wire(){
  for (const button of document.querySelectorAll('[data-run]')) {
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'running…';
      await fetch('/run/' + button.dataset.run, {method:'POST'});
      refresh();
    });
  }
  if (document.body.textContent.includes('[still running]')) setTimeout(refresh, 1500);
}
wire();
</script>
</body></html>`;
}

// ── the server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === 'POST' && url.pathname.startsWith('/run/')) {
    const check = checkById(decodeURIComponent(url.pathname.slice('/run/'.length)));
    if (!check) { res.writeHead(404).end('no such check'); return; }
    runCheck(check);
    res.writeHead(202, { 'content-type': 'text/plain' }).end('started');
    return;
  }
  if (url.pathname !== '/') { res.writeHead(404).end('the desk is at /'); return; }
  const states = new Map(await Promise.all(SERVICES.map(async (service) => [service.id, await health(service)])));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(servicePage(states));
});

for (const service of SERVICES) start(service);

server.listen(PORT, HOST, async () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`The desk: ${url}`);
  console.log(`Starting ${SERVICES.length} servers. Ctrl-C stops all of them.`);
  // Wait for the slowest of them rather than a fixed sleep, but never hold the
  // browser more than a few seconds — a service that is still coming up shows
  // as not answering and the page picks it up on the next refresh.
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const up = await Promise.all(SERVICES.map((service) => reach(service.port)));
    if (up.every(Boolean)) break;
    await new Promise((done) => { setTimeout(done, 400); });
  }
  if (!process.env.AUDIT_NO_OPEN) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  }
});

// One Ctrl-C takes the whole desk down. Without this the audits survive their
// parent and the ports stay held, which is the worst possible failure for a
// tool whose entire job is not having to manage these processes by hand.
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (closing) process.exit(0);
    closing = true;
    for (const { child } of children.values()) child.kill('SIGTERM');
    server.close();
    setTimeout(() => process.exit(0), 400).unref();
  });
}
