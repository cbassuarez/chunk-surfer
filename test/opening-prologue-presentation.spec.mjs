import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {makeOpeningPrologueScene,openingPrologueActFrame,openingPrologueCaptionPlacement} from '../src/game/opening-prologue-scene.js';
import {cinematicConversationLayout} from '../src/render/cinematic-conversation.js';
import {uiSetLayoutSize} from '../src/render/ui.js';
import {openingPrologueSpeechActive} from '../src/audio/opening-prologue-audio.js';
import {OPENING_PROLOGUE} from '../src/data/opening-prologue.js';
import {openingHorizonFrame} from '../src/render/opening-omen.js';
import {SOURCE_REST_HORIZON} from '../src/game/source-rest-horizon.js';
import {sourceRestHorizonLensUniforms,OPENING_OPHANIM_RING_BYTE,OPENING_OPHANIM_EYE_BYTE,openingOphanimMarkByte,SOURCE_REST_HORIZON_LENS_GLSL} from '../src/render/source-rest-horizon-pass.js';
import {createPrologueDrive} from '../src/game/source-drive/prologue-drive.js';
import {decodePrintedSurface} from '../src/render/printed-surface.js';
import {sourceMaterialRecordedInk,sourcePrismaticInk} from '../src/render/source-material-finish.js';

function host(){
  scenes.clear();const calls={omen:[],done:0,look:[]};
  let elapsed=0,paused=false;
  const drive={start(){},update(dt){if(!paused)elapsed+=dt;},setPaused(value){paused=!!value;},snapshot:()=>({timeSec:elapsed,paused,driveState:{heading:0}}),
    frame:()=>({scene:{eye:[-8,1.6,-600]},look:{yaw:0,pitch:-.035}}),
    lookAngles:()=>({yaw:0,pitch:-.035}),lookBy:(yaw,pitch)=>{calls.look.push([yaw,pitch]);return true;}};
  let scene;
  scene=makeOpeningPrologueScene({drive,driveMetrics:{ready:true},getReady:()=>true,getPresentationReady:()=>true,
    setOmen:value=>calls.omen.push(value),audio:{},onDone(){calls.done++;scenes.remove(scene);}});
  scenes.push(scene);scene.update(.01);scene.update(.01);scene.update(.01);
  assert.equal(scene.view().phase,'film');return{scene,calls};
}
const advance=(scene,seconds)=>{for(let elapsed=0;elapsed<seconds;elapsed+=.05)scene.update(.05);};

test('reply, navigation and pedal keys cannot become an accidental film skip',()=>{
  const h=host();
  try{
    for(const key of['w','a','s','d','ArrowUp','ArrowDown',' ','Enter','1']){
      h.scene.key({key});advance(h.scene,1.3);h.scene.keyup({key});
      assert.equal(h.calls.done,0,`holding ${JSON.stringify(key)} must not skip`);
    }
    h.scene.key({key:'e',code:'KeyE'});advance(h.scene,.65);
    h.scene.keyup({key:'w'});advance(h.scene,.55);
    assert.equal(h.calls.done,1,'only the dedicated held E gesture skips; unrelated keyup does not release it');
  }finally{scenes.clear();}
});

test('pause and blur cancel a partial skip; the controller uses the displayed tabNext action',()=>{
  const h=host();
  try{
    h.scene.key({key:'e'});advance(h.scene,.6);h.scene.pause();advance(h.scene,2);h.scene.resume();advance(h.scene,1.3);
    assert.equal(h.calls.done,0);assert.equal(h.scene.view().skip,0);
    h.scene.key({key:'e',controllerAction:'confirm'});advance(h.scene,1.3);assert.equal(h.calls.done,0,'controller confirm cannot inherit its synthetic E key');
    h.scene.key({key:'e',controllerAction:'tabNext'});advance(h.scene,1.2);assert.equal(h.calls.done,1);
  }finally{scenes.clear();}
});

