// Builds the lighting audit page from metrics.json and refs/refs.json.
//   node tools/chunk_surfer/lighting-audit/report.mjs
// Output: artifacts/lighting-audit/report/ (index.html + img/ + refs/)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {STATIONS} from './stations.mjs';
import {DESIGN} from './design.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const audit = path.join(root, 'artifacts/lighting-audit');
const out = path.join(audit, 'report');
const metrics = JSON.parse(fs.readFileSync(path.join(audit, 'metrics.json'), 'utf8'));
const refs = JSON.parse(fs.readFileSync(path.join(audit, 'refs/refs.json'), 'utf8'));
fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(path.join(out, 'img'), {recursive: true}); fs.mkdirSync(path.join(out, 'refs'), {recursive: true});
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const pct = v => v == null ? '–' : `${Math.round(v * 100)}%`;
const num = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : (+v).toFixed(d);
const signed = (v, d = 1) => v == null || !Number.isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;

// Images: on-screen frames keep their native 1280 px so the dither survives;
// diagnostic views are already 640 px.
const files = {};
async function image(src, name, {width = null, quality = 86} = {}) {
  if (!fs.existsSync(src)) return null;
  const dest = path.join(out, name);
  let pipeline = sharp(src).removeAlpha();
  if (width) pipeline = pipeline.resize(width, null, {withoutEnlargement: true});
  await pipeline.jpeg({quality, chromaSubsampling: '4:4:4', mozjpeg: true}).toFile(dest);
  const meta = await sharp(dest).metadata();
  files[name] = {width: meta.width, height: meta.height};
  return name;
}
const img = (name, alt, cls = '') => name ? `<img src="${name}" alt="${esc(alt)}" width="${files[name].width}" height="${files[name].height}" loading="lazy" decoding="async"${cls ? ` class="${cls}"` : ''}>` : '<div class="missing">not captured</div>';

const stations = metrics.stations.filter(s => !s.failed);
const byId = Object.fromEntries(stations.map(s => [s.id, s]));
const SPACES = {conservatoire: 'Conservatoire', exterior: 'Exterior', drive: 'Drive', source: 'Source'};

for (const s of stations) {
  const dir = path.join(audit, 'img', s.id);
  s.img = {
    final: await image(path.join(dir, 'final.png'), `img/${s.id}-screen.jpg`),
    clay: await image(path.join(dir, 'clay.png'), `img/${s.id}-clay.jpg`),
    falseColour: await image(path.join(dir, 'false-colour.png'), `img/${s.id}-false.jpg`, {quality: 82}),
    scene: await image(path.join(dir, 'scene.png'), `img/${s.id}-scene.jpg`, {quality: 82}),
    solos: [],
    previews: [],
  };
  for (const c of s.contributions) s.img.solos.push({...c, file: await image(path.join(dir, `solo-${c.solo}.png`), `img/${s.id}-solo-${c.solo}.jpg`, {quality: 80})});
  s.img.solos.unshift({label: 'Nothing the rig controls (sky, emitters, fog)', file: await image(path.join(dir, 'solo-none.png'), `img/${s.id}-solo-none.jpg`, {quality: 80}), share: s.residualShare});
  s.img.sweep = [];
  for (const p of s.sweep || []) s.img.sweep.push({...p, file: await image(path.join(dir, `preview-${p.id}.png`), `img/${s.id}-preview-${p.id}.jpg`)});
  for (const p of s.previews || []) s.img.previews.push({...p, file: await image(path.join(dir, `preview-${p.id}.png`), `img/${s.id}-preview-${p.id}.jpg`)});
}
for (const r of refs) r.img = await image(path.join(audit, 'refs', r.file), `refs/${r.file.replace(/\.\w+$/, '.jpg')}`, {width: 1280, quality: 84});

