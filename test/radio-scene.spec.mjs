import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import { makeRadioScene, RADIO_CONTACT_HOLD, RADIO_STAGE_HOLDS, radioStageForLine } from '../src/game/radio-scene.js';
import { drawRadioScene, radioSceneLayout } from '../src/render/radio-scene.js';
import { uiInit, uiSetScale, uiSize, uiWrap } from '../src/render/ui.js';
import { UI_CELL_W, UI_CELL_H } from '../src/render/atlas.js';
import { rehydrateTree } from '../src/narrative/runtime-content.js';

const readStory=id=>JSON.parse(readFileSync(new URL(`../content/narrative/${id}.story.json`,import.meta.url),'utf8'));
const terminalIds=['radio.pre_third_room_breakdown','radio.hush_help_rupture'];
const confirm={key:'Enter',code:'Enter'};
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
function resetStack(){while(scenes.depth())scenes.pop();}
test.afterEach(resetStack);

function tick(scene,seconds){
  for(let remaining=seconds;remaining>1e-9;remaining-=.01)scene.update(Math.min(.01,remaining));
}
function tap(scene,event=confirm){scene.key(event);scene.keyup(event);}
function noVoice(nodes){
  return Object.fromEntries(Object.entries(nodes).map(([id,node])=>[id,{...node,lines:(node.lines||[]).map(line=>({...line,voice:false}))}]));
}
function fixture(options={}){
  const calls={done:[],cancel:0,exit:0,stages:[],choices:[],typing:0,stopTyping:0,suspend:0,resume:0,cues:[]};
  const audio={startTyping(){calls.typing++;},stopTyping(){calls.stopTyping++;},stopTapeHiss(){},duckSoundtrack(){},unduckSoundtrack(){},confirm(){},tick(){}};
  const scene=makeRadioScene({
    id:'radio-scene-test',terminal:true,
    nodes:{start:{lines:[{text:'A quiet channel.',who:'direction',voice:false}]}},
    audio,getAudio:()=>null,
    onDone:value=>calls.done.push(value),onCancel:()=>calls.cancel++,onExit:()=>calls.exit++,
    onStage:(stage,detail)=>calls.stages.push({stage,...detail}),onChoice:value=>calls.choices.push(value),
    onSuspend:()=>calls.suspend++,onResume:()=>calls.resume++,cue:name=>calls.cues.push(name),
    ...options,
  });
  scenes.push(scene);
  return{scene,calls};
}
function contactFixture(options={}){
  return fixture({
    startAt:'contact',nodes:{
      contact:{lines:[{sourceId:'rupture.decision',text:'Hold the contact.',who:'direction',voice:false}],choices:[
        {text:'Seat the battery — risk the carrier',goto:'reseat'},
        {text:'Keep it still — let the channel go',goto:'still'},
      ]},
      reseat:{lines:[{sourceId:'rupture.reseat',text:'The battery seats.',who:'direction',voice:false}],goto:'break'},
      still:{lines:[{sourceId:'rupture.still',text:'The hand stays clear.',who:'direction',voice:false}],goto:'break'},
      break:{lines:[{sourceId:'rupture.break',text:'The contact fails.',who:'direction',voice:false}],goto:'after'},
      after:{lines:[{sourceId:'rupture.after',text:'The set stays dead.',who:'direction',voice:false}]},
    },...options,
  });
}
function openContact(scene){
  tick(scene,RADIO_STAGE_HOLDS.decision+.01);tap(scene);tick(scene,.01);
  assert.equal(scene.view().radio.contact,true);
}
function driveToContact(scene){
  for(let i=0;i<100&&!scene.view().radio.contact;i++){tick(scene,5);tap(scene);}
  tick(scene,.01);assert.equal(scene.view().radio.contact,true);
}
function driveToEnd(scene){
  for(let i=0;i<100&&!scene.view().finished;i++){tick(scene,5);tap(scene);}
  assert.equal(scene.view().finished,true);
}

