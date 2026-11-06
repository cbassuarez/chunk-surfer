import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openingCabRadioLayout,openingCabInspectionModel,makeOpeningCabInspectionScene} from '../src/game/opening-cab-inspection.js';

const stations=[{id:'duet-a',label:'DUET I',programme:'First piano duet'},
  {id:'duet-b',label:'DUET II',programme:'Second piano duet'},
  {id:'duet-c',label:'DUET III',programme:'Third piano duet'},
  {id:'spoken',label:'SPOKEN',programme:'Public-domain speech'}];
const snapshot=()=>({on:true,playing:true,station:'DUET II',selectedStation:'duet-b',programme:'Second piano duet',volume:.45,stations});
const overlaps=(a,b)=>a.x<b.x+b.w-1e-7&&a.x+a.w>b.x+1e-7&&a.y<b.y+b.h-1e-7&&a.y+a.h>b.y+1e-7;
const click=(scene,hit,extra={})=>{const e={cellX:hit.x+hit.w/2,cellY:hit.y+hit.h/2,pointerId:3,button:0,...extra};scene.pointer({type:'pointerdown',...e});scene.pointer({type:'pointerup',...e});};

test('the four station keys and the transport are where they are on the set, including large-text layouts',()=>{
  for(const size of[{cols:75,rows:20},{cols:120,rows:40}]){
    const r=openingCabRadioLayout(size,snapshot());assert.equal(r.presets.length,4);assert.equal(r.actions.length,3);assert.equal(r.tune.length,4);
    assert.deepEqual(r.presets.map(p=>p.action),stations.map(s=>({type:'station',id:s.id})));
    assert.deepEqual(r.presets.filter(p=>p.selected).map(p=>p.stationId),['duet-b']);
    assert.ok(r.readout.h>=2&&r.readout.w>=12);
    for(const control of r.controls){assert.ok(control.w>=1.2&&control.h>=1.2,control.id);assert.ok(control.x>=0&&control.y>=0&&control.x+control.w<=size.cols&&control.y+control.h<=size.rows);assert.equal(overlaps(control,r.readout),false);}
    for(let i=0;i<r.controls.length;i++)for(let j=i+1;j<r.controls.length;j++)assert.equal(overlaps(r.controls[i],r.controls[j]),false,`${r.controls[i].id} ${r.controls[j].id}`);
    const[first,,,last]=r.presets;assert.ok(first.x<last.x,'one to four, left to right');assert.ok(r.actions[0].x>last.x,'the audio controls are to the right of the keys');
  }
  assert.equal(openingCabRadioLayout({cols:75,rows:20},snapshot(),false).controls.every(c=>!c.enabled),true);
  const moved=openingCabRadioLayout({cols:100,rows:40},snapshot(),true,(x,y)=>({x:.5+x,y:.5-y}));
  assert.ok(Math.abs(moved.actions[1].x+moved.actions[1].w/2-(50+100*.0584))<.5,'the projection from the renderer wins when it has one');
});

test('radio keyboard and controller controls forward exact owner actions once, with no optimistic playback state or action on release/repeat/modifier',()=>{
  const radio=snapshot(),calls=[];let closed=0;
  const scene=makeOpeningCabInspectionScene({id:'radio',getState:()=>({cabRadio:radio}),onCabRadioAction:action=>calls.push(action),onClose:()=>closed++});
  scene.enter();scene.key({code:'KeyA'});scene.key({key:'ArrowRight'});scene.key({code:'Digit4'});scene.key({code:'Space'});scene.key({key:'w'});scene.key({controllerAction:'selectDown'});scene.key({controllerAction:'confirm'});
  assert.deepEqual(calls,[{type:'station',delta:-1},{type:'station',delta:1},{type:'station',id:'spoken'},
    {type:'power'},{type:'volume',delta:.1},{type:'volume',delta:-.1},{type:'power'}]);
  for(const event of[{code:'Digit4',repeat:true},{code:'Space',repeat:true},{key:'d',ctrlKey:true},{key:'a',metaKey:true},{key:'w',altKey:true}])scene.key(event);
  scene.keyup({code:'Space'});assert.equal(calls.length,7);
  assert.equal(scene.view().model.radio.selectedStation,'duet-b');assert.equal(scene.view().model.radio.on,true,'only the audio owner may report power or station changes');
  scene.key({code:'KeyE'});scene.key({key:' '});assert.equal(closed,1);assert.equal(calls.length,7);
});