// ── Charts (inline SVG, one scale each) ─────────────────────────────────────
const refTones = refs.map(r => r.screen.tones), refDark = refs.map(r => r.screen.darkestShare);
function barChart({rows, max, ticks, unit = '', bandFrom = null, bandTo = null, bandLabel = '', format = v => v, refLine = null, refLabel = ''}) {
  const W = 780, left = 236, right = 56, rowH = 22, top = 26, H = top + rows.length * rowH + 30;
  const x = v => left + (W - left - right) * Math.max(0, Math.min(1, v / max));
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`;
  if (bandFrom != null) svg += `<rect x="${x(bandFrom)}" y="${top - 6}" width="${x(bandTo) - x(bandFrom)}" height="${rows.length * rowH + 6}" class="band"/><text x="${(x(bandFrom) + x(bandTo)) / 2}" y="${top - 10}" class="band-label" text-anchor="middle">${esc(bandLabel)}</text>`;
  for (const t of ticks) svg += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${top + rows.length * rowH}" class="grid"/><text x="${x(t)}" y="${H - 10}" class="tick" text-anchor="middle">${format(t)}${unit}</text>`;
  if (refLine != null) svg += `<line x1="${x(refLine)}" x2="${x(refLine)}" y1="${top - 6}" y2="${top + rows.length * rowH}" class="ref-line"/><text x="${x(refLine) + 4}" y="${top - 10}" class="band-label">${esc(refLabel)}</text>`;
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    svg += `<text x="${left - 10}" y="${y + 14}" class="row-label" text-anchor="end">${esc(row.label)}</text>`;
    if (row.value == null) { svg += `<text x="${left + 4}" y="${y + 14}" class="tick">not measured</text>`; return; }
    svg += `<rect x="${left}" y="${y + 4}" width="${Math.max(1.5, x(row.value) - left)}" height="${rowH - 9}" class="bar ${row.cls || ''}"/>`;
    svg += `<text x="${Math.min(x(row.value) + 6, W - right + 4)}" y="${y + 14}" class="value">${format(row.value)}${unit}</text>`;
  });
  return svg + '</svg>';
}
const stationLabel = s => s.title.replace(/^Source( proper)?:\s*/, 'Source · ').replace(/\s*\(.*\)$/, '');
const spaceCls = s => `space-${s.space}`;
const tonesChart = barChart({rows: [...stations.map(s => ({label: stationLabel(s), value: s.dither.tones, cls: spaceCls(s)})), ...refs.map(r => ({label: `Photo · ${(DESIGN.refNotes[r.file]?.title || r.title).slice(0, 30)}`, value: r.screen.tones, cls: 'photo'}))],
  max: 26, ticks: [0, 5, 10, 15, 20, 25], bandFrom: Math.min(...refTones), bandTo: Math.max(...refTones), bandLabel: 'reference photographs'});
const visibleChart = barChart({rows: stations.map(s => ({label: stationLabel(s), value: s.transfer.visibleShare, cls: spaceCls(s)})), max: 1, ticks: [0, .25, .5, .75, 1], format: v => `${Math.round(v * 100)}`, unit: '%'});
const costChart = barChart({rows: stations.map(s => ({label: stationLabel(s), value: s.cost.frameWallMs, cls: spaceCls(s)})), max: 60, ticks: [0, 10, 20, 30, 40, 50, 60], unit: ' ms', format: v => num(v, v < 10 ? 1 : 0), refLine: 16.7, refLabel: '60 fps'});

