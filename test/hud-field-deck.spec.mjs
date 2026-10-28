import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { machinePanelAperture } from '../src/render/presentation.js';
import { navigatorDisplayLayout } from '../src/render/navigator-layout.js';
import { takeSlotState } from '../src/render/field-deck.js';
import { mapAvailable } from '../src/game/map-ownership.js';
import {
  controlHudPresentation,
  fieldDeckLayout,
  hudReminderVisible,
  radioHudPresentation,
  controlHudRailParts,
} from '../src/render/hud-layout.js';

test('field deck gives navigation a stable, non-overlapping territory', () => {
  const deck=fieldDeckLayout({cols:128,rows:50});
  assert.equal(deck.compact,false);
  assert.ok(deck.navigator.w>=30&&deck.navigator.h>=16);
  assert.equal(deck.navigator.x+deck.navigator.w,126);
  assert.equal(deck.takes,undefined,'takes no longer occupy the world viewport');
  assert.ok(deck.objective.x+deck.objective.w<deck.navigator.x);
  assert.equal(deck.monitor,undefined,'monitor belongs to the navigator housing rather than the world viewport');
});

test('field deck composes within a compact viewport instead of clipping', () => {
  const deck=fieldDeckLayout({cols:64,rows:30});
  assert.equal(deck.compact,true);
  assert.ok(deck.navigator.x>=2&&deck.navigator.y>=2);
  assert.ok(deck.navigator.x+deck.navigator.w<=62);
  assert.ok(deck.navigator.y+deck.navigator.h<deck.prompt.y);
  assert.equal(deck.prompt.y,28);
});

test('production HUD paints one objective line before map acquisition and yields to the navigator afterwards', () => {
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf('function drawStoryHud('),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'production HUD function is available');
  const hudSource=source.slice(start,end);
  const size={cols:128,rows:50},objective=fieldDeckLayout(size).objective;
  const target={id:'story:yard-van',label:'GET THE KIT FROM THE VAN'};
  function paint({mapTaken=false,showRoom=true,bearing=true}={}){
    const calls=[],maps=[];
    const save={flags:{'van.preparation.v1':true,...(mapTaken?{'bag.taken':true,'map.taken':true}:{})},run:{ledger:{}}};
    runInNewContext(`${hudSource}\ndrawStoryHud();`,{
      storyMode:true,paused:false,towerPersonalHud:null,usingSourceSpace:()=>false,
      scenes:{blocksWorld:()=>false,suppressesHud:()=>false},towerWarningOwnsMoment:()=>false,
      uiSize:()=>size,fieldDeckLayout,REC:{recState:()=>({takes:[],injuries:0}),isRecording:()=>false,batteryLevel:()=>1,isListening:()=>true},
      usingPlan:()=>false,currentStoryGuidanceFrame:()=>({target}),
      activeDifficulty:{navigation:{showMap:true,showBearing:true,showDistance:true,showRoom}},
      mapAvailable,getSave:()=>save,itemLost:()=>false,drawMinimap:(...args)=>maps.push(args),
      currentFacilityMapModel:()=>({}),performance:{now:()=>1000},recentMischief:()=>[],recentApparitions:()=>[],
      workOrderAccepted:()=>false,monitorDisplaySnapshot:()=>({}),dockCommandUntil:0,
      storyGuidanceBearing:()=>bearing?{bearing:'SOUTHEAST',far:'VERY CLOSE'}:null,
      uiText:(x,y,text)=>calls.push({x,y,text}),chapelTowerState:()=>({phase:'recording'}),
      normalizeChunkSurfState:()=>({finale:{route:null}}),SOURCE_FINALE_ROUTE:{TOWER:'tower'},CHAPEL_TOWER_PHASE:{},KEY_DEBUG:false,
    });
    return{lines:calls.filter(call=>call.x===objective.x&&call.y===objective.y),maps};
  }
  for(const showRoom of[true,false]){
    const frame=paint({showRoom});
    assert.equal(frame.lines.length,1,'missing map must not overprint compass and required objective');
    assert.equal(frame.lines[0].text,'TARGET / GET THE KIT FROM THE VAN / SOUTHEAST / VERY CLOSE');
    assert.equal(frame.maps.length,0);
  }
  const withoutBearing=paint({bearing:false});
  assert.deepEqual(withoutBearing.lines.map(call=>call.text),[target.label],'required label survives without a bearing');
  const withNavigator=paint({mapTaken:true});
  assert.equal(withNavigator.maps.length,1,'acquired plan keeps its normal navigator');
  assert.equal(withNavigator.lines.length,0,'the navigator owns guidance when visible');
});

test('ordinary control legend returns only after input has gone idle', () => {
  assert.equal(hudReminderVisible({now:1000}),true);
  assert.equal(hudReminderVisible({now:10999,lastKeyAt:2000}),false);
  assert.equal(hudReminderVisible({now:11000,lastKeyAt:2000}),true);
  assert.equal(hudReminderVisible({now:12000,lastKeyAt:1000,lastPointerAt:5000}),false);
});

