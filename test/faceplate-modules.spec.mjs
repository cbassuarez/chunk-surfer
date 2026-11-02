import test from 'node:test';
import assert from 'node:assert/strict';
import {faceplateModulesEligible,faceplateModuleLayout,faceplateMapSnapshot,
  beginFaceplateModuleState,currentFaceplateModuleState,claimFaceplateModulePaint} from '../src/render/faceplate-module-state.js';
import {beginFaceplateModuleFrame,endFaceplateModuleFrame,faceplateModuleStatus} from '../src/render/faceplate-modules.js';
import {uiSize,uiPhysicalSize,uiWithLayoutSize,uiSetLayoutSize} from '../src/render/ui.js';
import {navigatorClockLayout} from '../src/render/navigator-clock.js';
import {navigatorTelemetryLayout} from '../src/render/navigator-lcd.js';
import {drawMinimapInset,minimapRadius} from '../src/render/minimap.js';
import {buildMinimapCommands,exteriorMinimapLabels} from '../src/render/map-commands.js';

const contains=(a,b)=>b.x>=a.x-1e-7&&b.y>=a.y-1e-7&&b.x+b.w<=a.x+a.w+1e-7&&b.y+b.h<=a.y+a.h+1e-7;
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const run=(extra={})=>({enabled:true,runId:'run-one',scope:'current',sceneId:'thought:odette',
  now:2400,nightClock:{value:'21:43',approximate:false},...extra});
const map=(extra={})=>({context:'interior',player:{resolved:true,floorId:'g',position:{x:0,y:0},heading:0},
  floors:[{id:'g',label:'GROUND',open:new Set(),runs:[]}],spaces:[],contacts:[],policy:{minimapMode:'compass'},...extra});

test('only the current active run can own modules; title, archive and full-frame films cannot borrow live world state',()=>{
  for(const sceneId of['thought:odette','pause','bag','menu','settings','battle'])assert.equal(faceplateModulesEligible(run({sceneId})),true);
  for(const sceneId of['title','title-menu','world-title','archive-tapes','history','return-report','credits','opening-overture','student-strike','standing-tear','ending-shore'])
    assert.equal(faceplateModulesEligible(run({sceneId})),false,sceneId);
  for(const scope of['historical','title','archive','cinematic','none'])assert.equal(faceplateModulesEligible(run({scope})),false);
  for(const runId of['',' ',null,undefined])assert.equal(faceplateModulesEligible(run({runId})),false);
  assert.equal(faceplateModulesEligible(run({enabled:false})),false);
});

test('one reserved territory keeps content, clock, map and reflective display separate at all supported device sizes',()=>{
  for(const cols of[40,48,64,72,80,96,128,192])for(const rows of[24,30,36,45,50,70]){
    const l=faceplateModuleLayout({cols,rows}),screen={x:0,y:0,w:cols,h:rows},content={x:0,y:0,w:l.contentSize.cols,h:l.contentSize.rows};
    assert.ok(contains(screen,l.territory));assert.equal(overlaps(content,l.territory),false);
    assert.ok(l.contentSize.cols>=40&&l.contentSize.rows>=16);
    if(l.mode==='side')assert.ok(contains(l.territory,l.navigator));
    else{
      for(const box of[l.map,l.lcd,l.identity,navigatorClockLayout(l.clockHousing).clock])assert.ok(contains(l.territory,box));
      assert.equal(overlaps(l.map,l.lcd),false);assert.equal(overlaps(l.map,l.identity),false);
      assert.equal(overlaps(l.identity,navigatorClockLayout(l.clockHousing).clock),false);
      const lcd=navigatorTelemetryLayout(l.lcd);
      for(const field of['takeLabel','takeCount','capacity','slots','injuries','monitorLabel','meter','scale','status'])assert.ok(contains(l.lcd,lcd[field]),field);
    }
  }
  for(const size of[{cols:20,rows:8},{cols:39,rows:24},{cols:80,rows:23}]){
    const l=faceplateModuleLayout(size);assert.equal(l.mode,'none');assert.deepEqual(l.contentSize,size);
  }
});

test('shared modules paint once after nested panels and leave the same content layout active for input',()=>{
  const physical=uiPhysicalSize();
  try{
    const before=beginFaceplateModuleFrame(run({map:map()}),{cols:80,rows:45});
    assert.deepEqual(uiSize(),before.contentSize);
    // A panel, keyboard pagination and its pointer hitboxes all obtain uiSize
    // outside the temporary physical-instrument scope.
    const rendered=uiSize(),keyLayout=uiSize(),pointerLayout=uiSize();
    assert.deepEqual(rendered,keyLayout);assert.deepEqual(rendered,pointerLayout);
    assert.deepEqual(uiPhysicalSize(),physical,'cell picking keeps its physical coordinate source');
    const painted=endFaceplateModuleFrame();assert.equal(painted.painted,true);
    assert.deepEqual(endFaceplateModuleFrame(),painted,'second nested close cannot paint a second module');
    assert.deepEqual(uiSize(),rendered);
    assert.throws(()=>uiWithLayoutSize({cols:80,rows:45},()=>{throw new Error('panel failure');}));
    assert.deepEqual(uiSize(),rendered,'physical scope restores input layout after exceptions');
    beginFaceplateModuleFrame(run({sceneId:'student-strike'}),{cols:80,rows:45});
    assert.equal(faceplateModuleStatus().enabled,false);assert.deepEqual(uiSize(),physical,'films release the whole frame');
  }finally{beginFaceplateModuleFrame({enabled:false},{cols:80,rows:45});uiSetLayoutSize(null);}
});