function contributionBar(s) {
  const parts = [...s.contributions].sort((a, b) => b.share - a.share).map(c => ({label: c.label, share: c.share, cls: c.solo === 'ambient' ? 'c-ambient' : c.solo === 'torch' ? 'c-torch' : 'c-lamp'}));
  parts.push({label: 'Sky, emitters, fog', share: s.residualShare, cls: 'c-rest'});
  return `<div class="stack" role="img" aria-label="Share of the frame's light by source">${parts.filter(p => p.share > .004).map(p => `<span class="${p.cls}" style="flex:${p.share}" title="${esc(p.label)} ${pct(p.share)}"></span>`).join('')}</div>`;
}
function transferChart(s) {
  const W = 300, H = 120, l = 28, r = 6, t = 8, b = 22, x = stop => l + (W - l - r) * (stop + 8) / 13, y = L => t + (H - t - b) * (1 - L / 100);
  const pts = s.transfer.curve.map(p => `${x(p.stop).toFixed(1)},${y(p.L).toFixed(1)}`).join(' ');
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="mini" role="img" aria-label="Screen lightness against scene light">`;
  for (const L of [0, 50, 100]) svg += `<line x1="${l}" x2="${W - r}" y1="${y(L)}" y2="${y(L)}" class="grid"/><text x="${l - 4}" y="${y(L) + 3}" class="tick" text-anchor="end">${L}</text>`;
  for (const stop of [-8, -4, 0, 4]) svg += `<text x="${x(stop)}" y="${H - 6}" class="tick" text-anchor="middle">${stop > 0 ? '+' : ''}${stop}</text>`;
  svg += `<line x1="${x(0)}" x2="${x(0)}" y1="${t}" y2="${H - b}" class="ref-line"/>`;
  svg += `<line x1="${l}" x2="${W - r}" y1="${y(8)}" y2="${y(8)}" class="threshold"/>`;
  svg += `<polyline points="${pts}" class="curve"/>`;
  for (const p of s.transfer.curve) svg += `<circle cx="${x(p.stop)}" cy="${y(p.L)}" r="${1.2 + Math.sqrt(p.share) * 9}" class="dot"/>`;
  return svg + '</svg>';
}

// ── Sections ───────────────────────────────────────────────────────────────
const env = metrics.environment;
const conservatoire = stations.filter(s => s.space === 'conservatoire');
const range = (list, key, fmt = v => v) => { const values = list.map(key).filter(v => v != null); return values.length ? `${fmt(Math.min(...values))}–${fmt(Math.max(...values))}` : '–'; };
const ambientKey = stations.filter(s => s.key?.label === 'Ambient + bounce');

function stationCard(s) {
  const c = s.cost, k = s.key;
  const rows = [
    ['Lights the renderer holds', `${s.lightCount}${s.uniforms.torch > .01 ? ' + torch' : ''}`],
    ['Largest source', k ? `${k.label} · ${pct(k.share)}` : '–'],
    ['Key to everything else', `${signed(s.keyToFillStops)} stops`],
    ['Lamps and torch to ambient', `${signed(s.directionalToAmbientStops)} stops`],
    ['Clay surfaces within ±½ stop', pct(s.clay.flatShare)],
    ['Scene range, 5th–95th', `${num(s.luminance.rangeStops)} stops`],
    ['Lit scene that shows on screen', pct(s.transfer.visibleShare)],
    ['Tones after dither', `${s.dither.tones} <span class="muted">(${pct(s.dither.darkestShare)} in the darkest)</span>`],
    ['Light no rig control switches off', `${pct(s.residualShare)}${s.skyTerm ? ' <span class="muted">(sky term, rim, glows: ' + pct(Math.max(0, s.skyTerm.share + Math.max(0, s.selfLight?.share || 0))) + ')</span>' : ''}`],
    ['Surface reflectance, median', s.albedo ? num(s.albedo.median, 2) : '–'],
    ['Frame, to finish', c.frameWallMs != null ? `${num(c.frameWallMs)} ms <span class="muted">(${num(c.frameWallNoLightsMs)} lights off)</span>` : '–'],
    ['World pass, lights on / off', c.marchMs != null ? `${num(c.marchMs)} / ${num(c.marchNoLightsMs)} ms` : '<span class="muted">not used here</span>'],
    ['Mesh pass, lights on / off', c.propsMs != null ? `${num(c.propsMs)} / ${num(c.propsNoLightsMs)} ms` : '–'],
  ];
  const notes = DESIGN.stationNotes[s.id] || '';
  return `<article class="station ${spaceCls(s)}" id="st-${s.id}">
  <header><span class="space-tag">${SPACES[s.space]}</span><h3>${esc(s.title)}</h3>${c.round === 1 ? '<span class="flag">timing: one round only</span>' : ''}</header>
  ${notes ? `<p class="station-note">${notes}</p>` : ''}
  <div class="triptych">
    <figure>${img(s.img.final, `${s.title}, as the player sees it`)}<figcaption>On screen</figcaption></figure>
    <figure>${img(s.img.clay, `${s.title}, every surface 18% grey`)}<figcaption>Clay: every lit surface 18% grey</figcaption></figure>
    <figure>${img(s.img.falseColour, `${s.title}, false colour`)}<figcaption>Scene light in stops from the median <span class="legend-fc"></span></figcaption></figure>
  </div>
  <div class="station-data">
    <dl>${rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    <div class="station-charts">
      <h4>Where the light comes from</h4>${contributionBar(s)}
      <h4>Scene light → screen</h4>${transferChart(s)}
      <p class="caption">Horizontal: scene light in stops from the frame's median. Vertical: what the screen shows there (CIE L*). Dots scale with how much of the frame sits at that level; the dashed line is the edge of visible (L* 8).</p>
    </div>
  </div>
  ${false && s.skyTerm && s.img.sky ? `<details><summary>Without the fixed sky term (${pct(s.skyTerm.share)} of this frame's light)</summary>
    <div class="previews" style="margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))"><figure>${img(s.img.self.with, 'As now')}<figcaption>As now · ${s.selfLight.tonesWith} tones · ${pct(s.selfLight.darkWith)} darkest</figcaption></figure><figure>${img(s.img.sky, 'Sky term removed')}<figcaption>Sky term removed · ${s.skyTerm.tonesWithout} tones · ${pct(s.skyTerm.darkWithout)} darkest</figcaption></figure></div>
  </details>` : ''}
  ${false ? `<details><summary>
    <div class="previews" style="margin-top:10px;grid-template-columns:repeat(2,minmax(0,1fr))"><figure>${img(s.img.self.with, 'As now')}<figcaption>As now · ${s.selfLight.tonesWith} tones · ${pct(s.selfLight.darkWith)} darkest</figcaption></figure><figure>${img(s.img.self.without, 'Rim and glow terms removed')}<figcaption>Rim pattern and chunk glows removed · ${s.selfLight.tonesWithout} tones · ${pct(s.selfLight.darkWithout)} darkest</figcaption></figure></div>
  </details>` : ''}
  <details><summary>Each light on its own (${s.img.solos.length} frames, scene light at one exposure)</summary>
    <div class="solos">${s.img.solos.map(o => `<figure>${img(o.file, o.label)}<figcaption>${esc(o.label)} · ${pct(o.share)}${o.light ? ` <span class="muted">r ${o.light.radius} m · ${o.light.intensity}${o.light.emergency ? ' · emergency' : ''}</span>` : ''}</figcaption></figure>`).join('')}</div>
  </details>
</article>`;
}

// Exposure ladder: as now, +½, +1 (from the previews), +1½, +2.
function sweepRow(s) {
  if (!s.img.sweep.length) return '';
  const base = s.img.previews.find(p => p.id === 'base'), one = s.img.previews.find(p => p.id === 'plus-one-stop');
  const steps = [base && {...base, title: 'As now'}, s.img.sweep.find(p => p.id === 'plus-half'), one && {...one, title: '+1 stop'}, s.img.sweep.find(p => p.id === 'plus-one-and-half'), s.img.sweep.find(p => p.id === 'plus-two')].filter(Boolean);
  return `<div class="preview-row"><h4>${esc(s.title)}</h4><div class="sweep">${steps.map(p => `<figure>${img(p.file, `${s.title}: ${p.title}`)}<figcaption><b>${esc(p.title)}</b><span>${p.tones} tones · ${pct(p.visibleShare)} visible · ${pct(p.darkestShare)} darkest</span></figcaption></figure>`).join('')}</div></div>`;
}
function previewRow(s) {
  if (!s.img.previews.length) return '';
  return `<div class="preview-row"><h4>${esc(s.title)}</h4><div class="previews">${s.img.previews.map(p => `<figure>${img(p.file, `${s.title}: ${p.title}`)}<figcaption><b>${esc(p.title)}</b><span>${p.tones} tones · ${pct(p.darkestShare)} darkest · ${pct(p.visibleShare)} of scene visible</span></figcaption></figure>`).join('')}</div></div>`;
}
const refCard = r => `<figure class="ref">${img(r.img, r.title)}<figcaption><b>${esc(DESIGN.refNotes[r.file]?.title || r.title)}</b>
  <span class="ref-metrics">${r.screen.tones} tones · ${pct(r.screen.darkestShare)} darkest · ${num(r.screen.rangeStops)} stops</span>
  <span>${DESIGN.refNotes[r.file]?.note || ''}</span>
  <span class="credit">Photo: ${esc(r.artist || 'unknown')}, <a href="${esc(r.page)}">Wikimedia Commons</a>, ${esc(r.license)}${r.size[0] < 600 ? ' · shown from a 500 px copy' : ''}</span></figcaption></figure>`;

const proposalTable = list => `<div class="table-wrap"><table class="proposals"><thead><tr><th>Change</th><th>Expected effect at the stations</th><th>GPU cost</th><th>Risk to the dithered look</th><th>Flash and motion settings</th></tr></thead><tbody>
${list.map(p => `<tr><td><b>${p.id}</b> ${p.title}<span class="where">${p.where || ''}</span></td><td>${typeof p.effect === 'function' ? p.effect(stations) : p.effect}</td><td>${p.cost} <span class="kind ${p.costKind}">${p.costKind}</span></td><td>${p.risk}</td><td>${p.access}</td></tr>`).join('')}
</tbody></table></div>`;

const html = `<title>Chunk Surfer Light Audit</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a field report. One reading column for argument; station dossiers break wide for the frames. */
:root{
  --bg:#0f1216;--panel:#161b21;--panel-2:#1c232b;--ink:#e8e4da;--muted:#98a0a8;--line:#2a323b;
  --sodium:#e3a54b;--phosphor:#7fd6c8;--red:#e0604f;--blue:#7aa2e8;--violet:#b49bea;
  --conservatoire:#e3a54b;--exterior:#9cc76b;--drive:#7aa2e8;--source:#b49bea;--photo:#6b737c;
  --display:"Archivo","Arial Narrow",system-ui,sans-serif;--body:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace;
  color-scheme:dark;
}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){
  --bg:#f4f2ee;--panel:#ffffff;--panel-2:#ebe8e2;--ink:#1d2126;--muted:#5d646c;--line:#d9d5cd;
  --sodium:#a8681a;--phosphor:#1f7d70;--red:#b23a2b;--blue:#2e5cb8;--violet:#6a48b5;
  --conservatoire:#b8781f;--exterior:#4f8a28;--drive:#2e5cb8;--source:#6a48b5;--photo:#8a9097;color-scheme:light}}
:root[data-theme="light"]{
  --bg:#f4f2ee;--panel:#ffffff;--panel-2:#ebe8e2;--ink:#1d2126;--muted:#5d646c;--line:#d9d5cd;
  --sodium:#a8681a;--phosphor:#1f7d70;--red:#b23a2b;--blue:#2e5cb8;--violet:#6a48b5;
  --conservatoire:#b8781f;--exterior:#4f8a28;--drive:#2e5cb8;--source:#6a48b5;--photo:#8a9097;color-scheme:light}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:16px/1.6 var(--body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:40px 80px}
main{max-width:1180px;margin:0 auto;display:grid;gap:56px}
.prose{max-width:70ch}
h1,h2,h3,h4{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:clamp(2.1rem,4vw,3.2rem);font-weight:800;letter-spacing:-.01em}
h2{font-size:1.75rem;font-weight:800;margin-bottom:14px}
h3{font-size:1.2rem;font-weight:700}
h4{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:14px 0 8px}
p{margin:0 0 12px}a{color:var(--phosphor)}
.eyebrow{font:500 .78rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--sodium);margin-bottom:10px}
.lede{font-size:1.15rem;max-width:68ch}
.muted{color:var(--muted)}
section{display:grid;gap:18px;min-width:0}
.findings{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
.finding{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px;display:grid;gap:8px;align-content:start}
.finding .figure{font:800 2.1rem var(--display);color:var(--sodium);line-height:1}
.finding p{margin:0;font-size:.95rem}
.method{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px;display:grid;gap:10px}
.method ul{margin:0;padding-left:18px}.method li{margin:3px 0}
code{font:.88em var(--mono);background:var(--panel-2);padding:1px 5px;border-radius:4px}
.chart{width:100%;height:auto;display:block}.mini{width:100%;max-width:340px;height:auto;display:block}
.chart text,.mini text{font:12px var(--mono);fill:var(--muted)}
.chart .row-label{fill:var(--ink);font-family:var(--body);font-size:12.5px}.chart .value{fill:var(--ink)}
.grid{stroke:var(--line);stroke-width:1}.band{fill:var(--photo);opacity:.18}.band-label{fill:var(--muted)!important}
.ref-line{stroke:var(--red);stroke-width:1.2;stroke-dasharray:4 3}.threshold{stroke:var(--muted);stroke-dasharray:2 3}
.bar{fill:var(--muted)}.bar.space-conservatoire{fill:var(--conservatoire)}.bar.space-exterior{fill:var(--exterior)}.bar.space-drive{fill:var(--drive)}.bar.space-source{fill:var(--source)}.bar.photo{fill:var(--photo)}
.curve{fill:none;stroke:var(--sodium);stroke-width:1.8}.dot{fill:var(--sodium);opacity:.55}
.chart-card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px;overflow-x:auto}
.key{display:flex;flex-wrap:wrap;gap:14px;font-size:.85rem;color:var(--muted)}.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.station{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;display:grid;gap:14px;border-top:3px solid var(--line)}
.station.space-conservatoire{border-top-color:var(--conservatoire)}.station.space-exterior{border-top-color:var(--exterior)}.station.space-drive{border-top-color:var(--drive)}.station.space-source{border-top-color:var(--source)}
.station header{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px}
.space-tag{font:500 .72rem var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.flag{font:.72rem var(--mono);color:var(--sodium);border:1px solid var(--line);border-radius:4px;padding:1px 6px}
.station-note{max-width:80ch;margin:0;font-size:.95rem}
.triptych{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:760px){.triptych{grid-template-columns:1fr}}
figure{margin:0;min-width:0}figure img{display:block;width:100%;height:auto;border-radius:6px;background:#000}
figcaption{font-size:.8rem;color:var(--muted);margin-top:5px}
.legend-fc{display:inline-block;width:84px;height:8px;border-radius:2px;vertical-align:0;margin-left:4px;background:linear-gradient(90deg,#0a0a3c,#1e46c8,#28a0c8,#5abe5a,#e6dc3c,#f08228,#e61e1e)}
.station-data{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px}
@media (max-width:760px){.station-data{grid-template-columns:1fr}}
dl{margin:0;display:grid;gap:0}dl div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:5px 0;font-size:.9rem}
dt{color:var(--muted)}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:.85rem}
.stack{display:flex;height:14px;border-radius:3px;overflow:hidden;background:var(--panel-2)}
.c-ambient{background:var(--muted)}.c-torch{background:var(--phosphor)}.c-lamp{background:var(--sodium)}.c-rest{background:var(--panel-2);background-image:repeating-linear-gradient(45deg,transparent 0 3px,var(--line) 3px 4px)}
.stack span{border-right:1px solid var(--panel)}
.caption{font-size:.78rem;color:var(--muted);margin:6px 0 0;max-width:46ch}
details{border-top:1px solid var(--line);padding-top:10px}summary{cursor:pointer;font-size:.9rem;color:var(--phosphor)}
summary:focus-visible,a:focus-visible{outline:2px solid var(--sodium);outline-offset:2px}
.solos{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px}
.stations{display:grid;gap:22px}
.space-heading{display:flex;align-items:baseline;gap:12px;margin-top:10px}.space-heading span{color:var(--muted);font-size:.9rem}
.preview-row{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.preview-row h4{margin-top:0}
.previews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media (max-width:760px){.previews{grid-template-columns:1fr}}
.sweep{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
@media (max-width:900px){.sweep{grid-template-columns:repeat(2,minmax(0,1fr))}}
.sweep figcaption,.previews figcaption{display:grid;gap:2px}.sweep figcaption b{color:var(--ink);font-weight:600}
.verdict{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--phosphor);border-radius:10px;padding:14px 18px;max-width:86ch}
.verdict p{margin:0}.previews figcaption b{color:var(--ink);font-weight:600}
.refs{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.ref{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px}
.ref figcaption{display:grid;gap:4px;font-size:.88rem;color:var(--ink)}.ref-metrics{font:.8rem var(--mono);color:var(--sodium)}.credit{font-size:.74rem;color:var(--muted)}
.intents{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.intent{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--line);border-radius:10px;padding:16px 18px}
.intent.space-conservatoire{border-left-color:var(--conservatoire)}.intent.space-exterior{border-left-color:var(--exterior)}.intent.space-drive{border-left-color:var(--drive)}.intent.space-source{border-left-color:var(--source)}
.intent h3{margin-bottom:8px}.intent p{font-size:.95rem;margin:0 0 6px}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;min-width:900px;font-size:.88rem;background:var(--panel)}
th{text-align:left;font:600 .74rem var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--line);background:var(--panel-2)}
td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
td b{font-family:var(--mono);color:var(--sodium);margin-right:4px}.where{display:block;color:var(--muted);font-size:.8rem;margin-top:3px}
.kind{display:inline-block;font:.68rem var(--mono);text-transform:uppercase;letter-spacing:.06em;border-radius:3px;padding:0 5px;margin-left:4px;border:1px solid var(--line)}
.kind.measured{color:var(--phosphor);border-color:var(--phosphor)}.kind.estimated{color:var(--sodium);border-color:var(--sodium)}
ol.order{margin:0;padding-left:22px;display:grid;gap:10px;max-width:80ch}ol.order li::marker{font-family:var(--mono);color:var(--sodium)}
.checks{display:grid;gap:10px;max-width:86ch}.check{display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;border-bottom:1px solid var(--line);padding-bottom:10px}
@media (max-width:640px){.check{grid-template-columns:1fr;gap:2px}}
.check b{font:600 .85rem var(--mono);color:var(--phosphor)}
.honesty{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.honesty div{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.honesty ul{margin:0;padding-left:18px;font-size:.92rem}.honesty li{margin:4px 0}
.missing{aspect-ratio:16/10;display:grid;place-items:center;background:var(--panel-2);color:var(--muted);border-radius:6px;font-size:.8rem}
nav.toc{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:.9rem}nav.toc a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--line)}nav.toc a:hover{color:var(--ink)}
@media (prefers-reduced-motion:no-preference){summary{transition:color .15s}}
</style>
<main>
<header class="prose" style="max-width:none">
  <div class="eyebrow">Research and design pass · ${esc(new Date(metrics.generatedAt).toISOString().slice(0, 10))} · no production lighting changed</div>
  <h1>The light is computed, then thrown away</h1>
  <p class="lede">${DESIGN.lede}</p>
  <nav class="toc" aria-label="Sections"><a href="#findings">Findings</a><a href="#stations">Stations</a><a href="#previews">Live previews</a><a href="#sweep">Exposure sweep</a><a href="#reference">Reference</a><a href="#intent">Intent</a><a href="#design">Design</a><a href="#budget">Budget</a><a href="#proof">Proof</a><a href="#order">Order of work</a><a href="#honesty">Measured vs estimated</a></nav>
</header>

<section id="findings">
  <h2>What the measurements say</h2>
  <div class="findings">${DESIGN.findings(stations, refs).map(f => `<div class="finding"><div class="figure">${f.figure}</div><h3>${f.title}</h3><p>${f.body}</p></div>`).join('')}</div>
  <div class="chart-card"><h4>Tones the player can tell apart, per station and in eight night photographs</h4>${tonesChart}
    <div class="key"><span><i style="background:var(--conservatoire)"></i>Conservatoire</span><span><i style="background:var(--exterior)"></i>Exterior</span><span><i style="background:var(--drive)"></i>Drive</span><span><i style="background:var(--source)"></i>Source</span><span><i style="background:var(--photo)"></i>Photograph</span></div>
    <p class="caption" style="max-width:none">The frame is averaged over 8 px cells (about what the eye fuses at arm's length), converted to CIE L* and split into 4-L* bins. A tone counts when at least 1% of the frame falls in it.</p></div>
  <div class="chart-card"><h4>Share of the lit scene that reaches a visible value on screen (L* ≥ 8)</h4>${visibleChart}</div>
</section>

<section id="method" class="method">
  <h3>How this was measured</h3>
  <ul>
    <li>The dev build, unchanged, in headless Chrome on this machine's GPU: <code>${esc(env.renderer)}</code>, canvas ${env.canvas?.join(' × ')}, world rendered at ${stations[0]?.where ? '' : ''}1120 × 700 (render scale auto). Audio decoding was replaced with silence to fit in memory; light does not depend on it.</li>
    <li>An injected script (<code>tools/chunk_surfer/lighting-audit/inject.js</code>) watches the WebGL calls the renderer already makes. It adds a clay switch to the two lit shaders as they compile in that page, zeroes or scales the light uniforms it uploads, reads the linear scene buffers and times passes with GPU timer queries. No game file was edited, so the instrumentation cannot ship.</li>
    <li>Fourteen fixed stations, reached through the god hooks and Source presets (<code>stations.mjs</code>). At each: the screen, a clay frame, one frame per light, the renderer's light list, then timing with lights on, local lights off, and all lights off.</li>
    <li>Rerun with <code>node tools/chunk_surfer/lighting-audit/capture.mjs</code>, <code>analyse.mjs</code> and <code>report.mjs</code>, against a dev server on port 5547.</li>
  </ul>
</section>

<section id="stations">
  <h2>Stations</h2>
  <p class="prose">${DESIGN.stationsIntro}</p>
  <div class="stations">
  ${Object.keys(SPACES).map(space => { const list = stations.filter(s => s.space === space); return list.length ? `<div class="space-heading"><h3>${SPACES[space]}</h3><span>${list.length} station${list.length > 1 ? 's' : ''}</span></div>${list.map(stationCard).join('')}` : ''; }).join('')}
  </div>
</section>


<section id="previews">
  <h2>Live previews of the two rig changes</h2>
  <div class="verdict"><p>${DESIGN.verdict}</p></div>
  <p class="prose">${DESIGN.previewsIntro}</p>
  <div class="prose">${DESIGN.previewSummary(stations)}</div>
  ${stations.map(previewRow).join('')}
</section>

<section id="sweep">
  <h2>How far to push exposure</h2>
  <p class="prose">${DESIGN.sweepIntro}</p>
  <div class="prose">${DESIGN.sweepSummary(stations)}</div>
  ${stations.map(sweepRow).join('')}
</section>

<section id="reference">
  <h2>What real night light does</h2>
  <p class="prose">${DESIGN.referenceIntro}</p>
  <div class="refs">${refs.map(refCard).join('')}</div>
</section>

<section id="intent">
  <h2>Intent, per space</h2>
  <p class="prose">${DESIGN.intentIntro}</p>
  <div class="intents">${DESIGN.intents.map(i => `<div class="intent space-${i.space}"><h3>${i.title}</h3><p><b>Key.</b> ${i.key}</p><p><b>Shadows.</b> ${i.shadows}</p><p><b>The eye lands on.</b> ${i.eye}</p><p class="muted">${i.target}</p></div>`).join('')}</div>
</section>

<section id="design">
  <h2>Design</h2>
  <h3>A · Changes to the existing rig</h3>
  <p class="prose">${DESIGN.groupAIntro}</p>
  ${proposalTable(DESIGN.rig)}
  <h3>B · New rendering work</h3>
  <p class="prose">${DESIGN.groupBIntro}</p>
  ${proposalTable(DESIGN.rendering)}
  <p class="prose muted">${DESIGN.considered}</p>
</section>

<section id="budget">
  <h2>Budget</h2>
  <div class="prose">${DESIGN.budget(stations)}</div>
  <div class="chart-card"><h4>Frame time to finish, lights as now (median of 50 frames)</h4>${costChart}</div>
  ${DESIGN.budgetTable(stations)}
</section>

<section id="proof">
  <h2>Proof: what decides success later</h2>
  <p class="prose">${DESIGN.proofIntro}</p>
  <div class="checks">${DESIGN.checks.map(c => `<div class="check"><b>${c.name}</b><div>${c.text}</div></div>`).join('')}</div>
</section>

<section id="order">
  <h2>Recommended order of work</h2>
  <ol class="order">${DESIGN.order.map(o => `<li>${o}</li>`).join('')}</ol>
</section>

<section id="honesty">
  <h2>Measured vs estimated</h2>
  <div class="honesty">${DESIGN.honesty.map(h => `<div><h4>${h.title}</h4><ul>${h.items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('')}</div>
</section>
</main>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
const bytes = Object.keys(files).reduce((sum, name) => sum + fs.statSync(path.join(out, name)).size, 0);
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(Object.keys(files), null, 1));
console.log(JSON.stringify({out, images: Object.keys(files).length, megabytes: +(bytes / 1048576).toFixed(1), htmlKB: Math.round(html.length / 1024)}));
