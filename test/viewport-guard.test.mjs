import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isViewportTooSmall } from '../src/platform/display-policy.js';
import { ensureViewportFaultOverlay, installViewportGuard, paintViewportFaultReadout, viewportFaultTextRows } from '../src/platform/viewport-guard.js';
import { measureElectronicText } from '../src/render/electronic-text.js';
import { applyVfdSettings, vfdSettings } from '../src/render/palette.js';
import { vfdDomTheme } from '../src/render/vfd-dom.js';

test('viewport guard threshold is exact', () => {
  assert.equal(isViewportTooSmall(960, 600, { width: 960, height: 600 }), false);
  assert.equal(isViewportTooSmall(960, 599, { width: 960, height: 600 }), true);
});

test('viewport guard toggles fault class and overlay', () => {
  const classes = new Set();
  const listeners = new Map();
  const overlay = { hidden: true };
  const doc = {
    head: { appendChild() {} },
    body: {
      appendChild() {},
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      },
    },
    querySelector(selector) { return selector === '[data-viewport-fault]' ? overlay : null; },
    createElement() { return { dataset: {}, className: '', hidden: true, innerHTML: '', textContent: '' }; },
  };
  const win = {
    innerWidth: 900,
    innerHeight: 560,
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name) { listeners.delete(name); },
  };

  const dispose = installViewportGuard({ window: win, document: doc });
  assert.equal(classes.has('viewport-too-small'), true);
  assert.equal(overlay.hidden, false);

  win.innerWidth = 960;
  win.innerHeight = 600;
  listeners.get('resize')();
  assert.equal(classes.has('viewport-too-small'), false);
  assert.equal(overlay.hidden, true);

  dispose();
  assert.equal(listeners.has('resize'), false);
});

test('viewport fault uses the shared VFD machine card', () => {
  let appended = null;
  const doc = {
    head: { appendChild() {} },
    body: { appendChild(node) { appended = node; } },
    querySelector() { return null; },
    createElement() { return { dataset: {}, style: { setProperty() {} }, className: '', hidden: true, innerHTML: '', textContent: '' }; },
  };
  const overlay = ensureViewportFaultOverlay(doc);
  assert.equal(overlay, appended);
  assert.match(overlay.className, /cs-machine-overlay/);
  assert.match(overlay.innerHTML, /cs-machine-panel/);
  assert.match(overlay.innerHTML, /cs-machine-glass/);
  assert.match(overlay.innerHTML, /cs-machine-header/);
  assert.match(overlay.innerHTML, /cs-machine-footer/);
});

test('DOM machine cards resolve the current VFD theme and display settings', () => {
  const previous = { ...vfdSettings };
  try {
    applyVfdSettings({ phosphor: 'green', brightness: 1.2, flicker: 'full' });
    const resolved = vfdDomTheme('amber');
    assert.equal(resolved.variables['--cs-vfd-phosphor'], '#5BF08A');
    assert.equal(resolved.variables['--cs-vfd-glass'], '#040606');
    assert.equal(resolved.brightness, 1.2);
    assert.equal(resolved.flicker, 'full');
  } finally {
    applyVfdSettings(previous);
  }
});

test('viewport fault wraps using character-ROM metrics without losing instruction text',()=>{
  const text='MINIMUM SAFE SIGNAL FRAME 960 × 600';
  for(const width of [72,144,264,600]) {
    const rows=viewportFaultTextRows(text,width,14);
    assert.equal(rows.join('').replaceAll(' ',''),text.replaceAll(' ',''));
    assert.ok(rows.every(row=>measureElectronicText(row,{fontSize:14})<=width));
  }
  assert.deepEqual(viewportFaultTextRows('',300,14),[]);
});

function faultReadoutFixture({dpr=2,available=true}={}) {
  const dots=[],ctx={globalAlpha:1,save(){},restore(){},clearRect(){dots.length=0;},
    beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},
    arc(...args){dots.push(args);},fillRect(){},
    fillText(){throw Error('VFD must not use browser type');},measureText(){throw Error('VFD must not use native metrics');}};
  const canvas={width:0,height:0,setAttribute(k,v){this[k]=v;},getContext:()=>available?ctx:null};
  const accessible={textContent:'VIEWPORT BELOW SAFE SIZE'};let attached=false;
  const node={clientWidth:264,style:{},dataset:{faultReadout:'phosphor'},ownerDocument:{createElement:()=>canvas},
    appendChild(){attached=true;},querySelector:selector=>selector==='canvas'?(attached?canvas:null):accessible};
  const glass={dataset:{},querySelectorAll:()=>[node]};
  const overlay={hidden:false,dataset:{},style:{setProperty(){}},querySelector:()=>glass};
  const win={devicePixelRatio:dpr,getComputedStyle:()=>({fontSize:'20px',lineHeight:'26px',display:'block'})};
  return{overlay,glass,node,canvas,accessible,dots,win};
}

test('viewport fault paints responsive phosphor while retaining polite semantic text',()=>{
  const f=faultReadoutFixture();
  assert.equal(paintViewportFaultReadout(f.overlay,{window:f.win}),true);
  assert.equal(f.glass.dataset.electronicPainted,'true');assert.equal(f.canvas['aria-hidden'],'true');
  assert.equal(f.accessible.textContent,'VIEWPORT BELOW SAFE SIZE');assert.equal(f.accessible['aria-hidden'],undefined);
  assert.equal(f.canvas.width,528);assert.equal(f.canvas.height,104);assert.equal(f.node.style.height,'52px');
  assert.ok(f.dots.length>0);
  f.node.clientWidth=528;paintViewportFaultReadout(f.overlay,{window:f.win});
  assert.equal(f.canvas.width,1056);assert.equal(f.canvas.height,52,'larger frame restores one readout row');
  f.overlay.hidden=true;assert.equal(paintViewportFaultReadout(f.overlay,{window:f.win}),false);
});

test('viewport Canvas failure keeps a non-glass readable service notice',()=>{
  const f=faultReadoutFixture({available:false});
  assert.equal(paintViewportFaultReadout(f.overlay,{window:f.win}),false);
  assert.equal(f.glass.dataset.electronicPainted,undefined);assert.equal(f.accessible.textContent,'VIEWPORT BELOW SAFE SIZE');
  const source=readFileSync('src/platform/viewport-guard.js','utf8');
  assert.match(source,/role="status" aria-live="polite"/);
  assert.match(source,/viewport-fault__display\{[^}]*pointer-events:none/);
  assert.match(source,/viewport-fault__glass:not\(\[data-electronic-painted=true\]\)\{background:#d8d3be;[^}]*box-shadow:none/);
});