test('the seven authored source IDs survive the real conversation and physical branches',()=>{
  assert.deepEqual(Object.keys(RADIO_STAGE_HOLDS),['onset','relay','decision','reseat','still','break','after']);
  assert.ok(Object.isFrozen(RADIO_STAGE_HOLDS));
  for(const stage of Object.keys(RADIO_STAGE_HOLDS)){
    assert.equal(radioStageForLine({sourceId:`rupture.${stage}`}),stage);
    assert.equal(radioStageForLine({id:`rupture.${stage}`}),stage);
  }
  assert.equal(radioStageForLine({sourceId:'warning.relay'}),null);
  for(const id of terminalIds)for(const branch of ['reseat','still']){
    const doc=readStory(id),nodes=freeze(noVoice(rehydrateTree(doc,{ROOMLABEL:'Studio B3'})));
    const before=JSON.stringify(nodes),{scene,calls}=fixture({id,nodes,startAt:doc.entry});
    driveToContact(scene);
    assert.equal(scene.view().pending.options[scene.view().pending.index].goto,'still');
    scene.key({key:branch==='reseat'?'1':'2'});
    scene.key(confirm);tick(scene,RADIO_CONTACT_HOLD+.01);scene.keyup(confirm);
    driveToEnd(scene);
    assert.deepEqual(calls.stages.map(value=>value.stage),['onset','relay','decision',branch,'break','after']);
    assert.deepEqual(calls.done,[{choice:branch}]);
    assert.equal(calls.exit,1);assert.equal(calls.cancel,0);
    assert.equal(JSON.stringify(nodes),before,'presentation does not mutate authored source or flag operations');
    assert.deepEqual(calls.choices.find(choice=>choice.goto===branch).set,[`radio.contact.${branch==='reseat'?'reseated':'held'}`]);
  }
});

test('each terminal stage owns its minimum dwell even when Continue is mashed',()=>{
  for(const [stage,seconds] of Object.entries(RADIO_STAGE_HOLDS)){
    const {scene,calls}=fixture({nodes:{start:{lines:[{sourceId:`rupture.${stage}`,text:'Set.',who:'direction',voice:false}]}}});
    tick(scene,seconds-.001);
    for(let i=0;i<12;i++)tap(scene);
    assert.equal(calls.done.length,0,`${stage} cannot be skipped before ${seconds}s`);
    assert.equal(scene.view().radio.ready,false);
    tick(scene,.002);tap(scene);
    assert.equal(calls.done.length,1,`${stage} becomes player-advanceable at its dwell`);
  }
});

test('contact defaults safe; numbers select and only an uninterrupted 650ms hold commits',()=>{
  const {scene,calls}=contactFixture();openContact(scene);
  assert.equal(scene.view().pending.index,1);
  scene.key({key:'1',code:'Digit1'});tick(scene,2);
  assert.equal(scene.view().pending.index,0);assert.equal(calls.choices.length,0,'number is selection only');
  scene.key(confirm);tick(scene,RADIO_CONTACT_HOLD-.001);
  assert.equal(calls.choices.length,0);assert.ok(scene.view().radio.hold>0);
  scene.keyup(confirm);assert.equal(scene.view().radio.hold,0);
  tick(scene,1);assert.equal(calls.choices.length,0,'release discards accumulated hold');
  scene.key(confirm);tick(scene,RADIO_CONTACT_HOLD+.001);
  assert.equal(calls.choices.length,1);assert.equal(calls.choices[0].goto,'reseat');
  tick(scene,3);scene.key({...confirm,repeat:true});
  assert.equal(calls.choices.length,1,'held key repeat cannot execute a second choice');
  scene.keyup(confirm);
});