test('one drive owner keeps the picture and responsive look throughout its cinematic departure',()=>{
  const h=host();
  try{
    assert.equal(h.scene.allowsLook,true);assert.equal(h.scene.lookBy(.4,-.2),true);
    h.scene.seekStage('woken');h.scene.update(.05);
    const omen=h.calls.omen.at(-1);assert.deepEqual(omen.horizon.centre,[0,14,-115]);
    assert.equal(h.scene.worldView(),null);assert.equal(h.calls.omen.at(-1),omen,'reading the host camera must not rewrite the omen');
    h.scene.seekStage('inner');h.scene.update(.05);
    assert.equal(h.scene.allowsLook,true);assert.equal(h.scene.lookBy(.2,0),true);
    assert.equal(h.scene.worldView(),null);
  }finally{scenes.clear();}
});

test('the actual prologue driver delegates head look without steering the van',()=>{
  const driver=createPrologueDrive();driver.start();
  try{
    for(let n=0;n<30;n++)driver.update(.05);
    const before=driver.snapshot().driveState,look=driver.lookAngles();
    assert.equal(driver.lookBy(.2,-.1),true);
    assert.equal(driver.lookAngles().yaw,look.yaw+.2);assert.equal(driver.lookAngles().pitch,look.pitch-.1);
    const after=driver.snapshot().driveState;
    assert.equal(after.heading,before.heading);assert.equal(after.wheelAngle,before.wheelAngle);
    driver.lookBy(10,10);assert.equal(driver.lookAngles().yaw,1.55);assert.equal(driver.lookAngles().pitch,.45);
  }finally{driver.dispose();}
});

test('the music stays ducked for the actual voice handle, including a long line after its caption is revealed',()=>{
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:0,typing:false,lineAge:0}),true);
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:.7,typing:false,lineAge:12}),true);
  assert.equal(openingPrologueSpeechActive({who:'unknown',voice:null,typing:true,lineAge:.2}),false);
  assert.equal(openingPrologueSpeechActive({who:'me',voice:.5}),false);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/speaking:openingPrologueSpeechActive\(v\)/);
  assert.match(main,/if\(openingPrologueScene\)\{if\(paused\)openingPrologueScene\.pause\(\);else if\(gameplayInputLifecycleActive\(\)\)openingPrologueScene\.resume\(\);\}/);
});

test('every ending question stays wholly readable and selectable at enlarged text scale',()=>{
  for(const options of [OPENING_PROLOGUE.nodes.fate.choices,OPENING_PROLOGUE.nodes.file.choices])for(let selected=0;selected<options.length;selected++){
    const layout=cinematicConversationLayout({history:[{who:'unknown',text:'What else?'}],pending:{kind:'branch',index:selected,options}},
      {cols:76,rows:24,prompt:'UP/DOWN SELECT · ENTER REPLY · Q REVIEW'});
    assert.equal(layout.selectedChoiceComplete,true);
    assert.equal(layout.choices.rows.filter(row=>row.kind==='choice'&&row.selected).map(row=>row.bodyText).join(' ').replace(/\s+/g,' ').trim(),options[selected].text);
    assert.ok((layout.y+layout.height)*layout.scale<=23);
  }
});

test('Cinematic anchors preserve the cab hands and the upper sky/school picture',()=>{
  for(const intent of['road','windshield','body','reminder','return'])assert.equal(openingPrologueCaptionPlacement(intent),'top');
  for(const intent of['wheels','school','near','fates','avert'])assert.equal(openingPrologueCaptionPlacement(intent),'bottom');
  assert.equal(openingPrologueCaptionPlacement(null,'grip'),'top');
});