test('smart controls stay up whenever nothing else wants the row', () => {
  // The rail used to hide itself as soon as the player touched a control, and
  // come back only after they had been idle for a while — so the three verbs the
  // game is built on were on screen exactly when nobody was playing. It is icons
  // now rather than three words, so it can simply stay.
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:17_999,introducedAt:1,lastKeyAt:17_990,lastPointerAt:17_995,
  }),{visible:true,compact:false,reason:'discovery'});
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:18_100,introducedAt:1,lastKeyAt:18_090,lastPointerAt:18_095,
  }),{visible:true,compact:false,reason:'ambient'});
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:30_000,introducedAt:1,lastKeyAt:20_000,lastPointerAt:20_500,
  }),{visible:true,compact:false,reason:'ambient'});
  // Still nothing at all before the kit is in his hands.
  assert.deepEqual(controlHudPresentation({mode:'smart',now:5_000}),
    {visible:false,compact:false,reason:'not-introduced'});
});

test('smart controls yield to focused verbs while persistent controls collapse to the torch', () => {
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:2_000,introducedAt:1,contextual:true,
  }),{visible:true,compact:true,reason:'discovery-compact'});
  // A focused verb still takes the row outright.
  assert.deepEqual(controlHudPresentation({
    mode:'smart',now:20_000,introducedAt:1,contextual:true,
  }),{visible:false,compact:false,reason:'context'});
  assert.deepEqual(controlHudPresentation({
    mode:'persistent',now:2_000,introducedAt:1,contextual:true,
  }),{visible:true,compact:true,reason:'persistent-compact'});
  assert.deepEqual(controlHudPresentation({
    mode:'persistent',now:2_000,introducedAt:1,
  }),{visible:true,compact:false,reason:'persistent'});
  assert.deepEqual(controlHudPresentation({mode:'smart',now:2_000}),{
    visible:false,compact:false,reason:'not-introduced',
  });
});

test('take rail exposes five bounded completion slots', () => {
  assert.deepEqual(takeSlotState(2,5),[true,true,false,false,false]);
  assert.deepEqual(takeSlotState(99,5),[true,true,true,true,true]);
  assert.deepEqual(takeSlotState(-2,5),[false,false,false,false,false]);
});

test('radio retains its literal name in Smart contextual and compact control rails after introduction',()=>{
  const controls=controlHudPresentation({mode:'smart',now:120000,introducedAt:1,contextual:true});
  assert.equal(controls.visible,false);
  const radio=radioHudPresentation({introduced:true});
  assert.equal(radio.visible,true);assert.equal(radio.part.action,'radio');assert.equal(radio.part.label,'RADIO');
  assert.equal(radio.part.icon,undefined,'the RADIO label must not become another ambiguous icon');
  const parts=[{action:'light',icon:'light'},{action:'recorder',icon:'recorder'},{action:'bag',icon:'bag'},radio.part];
  assert.deepEqual(controlHudRailParts(parts,{compact:true}).map(part=>part.action),['light','radio']);
  assert.deepEqual(controlHudRailParts([radio.part],{compact:true}),[radio.part]);
  assert.deepEqual(controlHudRailParts(parts),parts);
});

test('radio HUD yields to scene ownership and reports physical state without promising a live call',()=>{
  assert.equal(radioHudPresentation().visible,false);
  assert.equal(radioHudPresentation({introduced:true,worldVisible:false}).visible,false);
  for(const [options,status] of [[{dead:true},'DEAD'],[{deployed:true},'DEPLOYED'],[{noSignal:true},'NO SIGNAL'],[{busy:true},'BUSY'],[{dead:true,deployed:true},'DEPLOYED · DEAD']]){
    const shown=radioHudPresentation({introduced:true,...options});
    assert.equal(shown.visible,true);assert.equal(shown.enabled,false);assert.equal(shown.status,status);
    assert.equal(shown.part.label,`RADIO · ${status}`);
  }
  assert.equal(radioHudPresentation({introduced:true,calling:true}).status,'CALLING');
  assert.equal(radioHudPresentation({introduced:true,dead:true,noSignal:true,calling:true}).status,'DEAD');
});


test('the map stays in VFD glass and telemetry occupies a separate LCD in the same housing',()=>{
  for(const [cols,rows]of[[40,24],[64,30],[80,45],[128,50],[192,70]]){
    const d=fieldDeckLayout({cols,rows}),n=d.navigator,a=machinePanelAperture(n.x,n.y,n.w,n.h),l=navigatorDisplayLayout(a,{telemetry:true});
    for(const r of[l.viewport,l.footer]){
      assert.ok(r.x>=l.aperture.x&&r.y>=l.aperture.y);assert.ok(r.x+r.w<=l.aperture.x+l.aperture.w+1e-8);assert.ok(r.y+r.h<=l.aperture.y+l.aperture.h+1e-8,JSON.stringify({cols,rows,r,a:l.aperture}));
    }
    assert.ok(l.viewport.h>=5.5,'moving telemetry out of the VFD returns useful map height');
    assert.ok(l.aperture.y+l.aperture.h<l.lcd.y,'a real metal band separates the two cutouts');
    assert.ok(l.lcd.x>=n.x+1&&l.lcd.x+l.lcd.w<=n.x+n.w-1);
    assert.ok(l.lcd.y+l.lcd.h<=n.y+n.h-1,'the reflective LCD fits inside the retained outer shell');
  }
});
