import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  combatActionButtonState, combatToolButtonState, combatControlTabStates, combatActionReadout,
  combatToolColor,
} from '../src/render/combat-view.js';

const source = readFileSync(new URL('../src/render/combat-view.js', import.meta.url), 'utf8');
function painter(name) {
  const start = source.indexOf(`export function ${name}(`);
  const candidates = [source.indexOf('\nexport function ', start + 1), source.indexOf('\nconst HAND_PALETTE', start + 1)]
    .filter(index => index >= 0);
  assert.ok(start >= 0 && candidates.length, `${name} exists in the production renderer`);
  const text = source.slice(start, Math.min(...candidates)).replace(/^export /, '');
  const lamps = [], readouts = [], prints = [];
  const context = {
    combatActionButtonState, combatToolButtonState, combatControlTabStates, combatActionReadout,
    drawLampButton:(x,y,w,h,state)=>{lamps.push({x,y,w,h,...state});return{content:{x,y,w,h},ink:'#12150d'};},
    uiText:(x,y,text,role,alpha)=>readouts.push({x,y,text,role,alpha}),
    drawCombatActionIcon(){},drawBagIcon(){},drawPrintedText:(...args)=>prints.push(args),combatToolIcon:id=>id,
    uiDrawHardware:draw=>draw({ctx:{},dpr:1,cellW:8.45,cellH:20}),drawInstrumentPlate(){},
  };
  return {draw:runInNewContext(`${text}\n${name}`,context),lamps,readouts,prints};
}

test('every currently available action is lit independently of the cursor or counter match', () => {
  for (const focused of [false,true]) {
    const state = combatActionButtonState({enabled:true,damage:3},{focused});
    assert.equal(state.lit,true);assert.equal(state.enabled,true);
    assert.equal(state.color,'amber');assert.equal(state.focused,focused);
    assert.equal(state.detail,'DMG 3');
  }
});

test('an unavailable action stays unlit while exposing its actual reason', () => {
  const state = combatActionButtonState({enabled:false,perfect:true,reason:'NO TAKE'},{focused:true,executing:true});
  assert.equal(state.lit,false);assert.equal(state.enabled,false);assert.equal(state.focused,true);
  assert.equal(state.counters,false);assert.equal(state.executing,false);
  assert.equal(state.detail,'NO TAKE');
  assert.equal(combatActionButtonState({enabled:false}).detail,'UNAVAILABLE');
});

test('a real counter has a word as well as its distinct available lamp', () => {
  const state = combatActionButtonState({enabled:true,perfect:true,damage:5});
  assert.equal(state.lit,true);assert.equal(state.color,'green');
  assert.equal(state.detail,'COUNTER · DMG 5');
});

test('combat controls preserve instrument meanings rather than one shared category hue',()=>{
  assert.equal(combatToolColor('self'),'white');assert.equal(combatToolColor('torch'),'amber');
  assert.equal(combatToolColor('recorder'),'red');assert.equal(combatToolColor('radio'),'blue');
  assert.equal(combatToolColor('rig'),'#6eabc9');assert.equal(combatToolColor('fork'),'#b69bcc');
  for(const tool of ['self','torch','recorder','rig','fork','radio']){
    assert.equal(combatActionButtonState({enabled:true,tool}).color,combatToolColor(tool));
    assert.equal(combatToolButtonState({id:tool}).illumination,'powered');
  }
  assert.equal(combatActionButtonState({id:'playback',tool:'recorder',enabled:true}).color,'green');
  assert.equal(combatActionButtonState({tool:'torch',enabled:true,perfect:true}).color,'green');
});

test('the connected tool is distinct from a cursor visiting an unconnected tool', () => {
  const connected = combatToolButtonState({ready:true},{selected:true,focused:false});
  assert.equal(connected.lit,true);assert.equal(connected.latched,true);assert.equal(connected.status,'CONNECTED');
  const cursor = combatToolButtonState({ready:true},{selected:false,focused:true});
  assert.equal(cursor.lit,false);assert.equal(cursor.latched,false);assert.equal(cursor.focused,true);
  assert.equal(cursor.status,'READY');
  const unavailable = combatToolButtonState({ready:false,reason:'EMPTY'},{selected:true,focused:true});
  assert.equal(unavailable.lit,false);assert.equal(unavailable.latched,false);assert.equal(unavailable.status,'EMPTY');
});