test('opening Review holds the exact live utterance, stage, drive and partial skip without completing the line',()=>{
  uiSetLayoutSize({cols:140,rows:40});const h=host();
  try{
    advance(h.scene,4);h.scene.key({key:' '});advance(h.scene,.1);
    h.scene.key({key:'e'});advance(h.scene,.25);
    const before=h.scene.view();assert.ok(before.captionHistory.length>0);
    h.scene.key({key:'q'});const held=h.scene.view();assert.equal(held.reviewActive,true);assert.equal(held.paused,true);assert.equal(held.skip,0);assert.equal(h.scene.allowsLook,false);
    advance(h.scene,1);const after=h.scene.view();
    assert.deepEqual([after.nodeId,after.lineSerial,after.typed,after.stage.time,after.drive.timeSec],[before.nodeId,before.lineSerial,before.typed,before.stage.time,before.drive.timeSec]);
    assert.equal(h.scene.key({key:'Escape'}),true,'Escape closes this review without opening global pause');
    assert.equal(h.scene.view().reviewActive,false);assert.equal(h.scene.allowsLook,true);
    advance(h.scene,.2);assert.ok(h.scene.view().drive.timeSec>after.drive.timeSec);assert.equal(h.calls.done,0);
  }finally{scenes.clear();uiSetLayoutSize(null);}
});

test('closing Review cannot release an independently paused opening',()=>{
  uiSetLayoutSize({cols:140,rows:40});const h=host();
  try{
    advance(h.scene,4);h.scene.key({key:' '});advance(h.scene,.1);h.scene.key({key:'q'});h.scene.pause();
    const before=h.scene.view();h.scene.key({key:'q'});advance(h.scene,.5);const after=h.scene.view();
    assert.equal(after.reviewActive,false);assert.equal(after.paused,true);assert.equal(after.presentationPaused,true);
    assert.equal(after.drive.timeSec,before.drive.timeSec);assert.equal(after.typed,before.typed);
    h.scene.resume();advance(h.scene,.2);assert.equal(h.scene.view().presentationPaused,false);assert.ok(h.scene.view().drive.timeSec>after.drive.timeSec);
  }finally{scenes.clear();uiSetLayoutSize(null);}
});

test('a chosen act leaves one real eye shut through the rest of the encounter, without a saved penalty',()=>{
  const acts=Object.values(OPENING_PROLOGUE.nodes).filter(node=>node.openingAct);
  assert.equal(acts.length,8);
  for(const node of acts)assert.equal(node.goto,'kept');
  for(const id of['whole','ellery','school','kept']){
    const raw=OPENING_PROLOGUE.keys[id],frame=openingPrologueActFrame(raw,{id:'gaze'});
    assert.ok(frame.shut>=1);
    const horizon=openingHorizonFrame({centre:frame.hole,radius:frame.radius,open:frame.open,shut:frame.shut,clock:60});
    assert.equal(Array.from(horizon.eyeAges).filter(age=>age<SOURCE_REST_HORIZON.eyeDarkSeconds).length,1);
  }
  assert.equal(openingPrologueActFrame(OPENING_PROLOGUE.keys.whole,null).shut,0);
});

