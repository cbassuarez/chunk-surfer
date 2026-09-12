import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass, drawVfdGrid,
  clearInstrumentMaterialCache, instrumentMaterialCacheStats,
} from '../src/render/instrument-material.js';

function canvasProbe({cache=true}={}){
  const surfaces=[];
  const make=()=>{
    const commands=[],counts=new Map(),stack=[];
    const state={globalAlpha:1,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,globalCompositeOperation:'source-over'};
    const canvas={width:0,height:0,ownerDocument:cache?owner:null};
    const gradient=(kind,args)=>{const value={kind,args,stops:[]};Object.defineProperty(value,'addColorStop',{value:(...args)=>value.stops.push(args)});return value;};
    const methods={
      save(){stack.push({...state});},
      restore(){for(const key of Object.keys(state))delete state[key];Object.assign(state,stack.pop());},
      createLinearGradient:(...args)=>gradient('linear',args),
      createRadialGradient:(...args)=>gradient('radial',args),
      getImageData(){throw new Error('material may not read canvas pixels');},
    };
    const ctx=new Proxy(state,{
      get(target,key){
        if(key==='canvas')return canvas;
        if(key in methods)return methods[key];
        if(key in target)return target[key];
        return(...args)=>{
          counts.set(key,(counts.get(key)||0)+1);
          if(commands.length<2000)commands.push({method:key,args,state:{...state}});
        };
      },
      set(target,key,value){target[key]=value;return true;},
    });
    canvas.getContext=()=>ctx;
    const surface={canvas,ctx,commands,counts,state,stack};surfaces.push(surface);return surface;
  };
  const owner={createElement(kind){assert.equal(kind,'canvas');return make().canvas;}};
  const root=make();return{...root,surfaces};
}
const box={x:12,y:15,w:712,h:370,dpr:1};
test.beforeEach(clearInstrumentMaterialCache);

test('approved aluminum field, machining, warm aperture and separate cover returns survive the port',()=>{
  const p=canvasProbe();
  drawInstrumentPlate(p.ctx,box);
  drawInstrumentWell(p.ctx,{x:35,y:76,w:666,h:239,dpr:1});
  drawInstrumentGlass(p.ctx,{x:35,y:76,w:666,h:239,dpr:1});
  const commands=p.surfaces.flatMap(surface=>surface.commands);
  const stops=commands.flatMap(command=>command.state.fillStyle?.stops||[]).map(([,color])=>color);
  assert.ok(stops.includes('#e4e2d5'),'approved neutral satin highlight');
  assert.ok(stops.includes('#7d807d'),'neutral aluminum dark return, not a green painted replacement');
  assert.ok(stops.includes('#1d2617')&&stops.includes('#252a18'),'warm graphite/bronze substrate');
  assert.ok(commands.some(command=>command.method==='drawImage'&&command.state.globalAlpha===.65),'fine aluminum grain retains approved .65 opacity');
  assert.ok(commands.some(command=>command.state.strokeStyle==='#e3d9b54a'));
  assert.ok(commands.some(command=>command.state.strokeStyle==='#c3d2a118'),'two unequal front-cover returns');
  assert.ok(commands.some(command=>command.state.fillStyle==='rgba(20,33,20,.08)'),'front filter follows display content');
  assert.ok(!commands.some(command=>command.method==='fillText'),'material never manufactures a scale, caption, or display value');
});

test('raw material layers preserve caller alpha, clipping state and shadows',()=>{
  for(const draw of [drawInstrumentPlate,drawInstrumentWell,drawInstrumentGlass,drawVfdGrid]){
    const p=canvasProbe();Object.assign(p.state,{globalAlpha:.37,shadowBlur:9,shadowOffsetX:4,shadowOffsetY:2});
    const before={...p.state};draw(p.ctx,{...box,reflection:.7});
    assert.deepEqual(p.state,before);assert.equal(p.stack.length,0);
    assert.ok(p.commands.every(command=>command.state.globalAlpha<=.37),'no layer turns a fading surface opaque again');
    assert.ok(p.commands.filter(command=>command.method==='drawImage').every(command=>command.state.shadowBlur===0),'cached textures do not inherit unrelated drop shadows');
  }
});

test('static plate/well/cover rasters are reused and viewing changes allocate no new overlays',()=>{
  const p=canvasProbe();
  for(const draw of [drawInstrumentPlate,drawInstrumentWell,drawInstrumentGlass])draw(p.ctx,box);
  const baked=p.surfaces.length,budget=instrumentMaterialCacheStats();
  for(let frame=0;frame<60;frame++){
    drawInstrumentPlate(p.ctx,box);drawInstrumentWell(p.ctx,box);
    drawInstrumentGlass(p.ctx,{...box,viewX:(frame/59-.5)*1.8,reflection:frame/59});
  }
  assert.equal(p.surfaces.length,baked);assert.deepEqual(instrumentMaterialCacheStats(),budget);
});

test('aluminum, black and olive use distinct cached finishes with the same plate and screw geometry',()=>{
  const p=canvasProbe(),plateRasters=[];
  for(const finish of ['aluminum','black','olive']){
    const result=drawInstrumentPlate(p.ctx,{...box,finish});assert.deepEqual(result,box);
    plateRasters.push(p.commands.filter(command=>command.method==='drawImage').at(-1).args[0]);
  }
  assert.equal(new Set(plateRasters).size,3,'enamel colors may not reuse a differently colored cached face');
  const stops=p.surfaces.flatMap(surface=>surface.commands).flatMap(command=>command.state.fillStyle?.stops||[]).map(([,color])=>color);
  for(const color of ['#e4e2d5','#454e45','#77805a'])assert.ok(stops.includes(color));
  const count=p.surfaces.length;
  for(const finish of ['olive','black','aluminum'])drawInstrumentPlate(p.ctx,{...box,finish});
  assert.equal(p.surfaces.length,count,'swapping an already viewed finish does not rebake');
  const screwTurns=p.surfaces.flatMap(surface=>surface.commands).filter(command=>command.method==='rotate');
  assert.equal(screwTurns.length,12,'all finishes retain four physical fasteners');
});

