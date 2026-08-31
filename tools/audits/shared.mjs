// What every audit page and server has in common.
//
// The chrome, the typography, the link into the narrative studio, and the HTTP
// server. An audit supplies two things: a builder that reads the game, and a
// renderer that turns that into the middle of the page.
//
// House style, applied throughout: say things in ordinary words and keep the
// code name beside them in small type, never in place of them.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { AUDITS, SYSTEM_MAP_PORT } from './registry.mjs';

export const ROOT = resolve(import.meta.dirname, '../..');
const SESSION = resolve(ROOT, 'tools/narrative-studio/.studio-session.json');

// ── text ─────────────────────────────────────────────────────────────────────

export const escape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// Prose written in the data files marks code names with backticks. Set them
// rather than printing the marks.
export const prose = (value) => escape(value).replace(/`([^`]+)`/g, '<code>$1</code>');

export const ordinal = (index) => String(index + 1).padStart(2, '0');

// ── citations ────────────────────────────────────────────────────────────────

// Each file an audit points at, read once, so a reference can be turned into a
// real line number — and one that has gone stale can be shown as broken instead
// of linked.
export function citationReader() {
  const files = new Map();
  return async function citation(where) {
    if (!where?.file) return null;
    if (!files.has(where.file)) {
      try { files.set(where.file, (await readFile(resolve(ROOT, where.file), 'utf8')).split('\n')); }
      catch { files.set(where.file, null); }
    }
    const lines = files.get(where.file);
    if (!lines) return { ...where, line: 0, resolved: false, reason: 'file not found' };
    const index = lines.findIndex((line) => line.includes(where.symbol));
    return index < 0
      ? { ...where, line: 0, resolved: false, reason: 'symbol not found' }
      : { ...where, line: index + 1, abs: resolve(ROOT, where.file), resolved: true };
  };
}

// Where the rule lives. The link opens an editor; the text can be copied.
export function cite(where) {
  if (!where) return '';
  if (!where.resolved) {
    return `<span class="cite stale">${escape(where.file)} · ${escape(where.symbol)} — no longer there</span>`;
  }
  return `<a class="cite" href="vscode://file${escape(where.abs)}:${where.line}" title="${escape(where.symbol)}">${escape(where.file)}<b> line ${where.line}</b></a>`;
}

// ── the studio linkout ───────────────────────────────────────────────────────

// The studio writes this file when it starts and deletes it when it stops. A
// hard kill leaves it behind, so only trust it if the process it names is still
// running.
export async function studioSession() {
  let session;
  try { session = JSON.parse(await readFile(SESSION, 'utf8')); }
  catch { return null; }
  if (!session?.url || !session?.token) return null;
  try { process.kill(session.pid, 0); } catch { return null; }
  return session;
}

// Every piece of writing on an audit page is one click from where it is written.
// The server works out the studio's address when the link is followed rather
// than when the page is built, so links keep working after a studio restart.
export function studioLink(documentId, { node = '', label = '', missing = false, line = '' } = {}) {
  const text = escape(label || documentId);
  if (missing) return `<span class="doc missing">${text} — not found</span>`;
  const query = node ? `?node=${encodeURIComponent(node)}${line ? `&line=${encodeURIComponent(line)}` : ''}` : '';
  return `<a class="doc" href="/open/${encodeURIComponent(documentId)}${query}" target="_blank" rel="noreferrer">${text}</a>`;
}

// ── the page ─────────────────────────────────────────────────────────────────

export const STYLES = `
:root{
  --paper:#f2efe7; --ink:#191713; --dim:#6d675c; --rule:#cfc8ba; --rule-hard:#a8a091;
  --flag:#9a3412; --link:#1c4f6b; --panel:#ebe7dc; --code:#5b5245;
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua',Georgia,serif;
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
}
@media (prefers-color-scheme:dark){:root{
  --paper:#121110; --ink:#e6e1d6; --dim:#8c857a; --rule:#2e2b26; --rule-hard:#4a463e;
  --flag:#e08a5a; --link:#7fb6d1; --panel:#191715; --code:#a9a294;
}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
code{font-family:var(--mono);font-size:.78em;color:var(--code)}
a{color:var(--link)}
.layout{display:grid;grid-template-columns:262px minmax(0,1fr)}
nav{position:sticky;top:0;height:100vh;overflow-y:auto;padding:2.2rem 1.2rem 3rem 2rem;border-right:1px solid var(--rule)}
nav .mast{margin-bottom:1.1rem;line-height:1.3}
nav .mast b{display:block;font-weight:400;font-size:1.2rem;letter-spacing:-.01em}
nav .mast span{color:var(--dim);font-size:.85rem}
nav input{width:100%;font:inherit;font-size:.88rem;padding:.35rem 0;margin-bottom:1.3rem;background:transparent;color:var(--ink);border:0;border-bottom:1px solid var(--rule-hard);outline:none}
nav input::placeholder{color:var(--dim)}
.elsewhere{margin:0 0 1.3rem;padding:0 0 1rem;border-bottom:1px solid var(--rule);font-size:.84rem;line-height:1.65}
.elsewhere a{display:block;color:var(--link);text-decoration:none;border-bottom:1px solid transparent;width:fit-content}
.elsewhere a:hover{border-bottom-color:currentColor}
.elsewhere .here{color:var(--dim)}
.family{margin-bottom:1.2rem}
.family h5{margin:0 0 .4rem;font-family:var(--mono);font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);font-weight:500}
nav a.row{display:grid;grid-template-columns:1.7rem 1fr auto;gap:.35rem;align-items:baseline;padding:.22rem 0;text-decoration:none;color:var(--ink);border-bottom:1px solid transparent}
nav a.row:hover{border-bottom-color:var(--rule-hard)}
nav a.row.on .name{text-decoration:underline;text-underline-offset:3px}
nav a.row .ordinal{font-family:var(--mono);font-size:.66rem;color:var(--dim)}
nav a.row .name{font-size:.95rem;line-height:1.25}
nav a.row .dot{width:5px;height:5px;border-radius:50%;background:var(--flag);align-self:center}
.status{margin-top:1.5rem;padding-top:.9rem;border-top:1px solid var(--rule);font-size:.82rem;color:var(--dim);line-height:1.8}
.status b{color:var(--ink);font-weight:400}
.status .bad{color:var(--flag)}
#studio-state.up{color:var(--ink)}
main{padding:2.2rem clamp(1.2rem,4vw,4rem) 8rem}
.masthead{border-bottom:2px solid var(--ink);padding-bottom:1.1rem;margin-bottom:1.8rem;max-width:74ch}
.masthead h1{margin:0;font-size:clamp(2rem,4.2vw,2.9rem);line-height:1.03;letter-spacing:-.02em;font-weight:400}
.masthead .deck{margin:.9rem 0 0;font-size:1.04rem;color:var(--dim);max-width:64ch}
.roads{max-width:74ch;margin:0 0 2rem;padding:0;list-style:none}
.roads li{padding:.55rem 0;border-bottom:1px solid var(--rule);font-size:.96rem;color:var(--dim)}
.roads li b{color:var(--ink);font-weight:400}
.global{max-width:74ch;margin:0 0 3rem;padding:.9rem 1.1rem;background:var(--panel);border-left:2px solid var(--rule-hard)}
.global.bad{border-left-color:var(--flag)}
.global h4{margin:0 0 .4rem;font-size:.98rem;font-weight:400}
.global ul{margin:.3rem 0 0;padding-left:1.1rem;font-size:.92rem;color:var(--dim)}
.global li{margin:.2rem 0}
.global .id{color:var(--ink);margin-right:.4rem}
section.entry{max-width:74ch;padding:2.6rem 0 3rem;border-top:1px solid var(--rule)}
section.entry:first-of-type{border-top:0}
.entry-head{margin-bottom:1.7rem}
.entry-head .ordinal{font-family:var(--mono);font-size:.7rem;letter-spacing:.2em;color:var(--dim);display:block;margin-bottom:.3rem}
.entry-head h2{margin:0;font-size:clamp(1.7rem,3.4vw,2.3rem);line-height:1.05;letter-spacing:-.018em;font-weight:400}
.entry-head .ids{margin:.35rem 0 0;font-size:.85rem;color:var(--dim)}
.entry-head .summary{margin:.8rem 0 0;font-size:1.06rem}
.block{margin:0 0 2.2rem}
.block.two{display:grid;grid-template-columns:1fr 1fr;gap:2rem}
@media (max-width:900px){.block.two{grid-template-columns:1fr}.layout{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--rule)}}
h3{margin:0 0 .2rem;font-family:var(--mono);font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;font-weight:500;padding-bottom:.35rem;border-bottom:1px solid var(--rule-hard)}
h4{margin:1.4rem 0 .3rem;font-size:.98rem;font-weight:400}
.lede{margin:.5rem 0 .6rem;font-size:.92rem;color:var(--dim)}
.count{font-size:.83rem;color:var(--dim)}
.none{font-size:.92rem;color:var(--dim);font-style:italic;margin:.5rem 0}
table{width:100%;border-collapse:collapse;margin:.4rem 0}
td,th{padding:.45rem .5rem .45rem 0;vertical-align:top;border-bottom:1px solid var(--rule);text-align:left}
th{font-family:var(--mono);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:500}
td.key{width:9.5rem;font-size:.88rem;color:var(--dim);padding-right:1rem}
td.num{width:8rem;font-size:.85rem;color:var(--dim)}
td.kind{width:10.5rem;font-size:.88rem}
table p{margin:0 0 .3rem;font-size:.95rem}
.said{font-style:italic}
.dim{color:var(--dim)}
.ident{font-size:.82rem!important;color:var(--dim);margin:.2rem 0 .3rem!important}
ol.gate{margin:.5rem 0 0;padding:0;list-style:none;counter-reset:g}
ol.gate li{counter-increment:g;position:relative;padding:0 0 .8rem 1.7rem;margin-bottom:.8rem;border-bottom:1px solid var(--rule)}
ol.gate li:last-child{border-bottom:0;margin-bottom:0}
ol.gate li::before{content:counter(g,decimal-leading-zero);position:absolute;left:0;top:.25rem;font-family:var(--mono);font-size:.65rem;color:var(--dim)}
.gate-head{display:flex;flex-wrap:wrap;gap:.4rem;align-items:baseline;margin-bottom:.15rem}
.gate-label{font-size:1rem}
ol.gate p{margin:.15rem 0 .35rem;font-size:.93rem;color:var(--dim)}
.tag{font-size:.72rem;color:var(--dim);border:1px solid var(--rule-hard);padding:.05rem .35rem;border-radius:2px;white-space:nowrap}
.tag.divert,.tag.owed{color:var(--flag);border-color:var(--flag)}
.tag.divert b{font-weight:400}
.cite{display:inline-block;font-size:.8rem;color:var(--dim);text-decoration:none;border-bottom:1px dotted var(--rule-hard)}
.cite:hover{color:var(--ink)}
.cite b{font-weight:400;font-family:var(--mono);font-size:.88em}
.cite.stale{color:var(--flag);border-bottom:1px solid var(--flag)}
a.doc{font-size:.92rem;text-decoration:none;color:var(--link);border-bottom:1px solid currentColor}
a.doc:hover{background:var(--panel)}
.doc.missing{font-size:.92rem;color:var(--flag)}
.chips{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.3rem}
.chips span{border:1px solid var(--rule);padding:.05rem .35rem;border-radius:2px;color:var(--dim);font-size:.8rem}
.findings{margin:0 0 1.8rem;padding:.7rem .9rem;border-left:2px solid var(--flag);background:var(--panel)}
.findings h4{margin:0 0 .25rem;color:var(--flag);font-size:.95rem}
.findings ul{margin:0;padding-left:1.1rem;font-size:.92rem;color:var(--dim)}
.timeline td,.beats td{font-size:.93rem}
.timeline td.kind{width:9rem;color:var(--dim)}
.beats td.kind{width:10rem}
`;

const SCRIPT = `
const nav=[...document.querySelectorAll('nav a.row')];
const observer=new IntersectionObserver((entries)=>{
  for(const entry of entries){
    if(!entry.isIntersecting)continue;
    for(const link of nav)link.classList.toggle('on',link.dataset.id===entry.target.id);
  }
},{rootMargin:'-15% 0px -70% 0px'});
for(const section of document.querySelectorAll('section.entry'))observer.observe(section);