test('pointer presets, power and volume use matching primary press/release; drag/cancel/focus loss cannot operate the receiver',()=>{
  const calls=[],scene=makeOpeningCabInspectionScene({id:'radio',getState:()=>({cabRadio:snapshot()}),onCabRadioAction:action=>calls.push(action)});
  const hit=id=>scene.view().hitRegions.find(r=>r.id===id),a=hit('cab-radio:preset:duet-a'),power=hit('cab-radio:power');
  click(scene,a);click(scene,power);click(scene,hit('cab-radio:volume-up'));click(scene,hit('cab-radio:tune-up'));click(scene,hit('cab-radio:seek-down'));
  assert.deepEqual(calls,[{type:'station',id:'duet-a'},{type:'power'},{type:'volume',delta:.1},{type:'station',delta:1},{type:'station',delta:-1}]);
  calls.length=3;
  const down={type:'pointerdown',cellX:a.x+.1,cellY:a.y+.1,pointerId:1,button:0};
  for(const cancel of['pointercancel','lostpointercapture']){scene.pointer(down);scene.pointer({type:cancel,pointerId:1});scene.pointer({...down,type:'pointerup'});}
  scene.pointer(down);scene.pointer({...down,type:'pointerup',pointerId:2});
  scene.pointer(down);scene.pointer({...down,type:'pointerup',button:2});
  scene.pointer(down);scene.pointer({...down,type:'pointerup',cellX:power.x+.1,cellY:power.y+.1});
  scene.pointer(down);scene.suspend();scene.pointer({...down,type:'pointerup'});
  scene.pointer(down);scene.blur();scene.pointer({...down,type:'pointerup'});
  click(scene,a,{button:2});assert.equal(calls.length,3);
  scene.exit();click(scene,a);assert.equal(calls.length,3);
});

test('there is no panel: opening the radio leans over to the set, and closing comes back',()=>{
  const moves=[];let amount=0;const lean={set:on=>moves.push(on),step:dt=>{amount=1;moves.push(dt>0?'step':'still');},amount:()=>amount,project:()=>({x:.25,y:.25,visible:true})};
  const scene=makeOpeningCabInspectionScene({id:'radio',radioLean:lean,getState:()=>({cabRadio:snapshot()}),onCabRadioAction:()=>{}});
  scene.enter();assert.deepEqual(moves,[true]);scene.update(.1);assert.deepEqual(moves,[true,'step']);
  scene.key({code:'KeyE'});assert.equal(moves.at(-1),false);
  const other=[];const papers=makeOpeningCabInspectionScene({id:'recorder',radioLean:{set:on=>other.push(on),step:()=>other.push('step')},makeReader:()=>({enter(){},key(){},view:()=>({reading:false})})});
  papers.enter();papers.update(.1);assert.deepEqual(other,[],'only the radio leans');
  const source=readFileSync(new URL('../src/game/opening-cab-inspection.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/drawLampButton\(|drawVfdText\(/);
});

test('optional or failed radio owners leave the inspector usable, while every non-radio kind keeps its read-only controls',()=>{
  const absent=makeOpeningCabInspectionScene({id:'radio',getState:()=>({cabRadio:snapshot()})});
  assert.ok(absent.view().hitRegions.filter(r=>r.id.startsWith('cab-radio:')).every(r=>r.disabled));
  assert.doesNotThrow(()=>{absent.key({key:' '});click(absent,absent.view().hitRegions.find(r=>r.id==='cab-radio:power'));});
  const throwing=makeOpeningCabInspectionScene({id:'radio',onCabRadioAction:()=>{throw Error('unavailable');}});
  assert.doesNotThrow(()=>throwing.key({key:' '}));assert.equal(throwing.view().closed,false);
  for(const id of['job-papers','notebook','self-check','practice-note','first-take-note','recital-programme','recorder']){
    const calls=[],scene=makeOpeningCabInspectionScene({id,onCabRadioAction:action=>calls.push(action),
      makeReader:()=>({enter(){},key(){},view:()=>({reading:false})})});
    scene.enter();assert.equal(scene.view().readOnly,true);assert.deepEqual(scene.view().hitRegions.map(r=>r.id),['cab-object:close']);
    for(const key of['a','d','w','s',' ','1'])scene.key({key});assert.deepEqual(calls,[]);scene.exit();
  }
});
