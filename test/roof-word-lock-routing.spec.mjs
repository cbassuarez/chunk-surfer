import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const wheelStart=main.indexOf('function onMapWheel(e){');
const wheelEnd=main.indexOf('\nfunction onPointerEvent(e){',wheelStart);
assert.ok(wheelStart>=0&&wheelEnd>wheelStart);
const makeWheel=env=>Function('env',`with(env){return (${main.slice(wheelStart,wheelEnd)});}`)(env);

function wheelFixture(id,{surface=true,hasPointer=true}={}){
  const calls=[];let prevented=0;
  const original={type:'wheel',clientX:350,clientY:240,deltaY:-48,deltaMode:1,
    preventDefault(){prevented++;}};
  const payload={type:'wheel',cellX:37.5,cellY:12,clientX:350,clientY:240,
    pointerId:7,buttons:0,pointerType:'mouse',originalEvent:original};
  const top=id==null?null:{id,...(hasPointer?{pointer:event=>calls.push(event)}:{})};
  const route=makeWheel({scenes:{top:()=>top},pointerEventHitsGameplaySurface:event=>{
    assert.equal(event,original);return surface;
  },scenePointerPayload:event=>{assert.equal(event,original);return payload;}});
  return {calls,original,payload,route,prevented:()=>prevented};
}

for(const id of ['bag','roof-word-lock'])test(`actual wheel router passes ${id} UI coordinates and physical wheel units`,()=>{
  const f=wheelFixture(id);f.route(f.original);
  assert.equal(f.calls.length,1);
  const event=f.calls[0];
  for(const [name,value] of Object.entries(f.payload))assert.equal(event[name],value,name);
  assert.equal(event.deltaY,-48);assert.equal(event.deltaMode,1);
  assert.equal(f.prevented(),0,'only the scene consuming a visible control prevents scrolling');
  event.preventDefault();assert.equal(f.prevented(),1);
});

test('actual wheel router ignores world play and unrelated modal scenes',()=>{
  for(const id of [null,'pause','recorder','roof-city-seat']){
    const f=wheelFixture(id);f.route(f.original);
    assert.equal(f.calls.length,0,id??'world');assert.equal(f.prevented(),0);
  }
});

test('actual wheel router rejects events on browser or DOM form controls',()=>{
  for(const id of ['bag','roof-word-lock']){
    const f=wheelFixture(id,{surface:false});f.route(f.original);
    assert.equal(f.calls.length,0,id);assert.equal(f.prevented(),0);
  }
});

test('actual wheel router safely tolerates a scene without a pointer handler',()=>{
  for(const id of ['bag','roof-word-lock']){
    const f=wheelFixture(id,{hasPointer:false});assert.doesNotThrow(()=>f.route(f.original));
    assert.equal(f.prevented(),0);
  }
});

test('actual roof adapter maps only word-lock control sounds to the existing finite menu bus',()=>{
  const start=main.indexOf('function interactAcademicRoofProp(');
  const end=main.indexOf('\n// World interaction follows',start);
  assert.ok(start>0&&end>start);
  let options;const heard=[];
  const cue=name=>(...args)=>heard.push({name,args});
  const interact=Function('env',`with(env){return (${main.slice(start,end)});}`)({
    flagTest:()=>false,roofGateEligibility:()=>({schoolKey:true}),playerKeys:new Set(['master']),
    scenes:{push(){}},makeRoofPasswordScene:opts=>{options=opts;return {id:'roof-word-lock'};},
    STORY:{menuMove:cue('move'),menuDenied:cue('denied'),menuLatch:cue('latch'),menuBack:cue('back')},
  });
  assert.equal(interact({action:'roof-gate'}),true);assert.equal(typeof options.onSound,'function');
  for(const kind of ['turn','select','pull','denied','released','back','unknown'])options.onSound(kind);
  assert.deepEqual(heard.map(event=>event.name),['move','move','latch','denied','latch','back']);
  assert.equal(heard[2].args[0],false);assert.equal(heard[4].args[0],true);
  for(const {args} of heard){
    const settings=args.at(-1);
    assert.equal(settings.scope,'roof-word-lock');assert.equal(settings.profile,'van');
    assert.ok(settings.volume>0&&settings.volume<1);
  }
});
