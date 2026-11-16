// Builds artifacts/van-icon-plates/index.html from report.json. Opens from disk.
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const dir = resolve(import.meta.dirname, '../artifacts/van-icon-plates');
const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));

const NOTES = {
  shipped: {
    pros: ['No change; the approved art and its provenance stay valid.'],
    cons: ['The solid van is ~46% × 34% of the canvas. A camera-zoom bug renders it at 1.0 instead of the intended 1.518.',
      'There’s no plate, so the macOS Dock shows bare transparency; at 32px the van is ~15 × 11 px.'],
    os: {macOS: 'Nothing to do.', Linux: 'Packaging fix only (.desktop + hicolor).', Windows: 'Nothing to do.'},
  },
  refit: {
    pros: ['Smallest change: same identity, no new colour, and the zoom bug is fixed.', 'Solid coverage ~1.8× today; small sizes gain the most.',
      'Fits GNOME and Windows conventions, which allow free-form silhouettes.'],
    cons: ['Still transparent, so the macOS Dock still shows no plate.', 'macOS 26 Finder/Launchpad may give a non-squircle icon its legacy treatment (not verifiable on Linux).',
      'The rain is mostly invisible on light docks.'],
    os: {macOS: 'Re-export atlas + ICNS + DockTile.icns. No DockAssembly.m change.', Linux: 'hicolor PNGs from the same rasters.', Windows: 'ICO from the same rasters.'},
  },
  puddle: {
    pros: ['Keeps a cut-out character; a round island is a shape every OS accepts.', 'The van sits in its own world: wet ground, shadow and rain clipped to the island.'],
    cons: ['The dark disc edge is weak on dark docks/dash and is carried only by the hatch texture.',
      'Not a squircle, so the same macOS 26 legacy-treatment risk as D.'],
    os: {macOS: 'Re-export with the plate baked into every atlas frame. No DockAssembly.m change.', Linux: 'hicolor PNGs.', Windows: 'ICO.'},
  },
  street: {
    pros: ['Fills Apple’s 824/1024 body, so it reads as a native macOS icon.', 'Most continuity with the game: night asphalt, real shadow, rain falls on the plate.'],
    cons: ['Dark plate on a dark Dock: its edge depends on texture, not contrast.',
      'A squircle on Windows/GNOME reads as a macOS import (can be paired with D there).', 'Heavier handoff shimmer at 128/512 (~15–19% of pixels re-dither).'],
    os: {macOS: 'Re-export atlas + ICNS + DockTile.icns with the plate baked in.', Linux: 'Squircle or D silhouette in hicolor.', Windows: 'Squircle or D silhouette in ICO.'},
  },
  sodium: {
    pros: ['Highest contrast on light, dark and tinted backgrounds; distinctive in a row of icons.', 'Fills the macOS body.'],
    cons: ['Amber is a new brand colour decision.', 'The crosshatch is very visible on a flat colour: on-brand, but busy at 64–128px.',
      'Largest handoff shimmer (~19–23% of pixels at 128/512).'],
    os: {macOS: 'Re-export with the plate baked in.', Linux: 'hicolor PNGs.', Windows: 'ICO; same squircle-on-Windows caveat as A.'},
  },
};
const ORDER = ['shipped', 'refit', 'puddle', 'street', 'sodium'].filter(name => report.options[name]);
const data = {report, notes: NOTES, order: ORDER, sizes: [16, 24, 32, 48, 64, 128, 256, 512, 1024]};

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Van icon · plate options</title>
<style>
:root{color-scheme:dark;--bg:#14161b;--card:#1d2027;--ink:#ece6da;--dim:#a39f99;--line:#2e323a;--accent:#d7a85b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:1240px;margin:0 auto;padding:32px 24px 80px}h1{font:400 34px Georgia,serif;margin:0 0 6px}h2{font:400 24px Georgia,serif;margin:0}
h3{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:18px 0 8px;font-weight:600}
p{max-width:84ch;color:#cfc9bf}.dim{color:var(--dim);font-size:13px}code{color:#e3c995}
.diag{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin:18px 0 26px}
.diag div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.tag{font-size:11px;font-weight:700;letter-spacing:.08em;padding:2px 7px;border-radius:5px;margin-right:6px}
.design{background:#5b3d1a;color:#f3cf94}.pack{background:#1d4a45;color:#9fe1d5}.bug{background:#5a2222;color:#f2a3a3}
.bar{position:sticky;top:0;z-index:5;background:#14161bee;backdrop-filter:blur(6px);padding:10px 0;border-bottom:1px solid var(--line);display:flex;gap:18px;flex-wrap:wrap;align-items:center}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg button{font:inherit;font-size:13px;background:none;color:var(--ink);border:0;padding:6px 12px;cursor:pointer}
.seg button[aria-pressed=true]{background:#3a3f49}button.go{font:inherit;font-size:13px;background:var(--accent);color:#1b1408;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;font-weight:600}
.option{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin:22px 0}.option header{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:baseline}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}canvas{display:block;max-width:100%}
.frame{border-radius:12px;overflow:auto}.lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
ul{margin:0;padding-left:18px}li{margin:3px 0;color:#d6d0c6}.os dt{font-weight:600;margin-top:6px}.os dd{margin:0;color:#cfc9bf}
.metric{font-variant-numeric:tabular-nums;font-size:13px;color:var(--dim)}.choose{font-size:13px;color:var(--accent)}
</style><main>
<h1>Van icon · plate options</h1>
<p>Each option is rendered from <code>transit.glb</code> through the approved <code>renderer.mjs</code> and the game’s acquisition shader (<code>${report.options.street?.shader || ''}</code>), once per output size. Plates are real scene geometry under the van, baked into every Dock frame. Nothing is composited onto the van afterwards.</p>
<div class="diag">
 <div><span class="tag design">DESIGN</span><b>macOS: no plate.</b><p class="dim">The art is a transparent van (≈11.5% solid pixels). The running Dock tile and the closed-app plugin both replace the Dock’s rendering with a plain image view (<code>DockAssembly.m</code>, <code>ChunkSurferDockTile.m</code>). macOS never adds a shape, plate or dark/tinted variant there, so any plate must be in the art.</p></div>
 <div><span class="tag bug">BUG</span><b>The van renders 1.5× too small.</b><p class="dim"><code>renderer.mjs:98</code> sets <code>camera.zoom = ${report.approvedCamera.zoomField.toFixed(3)}</code>, but its <code>updateProjectionMatrix()</code> fell into the line’s comment. Measured in the live renderer, the projection in effect is <code>${report.approvedCamera.projectionScale}</code>.</p></div>
 <div><span class="tag pack">PACKAGING</span><b>Linux: generic gear.</b><p class="dim">The window’s Wayland app ID is <code>chunk-surfer</code>. Dev runs install no <code>.desktop</code> file or <code>hicolor</code> icons, so GNOME has nothing to match. The art isn’t involved.</p></div>
 <div><span class="tag pack">PACKAGING</span><b>macOS dark/tinted modes.</b><p class="dim">There’s no <code>CFBundleIconName</code>/asset catalog. Adding an Icon Composer icon would theme Finder/Launchpad, but the Dock tile (custom view) would still show the baked art. They would differ.</p></div>
</div>
<div class="bar">
 <span class="dim">Background</span><div class="seg" id="bg"><button data-bg="light" aria-pressed="true">Light</button><button data-bg="dark">Dark</button><button data-bg="tinted">Tinted*</button></div>
 <span class="dim">Dock tile drawn at</span><div class="seg" id="tile"><button data-size="128" aria-pressed="true">64pt @2x (128px)</button><button data-size="256">128pt @2x (256px)</button><button data-size="512">magnified (512px)</button></div>
 <button class="go" id="replay">Replay launch</button>
 <span class="dim">*Tinted approximates macOS 26 auto-tint for legacy icons. The running Dock tile is never tinted.</span>
</div>
<div id="options"></div>
<p class="dim">Mocks are drawn from the exported PNGs at true device pixels. They are not native acceptance: the final check is screenshots from installed builds.</p>
</main>
<script>
const DATA=${JSON.stringify(data)};
const BG={light:'#e8e6e0',dark:'#12141a',tinted:'#1a1712'};
const state={bg:'light',tile:128,start:performance.now()};
const dpr=Math.max(1,window.devicePixelRatio||1);
const images={};
function img(src){return images[src]||(images[src]=Object.assign(new Image(),{src}));}
for(const name of DATA.order){for(const s of DATA.sizes)img(name+'/icon-'+s+'.png');img(name+'/launch-atlas.png');img(name+'/handoff-last-frame.png');for(const s of [128,256,512])img(name+'/handoff-diff-'+s+'.png');}
function canvas(w,h){const c=document.createElement('canvas');c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.width=w+'px';c.style.height=h+'px';const x=c.getContext('2d');x.imageSmoothingQuality='high';return [c,x];}
// Draws an icon so one source pixel is one device pixel when size matches.
function drawIcon(x,image,px,py,devicePx){
  if(!image.complete||!image.naturalWidth)return;
  const css=devicePx/dpr;
  if(state.bg==='tinted'){x.save();x.filter='grayscale(1) brightness(1.15) contrast(1.05)';x.drawImage(image,px,py,css,css);x.restore();
    x.save();x.globalCompositeOperation='source-atop';x.globalAlpha=.55;x.fillStyle='#e0a24a';x.fillRect(px,py,css,css);x.restore();}
  else x.drawImage(image,px,py,css,css);
}
function squircle(x,cx,cy,r,n=5){x.beginPath();for(let i=0;i<=128;i++){const a=i/128*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
  x.lineTo(cx+Math.sign(c)*Math.abs(c)**(2/n)*r,cy+Math.sign(s)*Math.abs(s)**(2/n)*r);}x.closePath();}
// DockAssembly.m: frame = floor(progress * (frameCount-1)); then the static icon.
function dockFrame(name,elapsed){
  const L=DATA.report.launch;const p=Math.min(1,elapsed/L.duration);
  return {done:elapsed>=L.duration,index:Math.min(L.frameCount-1,Math.floor(p*(L.frameCount-1)))};
}
function drawTile(x,name,px,py,devicePx,elapsed){
  const f=dockFrame(name,elapsed),css=devicePx/dpr,L=DATA.report.launch;
  if(f.done){drawIcon(x,img(name+'/icon-'+devicePx+'.png'),px,py,devicePx);return;}
  const atlas=img(name+'/launch-atlas.png');if(!atlas.complete)return;
  const sx=f.index%L.columns*L.cell,sy=Math.floor(f.index/L.columns)*L.cell;
  if(state.bg==='tinted'){drawIcon(x,img(name+'/icon-'+devicePx+'.png'),px,py,devicePx);return;}
  x.drawImage(atlas,sx,sy,L.cell,L.cell,px,py,css,css);
}
const views=[];
function build(){
  const root=document.getElementById('options');
  for(const name of DATA.order){
    const o=DATA.report.options[name],n=DATA.notes[name],sec=document.createElement('section');sec.className='option';
    const handoff=o.handoff.map(h=>h.size+'px: '+(h.changedPixels*100).toFixed(1)+'% pixels differ').join(' · ');
    sec.innerHTML='<header><h2>'+o.label+'</h2><span class="metric">'+(o.opaqueFraction!=null?'solid coverage '+Math.round(o.opaqueFraction*100)+'% · ':'')+'handoff '+handoff+'</span></header><p>'+o.summary+'</p>'
      +'<h3>Every size, actual device pixels</h3><div class="frame" data-k="ladder"></div>'
      +'<div class="grid"><div><h3>macOS Dock · launch, then handoff</h3><div data-k="dock"></div></div><div><h3>GNOME dash · 64px</h3><div data-k="gnome"></div></div></div>'
      +'<h3>Handoff · last Dock frame vs static icon</h3><div class="frame" data-k="handoff"></div>'
      +'<div class="lists"><div><h3>For</h3><ul>'+n.pros.map(t=>'<li>'+t+'</li>').join('')+'</ul></div><div><h3>Against</h3><ul>'+n.cons.map(t=>'<li>'+t+'</li>').join('')+'</ul></div>'
      +'<div><h3>Per OS</h3><dl class="os">'+Object.entries(n.os).map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl></div></div>'
      +(name==='shipped'?'':'<p class="choose">To choose: reply “'+o.label.split(' · ')[0]+'”.</p>');
    root.append(sec);
    const ladderW=DATA.sizes.reduce((a,s)=>a+s/dpr+28,24);
    const [lc,lx]=canvas(ladderW,1024/dpr+48);sec.querySelector('[data-k=ladder]').append(lc);
    const [dc,dx]=canvas(520,190);sec.querySelector('[data-k=dock]').append(dc);
    const [gc,gx]=canvas(420,190);sec.querySelector('[data-k=gnome]').append(gc);
    const [hc,hx]=canvas(3*(512/dpr)+3*(512/dpr)+80,512/dpr+60);sec.querySelector('[data-k=handoff]').append(hc);
    views.push({name,lc,lx,dc,dx,gc,gx,hc,hx});
  }
}
function paintStatic(v){
  const {lx,lc,hx,hc,name}=v,bg=BG[state.bg];
  lx.setTransform(dpr,0,0,dpr,0,0);lx.fillStyle=bg;lx.fillRect(0,0,lc.width,lc.height);
  let x=12;const base=1024/dpr+12;lx.font='12px system-ui';lx.fillStyle=state.bg==='light'?'#555':'#aaa';
  for(const s of DATA.sizes){const css=s/dpr;drawIcon(lx,img(name+'/icon-'+s+'.png'),x,base-css,s);lx.fillText(s+'',x,base+18);x+=css+28;}
  hx.setTransform(dpr,0,0,dpr,0,0);hx.fillStyle='#0d0f13';hx.fillRect(0,0,hc.width,hc.height);hx.font='12px system-ui';
  const size=state.tile,css=size/dpr,last=img(name+'/handoff-last-frame.png');let hxp=12;
  const pairs=[['last Dock frame (256px cell) at '+size,()=>{hx.fillStyle=BG[state.bg];hx.fillRect(hxp,24,css,css);hx.drawImage(last,hxp,24,css,css);}],
    ['static icon '+size+'px',()=>{hx.fillStyle=BG[state.bg];hx.fillRect(hxp,24,css,css);drawIcon(hx,img(name+'/icon-'+size+'.png'),hxp,24,size);}],
    ['difference ×3',()=>{const d=img(name+'/handoff-diff-'+size+'.png');if(d.complete)hx.drawImage(d,hxp,24,css,css);}]];
  for(const [label,draw] of pairs){hx.fillStyle='#aaa';hx.fillText(label,hxp,16);if(last.complete)draw();hxp+=css+24;}
  const h=DATA.report.options[name].handoff.find(h=>h.size===size);hx.fillStyle='#d7a85b';hx.fillText((h.changedPixels*100).toFixed(1)+'% pixels differ · mean Δ '+h.meanDelta,hxp,40);
}
function paintLive(v,elapsed){
  const {dx,dc,gx,gc,name}=v,dark=state.bg!=='light';
  dx.setTransform(dpr,0,0,dpr,0,0);dx.fillStyle=state.bg==='light'?'#9fb4c8':'#232a35';dx.fillRect(0,0,dc.width,dc.height);
  const tile=Math.min(state.tile,256),css=tile/dpr,shelfH=css+28,y0=190-shelfH-8;
  dx.fillStyle=dark?'rgba(30,32,38,.72)':'rgba(246,246,248,.55)';dx.beginPath();dx.roundRect(16,y0,488,shelfH,22);dx.fill();
  const slots=5,gap=(488-slots*css)/(slots+1);
  for(let i=0;i<slots;i++){const px=16+gap+i*(css+gap),py=y0+14;
    if(i===2){drawTile(dx,name,px,py,tile,elapsed);dx.fillStyle=dark?'#ddd':'#333';dx.beginPath();dx.arc(px+css/2,y0+shelfH-5,2,0,7);dx.fill();}
    else{squircle(dx,px+css/2,py+css/2,css*.4);dx.fillStyle=['#5f86c4','#7a7f87','','#c25b4d','#5aa06c'][i];dx.fill();}}
  gx.setTransform(dpr,0,0,dpr,0,0);gx.fillStyle=state.bg==='light'?'#c9ccd3':'#202228';gx.fillRect(0,0,gc.width,gc.height);
  const g=64/dpr;gx.fillStyle='rgba(24,24,26,.82)';gx.beginPath();gx.roundRect(30,190-g-46,360,g+30,18);gx.fill();
  for(let i=0;i<4;i++){const px=50+i*(g+28),py=190-g-31;
    if(i===1){drawIcon(gx,img(name+'/icon-64.png'),px,py,64);gx.fillStyle='#ddd';gx.beginPath();gx.arc(px+g/2,py+g+9,2,0,7);gx.fill();}
    else{gx.fillStyle=['#e66100','','#3584e4','#2ec27e'][i];gx.beginPath();gx.arc(px+g/2,py+g/2,g*.42,0,7);gx.fill();}}
}
function frame(now){const elapsed=(now-state.start)/1000;for(const v of views)paintLive(v,elapsed);requestAnimationFrame(frame);}
function repaint(){for(const v of views)paintStatic(v);}
function seg(id,key,parse){document.getElementById(id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  for(const o of b.parentNode.children)o.setAttribute('aria-pressed',o===b);state[key]=parse(b.dataset);repaint();});}
seg('bg','bg',d=>d.bg);seg('tile','tile',d=>Number(d.size));
document.getElementById('replay').onclick=()=>{state.start=performance.now();};
build();Promise.all(Object.values(images).map(i=>i.decode().catch(()=>{}))).then(()=>{repaint();state.start=performance.now();requestAnimationFrame(frame);});
</script></html>`;
await writeFile(join(dir, 'index.html'), html);
console.log(join(dir, 'index.html'));
