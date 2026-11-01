import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import { makeRadioScene as createRadioScene } from '../src/game/radio-scene.js';
import { uiInit, uiSetScale } from '../src/render/ui.js';
import { createRadioInstrument } from '../src/game/radio-instrument.js';
import { UI_CELL_W, UI_CELL_H } from '../src/render/atlas.js';

const previous = Object.fromEntries(['document','window','getComputedStyle'].map(k=>[k,globalThis[k]]));
globalThis.document={fonts:{load:()=>Promise.resolve()},createElement:()=>({style:{},getContext:()=>null})};
globalThis.window={devicePixelRatio:2,addEventListener(){}};
globalThis.getComputedStyle=()=>({position:'relative'});
uiInit({clientWidth:1280,clientHeight:720,appendChild(){}});uiSetScale(.9);
test.after(()=>{uiSetScale(1);for(const[k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
test.afterEach(()=>scenes.clear());
const tick=(scene,s)=>{for(let t=0;t<s-1e-7;t+=.01)scene.update(Math.min(.01,s-t));};
const tap=(scene,key='Enter')=>{scene.key({key,code:key});scene.keyup({key,code:key});};
const makeRadioScene=options=>createRadioScene({getHardwareReady:()=>true,...options});
function hub(){const choices=[];const scene=makeRadioScene({nodes:{request:{lines:[{text:'Channel two.',who:'direction',voice:false}],choices:[{text:'Ask Martin',goto:'call'},{text:'Lower',goto:'lower'}]},call:{lines:[{text:'Martin.',who:'me',voice:false}]},lower:{lines:[]}},startAt:'request',onChoice:c=>choices.push(c.goto)});scenes.push(scene);tick(scene,1);tap(scene);assert.equal(scene.view().radio.canTune,true);return{scene,choices};}
function click(scene,id){const r=scene.view().layout.controls[id];assert.ok(r,`visible ${id}`);const p={cellX:r.center.x,cellY:r.center.y,button:0};scene.pointer({type:'pointerdown',...p});scene.pointer({type:'pointerup',...p});return p;}

test('clicking the actual projected selector changes channel without committing a call; blank space is inert',()=>{
  const {scene,choices}=hub();click(scene,'channel');assert.equal(scene.view().radio.instrument.channel,3);assert.deepEqual(choices,[]);
  scene.pointer({type:'pointerdown',cellX:165,cellY:20,button:0});assert.deepEqual(choices,[]);
  assert.equal(scene.view().radio.instrument.channel,3);tap(scene,'ArrowLeft');assert.equal(scene.view().radio.instrument.channel,2);
  click(scene,'volume');assert.equal(scene.view().radio.instrument.volume,1);assert.deepEqual(choices,[]);
});

test('choice ink owns clicks on the enlarged fringe of an exposed physical control',()=>{
  const choices=[];
  try{
    uiSetScale(1);uiInit({clientWidth:50*UI_CELL_W+.1,clientHeight:16*UI_CELL_H+.1,appendChild(){}});
    const scene=makeRadioScene({startAt:'request',onChoice:choice=>choices.push(choice.goto),nodes:{
      request:{lines:[],choices:[{text:'Ask Martin to repeat the directions',goto:'call'}]},
      call:{lines:[{text:'The main landing.',who:'radio',voice:false}]},
    }});
    scenes.push(scene);tick(scene,2);
    const layout=scene.view().layout,contains=(p,r)=>p.cellX>=r.x&&p.cellX<=r.x+r.w&&p.cellY>=r.y&&p.cellY<=r.y+r.h;
    let point=null;
    for(const [id,rect]of Object.entries(layout.controls))for(const ink of layout.occlusionRects){
      if(!['previous','next','select','key:4','key:5','key:6'].includes(id))continue;
      const x1=Math.max(rect.x,ink.x),y1=Math.max(rect.y,ink.y),x2=Math.min(rect.x+rect.w,ink.x+ink.w),y2=Math.min(rect.y+rect.h,ink.y+ink.h);
      if(x2<=x1||y2<=y1)continue;
      const candidate={cellX:(x1+x2)/2,cellY:(y1+y2)/2};
      if(!layout.choices.some(r=>contains(candidate,r)))continue;
      const winner=Object.entries(layout.controls).filter(([,r])=>contains(candidate,r)).sort(([,a],[,b])=>
        Math.hypot(candidate.cellX-a.center.x,candidate.cellY-a.center.y)-Math.hypot(candidate.cellX-b.center.x,candidate.cellY-b.center.y))[0]?.[0];
      if(winner===id)point=candidate;
    }
    assert.ok(point,'the actual projection has a minimum-target fringe over reply ink');
    scene.pointer({type:'pointerdown',button:0,...point});scene.pointer({type:'pointerup',button:0,...point});
    assert.deepEqual(choices,['call'],'the text response commits instead of operating the hardware behind it');
  }finally{
    scenes.clear();uiInit({clientWidth:1280,clientHeight:720,appendChild(){}});uiSetScale(.9);
  }
});

test('the authored stuck-key line dispatches a finite fault contact rather than acquiring a held input',()=>{
  const controls=[];
  const scene=makeRadioScene({terminal:true,onInstrumentControl:(kind,detail)=>controls.push({kind,id:detail?.id}),
    nodes:{start:{lines:[{sourceId:'radio.pre_third_room_breakdown.relay.line.3',who:'direction',voice:false,
      text:'The transmit key sinks under your thumb.'}]}}});
  scenes.push(scene);
  assert.deepEqual(controls,[{kind:'fault',id:'ptt-fault'}]);
  assert.equal(scene.view().radio.keyStuck,true);
});

test('PTT on an incoming line depresses hardware without advancing the line or accepting a call',()=>{
  const scene=makeRadioScene({nodes:{start:{lines:[{id:'incoming',text:'Are you inside?',who:'radio',voice:false},{id:'next',text:'Wait.',who:'radio',voice:false}]}}});scenes.push(scene);tick(scene,2);
  const before=scene.view().line;click(scene,'ptt');assert.deepEqual(scene.view().line,before);assert.equal(scene.view().radio.instrument.interaction.id,'ptt');
});

test('controller shoulders adjust volume and do not masquerade as keyboard E confirmation',()=>{
  const {scene,choices}=hub();scene.key({controllerAction:'tabPrev',key:'q'});assert.equal(scene.view().radio.instrument.volume,.5);
  scene.key({controllerAction:'tabNext',key:'e',code:'KeyE'});scene.keyup({controllerAction:'tabNext',key:'e',code:'KeyE'});
  assert.equal(scene.view().radio.instrument.volume,.75);assert.deepEqual(choices,[]);
});

function contact(){const chosen=[];const scene=makeRadioScene({terminal:true,startAt:'contact',onChoice:c=>chosen.push(c.goto),nodes:{contact:{lines:[{sourceId:'rupture.decision',text:'Hold.',who:'direction',voice:false}],choices:[{text:'Seat the battery',goto:'reseat'},{text:'Keep still',goto:'still'}]},reseat:{lines:[{sourceId:'rupture.reseat',text:'Seated.',voice:false}]},still:{lines:[{sourceId:'rupture.still',text:'Still.',voice:false}]}}});scenes.push(scene);tick(scene,2);tap(scene);tick(scene,.01);assert.equal(scene.view().radio.contact,true);return{scene,chosen};}

test('unrelated key release cannot release a held contact; the owning confirm release cancels it',()=>{
  const {scene,chosen}=contact();scene.key({key:'Enter',code:'Enter'});tick(scene,.3);scene.keyup({key:'Shift',code:'ShiftLeft'});
  assert.ok(scene.view().radio.hold>.29);assert.equal(scene.view().radio.instrument.interaction.pressure,1);assert.deepEqual(chosen,[]);
  scene.keyup({key:'Enter',code:'Enter'});assert.equal(scene.view().radio.hold,0);assert.equal(scene.view().radio.instrument.interaction.pressure,0);
});

test('a physical battery grab retains its original capture as the plate closes; dragging away cancels',()=>{
  const {scene,chosen}=contact();const r=scene.view().layout.controls.battery;assert.ok(r);
  const p={cellX:r.center.x,cellY:r.center.y,button:0};scene.pointer({type:'pointerdown',...p});tick(scene,.59);
  scene.pointer({type:'pointermove',...p});assert.ok(scene.view().radio.hold>.58);tick(scene,.07);assert.deepEqual(chosen,['reseat']);
  const other=contact();const b=other.scene.view().layout.controls.battery;other.scene.pointer({type:'pointerdown',cellX:b.center.x,cellY:b.center.y,button:0});tick(other.scene,.3);
  other.scene.pointer({type:'pointermove',cellX:0,cellY:0,button:0});assert.equal(other.scene.view().radio.hold,0);tick(other.scene,1);assert.deepEqual(other.chosen,[]);
});

test('synchronously failing discovery work cannot escape the game update or strand a pending sound',()=>{
  const i=createRadioInstrument({canEgg:()=>true,onEgg:()=>{throw Error('unavailable');}});for(let n=0;n<11;n++)i.tune(1,true);
  assert.doesNotThrow(()=>{for(let n=0;n<20;n++)i.update(.1,{quiet:true});});assert.equal(i.view().eggPlaying,false);i.stop();
});