const filter=document.getElementById('filter');
if(filter)filter.addEventListener('input',()=>{
  const term=filter.value.trim().toLowerCase();
  for(const section of document.querySelectorAll('section.entry')){
    const hit=!term||(section.dataset.search||'').includes(term);
    section.hidden=!hit;
    const link=nav.find((a)=>a.dataset.id===section.id);
    if(link)link.style.opacity=hit?'1':'.28';
  }
});

const state=document.getElementById('studio-state');
async function poll(){
  try{
    const info=await (await fetch('/api/studio')).json();
    state.textContent=info.running?'open':'not running';
    state.classList.toggle('up',!!info.running);
  }catch{state.textContent='unknown';}
}
poll();setInterval(poll,4000);
`;

// A link to every other audit, and back to the system map. The system map's port
// is fixed; the other audits may or may not be running, and saying which is not
// worth a second poll — the page they land on says to start it.
function elsewhere(activeId) {
  const rows = AUDITS.map((audit) => (audit.id === activeId
    ? `<span class="here">${escape(audit.title)} — you are here</span>`
    : `<a href="http://127.0.0.1:${audit.port}/">${escape(audit.title)}</a>`));
  rows.push(`<a href="http://127.0.0.1:${SYSTEM_MAP_PORT}/">The system map</a>`);
  return `<div class="elsewhere">${rows.join('')}</div>`;
}

// One page. `rail` is the index down the left, `body` is the document.
export function pageShell({
  id, title, heading, deck, rail = '', body = '', roads = '',
  filterPlaceholder = 'find one…', mastTitle, mastNote,
  statusRows = [], global = '',
}) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLES}</style>
</head><body>
<div class="layout">
<nav>
  <div class="mast"><b>${escape(mastTitle || title)}</b><span>${escape(mastNote || '')}</span></div>
  ${elsewhere(id)}
  <input id="filter" type="search" placeholder="${escape(filterPlaceholder)}" autocomplete="off" spellcheck="false">
  ${rail}
  <div class="status">
    ${statusRows.map((row) => `<div>${row}</div>`).join('')}
    <div>Studio <b id="studio-state">checking…</b></div>
  </div>
</nav>
<main>
  <header class="masthead">
    <h1>${escape(heading)}</h1>
    <p class="deck">${escape(deck)}</p>
  </header>
  ${roads}
  ${global}
  ${body}
</main>
</div>
<script>${SCRIPT}</script>
</body></html>`;
}

