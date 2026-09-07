import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawHardwareCap, hardwareCapGeometry, hardwarePigment, clearHardwareMaterialCache, hardwareMaterialCacheStats } from '../src/render/hardware-material.js';
import { hardwarePromptIds } from '../src/game/hardware-prompts.js';

function canvasProbe() {
  const calls=[], surfaces=[];
  const make = () => {
    const stack=[];
    const canvas={width:0,height:0,ownerDocument:owner};
    const ctx={canvas,globalAlpha:1,shadowBlur:0,
      save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},
      createLinearGradient(){return {addColorStop(){}};},
      createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
      putImageData(image){canvas.image=image;calls.push(['bake']);},
      drawImage(image,...args){calls.push(['image',image,...args,this.globalAlpha]);},
    };
    for(const method of ['translate','beginPath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','closePath','clip','fill','stroke','fillRect'])ctx[method]=(...args)=>calls.push([method,...args]);
    canvas.getContext=()=>ctx;
    return canvas;
  };
  const owner={createElement(kind){assert.equal(kind,'canvas');const c=make();surfaces.push(c);return c;}};
  const canvas=make();
  return {ctx:canvas.getContext('2d'),calls,surfaces};
}

test('cap forming scales with DPI, preserves a fixed socket, and moves the complete content box',()=>{
  for(const finish of ['lens','opaque','keycap']) for(const [w,h] of [[26,25],[34,32],[110,44],[260,64]]) {
    const up=hardwareCapGeometry(w,h,0,{finish}),down=hardwareCapGeometry(w,h,1,{finish});
    assert.equal(up.w,down.w);assert.equal(up.h,down.h);assert.equal(up.rim,down.rim);
    assert.ok(Math.abs(down.content.y-up.content.y-up.distance)<1e-9);
    assert.equal(up.content.w,down.content.w);
    assert.ok(down.content.x>=0&&down.content.y>=0);
    assert.ok(down.content.x+down.content.w<=w&&down.content.y+down.content.h<=h);
    const high=hardwareCapGeometry(w*2,h*2,1,{dpr:2,finish});
    for(const k of ['x','y','w','h'])assert.ok(Math.abs(high.content[k]/2-down.content[k])<1e-8);
  }
});

test('coloured polymer has distinct unlit pigments and invalid colours have a safe material',()=>{
  assert.ok(hardwarePigment('red').off[0]>hardwarePigment('red').off[1]*1.5);
  assert.ok(hardwarePigment('blue').off[2]>hardwarePigment('blue').off[0]);
  assert.deepEqual(hardwarePigment('not-a-colour'),hardwarePigment('amber'));
  assert.deepEqual(hardwarePigment('#ff8000').on,[255,128,0]);
});

test('material fields are baked once; lamp heat and cap travel never allocate a new decoder or field',()=>{
  clearHardwareMaterialCache();const p=canvasProbe();
  drawHardwareCap(p.ctx,10,10,130,54,{color:'amber'});
  assert.equal(p.surfaces.length,2);
  for(let n=0;n<60;n++)drawHardwareCap(p.ctx,10,10,130,54,{color:'amber',travel:n/59,lampHeat:n/59,focused:n%2===0});
  assert.equal(p.surfaces.length,2);assert.equal(p.calls.filter(c=>c[0]==='bake').length,2);
  const off=p.surfaces[0].image,on=p.surfaces[1].image;
  const at=(Math.floor(on.height*.62)*on.width+Math.floor(on.width*.43))*4;
  assert.ok(on.data[at]>off.data[at]+50,'internal lamp hotspot');
  assert.ok(on.data[at+1]>on.data[5]+40,'thick perimeter remains darker');
});

test('opaque transport keys never flood and rendering composes the caller alpha',()=>{
  clearHardwareMaterialCache();const p=canvasProbe();p.ctx.globalAlpha=.4;
  drawHardwareCap(p.ctx,0,0,70,34,{color:'white',finish:'opaque',lampHeat:1,alpha:.5});
  const images=p.calls.filter(c=>c[0]==='image');assert.equal(images.length,1);
  assert.equal(images[0].at(-1),.2);assert.equal(p.ctx.globalAlpha,.4);
});

test('unlit legends have readable central fields; disabling does not erase polymer colour',()=>{
  const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  for(const color of ['amber','red','green','blue','white']) {
    clearHardwareMaterialCache();const p=canvasProbe();drawHardwareCap(p.ctx,0,0,130,54,{color});
    const image=p.surfaces[0].image,at=(Math.floor(image.height*.5)*image.width+Math.floor(image.width*.5))*4;
    const contrast=(luminance(Array.from(image.data.slice(at,at+3)))+.05)/(luminance([18,21,13])+.05);
    assert.ok(contrast>=4.5,`${color} centre contrast ${contrast.toFixed(2)}`);
    drawHardwareCap(p.ctx,0,0,130,54,{color,enabled:false});
    assert.equal(p.surfaces.length,2,'disabled uses the very same plastic fields');
  }
});

test('resizing has a bounded material cache and explicit cleanup',()=>{
  clearHardwareMaterialCache();const p=canvasProbe();
  for(let i=0;i<70;i++)drawHardwareCap(p.ctx,0,0,24+i,26,{color:'red'});
  const stats=hardwareMaterialCacheStats();assert.ok(stats.entries<=stats.maxEntries);assert.ok(stats.pixels<=stats.maxPixels);
  clearHardwareMaterialCache();assert.equal(hardwareMaterialCacheStats().pixels,0);
});

test('keyboard cap aliases track physical authored keys and release combined confirm hints',()=>{
  assert.deepEqual(hardwarePromptIds({code:'KeyF',key:'f'}),['prompt:F']);
  assert.deepEqual(hardwarePromptIds({key:'r'}),['prompt:R']);
  assert.deepEqual(hardwarePromptIds({code:'Space',key:' '}),['prompt:SPACE','prompt:ENTER / SPACE']);
  assert.deepEqual(hardwarePromptIds({code:'Escape'}),['prompt:ESC']);
  assert.deepEqual(hardwarePromptIds({code:'ShiftRight'}),['prompt:SHIFT']);
  assert.deepEqual(hardwarePromptIds({controller:true,key:'f'}),[]);
});

test('production integration keeps plastic print separate from VFD and includes focus-loss cleanup',()=>{
  const keycap=readFileSync('src/render/keycap.js','utf8');
  assert.doesNotMatch(keycap,/drawVfdGlyph/);assert.match(keycap,/drawHardwarePrint/);
  const panel=readFileSync('src/render/presentation.js','utf8');
  assert.match(panel,/drawInstrumentPlate\(/);assert.match(panel,/drawPrintedText\(/);
  assert.match(readFileSync('src/render/instrument-material.js','utf8'),/drawHardwareScrew\(/,
    'the machined plate still owns physical fasteners through its shared material helper');
  const main=readFileSync('src/main.js','utf8');
  assert.match(main,/function onBlur\(\)\{[\s\S]*?cancelControlScope\(''\)/);
  assert.match(main,/function onKeyUp\(e\)\{[\s\S]*?hardwarePromptIds\(e\)/);
});