test('only the current control tab is lit while a command can be chosen', () => {
  for (const phase of ['tool','move']) {
    const states = combatControlTabStates(phase);
    assert.equal(states.filter(state=>state.lit).length,1);
    assert.equal(states.find(state=>state.lit).id,phase);
    assert.equal(states.find(state=>state.selected).id,phase);
    assert.ok(states.every(state=>state.enabled));
    assert.ok(states.every(state=>state.color==='amber'&&!state.focused));
  }
  for (const phase of ['talk','resolve','prepare','arrival','result']) {
    const states = combatControlTabStates(phase);
    assert.ok(states.every(state=>!state.lit&&!state.enabled&&!state.selected));
  }
  const separate= combatControlTabStates('tool',{focusedMode:'move'});
  assert.equal(separate[0].lit,true);assert.equal(separate[0].focused,false);
  assert.equal(separate[1].lit,false);assert.equal(separate[1].focused,true);
});

test('the actual action painter powers available caps without making cursor focus the lamp source', () => {
  const p = painter('drawCombatActionTile');
  p.draw({id:'expose',label:'EXPOSE',enabled:true,damage:3},{x:1,y:2,w:22,h:3.2,selected:true,focused:false});
  assert.equal(p.lamps.length,1);assert.equal(p.lamps[0].lit,true);assert.equal(p.lamps[0].selected,false);
  assert.equal(p.lamps[0].focused,false);assert.equal(p.readouts[0].text,'DMG 3');
  p.draw({id:'playback',label:'PLAYBACK',enabled:false,reason:'NO TAKE'},{x:1,y:2,w:22,h:3.2,focused:true});
  assert.equal(p.lamps[1].lit,false);assert.equal(p.lamps[1].enabled,false);assert.equal(p.lamps[1].focused,true);
  assert.equal(p.readouts[1].text,'NO TAKE');assert.ok(p.readouts[1].alpha>=.75);
});

test('the actual tool painter preserves a connected lamp and readable unpowered cap status', () => {
  const p = painter('drawCombatToolTile');
  p.draw({id:'torch',label:'TORCH',ready:true},{x:1,y:2,w:22,h:3,selected:true});
  assert.equal(p.lamps[0].lit,true);assert.equal(p.lamps[0].latched,true);
  assert.equal(p.readouts[0].text,'CONNECTED');
  p.draw({id:'rig',label:'RIG',ready:false},{x:1,y:2,w:22,h:3,selected:true,focused:true});
  assert.equal(p.lamps[1].lit,false);assert.equal(p.lamps[1].focused,true);
  assert.equal(p.readouts[1].text,'UNAVAILABLE');
});

test('the mode painter keeps broad hit regions while mounting small amber indexed rockers on printed metal', () => {
  const p = painter('drawCombatControlTabs');
  const regions = p.draw({x:4,y:2,w:32,h:1.65,phase:'move'});
  assert.equal(p.lamps.length,2);assert.equal(p.lamps[0].lit,false);assert.equal(p.lamps[1].lit,true);
  assert.equal(regions.tools.id,'tool');assert.equal(regions.actions.id,'move');
  assert.equal(regions.tools.x,4);assert.equal(regions.tools.h,1.65);
  assert.ok(regions.tools.x+regions.tools.w<regions.actions.x);
  assert.ok(regions.actions.x+regions.actions.w<=36);
  assert.deepEqual(p.prints.map(call=>call[2]),['TOOLS','ACTIONS']);
  for(const [index,region] of [regions.tools,regions.actions].entries()){
    const lamp=p.lamps[index];
    assert.equal(lamp.color,'amber');assert.equal(lamp.legend,'/');
    assert.ok(lamp.w<region.w/2&&lamp.h<region.h);
    assert.ok(lamp.x>=region.x&&lamp.x+lamp.w<=region.x+region.w);
    assert.ok(lamp.y>=region.y&&lamp.y+lamp.h<=region.y+region.h);
    assert.equal(p.prints[index][3].finish,'etched');
    assert.equal(p.prints[index][3].darkPanel,false);
  }
});

test('the connected tool remains named when the action bank is open without resizing mode targets',()=>{
  const p=painter('drawCombatControlTabs');
  const baseline=p.draw({x:4,y:2,w:80,h:1.65,phase:'move'});
  const connected=p.draw({x:4,y:2,w:80,h:1.65,phase:'move',toolLabel:'recorder'});
  assert.equal(p.prints[2][2],'TOOLS · RECORDER');assert.equal(p.prints[3][2],'ACTIONS');
  assert.deepEqual(connected,baseline);
  assert.equal(p.lamps[2].lit,false);assert.equal(p.lamps[3].lit,true);
  assert.equal(p.lamps[2].w,p.lamps[0].w);assert.equal(p.lamps[2].x,p.lamps[0].x);
});