test('supplied clock and work-order authority survive overlays without a second clock or an unearned counter',()=>{
  beginFaceplateModuleState(run({held:true,telemetry:{takes:4,total:5,monitor:{available:false}}}),{cols:40,rows:24});
  let s=currentFaceplateModuleState();assert.deepEqual(s.context.nightClock,{value:'21:43',approximate:false});
  assert.equal(s.context.telemetry.paused,true);assert.equal(s.context.telemetry.takesEnabled,false);
  assert.equal(s.context.now,2400);assert.equal(claimFaceplateModulePaint(),s);assert.equal(claimFaceplateModulePaint(),null);
  beginFaceplateModuleState(run({nightClock:{value:'00:12:34'},telemetry:{takesEnabled:true}}),{cols:40,rows:24});
  s=currentFaceplateModuleState();assert.equal(s.context.nightClock,null);assert.equal(s.context.telemetry.takesEnabled,true);
  beginFaceplateModuleState({enabled:false},{cols:40,rows:24});assert.equal(currentFaceplateModuleState().context,null,'closing run clears live module data');
});

test('opening an overlay cannot reveal hidden HUSH coordinates or acoustic position trails',()=>{
  const source=map({hush:{active:true,sensed:true,visible:false,floorId:'g',position:{x:8,y:9}},
    contacts:[{id:'heard',observation:{floorId:'g',position:{x:4,y:7},region:[{x:0,y:1}],observedAt:100}}]});
  const snapshot=faceplateMapSnapshot(source);
  assert.equal(snapshot.hush.position,null);assert.equal(snapshot.contacts[0].observation.position,null);
  assert.deepEqual(source.hush.position,{x:8,y:9});assert.deepEqual(source.contacts[0].observation.position,{x:4,y:7});
  const bounds={x:1,y:1,w:12,h:6};
  assert.equal(drawMinimapInset(snapshot,{bounds}).some(c=>c.kind.startsWith('hush-visible')),false);
  const visible=faceplateMapSnapshot({...source,hush:{...source.hush,visible:true}});
  assert.ok(drawMinimapInset(visible,{bounds}).some(c=>c.kind.startsWith('hush-visible')));
  assert.equal(faceplateMapSnapshot(null),null);
});

test('outdoor local survey has context-appropriate reach, readable bounded names and a heading-correct north reference',()=>{
  const model=map({context:'exterior',policy:{showMapTopology:true,showRoom:true},district:{plan:{
    ground:[],buildings:[],courts:[],edges:[],ellery:{points:[],holes:[],edges:[]},labels:[
      {text:'EAST STREET',x:12,y:0,size:'street'},{text:'ELLERY',x:0,y:15,size:'place'},
      {text:'OFF PAGE',x:1000,y:1000},{text:'COVERS PLAYER',x:0,y:0},
    ]}}});
  const viewport={x:1,y:1,w:26,h:12};
  assert.equal(minimapRadius(model),28);assert.equal(minimapRadius(map()),18);assert.equal(minimapRadius(model,12),12);
  for(const heading of[0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const commands=buildMinimapCommands({model:{...model,player:{...model.player,heading}},viewport,radius:minimapRadius(model),aspect:.5});
    const north=commands.find(c=>c.kind==='district-north');assert.ok(north);
    const player=commands.find(c=>c.kind==='player');assert.ok(player);
    const labels=commands.filter(c=>c.kind==='district-label');assert.ok(labels.length<=3);
    for(const label of labels){assert.ok(contains(viewport,label.box));assert.notEqual(label.text,'COVERS PLAYER');assert.notEqual(label.text,'OFF PAGE');}
    if(heading===0)assert.ok(north.tip.y<north.point.y);
    if(heading===Math.PI/2)assert.ok(north.tip.x<north.point.x);
  }
  const transform={point:p=>p};const labels=exteriorMinimapLabels({labels:[{text:'A',x:4,y:2},{text:'B',x:4,y:2},{text:'C',x:8,y:3}]},transform,{x:0,y:0,w:12,h:6});
  assert.equal(labels.length,2,'overlapping names cannot pile up');
  for(const policy of[{minimapMode:'compass'},{showMapTopology:false},{showRoom:false}]){
    const c=buildMinimapCommands({model:{...model,policy},viewport});assert.equal(c.some(c=>c.kind==='district-label'),false);
  }
});
