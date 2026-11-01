import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {navigatorClockState,navigatorClockLayout,navigatorClockGeometry,paintNavigatorClock} from '../src/render/navigator-clock.js';
import {fieldDeckLayout} from '../src/render/hud-layout.js';
import {machinePanelAperture} from '../src/render/presentation.js';
import {navigatorDisplayLayout} from '../src/render/navigator-layout.js';
import {navigatorTelemetryState} from '../src/render/navigator-telemetry.js';
import {nightClockReadout,freshNightClock} from '../src/game/night-clock.js';

const contains=(a,b)=>b.x>=a.x-1e-7&&b.y>=a.y-1e-7&&b.x+b.w<=a.x+a.w+1e-7&&b.y+b.h<=a.y+a.h+1e-7;
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

// Actual vendored Nimbus Sans advances and conservative whole-font outline
// bounds feed the production native-ink painter. This is CPU font-table/layout
// evidence; browser rasterization and target discovery are separate checks.
function hardwareFont(){
 const b=readFileSync(new URL('../public/assets/fonts/NimbusSans-Regular.otf',import.meta.url)),tables={};
 for(let i=0;i<b.readUInt16BE(4);i++){const p=12+i*16;tables[b.toString('ascii',p,p+4)]=b.readUInt32BE(p+8);}
 const units=b.readUInt16BE(tables.head+18),ascent=b.readInt16BE(tables.head+42),descent=-b.readInt16BE(tables.head+38),count=b.readUInt16BE(tables.hhea+34),cmap=tables.cmap;
 let table;for(let i=0;i<b.readUInt16BE(cmap+2);i++){const p=cmap+4+i*8,o=cmap+b.readUInt32BE(p+4);if([0,3].includes(b.readUInt16BE(p))&&b.readUInt16BE(o)===4)table=o;}
 assert.ok(table);const n=b.readUInt16BE(table+6)/2,end=table+14,start=end+n*2+2,delta=start+n*2,range=delta+n*2;
 const glyph=code=>{for(let i=0;i<n;i++){if(code>b.readUInt16BE(end+i*2))continue;const first=b.readUInt16BE(start+i*2);if(code<first)return 0;const d=b.readInt16BE(delta+i*2),r=b.readUInt16BE(range+i*2);if(!r)return(code+d)&65535;const g=b.readUInt16BE(range+i*2+r+2*(code-first));return g?(g+d)&65535:0;}return 0;};
 return{measure(value,size){return{width:[...String(value)].reduce((sum,ch)=>sum+b.readUInt16BE(tables.hmtx+4*Math.min(glyph(ch.codePointAt(0)),count-1)),0)/units*size,actualBoundingBoxAscent:ascent/units*size,actualBoundingBoxDescent:descent/units*size};}};
}
const font=hardwareFont();
function context(){
 const state={globalAlpha:.8,shadowBlur:6,shadowOffsetX:3,shadowOffsetY:2,font:'12px sans-serif'},draws=[],stack=[];
 const methods={save(){stack.push({...state});},restore(){assert.ok(stack.length);for(const k of Object.keys(state))delete state[k];Object.assign(state,stack.pop());},measureText(value){const size=Number(/([\d.]+)px/.exec(state.font)?.[1]||12);return font.measure(value,size);}};
 const ctx=new Proxy(state,{get(target,key){if(key in methods)return methods[key];if(key in target)return target[key];return(...args)=>draws.push({kind:key,args,state:{...state}});},set(target,key,value){target[key]=value;return true;}});
 return{ctx,draws,state,stack};
}

test('clock display accepts only supplied night readings and marks estimated legacy time explicitly',()=>{
 assert.equal(navigatorClockState(null),null);assert.equal(navigatorClockState({elapsedSeconds:20}),null);assert.equal(navigatorClockState({value:'00:12:34'}),null,'session duration is never silently presented as night time');
 for(const value of['24:00','21:60','9:30','NaN','??:??'])assert.equal(navigatorClockState({value}),null);
 for(const value of['21:38','23:59','00:00','06:00'])assert.deepEqual(navigatorClockState({value,approximate:false}),{value,approximate:false,text:value,qualifier:''});
 assert.deepEqual(navigatorClockState({value:'21:38',approximate:true}),{value:'21:38',approximate:true,text:'~21:38',qualifier:'ESTIMATED'});
 const live=nightClockReadout({nightClock:freshNightClock()});assert.equal(navigatorClockState(live).value,'21:38');
});

test('clock occupies existing header metal at every supported FN12 size and cannot resize or cover navigation/recording displays',()=>{
 for(const cols of[40,48,64,72,80,96,128,192])for(const rows of[24,30,36,45,50,70]){
  const housing=fieldDeckLayout({cols,rows}).navigator,aperture=machinePanelAperture(housing.x,housing.y,housing.w,housing.h),nav=navigatorDisplayLayout(aperture,{telemetry:true}),l=navigatorClockLayout(housing);
  assert.ok(contains(housing,l.clock));assert.ok(contains(housing,l.identity));assert.ok(!overlaps(l.clock,l.identity));
  for(const protectedBox of[nav.aperture,nav.lcd,nav.viewport,nav.footer])assert.ok(!overlaps(l.clock,protectedBox),'clock stays outside both existing display technologies');
  assert.ok(l.clock.y+l.clock.h+.05<aperture.y,'top lip clears VFD cutout');
  assert.deepEqual(navigatorDisplayLayout(aperture,{telemetry:true,nightClock:{value:'21:38'}}),nav,'clock does not modify the map/LCD layout');
 }
});