test('controller confirm has the same hold and selection cancellation contract',()=>{
  const {scene,calls}=contactFixture();openContact(scene);
  const event={controllerAction:'confirm',key:'',code:'GamepadA'};
  scene.key(event);tick(scene,.4);scene.key({key:'ArrowUp'});
  assert.equal(scene.view().radio.hold,0);assert.equal(scene.view().pending.index,0);
  tick(scene,1);assert.equal(calls.choices.length,0);
  scene.key(event);tick(scene,.64);assert.equal(calls.choices.length,0);
  scene.keyup(event);scene.key(event);tick(scene,.66);scene.keyup(event);
  assert.equal(calls.choices[0].goto,'reseat');
});

test('pointer drag-off, pointerup, and pointercancel discard the whole physical hold',()=>{
  for(const interruption of ['pointermove','pointerup','pointercancel']){
    const {scene,calls}=contactFixture();openContact(scene);
    const rect=radioSceneLayout(uiSize(),scene.view()).choices[1];
    const point={cellX:rect.x+rect.w/2,cellY:rect.y+rect.h/2,button:0,pointerId:7};
    scene.pointer({...point,type:'pointerdown'});tick(scene,.4);
    scene.pointer({...point,type:interruption,...(interruption==='pointermove'?{cellX:rect.x-4}: {})});
    assert.equal(scene.view().radio.hold,0);tick(scene,1);
    assert.equal(calls.choices.length,0,interruption);
    scene.pointer({...point,type:'pointerdown'});tick(scene,.66);
    scene.pointer({...point,type:'pointerup'});
    assert.equal(calls.choices[0].goto,'still');scenes.remove(scene);
  }
});

test('pause overlays discard held input and freeze the exact narrative clock',()=>{
  const {scene,calls}=contactFixture();openContact(scene);
  scene.key(confirm);tick(scene,.4);
  const before=scene.view().radio.time;
  const pause={id:'pause',blocksInput:true,blocksWorld:true};scenes.push(pause);
  assert.equal(scene.view().radio.hold,0,'stack suspension releases the held contact immediately, before another update');
  for(let i=0;i<20;i++)scenes.update(.1);
  assert.equal(scene.view().radio.time,before);assert.equal(calls.choices.length,0);
  scenes.remove(pause);tick(scene,.5);
  assert.equal(scene.view().radio.hold,0);assert.equal(calls.choices.length,0);
  scene.keyup(confirm);scene.key(confirm);tick(scene,.66);scene.keyup(confirm);
  assert.equal(calls.choices[0].goto,'still');
});

test('blur remains suspended until explicit focus, with no dwell or typing advancing',()=>{
  const {scene,calls}=contactFixture();openContact(scene);
  scene.key(confirm);tick(scene,.4);scene.blur();
  const before=scene.view();tick(scene,2);
  assert.equal(scene.view().radio.time,before.radio.time,'focus loss must not auto-resume on the next frame');
  assert.equal(scene.view().radio.hold,0);assert.equal(scene.view().typed,before.typed);
  assert.equal(calls.resume,0);assert.equal(calls.choices.length,0);
  scene.focus();tick(scene,1);
  assert.equal(calls.choices.length,0,'resume requires a fresh press');
  scene.keyup(confirm);scene.key(confirm);tick(scene,.66);scene.keyup(confirm);
  assert.equal(calls.choices[0].goto,'still');
});

test('blur also stops an unfinished physical line rather than revealing its text while unfocused',()=>{
  const {scene}=fixture({nodes:{start:{lines:[{sourceId:'rupture.onset',text:'Paper slides over Martin\'s desk. His pencil taps twice.',who:'direction',voice:false}]}}});
  tick(scene,.1);assert.equal(scene.view().typing,true);
  scene.blur();const before=scene.view();tick(scene,5);
  assert.equal(scene.view().typed,before.typed);assert.equal(scene.view().radio.age,before.radio.age);
  scene.focus();tick(scene,.1);
  assert.ok(scene.view().typed>before.typed);assert.ok(scene.view().radio.age>before.radio.age);
});