// The panel at the top of every audit: what is broken, then what is unfinished.
export function globalPanel({ broken = [], unfinished = [], allWell, someBroken, someUnfinished }) {
  const headline = broken.length ? someBroken : unfinished.length ? someUnfinished : allWell;
  return `<div class="global ${broken.length ? 'bad' : ''}">
    <h4>${escape(headline)}</h4>
    ${broken.length ? `<ul>${broken.map((text) => `<li>${escape(text)}</li>`).join('')}</ul>` : ''}
    ${unfinished.length ? `<ul>${unfinished.map((entry) => (typeof entry === 'string'
      ? `<li>${escape(entry)}</li>`
      : `<li><span class="id">${escape(entry.id)}</span>${escape(entry.text)}</li>`)).join('')}</ul>` : ''}
  </div>`;
}

// ── the server ───────────────────────────────────────────────────────────────

const notice = (title, body) => `<!doctype html><meta charset="utf-8">
<title>${title}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2efe7;color:#191713;
  font:16px/1.55 'Iowan Old Style',Palatino,Georgia,serif;padding:2rem}
@media(prefers-color-scheme:dark){body{background:#121110;color:#e6e1d6}}
div{max-width:46ch}
h1{font-size:1.5rem;font-weight:400;margin:0 0 .6rem;letter-spacing:-.01em}
p{margin:.5rem 0;opacity:.75}
code{font:.82em ui-monospace,SFMono-Regular,Menlo,monospace;
  border:1px solid currentColor;border-radius:2px;padding:.05rem .3rem;opacity:.9}
</style>
<div><h1>${title}</h1>${body}</div>`;