test('the opening eye aperture is explicitly opt-in and does not change Source II recording eyes',()=>{
  assert.deepEqual(sourceRestHorizonLensUniforms({active:true}).eyes,[0,0]);
  const frame=openingHorizonFrame({centre:[80,70,-16],radius:1,clock:30});
  assert.deepEqual(sourceRestHorizonLensUniforms(frame).eyes,[2,.96]);
  assert.equal(OPENING_OPHANIM_RING_BYTE,172);assert.equal(OPENING_OPHANIM_EYE_BYTE,173);
  assert.deepEqual(decodePrintedSurface(171/255),{kind:2,coverage:1},'ordinary full light pigment retains its own identity');
  assert.deepEqual(decodePrintedSurface(OPENING_OPHANIM_EYE_BYTE/255),{kind:0,coverage:0},'opening optical identity cannot alias an ordinary sheet');
  assert.equal(openingOphanimMarkByte(),156,'Source II does not opt in');
  assert.equal(openingOphanimMarkByte({eyePresentation:[0,0],eyeInk:12}),156,'a dormant eye ID does not change Source II');
  assert.equal(openingOphanimMarkByte({eyePresentation:[2,.96]}),172);
  assert.equal(openingOphanimMarkByte({eyePresentation:[2,.96],eyeInk:12}),173);
  const shader=readFileSync(new URL('../src/render/pixel-mesh/shader.js',import.meta.url),'utf8');
  assert.match(shader,/sourcePrismaticInk\(2\.0,worldMetres,finishFacing,0\.0,1\.0\)/,'the exact retained silicon palette colours only the optical marks');
  const texel=shader.slice(shader.indexOf('vec2 printedSurfaceTexel('),shader.indexOf('float printedSurfaceAreaTexel('));
  assert.match(texel,/if\(byte==172\.0\)return vec2\(2\.0,0\.0\)/,'ring identity retains the former light-surface stock acquisition');
  assert.match(texel,/if\(byte==173\.0\)return vec2\(2\.0,1\.0\)/,'eye identity retains the existing pigment endpoint acquisition');
  assert.ok(texel.indexOf('byte==173.0')<texel.indexOf('printedSurfaceKind(tag)'),'optical identities resolve before the ordinary material decoder');
  const hook=shader.slice(shader.indexOf('float openingOphanimTag='),shader.indexOf('captureDark=sourceWalkwayRecordedInk('));
  assert.match(hook,/texelFetch\(uMarks/,'categorical identities use the winning unfiltered texel');
  assert.match(hook,/step\(171\.5,openingOphanimTag\)\*step\(openingOphanimTag,173\.5\)/,'ordinary pigment171 and adjacent identities cannot acquire the rainbow');
  assert.doesNotMatch(hook,/captureBit\s*[*+\-/]?=|captureDark\s*=/,'restoring light ink cannot rewrite the acquired mask or fill its black pupils');
  const inks=[0,1,2,3,4,5].map(n=>sourcePrismaticInk({finish:'silicon',world:[n/(6*.028),0,0],facing:1,pigment:0}));
  assert.ok(new Set(inks.map(rgb=>rgb.map(n=>n.toFixed(2)).join(','))).size>=6,'the earlier spectrum retains six distinct hue phases');
  const eyeInk=sourceMaterialRecordedInk([.2,.4,.8],{finish:'silicon',pigmentKind:2,pigment:1,capturedLight:1});
  assert.deepEqual(eyeInk,[.96,.985,1],'the general printed-light material remains silver');
  assert.match(SOURCE_REST_HORIZON_LENS_GLSL,/eyeInk=e\.w/,'the winning eye intersection keeps its identity');
});

test('the shortest encounter remains substantial, with a required act and six to eight meaningful question boards',()=>{
  const nodes=OPENING_PROLOGUE.nodes,cost=node=>node.lines.reduce((sum,row)=>sum+(row.text.match(/\S+/g)||[]).length,0);
  const distances=new Map([[OPENING_PROLOGUE.entry,0]]),parents=new Map(),queue=[OPENING_PROLOGUE.entry];
  while(queue.length){
    queue.sort((a,b)=>distances.get(a)-distances.get(b));const id=queue.shift(),node=nodes[id];
    for(const to of[node.goto,...(node.choices||[]).map(row=>row.goto)].filter(Boolean)){
      const distance=distances.get(id)+cost(node);
      if(distance<(distances.get(to)??Infinity)){distances.set(to,distance);parents.set(to,id);queue.push(to);}
    }
  }
  const route=[];for(let id='card';id;id=parents.get(id))route.unshift(id);
  assert.ok(distances.get('card')>=650&&distances.get('card')<=800);
  const boards=route.filter(id=>nodes[id].choices).length;assert.ok(boards>=6&&boards<=8);
  assert.ok(route.some(id=>nodes[id].openingAct));
  assert.ok(route.includes('kept')&&route.includes('job-sheet')&&route.includes('ellery'));
  assert.ok(!route.includes('file'));
});