test('scene completion and external removal clean up once and do not continue dispatching',()=>{
  const {scene,calls}=fixture({terminal:false});tick(scene,1);tap(scene);
  assert.equal(calls.done.length,1);assert.equal(calls.exit,1);assert.equal(scenes.depth(),0);
  const stopped=calls.stopTyping;
  scene.exit();scene.update(10);tap(scene);scene.key({key:'Escape'});
  assert.equal(calls.done.length,1);assert.equal(calls.cancel,0);assert.equal(calls.exit,1);assert.equal(calls.stopTyping,stopped);
  const suspend=calls.suspend;scenes.push({id:'unrelated'});scenes.pop();
  assert.equal(calls.suspend,suspend,'completed scenes release their stack subscriptions');
  const aborted=contactFixture();openContact(aborted.scene);
  aborted.scene.key(confirm);tick(aborted.scene,.4);scenes.remove(aborted.scene);
  tick(aborted.scene,10);assert.equal(aborted.calls.choices.length,0);assert.equal(aborted.calls.done.length,0);assert.equal(aborted.calls.exit,1);
});

test('ordinary radio can be lowered once, but Escape cannot finish a terminal rupture',()=>{
  const optional=fixture({terminal:false});
  assert.equal(optional.scene.key({key:'Escape'}),true);
  assert.equal(optional.calls.cancel,1);assert.equal(optional.calls.done.length,0);assert.equal(optional.calls.exit,1);
  optional.scene.key({key:'Escape'});assert.equal(optional.calls.cancel,1);
  const required=contactFixture();openContact(required.scene);
  required.scene.key(confirm);tick(required.scene,.4);
  assert.equal(required.scene.key({key:'Escape'}),false,'the application may open Pause instead');
  assert.equal(scenes.top(),required.scene);assert.equal(required.scene.view().radio.hold,0);
  assert.equal(required.calls.done.length,0);assert.equal(required.calls.cancel,0);
});

test('terminal equipment cues never double-dispatch old line audio, while ordinary cues remain usable',()=>{
  for(const terminal of [false,true]){
    const {scene,calls}=fixture({terminal,nodes:{start:{lines:[{sourceId:'rupture.onset',text:'Contact.',who:'direction',voice:false,cue:'old-rupture'}]}}});
    assert.deepEqual(calls.cues,terminal?[]:['old-rupture']);scenes.remove(scene);
  }
});

test('reduced motion preserves authored stages, choices and dwell without mutating the world-view contract',()=>{
  const presentations=[];
  for(const reducedMotion of [false,true]){
    const {scene,calls}=contactFixture({getReducedMotion:()=>reducedMotion,worldView:state=>({...state})});
    openContact(scene);const world=scene.worldView();assert.equal(world.reducedMotion,reducedMotion);
    scene.key(confirm);tick(scene,.64);assert.equal(calls.choices.length,0);
    tick(scene,.02);scene.keyup(confirm);driveToEnd(scene);
    presentations.push(calls.stages.map(value=>value.stage));
  }
  assert.deepEqual(presentations[0],presentations[1]);
});