test('DPR scales physical aperture depth once and never changes its fixed hit rectangle',()=>{
  const a=canvasProbe(),b=canvasProbe();
  const normal=drawInstrumentWell(a.ctx,{...box,depth:1});
  const high=drawInstrumentWell(b.ctx,{x:box.x*2,y:box.y*2,w:box.w*2,h:box.h*2,dpr:2,depth:1});
  for(const key of ['x','y','w','h','outset'])assert.equal(high[key]/2,normal[key]);
  assert.equal(high.contentOffset.x/2,normal.contentOffset.x);assert.equal(high.contentOffset.y/2,normal.contentOffset.y);
  assert.ok(Math.abs(normal.contentOffset.x-2.52)<1e-9);assert.ok(Math.abs(normal.contentOffset.y-1.08)<1e-9);
  const flat=drawInstrumentWell(a.ctx,{...box,depth:0});
  for(const key of ['x','y','w','h'])assert.equal(flat[key],normal[key]);
  assert.deepEqual(flat.contentOffset,{x:0,y:0});
});

test('fastener settings are explicit, stable and separate from the material finish',()=>{
  const on=canvasProbe();drawInstrumentPlate(on.ctx,{...box,screwRadius:7,screwInset:13,seed:'case-a'});
  const screwTurns=on.surfaces.flatMap(surface=>surface.commands).filter(command=>command.method==='rotate');
  assert.equal(screwTurns.length,4);
  clearInstrumentMaterialCache();
  const off=canvasProbe();drawInstrumentPlate(off.ctx,{...box,fasteners:false,seed:'case-a'});
  assert.equal(off.surfaces.flatMap(surface=>surface.commands).filter(command=>command.method==='rotate').length,0);
  assert.ok(off.surfaces.some(surface=>surface.commands.some(command=>command.state.fillStyle?.stops?.some(([,color])=>color==='#e4e2d5'))));
});

test('glass stays out of text by default; mesh requires an explicitly authored region',()=>{
  const p=canvasProbe();drawInstrumentGlass(p.ctx,box);
  assert.ok(!p.surfaces.flatMap(surface=>surface.commands).some(command=>command.state.strokeStyle==='rgba(11,32,22,.25)'));
  drawInstrumentGlass(p.ctx,{...box,grid:{x:50,y:110,w:130,h:50}});
  assert.ok(p.surfaces.flatMap(surface=>surface.commands).some(command=>command.state.strokeStyle==='rgba(11,32,22,.25)'));
  assert.ok(p.commands.some(command=>command.method==='moveTo'&&command.args[0]===50&&command.args[1]===110),'mesh clips to its digit region, not the complete panel');
});

test('reduced motion fixes front-view coordinates without changing geometry, and no frame randomness is read',()=>{
  const p=canvasProbe();drawInstrumentGlass(p.ctx,box);
  const render=options=>{p.commands.length=0;drawInstrumentGlass(p.ctx,{...box,...options});return p.commands.map(({method,args,state})=>({method,args:args.map(value=>typeof value==='object'?'cached-canvas':value),state}));};
  const left=render({reducedMotion:true,viewX:-.9,viewY:-.45});
  const right=render({reducedMotion:true,viewX:.9,viewY:.45});assert.deepEqual(left,right);
  const original=Math.random;Math.random=()=>{throw new Error('time-random material');};
  try{drawInstrumentPlate(p.ctx,box);drawInstrumentWell(p.ctx,box);drawInstrumentGlass(p.ctx,box);}finally{Math.random=original;}
  const source=readFileSync(new URL('../src/render/instrument-material.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/getImageData\s*\(|Date\.now\s*\(|performance\.now\s*\(|requestAnimationFrame\s*\(/);
});

test('resize caches are bounded, and teardown returns their pixel budget to zero',()=>{
  const p=canvasProbe();
  for(let i=0;i<36;i++)drawInstrumentWell(p.ctx,{x:0,y:0,w:500+i*3,h:180+i,dpr:1+i%2});
  const stats=instrumentMaterialCacheStats();assert.ok(stats.entries<=stats.maxEntries);assert.ok(stats.pixels<=stats.maxPixels);
  clearInstrumentMaterialCache();assert.equal(instrumentMaterialCacheStats().pixels,0);assert.equal(instrumentMaterialCacheStats().entries,0);
});

test('tiny and headless apertures remain finite; invalid geometry is a no-op',()=>{
  const p=canvasProbe({cache:false});
  for(const draw of [drawInstrumentPlate,drawInstrumentWell,drawInstrumentGlass,drawVfdGrid]){
    assert.equal(draw(p.ctx,{...box,w:0}),null);assert.equal(draw(p.ctx,{...box,x:NaN}),null);
    const result=draw(p.ctx,{x:0,y:0,w:6,h:8,dpr:3});assert.equal(result.w,6);assert.equal(result.h,8);
  }
  for(const command of p.commands)for(const value of command.args)if(typeof value==='number')assert.ok(Number.isFinite(value));
  assert.equal(p.stack.length,0);
});
