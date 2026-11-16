// Builds artifacts/van-icon-m62/index.html from report.json. Opens from disk.
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const dir = resolve(import.meta.dirname, '../artifacts/van-icon-m62');
const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));

const SHAPES = {
  'm62-squircle': 'Drawn into the art at Apple’s 824/1024 body. This is what the Dock tile needs, because the game’s animated tile draws its own image and the system never masks it.',
  'm62-bleed': 'No shape of its own. The master for anything that masks or crops for you: macOS 26 Finder/Launchpad, and Steam’s square JPG.',
  'm62-tile': 'A square with lightly rounded corners at 92% of the canvas. Close to the Mac shape without copying it.',
  'm62-roundel': 'A circle of lit road. The van is the same size as in the other shapes; only the cut differs.',
  'm62-chunk': 'A slab of carriageway with its cut face showing. A second composition: the van is smaller and the camera sits lower in the frame.',
};
const SYSTEMS = [
  {id: '1', name: 'One road, each platform’s own cut', mac: 'm62-squircle', win: 'm62-tile', linux: 'm62-tile', steam: 'm62-bleed',
    pros: ['Same picture, same van size everywhere; only the corner treatment changes.', 'Every cut comes from one full-bleed master, so future platforms are a new mask, not new art.', 'Steam’s square JPG is the master itself, with no black corners.'],
    cons: ['The tile nearly fills the canvas. GNOME’s guideline says app icons “shouldn’t fill this space”, so it will look a little heavy next to GNOME’s own icons.', 'Three slightly different outlines in screenshots and press material.']},
  {id: '2', name: 'Apple squircle everywhere', mac: 'm62-squircle', win: 'm62-squircle', linux: 'm62-squircle', steam: 'm62-bleed',
    pros: ['One outline to remember; simplest export.', 'The 80% body leaves the margin GNOME asks for.'],
    cons: ['Reads as a Mac port on Windows and is the smallest icon on a Windows taskbar.', 'Steam still needs the square, so there are two shapes in practice anyway.']},
  {id: '3', name: 'Squircle on Mac, roundel elsewhere', mac: 'm62-squircle', win: 'm62-roundel', linux: 'm62-roundel', steam: 'm62-bleed',
    pros: ['A circle is at home on GNOME and Windows and is clearly not a Mac icon.', 'The pool-of-light idea gives the circle a reason to exist.'],
    cons: ['The circle clips the edge line and the van’s shadow more tightly; at 16–24 px it is mostly van.', 'The road reads less as a road: the line has less run.']},
  {id: '4', name: 'Squircle on Mac, road chunk elsewhere', mac: 'm62-squircle', win: 'm62-chunk', linux: 'm62-chunk', steam: 'm62-bleed',
    pros: ['A free silhouette is what Microsoft (“transparent icons look best”) and GNOME (top face plus a darker front profile) both describe.', 'It is a chunk, which is the game’s name.'],
    cons: ['The van is about 20% smaller than in the plated shapes, so it is weakest at 16–24 px.', 'Two compositions to keep in step, not one picture with different masks.', 'The slab is new art direction that the game itself does not show.']},
];
const DOCS = [
  ['macOS', 'Apple’s current guidelines: icons are a 1024 px square and “the system applies masking to produce rounded corners”; background layers must be “full-bleed and opaque”. The game’s Dock tile is a custom view, so there the shape has to be in the art.', 'https://developer.apple.com/design/human-interface-guidelines/app-icons'],
  ['Windows', '“Apps should have, at the bare minimum: 16x16, 24x24, 32x32, 48x48, and 256x256.” Transparent icons “look best”, but “if your app’s branding requires your icon be plated on a background, that’s okay too.” At least half the icon should pass 3:1 contrast on light and dark.', 'https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-construction'],
  ['GNOME', '“App icons are drawn within a 128×128px area, but shouldn’t fill this space.” Typically viewed at 64 px, down to 32 px. “Do not draw shadows outside the main silhouette of the icon.”', 'https://developer.gnome.org/hig/guidelines/app-icons.html'],
  ['Steam', 'App icon: “184px by 184px JPG”, used in the library list, chat and notifications. Shortcut icon: 256 or 512 px ICO/PNG; if it is reused for the app icon, “any alpha will be replaced with solid black”. A Mac ICNS is uploaded separately.', 'https://partner.steamgames.com/doc/store/assets/community'],
  ['itch.io', 'itch has no icon slot of its own: the page and the itch app show the cover image (630×500 recommended, per itch community guidance; not checked against an official page). The installed game uses the same OS icons as above.', 'https://itch.io/docs/creators/'],
];
const data = {report, shapes: SHAPES, systems: SYSTEMS};

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Van icon · M62 shapes</title>
<style>
:root{color-scheme:dark;--bg:#14161b;--card:#1d2027;--ink:#ece6da;--dim:#a39f99;--line:#2e323a;--accent:#e0a24a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:1240px;margin:0 auto;padding:32px 24px 80px}h1{font:400 34px Georgia,serif;margin:0 0 6px}h2{font:400 24px Georgia,serif;margin:0}
h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:18px 0 8px;font-weight:600}
p{max-width:84ch;color:#cfc9bf}.dim{color:var(--dim);font-size:13px}a{color:var(--accent)}
.bar{position:sticky;top:0;z-index:5;background:#14161bee;backdrop-filter:blur(6px);padding:10px 0;border-bottom:1px solid var(--line);display:flex;gap:18px;flex-wrap:wrap;align-items:center}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg button{font:inherit;font-size:13px;background:none;color:var(--ink);border:0;padding:6px 12px;cursor:pointer}
.seg button[aria-pressed=true]{background:#3a3f49}button.go{font:inherit;font-size:13px;background:var(--accent);color:#1b1408;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:22px 0}
.shapes{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.shape{text-align:center}.shape b{display:block;margin-top:8px}.shape p{font-size:13px;text-align:left;margin:6px 0 0}
.stage{border-radius:12px;padding:16px;display:flex;align-items:flex-end;justify-content:center;gap:14px;flex-wrap:wrap}
.light .stage{background:#e8e6e0}.dark .stage{background:#101216}
.ladder{justify-content:flex-start;overflow:auto;flex-wrap:nowrap}.ladder figure{margin:0;font-size:11px;color:#777;text-align:center}
.mocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.mock{border-radius:12px;overflow:hidden;border:1px solid var(--line)}
.mock h4{margin:0;padding:7px 12px;font-size:12px;font-weight:600;color:var(--dim);background:#171a20}.scene{height:150px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px}
.light .scene{background:linear-gradient(#b9c8d8,#9fb4c8)}.dark .scene{background:linear-gradient(#222a36,#171c24)}
.shelf{display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:18px}
.light .dock{background:rgba(246,246,248,.6)}.dark .dock{background:rgba(40,42,50,.75)}
.taskbar{border-radius:0;width:100%;justify-content:center;padding:6px}.light .taskbar{background:#eef1f6}.dark .taskbar{background:#1c2026}
.dash{background:rgba(24,24,26,.85)}
.ph{border-radius:22%;opacity:.9}.dash .ph{border-radius:50%}.taskbar .ph{border-radius:18%}
.steam{background:#1b2838!important;flex-direction:column;align-items:stretch!important;justify-content:center!important;padding:10px 0 10px!important;gap:2px}
.row{display:flex;align-items:center;gap:8px;padding:3px 14px;color:#b8bcbf;font-size:13px}.row.on{background:#3d4450;color:#fff}.row i{width:16px;height:16px;background:#4a5563;display:block}
.lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}ul{margin:0;padding-left:18px}li{margin:3px 0;color:#d6d0c6}
.choose{font-size:13px;color:var(--accent)}table{border-collapse:collapse;width:100%}td{vertical-align:top;padding:8px 10px;border-top:1px solid var(--line);font-size:14px;color:#cfc9bf}td:first-child{font-weight:600;color:var(--ink);white-space:nowrap}
img{display:block}
</style><main class="light" id="root">
<h1>Van icon · the lit M62, in five shapes</h1>
<p>The amber wall is gone. The van is now stopped on the hard shoulder of the motorway under one sodium column, using the game’s own lamp colour. The road, the edge line, the red studs and the verge are real geometry under the van, and the whole picture goes through the game’s dither (<code>${Object.values(report.options)[0].shader}</code>) once per output size. Nothing in production has changed.</p>
<div class="bar">
 <span class="dim">Desktop</span><div class="seg" id="bg"><button data-bg="light" aria-pressed="true">Light</button><button data-bg="dark" aria-pressed="false">Dark</button></div>
 <button class="go" id="replay">Replay Dock launch</button>
 <span class="dim">Icons are drawn at true device pixels.</span>
</div>
<div class="card"><h2>The five shapes</h2><p class="dim">Same road, same light. Each is rendered separately, not cropped from another.</p><div class="shapes" id="shapes"></div>
<h3>Every size</h3><div id="ladders"></div></div>
<h2 style="margin-top:34px">Four ways to combine them</h2>
<p>Steam’s app icon must be a square JPG, so the full-bleed square is part of every set. The question is what the desktop icons look like next to it.</p>
<div id="systems"></div>
<div class="card"><h2>What the platform documents say</h2><table>${DOCS.map(([k, v, u]) => `<tr><td>${k}</td><td>${v} <a href="${u}">Source</a></td></tr>`).join('')}</table>
<p class="dim">Mocks are not native acceptance. The final check is screenshots from installed builds on each OS. The macOS 26 full-bleed route (Icon Composer) is not built or tested here.</p></div>
</main>
<script>
const DATA=${JSON.stringify(data)};
const dpr=Math.max(1,window.devicePixelRatio||1),O=DATA.report.options,L=DATA.report.launch;
const icon=(name,px,cls)=>{const i=new Image();i.src=name+'/icon-'+px+'.png';i.style.width=i.style.height=px/dpr+'px';if(cls)i.className=cls;return i;};
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;};
const ph=(px,color)=>{const d=el('div','ph');d.style.width=d.style.height=px/dpr*.82+'px';d.style.background=color;return d;};
for(const [name,o] of Object.entries(O)){
  const s=el('div','shape');const st=el('div','stage');st.append(icon(name,256));s.append(st,el('b','',o.label),el('p','dim',DATA.shapes[name]));document.getElementById('shapes').append(s);
  const lad=el('div','stage ladder');lad.style.marginBottom='10px';
  for(const px of [16,20,24,32,40,48,64,128,256]){const f=el('figure');f.append(icon(name,px),document.createTextNode(px));lad.append(f);}
  const t=el('div','dim',o.label);document.getElementById('ladders').append(t,lad);
}
const docks=[];
function mock(title,inner){const m=el('div','mock');m.append(el('h4','',title),inner);return m;}
for(const sys of DATA.systems){
  const card=el('section','card');card.append(el('h2','',sys.id+' · '+sys.name));
  card.append(el('p','dim','macOS: '+O[sys.mac].label+' &nbsp;·&nbsp; Windows: '+O[sys.win].label+' &nbsp;·&nbsp; Linux: '+O[sys.linux].label+' &nbsp;·&nbsp; Steam: '+O[sys.steam].label));
  const mocks=el('div','mocks');
  // macOS Dock: launch atlas, then the static icon.
  const sc=el('div','scene'),sh=el('div','shelf dock');const cv=document.createElement('canvas');cv.width=cv.height=128;cv.style.width=cv.style.height=128/dpr+'px';
  sh.append(ph(128,'#5f86c4'),ph(128,'#7a7f87'),cv,ph(128,'#c25b4d'));sc.append(sh);mocks.append(mock('macOS Dock · 64pt @2x',sc));docks.push({cv,name:sys.mac});
  const w=el('div','scene');w.style.flexDirection='column';w.style.justifyContent='flex-end';w.style.paddingBottom='0';
  for(const px of [48,24]){const tb=el('div','shelf taskbar');tb.append(ph(px,'#3a78d0'),ph(px,'#e2a23a'),icon(sys.win,px),ph(px,'#4aa36a'));if(px===48)tb.style.marginBottom='10px';w.append(tb);}
  mocks.append(mock('Windows 11 taskbar · 200% and 100%',w));
  const g=el('div','scene'),gs=el('div','shelf dash');gs.append(ph(64,'#e66100'),icon(sys.linux,64),ph(64,'#3584e4'),ph(64,'#2ec27e'));g.append(gs);mocks.append(mock('GNOME dash · 64 px',g));
  const s=el('div','scene steam');
  for(const [label,on] of [['Another Game',0],['Chunk Surfer',1],['Some Other Game',0]]){const r=el('div','row'+(on?' on':''));if(on){const i=new Image();i.src=sys.steam+'/icon-16.png';i.style.width=i.style.height='16px';r.append(i);}else r.append(el('i'));r.append(document.createTextNode(label));s.append(r);}
  const big=el('div','row');const j=new Image();j.src=sys.steam+'/steam-app-icon-184.jpg';j.style.width=j.style.height=64+'px';big.append(j,document.createTextNode('184 px JPG, shown at 64'));s.append(big);
  mocks.append(mock('Steam library list',s));
  card.append(mocks);
  const lists=el('div','lists');lists.append(el('div','','<h3>For</h3><ul>'+sys.pros.map(t=>'<li>'+t+'</li>').join('')+'</ul>'),el('div','','<h3>Against</h3><ul>'+sys.cons.map(t=>'<li>'+t+'</li>').join('')+'</ul>'));
  card.append(lists,el('p','choose','To choose: reply “'+sys.id+'”.'));
  document.getElementById('systems').append(card);
}
const atlases={};let start=performance.now();
function frame(now){
  const elapsed=(now-start)/1000,p=Math.min(1,elapsed/L.duration),index=Math.min(L.frameCount-1,Math.floor(p*(L.frameCount-1)));
  for(const d of docks){const a=atlases[d.name]||(atlases[d.name]=Object.assign(new Image(),{src:d.name+'/launch-atlas.png'})),x=d.cv.getContext('2d');
    if(!d.still)d.still=Object.assign(new Image(),{src:d.name+'/icon-128.png'});
    x.clearRect(0,0,128,128);x.imageSmoothingQuality='high';
    if(elapsed>=L.duration||!a.complete||!a.naturalWidth){if(d.still.complete)x.drawImage(d.still,0,0);}
    else x.drawImage(a,index%L.columns*L.cell,Math.floor(index/L.columns)*L.cell,L.cell,L.cell,0,0,128,128);}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
document.getElementById('replay').onclick=()=>{start=performance.now();};
document.getElementById('bg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;for(const o of b.parentNode.children)o.setAttribute('aria-pressed',o===b);document.getElementById('root').className=b.dataset.bg;});
</script></html>`;
await writeFile(join(dir, 'index.html'), html);
console.log(join(dir, 'index.html'));
