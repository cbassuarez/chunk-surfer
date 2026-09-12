import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBagScene } from '../src/game/bag.js';
import { normalizeCombatBuild } from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';
import { MAP_LAB_CASES, mapLabJob, mapLabModel } from '../src/game/map-fixtures.js';
import { bagGuideActions } from '../src/render/bag-view.js';
import { mapLayoutFromBag } from '../src/render/map-layout.js';
import { uiInit } from '../src/render/ui.js';

// Pointer geometry needs a physical viewport, not the uninitialized 0×0 UI.
{
  const previous=new Map(['document','window','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    globalThis.document={createElement:()=>({style:{},getContext:()=>null})};
    globalThis.window={devicePixelRatio:1,addEventListener(){}};
    globalThis.getComputedStyle=()=>({position:'relative'});
    uiInit({clientWidth:1280,clientHeight:760,appendChild(){}});
  }finally{for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

const key=(bag,value,code=value)=>bag.key({key:value,code});
const state=bag=>bag.debugState();
const hit=(bag,id)=>{const found=state(bag).hitRegions.find(item=>item.id===id);assert.ok(found,`visible ${id}`);return found;};
const pointer=(bag,type,rect)=>bag.pointer({type,pointerId:7,button:0,cellX:rect.x+rect.w*.5,cellY:rect.y+rect.h*.5});

function fixture({assistance='guided',initialTarget=null,markSucceeds=true,savedSkills=false}={}){
  let stage='skills-selector',target=initialTarget,closed=0,marks=0,rendered=null;
  const events=[];
  const build=normalizeCombatBuild(null,[],null,{tutorialComplete:true,combatAssistance:assistance});
  const context=()=>({...MAP_LAB_CASES[0],target});
  const guide=({workingBuild}={})=>stage==='skills-selector'
    ?{kind:'section',section:'skills',title:'OPEN SKILLS',why:'Use the green screen selector to reach the patch bay.',allowClose:false}
    :stage==='skills'
      ?{kind:'skills',section:'skills',title:build.pinsEarned?'PATCH ONE LEAD':'INSPECT THE PATCH BAY',why:build.pinsEarned?'Choose any compatible input. Spare cables can stay unused.':'This shift starts without spare leads. Inspect the circuit, then continue.',continueLabel:'CONTINUE TO MAP',continueEnabled:build.pinsEarned===0||workingBuild.techniques.length>0,allowClose:false}
      :stage==='map-selector'
        ?{kind:'section',section:'map',title:'OPEN MAP',why:'Now select the map to set the first real bearing.',allowClose:false}
        :stage==='mark'
          ?{kind:'action',section:'map',entry:'room:main_b3',action:'mark',title:'MARK STUDIO B3',why:'Set the actual first room as your waypoint.',allowClose:false}
          :{kind:'close',section:'map',entry:'room:main_b3',title:'FOLLOW THE TARGET',why:'The first bearing is set. Close the case and follow it.',allowClose:true};
  const bag=makeBagScene({
    embeddedHost:true,focus:savedSkills?null:{sectionId:'kit',onceKey:'post-training-start'},
    memory:savedSkills?{sectionId:'skills',selected:{skills:`skill:${TECHNIQUE.AFTERIMAGE}`},scroll:{}}:null,
    getBuild:()=>build,hasRig:()=>true,
    getJob:()=>mapLabJob(context()),getMap:()=>mapLabModel(context()),getGuide:guide,
    markRoom:roomId=>{marks++;if(!markSucceeds)return false;target=roomId;return true;},
    debug:value=>{rendered=value;},
    onClose:()=>{closed++;},
    onGuideEvent:event=>{
      events.push(event);
      if(stage==='skills-selector'&&event.type==='section-selected'&&event.sectionId==='skills')stage='skills';
      else if(stage==='skills'&&event.type==='continue')stage='map-selector';
      else if(stage==='map-selector'&&event.type==='section-selected'&&event.sectionId==='map')stage='mark';
      else if(stage==='mark'&&event.type==='marked'&&event.roomId==='main_b3')stage='close';
    },
  });
  bag.enter();bag.render();
  return {bag,events,guide,stage:()=>stage,target:()=>target,closed:()=>closed,marks:()=>marks,rendered:()=>rendered};
}

test('post-training selectors require an explicit visit, patching leaves normal controls live, and B cannot skip the guide',()=>{
  const f=fixture(),{bag}=f;
  assert.equal(state(bag).nav.sectionId,'kit','guide presentation never auto-visits SKILLS');
  bag.update(.1);assert.equal(state(bag).nav.sectionId,'kit');
  key(bag,'b','KeyB');assert.equal(f.closed(),0);
  key(bag,'2','Digit2');assert.equal(state(bag).nav.sectionId,'kit');
  key(bag,'4','Digit4');assert.equal(f.stage(),'skills');
  key(bag,'c','KeyC');assert.equal(f.stage(),'skills','cannot Continue before one actual patch');
  const original=state(bag).selected.id;
  key(bag,'ArrowRight');assert.notEqual(state(bag).selected.id,original,'skill browsing remains live');
  key(bag,'ArrowLeft');key(bag,'Enter');
  assert.equal(state(bag).workingBuild.techniques.length,1);
  assert.equal(state(bag).workingBuild.unspent,1,'the second cable may stay spare');
  assert.equal(f.stage(),'skills','a patch never doubles as Continue');
  key(bag,' ','Space');assert.equal(state(bag).workingBuild.techniques.length,0,'pull remains live');
  key(bag,'c','KeyC');assert.equal(f.stage(),'skills');
  key(bag,'Enter');key(bag,'c','KeyC');assert.equal(f.stage(),'map-selector');
  assert.equal(state(bag).nav.sectionId,'skills','MAP must also be explicitly selected');
  key(bag,'2','Digit2');assert.equal(f.stage(),'mark');
  key(bag,'b','KeyB');assert.equal(f.closed(),0);
  bag.selectRoom('the_tub');assert.equal(state(bag).mapSelected.roomId,'main_b3');
  key(bag,'Enter');assert.equal(f.stage(),'close');assert.equal(f.target(),'main_b3');assert.equal(f.marks(),1);
  key(bag,'b','KeyB');assert.equal(f.closed(),1);
  const marked=f.events.find(event=>event.type==='marked');
  assert.equal(marked.roomId,'main_b3');assert.ok(marked.spaceId);assert.equal(marked.sectionId,'map');
  assert.equal(marked.workingBuild.techniques.length,1);bag.exit();
});

test('zero-cable shifts inspect and explicitly continue without a fabricated award or patch',()=>{
  for(const assistance of ['severe','dead-air']){
    const f=fixture({assistance}),{bag}=f;
    bag.key({controllerAction:'tabNext',controller:true});assert.equal(f.stage(),'skills');
    assert.equal(state(bag).workingBuild.pinsEarned,0);
    key(bag,'Enter');assert.equal(f.stage(),'skills');assert.deepEqual(state(bag).workingBuild.techniques,[]);
    bag.key({controllerAction:'tabNext',controller:true});assert.equal(f.stage(),'map-selector');
    bag.key({controllerAction:'tabNext',controller:true,repeat:true});assert.equal(f.stage(),'map-selector','holding Continue cannot press the next screen selector');
    bag.key({controllerAction:'tabNext',controller:true});assert.equal(f.stage(),'mark');
    bag.key({controllerAction:'confirm',controller:true});assert.equal(f.stage(),'close');
    bag.key({controllerAction:'back',controller:true});assert.equal(f.closed(),1);
    assert.equal(f.events.some(event=>event.type==='skills-changed'),false);bag.exit();
  }
});

test('a remembered SKILLS screen still requires its explicit selector press and closing during a lifted cable cannot bypass setup',()=>{
  const f=fixture({savedSkills:true}),{bag}=f;
  assert.equal(state(bag).nav.sectionId,'skills');
  assert.equal(f.stage(),'skills-selector');bag.update(.2);
  assert.equal(f.stage(),'skills-selector','restoring navigation is not a user visit');
  key(bag,'c','KeyC');assert.equal(f.stage(),'skills-selector');
  pointer(bag,'pointerdown',hit(bag,'bag:tab:skills'));bag.render();assert.equal(f.stage(),'skills');
  pointer(bag,'pointerdown',hit(bag,'bag:patch:supply:torch'));assert.ok(state(bag).patchDrag);
  key(bag,'b','KeyB');
  assert.equal(f.closed(),0);assert.equal(state(bag).patchDrag,null);
  assert.deepEqual(state(bag).workingBuild.techniques,[]);assert.equal(state(bag).workingBuild.unspent,2);
  assert.equal(f.stage(),'skills');bag.exit();
});

test('the guide admits socket dragging and rejects pointer attempts to leave the required section',()=>{
  const f=fixture(),{bag}=f;
  pointer(bag,'pointerdown',hit(bag,'bag:tab:map'));assert.equal(f.stage(),'skills-selector');
  pointer(bag,'pointerdown',hit(bag,'bag:tab:skills'));bag.render();assert.equal(f.stage(),'skills');
  pointer(bag,'pointerdown',hit(bag,'bag:tab:map'));assert.equal(f.stage(),'skills');
  pointer(bag,'pointerdown',hit(bag,'bag:patch:supply:torch'));
  assert.ok(state(bag).patchDrag,'guide does not replace the cable interaction with a modal');
  pointer(bag,'pointermove',hit(bag,`bag:patch:input:skill:${TECHNIQUE.AFTERIMAGE}`));
  pointer(bag,'pointerup',hit(bag,`bag:patch:input:skill:${TECHNIQUE.AFTERIMAGE}`));
  assert.deepEqual(state(bag).workingBuild.techniques,[TECHNIQUE.AFTERIMAGE]);
  assert.equal(f.stage(),'skills');assert.ok(f.events.some(event=>event.type==='skills-changed'));bag.exit();
});

test('the exterior tour never turns an unavailable Continue or a changing callout into progression',()=>{
  const f=fixture(),{bag}=f;
  pointer(bag,'pointerdown',hit(bag,'bag:tab:skills'));bag.render();
  const before=f.rendered().layout;
  pointer(bag,'pointerdown',hit(bag,'bag:guide:continue'));
  assert.equal(f.stage(),'skills','the exterior control cannot bypass a real patch');
  pointer(bag,'pointerdown',hit(bag,'bag:patch:supply:torch'));
  bag.render();assert.ok(state(bag).patchDrag,'changing explanation does not resize the case or cancel a held lead');
  assert.deepEqual(f.rendered().layout,before);
  const input=hit(bag,`bag:patch:input:skill:${TECHNIQUE.AFTERIMAGE}`);
  pointer(bag,'pointermove',input);pointer(bag,'pointerup',input);bag.render();
  assert.equal(f.stage(),'skills','socket completion is not Continue');
  assert.deepEqual(f.rendered().layout,before,'ready-state callouts keep the same module geometry');
  pointer(bag,'pointerdown',hit(bag,'bag:guide:continue'));
  assert.equal(f.stage(),'map-selector');bag.exit();
});

test('a failed waypoint callback cannot complete the gate, and an existing real B3 mark is never toggled off',()=>{
  const failed=fixture({assistance:'severe',markSucceeds:false});
  key(failed.bag,'4','Digit4');key(failed.bag,'c','KeyC');key(failed.bag,'2','Digit2');key(failed.bag,'Enter');
  assert.equal(failed.stage(),'mark');assert.equal(failed.target(),null);
  assert.equal(failed.events.some(event=>event.type==='marked'),false);failed.bag.exit();
  const existing=fixture({assistance:'severe',initialTarget:'main_b3'});
  key(existing.bag,'4','Digit4');key(existing.bag,'c','KeyC');key(existing.bag,'2','Digit2');key(existing.bag,'Enter');
  assert.equal(existing.stage(),'close');assert.equal(existing.target(),'main_b3');assert.equal(existing.marks(),0);existing.bag.exit();
});

test('the map guide marks only through the visible SET TARGET control, never a caption or room-selection click',()=>{
  const f=fixture({assistance:'severe'}),{bag}=f;
  try{
    key(bag,'4','Digit4');key(bag,'c','KeyC');key(bag,'2','Digit2');bag.render();
    assert.equal(f.stage(),'mark');assert.equal(f.target(),null);
    key(bag,'F6');assert.equal(state(bag).mapNav.focusedControlId,null,'console mode cannot bypass the mandatory B3 guide');
    const selected=state(bag).mapSelected;
    assert.equal(selected.roomId,'main_b3');
    const mapLayout=mapLayoutFromBag(f.rendered().layout);
    const roomHits=state(bag).hitRegions.filter(region=>region.kind==='map-space');
    const room=roomHits.find(region=>region.id===`bag:space:${selected.id}`);
    if(room){pointer(bag,'pointerdown',room);pointer(bag,'pointerdown',room);assert.equal(f.marks(),0,'room presses only select');}
    const clickable=hit(bag,'bag:map:set-target');
    const target=f.rendered().guidePresentation.targets.find(item=>item.id===clickable.id);
    assert.ok(target,'the guide identifies the actual SET TARGET key');
    for(const field of ['x','y','w','h'])assert.equal(target.rect[field],clickable[field]);
    pointer(bag,'pointerdown',mapLayout.legendRail);
    pointer(bag,'pointerdown',mapLayout.detail);
    assert.equal(f.marks(),0,'a legend or selected-room caption cannot mark a room');
    assert.equal(f.stage(),'mark');
    pointer(bag,'pointerdown',clickable);
    assert.equal(f.target(),'main_b3');assert.equal(f.marks(),1);assert.equal(f.stage(),'close');
    const marked=f.events.find(event=>event.type==='marked');
    assert.equal(marked.roomId,'main_b3');assert.equal(marked.spaceId,selected.id);
  }finally{bag.exit();}
});

test('the exterior Continue uses its rendered hit bounds and mandatory rails never advertise closing early',()=>{
  const f=fixture({assistance:'severe'});key(f.bag,'4','Digit4');f.bag.render();
  const g=f.guide(state(f.bag));
  const {guidePresentation,layout}=f.rendered(),button=guidePresentation?.continueRegion;
  assert.ok(button,'the guided Skills stage has an exterior Continue control');
  assert.equal(layout.guide,null,'no interior band steals space from the patch bay');
  const clickable=hit(f.bag,'bag:guide:continue');
  for(const field of ['x','y','w','h'])assert.equal(clickable[field],button[field]);
  assert.ok(button.w>0&&button.h>0);
  const overlapsBody=button.x<layout.body.x+layout.body.w&&button.x+button.w>layout.body.x
    &&button.y<layout.body.y+layout.body.h&&button.y+button.h>layout.body.y;
  assert.equal(overlapsBody,false,'the new tour control sits outside the case body');
  assert.ok(bagGuideActions(g).some(([keyName,label])=>keyName==='C'&&label==='CONTINUE TO MAP'));
  assert.ok(bagGuideActions(g).some(([keyName,label])=>keyName==='ENTER'&&label==='PATCH'));
  assert.ok(bagGuideActions(g).some(([keyName,label])=>keyName==='SPACE'&&label==='PULL'));
  assert.equal(bagGuideActions(g).some(([keyName,label])=>label==='PATCH'&&keyName.includes('SPACE')),false,'Space cannot be advertised as both patch and pull');
  assert.equal(bagGuideActions(g).some(([,label])=>label==='CLOSE'),false);
  pointer(f.bag,'pointerdown',clickable);assert.equal(f.stage(),'map-selector','the exterior control still dispatches the real explicit Continue');
  f.bag.exit();
});

test('legacy work-order guides stay readable, closable, and restricted to their authored inspection',()=>{
  let closed=0,read=0;
  const doc={id:'work-order',title:'WORK ORDER'};
  const bag=makeBagScene({embeddedHost:true,job:{rooms:[{roomId:'main_b3',label:'STUDIO B3',notes:[doc]}],unfiled:[],total:1,done:0},
    guide:{section:'files',entry:'file:work-order',action:'confirm',title:'READ THE WORK ORDER',why:'Read the order before you roll sound.'},
    readDocument:()=>{read++;},onClose:()=>{closed++;}});
  bag.enter();bag.update(.1);assert.equal(state(bag).nav.sectionId,'sheets');
  key(bag,'4','Digit4');assert.equal(state(bag).nav.sectionId,'sheets');
  key(bag,'Enter');assert.equal(read,1);assert.equal(state(bag).route.type,'sheet-reader');
  key(bag,'b','KeyB');assert.equal(closed,1);bag.exit();
});