test('formed HH:MM ink and native identity fit compact header at real UI scale and device pixel ratios',()=>{
 for(const scale of[.8,1,1.25,1.5])for(const dpr of[1,1.5,2,3])for(const viewport of[{cols:40,rows:24},{cols:80,rows:45},{cols:192,rows:70}]){
  const housing=fieldDeckLayout(viewport).navigator,metrics={cellW:8.45*scale,cellH:20*scale,dpr},g=navigatorClockGeometry(housing,metrics),clock=g.clock;
  for(const bank of[g.hours,g.colon,g.minutes,g.estimate])assert.ok(contains(clock,bank));
  assert.ok(!overlaps(g.hours,g.colon)&&!overlaps(g.colon,g.minutes));assert.ok(g.icon.x-g.icon.r>=clock.x+1*dpr);assert.ok(g.icon.y-g.icon.r>=clock.y);
  const p=context(),before={...p.state},rendered=paintNavigatorClock(p.ctx,housing,{value:'23:59',approximate:true},metrics);assert.deepEqual(p.state,before);assert.equal(p.stack.length,0);
  assert.ok(contains(g.identity,{x:rendered.identity.x,y:rendered.identity.y,w:rendered.identity.width,h:rendered.identity.height}),'actual pinned native-font advances and conservative bounds fit the reserved identity box');
  assert.ok(rendered.identity.fontSize>=9*dpr,'identity remains native-size readable at minimum UI scale');
  const fills=p.draws.filter(d=>d.kind==='fillText');assert.ok(fills.length);assert.ok(fills.every(d=>d.state.font.includes('Hardware Sans')));
  for(const draw of fills){const value=draw.args[0],size=Number(/([\d.]+)px/.exec(draw.state.font)[1]),m=font.measure(value,size),x=draw.args[1],baseline=draw.args[2],bounds={x,y:baseline-m.actualBoundingBoxAscent,w:m.width,h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};
    assert.ok(contains(value==='~'?g.estimate:g.identity,bounds),'native identity/estimate ink cannot clip vertically or encroach on digits '+JSON.stringify({scale,dpr,value,bounds,box:g.identity}));}
  assert.ok(p.draws.every(d=>d.state.shadowBlur===0),'reflective clock does not glow');
 }
});

test('time changes and estimate state never animate a colon, move the banks or alter take-counter eligibility',()=>{
 const housing=fieldDeckLayout({cols:40,rows:24}).navigator,metrics={cellW:8.45,cellH:20,dpr:1};
 const layouts=[];for(const value of['21:38','21:59','22:00','23:59','00:00','06:00'])for(const approximate of[false,true]){const p=context(),r=paintNavigatorClock(p.ctx,housing,{value,approximate},metrics);layouts.push(r.geometry);assert.equal(r.state.text,(approximate?'~':'')+value);}
 assert.ok(layouts.every(l=>JSON.stringify(l)===JSON.stringify(layouts[0])));
 const make=readout=>{const p=context();paintNavigatorClock(p.ctx,housing,readout,metrics);return p.draws;};assert.deepEqual(make({value:'21:38'}),make({value:'21:38'}),'no independent wall-clock tick or flickering colon exists in the painter');
 const unaccepted=navigatorTelemetryState({takesEnabled:false,takes:4,total:5,nightClock:{value:'23:59'}});assert.equal(unaccepted.takesEnabled,false);assert.equal(unaccepted.takes,0);assert.equal(unaccepted.total,0);assert.deepEqual(unaccepted.slots,[]);
});

test('production minimap and pause use the supplied same clock while play duration stays out of their time field',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),minimap=readFileSync(new URL('../src/render/minimap.js',import.meta.url),'utf8'),pause=readFileSync(new URL('../src/game/pause.js',import.meta.url),'utf8');
 assert.match(main,/time:nightClockReadout\(getSave\(\)\)/);assert.match(main,/nightClock:nightClockReadout\(getSave\(\)\)/);
 const hud=main.slice(main.indexOf('function drawStoryHud()'),main.indexOf('function drawStoryHud()')+6000);assert.match(hud,/mapAvailable\(getSave\(\)\.flags,false\)\)drawMinimap/,'existing device eligibility still owns HUD visibility');
 assert.match(minimap,/navigatorClockState\(opts\.telemetry\?\.nightClock\)/);assert.match(minimap,/if\(nightClock\)drawNavigatorClock/);
 assert.match(pause,/navigatorClockState\(live\.time\)/);assert.doesNotMatch(pause,/live\.time \|\| '00:00:00'/);
});