test('all authored radio prose and choices fit the viewport without overlapping at 960/1280 and 1.5 scale',()=>{
  const docs=[...terminalIds,'radio.initial_checkin','radio.post_second_take_warning','conservatory.radio_dead','radio.guidance'].map(readStory);
  for(const [width,height] of [[960,600],[1280,760]])for(const scale of [1,1.5]){
    const size={cols:Math.floor(width/(UI_CELL_W*scale)),rows:Math.floor(height/(UI_CELL_H*scale))};
    for(const doc of docs)for(const node of Object.values(doc.nodes)){
      const states=(node.lines||[]).map(line=>({line}));
      if(node.choices?.length)states.push({line:node.lines?.at(-1),pending:{options:node.choices,index:0}});
      for(const view of states){
        const label=`${doc.id}:${view.line?.id||node.id} ${width}x${height}@${scale}`,layout=radioSceneLayout(size,view);
        assert.ok(layout.x>=0&&layout.x+layout.w<=size.cols,label);
        assert.ok(layout.textY>=1.1,label);
        assert.ok(layout.footerY+1<=size.rows,label);
        const bottom=layout.textY+(layout.lines.length-1)*1.1+1;
        assert.ok(bottom<=(layout.choices[0]?.y-.15||layout.footerY-.5),`${label}: prose ${bottom} overlaps choices/footer`);
        for(const rect of layout.choices){
          assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.w<=size.cols&&rect.y+rect.h<=layout.footerY,label);
          const rows=uiWrap(rect.choice.text,rect.w-3);
          assert.ok(rows.length<=2,`${label}: choice must not be silently truncated`);
          assert.ok((rows.length-1)*.9+1<=rect.h+.001,label);
        }
      }
    }
  }
});

// A recording canvas checks the actual code-native drawing, not a duplicated
// formula or a screenshot assertion dependent on a native graphics backend.
function renderProbe(width=960,height=600){
  const originals=Object.fromEntries(['document','window','getComputedStyle'].map(key=>[key,globalThis[key]]));
  const surfaces=[];
  const document={fonts:{check:()=>true,load:()=>Promise.resolve()},createElement(){
    const commands=[],state={globalAlpha:1,font:'14px sans-serif'},stack=[];
    const canvas={width:0,height:0,style:{},ownerDocument:document};
    const gradient=(type,args)=>{const value={type,args,stops:[]};Object.defineProperty(value,'addColorStop',{value:(...stop)=>value.stops.push(stop)});return value;};
    const methods={
      save(){stack.push({...state});},restore(){Object.assign(state,stack.pop()||{});},
      createLinearGradient:(...args)=>gradient('linear',args),createRadialGradient:(...args)=>gradient('radial',args),
      createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
      measureText(text){const px=Number(/([\d.]+)px/.exec(state.font)?.[1]||14);return{width:String(text).length*px*.55,actualBoundingBoxAscent:px*.72,actualBoundingBoxDescent:px*.12};},
    };
    const ctx=new Proxy(state,{get(target,key){if(key==='canvas')return canvas;if(key in methods)return methods[key];if(key in target)return target[key];return(...args)=>commands.push({method:key,args,fill:state.fillStyle});},set(target,key,value){target[key]=value;return true;}});
    canvas.getContext=()=>ctx;surfaces.push({canvas,commands});return canvas;
  }};
  globalThis.document=document;globalThis.window={devicePixelRatio:1,addEventListener(){}};globalThis.getComputedStyle=()=>({position:'relative'});
  uiInit({clientWidth:width,clientHeight:height,style:{},appendChild(){}});uiSetScale(1);
  return{
    draw(stage,age,reducedMotion){
      const commands=surfaces[0].commands;commands.length=0;
      drawRadioScene({line:null,typed:0,radio:{stage,age,time:age,ready:true,terminal:true}},{reducedMotion});
      const end=commands.findIndex(command=>command.method==='drawImage');
      return structuredClone(commands.slice(0,end<0?commands.length:end));
    },
    restore(){uiSetScale(1);for(const[key,value]of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}},
  };
}

test('reduced-motion equipment drawing uses one static pose per stage, without flicker or residual settling',()=>{
  const probe=renderProbe();
  try{
    for(const stage of ['live',...Object.keys(RADIO_STAGE_HOLDS)]){
      assert.deepEqual(probe.draw(stage,.1,true),probe.draw(stage,1.1,true),`${stage} must not animate within its reduced-motion stage`);
    }
    assert.notDeepEqual(probe.draw('relay',.1,false),probe.draw('relay',1.1,false),'normal motion still provides authored physical progression');
  }finally{probe.restore();}
});