// Serves one audit. It stores nothing: every request rebuilds the page from the
// files on disk, so reloading after an edit gives an honest answer.
export function serveAudit({ audit, build, render }) {
  const host = '127.0.0.1';
  const port = Number(process.env.AUDIT_PORT || audit.port);
  const html = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(body);
  };
  const json = (res, status, data) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(data));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    try {
      if (url.pathname === '/api/studio') {
        const session = await studioSession();
        return json(res, 200, session ? { running: true, port: session.port, startedAt: session.startedAt } : { running: false });
      }
      if (url.pathname === '/api/audit') return json(res, 200, await build());

      // The link into the studio. `node` opens the right part of the document;
      // `line` is passed along so the studio can say which line was wanted,
      // since it selects a whole part at a time.
      if (url.pathname.startsWith('/open/')) {
        const documentId = decodeURIComponent(url.pathname.slice('/open/'.length));
        const session = await studioSession();
        if (!session) {
          return html(res, 503, notice('The studio is not running.', `
            <p>Start it in another terminal and click the link again. It works out where the
              studio is each time, so it will go through as soon as one is open.</p>
            <p><code>npm run studio</code></p>
            <p style="margin-top:1.4rem">You asked for <code>${escape(documentId)}</code>.</p>`));
        }
        const target = new URL(session.url);
        target.searchParams.set('doc', documentId);
        for (const key of ['node', 'line']) {
          const value = url.searchParams.get(key);
          if (value) target.searchParams.set(key, value);
        }
        res.writeHead(302, { location: target.toString(), 'cache-control': 'no-store' });
        return res.end();
      }

      if (url.pathname === '/') return html(res, 200, render(await build()));
      return html(res, 404, notice('No such page.', '<p>The audit is at <code>/</code>.</p>'));
    } catch (error) {
      return html(res, 500, notice('The audit could not be put together.',
        `<p><code>${String(error?.stack || error).replace(/[<>&]/g, '')}</code></p>`));
    }
  });

  server.listen(port, host, () => {
    const url = `http://${host}:${port}/`;
    console.log(`${audit.title}: ${url}`);
    console.log('Links open each piece of writing in the studio. Run `npm run studio` alongside this for them to work.');
    if (!process.env.AUDIT_NO_OPEN) {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
      spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); process.exit(0); });
  return server;
}
