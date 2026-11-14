import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as HUNTER from '../src/game/take-hunter.js';
import {pressControl,sampleControl,cancelControlScope} from '../src/game/control-mechanics.js';
import {drawHardwareCap} from '../src/render/hardware-material.js';
import {recorderTransportReadout} from '../src/render/recorder-instrument.js';
import {recorderControlRegions,recordingOverlayButtons} from '../src/render/recorder-view.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),instrument=readFileSync(new URL('../src/render/recorder-instrument.js',import.meta.url),'utf8');
const from=main.indexOf('function recordAction('),until=main.indexOf('\n  if(usingSourceSpace()){',from);assert.ok(from>=0&&until>from);
function fixture(cells=4){
 let recording=true,now=100;const spoken=[],rejected=[],brakes=[];
 const h=vm.createContext({takeRoom:'amplifications',takeHunter:{...HUNTER.armTakeHunter(null,{roll:0}),seconds:9,cells,warningSeconds:2.4},HUNTER,
  REC:{isRecording:()=>recording,isSlating:()=>false,isStalled:()=>false,recState:()=>({spoiled:false})},
  chapelTapeCaseAvailable:()=>true,cancelApparitionApplause(){},micCheckActive:()=>false,
  pressControl:(id,options)=>pressControl(id,{...options,now}),pressPromptControl:(id,options)=>{rejected.push({id,...options});pressControl(id,{...options,now});},
  recordingPressurePerformance:{stopPress:frame=>brakes.push(frame)},recordingPressureFrame:()=>({hunter:h.takeHunter}),
  recordingStopConfirmation:{refuse(){},request:()=>false},
  SPEECH:{say:line=>spoken.push(line.text)},stopTake:()=>{recording=false;cancelControlScope('recording:');}});
 vm.runInContext(main.slice(from,until)+'\n}',h);
 return{h,spoken,rejected,brakes,recording:()=>recording,clock:value=>{now=value;}};
}
test.afterEach(()=>cancelControlScope(''));

test('actual resisted STOP acknowledges both physical presenters without counts or retry/quiet instructions, while release stays bounded',()=>{
 const f=fixture();f.h.recordAction();assert.equal(f.recording(),true);assert.equal(f.h.takeHunter.cancelTries,1);
 assert.deepEqual(f.rejected.map(row=>row.id),['recording:stop','recorder:stop']);assert.ok(f.rejected.every(row=>row.rejected&&row.held===false));
 assert.equal(sampleControl('recording:stop',{now:130}).rejected,true);assert.equal(sampleControl('recorder:stop',{now:130}).rejected,true);
 assert.equal(f.brakes.length,1);assert.deepEqual(f.spoken,[]);
 for(let press=2;press<=6;press++){f.clock(100+press*300);f.h.recordAction();}
 assert.equal(f.recording(),false);assert.equal(f.h.takeHunter.cancelTries,6);assert.equal(f.brakes.length,5);
 assert.deepEqual(f.spoken,['There. Off.']);assert.ok(f.spoken.every(text=>!/again|press|quiet|\d/i.test(text)));
});

test('an ordinary early STOP does not invent a malfunction and every seized readout is independent of hidden force counts',()=>{
 const f=fixture(14);f.h.recordAction();assert.equal(f.recording(),false);assert.deepEqual(f.rejected,[]);assert.deepEqual(f.brakes,[]);
 const expected={label:'STOP HELD',detail:'LOCATION INDICATOR',held:true};
 for(const tries of[0,1,4,7,999])for(const needs of[6,7,8,1000]){
  const readout=recorderTransportReadout({phase:'seized',tries,needs,remaining:needs-tries});assert.deepEqual(readout,expected);
  assert.doesNotMatch(JSON.stringify(readout),/\d|remaining|tries|needs/);
 }
});

test('the actual recorder button forwards only its local shudder and prints STOP on the returned moving cap, with fixed hit housings',()=>{
 const start=instrument.indexOf('function button(ctx,'),end=instrument.indexOf('\nexport function drawRecorderInstrument(',start);assert.ok(start>=0&&end>start);
 const prints=[],options=[],values=[],ctx=new Proxy({globalAlpha:1,createLinearGradient:()=>({addColorStop(){}})},
  {get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}}),
  draw=new Function('drawHardwareCap','drawHardwarePrint','clamp',instrument.slice(start,end)+';return button;')(
   (...args)=>{options.push(args[5]);const geometry=drawHardwareCap(...args);values.push(geometry);return geometry;},
   (_ctx,label,x,y,print)=>prints.push({label,x,y,print}),n=>Math.max(0,Math.min(1,n)));
 const rect={x:4,y:3,w:66,h:28},before=recorderControlRegions(rect,recordingOverlayButtons()),slot={x:20,y:35,w:100,h:40};
 draw(ctx,slot,'STOP',{enabled:true},'white',{travel:.4,lampHeat:0,rejected:true,lateral:.6,rejectTravel:.02},1);
 assert.equal(options[0].lateral,.6);assert.equal(options[0].color,'amber');assert.ok(Math.abs(options[0].travel-.42)<1e-9);
 assert.equal(prints[0].label,'STOP');assert.equal(prints[0].x,slot.x+values[0].content.x);assert.equal(prints[0].y,slot.y+values[0].content.y);
 assert.deepEqual(recorderControlRegions(rect,recordingOverlayButtons()),before);
 draw(ctx,slot,'STOP',{enabled:true},'white',{travel:.72,lampHeat:0,rejected:true,lateral:0,rejectTravel:0},1);
 assert.equal(options[1].lateral,0,'reduced-motion sample causes no lateral rendering');
});
