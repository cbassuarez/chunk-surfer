import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makePracticeMetronomeScene,practiceMetronomePrompts} from '../src/game/practice-metronome-scene.js';
import {practiceMetronomeLayout,practiceMetronomeHit,practiceMetronomeTempoAtPointer,
  practiceMetronomePointerOnPlane,projectPracticeMetronomePoint,practiceMetronomeHintRegions} from '../src/render/practice-metronome-view.js';
import {PRACTICE_METRONOME_SHAPE as C,practiceMetronomeGeometry,practiceMetronomeInstances,
  practiceMetronomePose,practiceMetronomeWeightDistance,practiceMetronomeTempoAtDistance,
  practiceMetronomePlacement,PRACTICE_METRONOME_PICK_GEOMETRY as PICK} from '../src/render/practice-metronome-model.js';
import {freshMetronomeState,stepMetronomes,holdMetronomeWeight,setMetronomeTempo,setMetronomeRunning,metronomeVoiceState} from '../src/game/practice-metronomes.js';
import {setActiveInputDevice,setControllerSettings,resetControllerSettings} from '../src/game/bindings.js';

const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} should equal ${b}`);
const renderProp={id:'lesson',x:12,y:1.42,z:9,yaw:.45,scale:1};
const transform=(m,p)=>({x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]});
function cameraFor(prop=renderProp,{width=1280,height=800,side=.08,distance=.68,tanHalfFov=.40}={}){
  const matrix=practiceMetronomePlacement(prop),eye=transform(matrix,{x:side,y:.24,z:-distance}),target=transform(matrix,{x:0,y:.23,z:-.08});
  const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z;
  return{eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),tanHalfFov,width,height};
}
function fixture(initial={},options={}){
  scenes.clear();let state={id:'lesson',label:'the lesson room',tempo:134.4,running:true,stopped:false,held:false,swing:.55,...initial},closes=0,stops=0,recording=false,lights=0;
  const actions=[],controlEvents=[];
  const scene=makePracticeMetronomeScene({getState:()=>state,
    onTempo:(tempo,options)=>{state.tempo=tempo;actions.push(['tempo',tempo,options]);},
    onWeightHold:held=>{state.held=held;actions.push(['hold',held]);},
    onRunning:running=>{state.running=running;state.stopped=!running;actions.push(['running',running]);},
    onClose:()=>closes++,isRecording:()=>recording,onRecordStop:()=>{stops++;recording=false;},onLight:()=>lights++,onControl:(...event)=>controlEvents.push(event),
    getRenderProp:()=>renderProp,getCamera:()=>cameraFor(),getReducedMotion:()=>options.reducedMotion??true,
    worldView:frame=>({metronomeInspection:true,frame})});
  scenes.push(scene);return{scene,state,actions,controlEvents,get closes(){return closes;},get stops(){return stops;},get lights(){return lights;},set recording(value){recording=value;}};
}
function click(scene,p,id=1){scene.pointer({type:'pointerdown',pointerId:id,button:0,cellX:p.x,cellY:p.y});scene.pointer({type:'pointerup',pointerId:id,button:0,cellX:p.x,cellY:p.y});}

test('every authored tempo projects to its literal 3D weight at all swings and viewport aspect ratios',()=>{
  for(const size of[{cols:120,rows:38},{cols:54,rows:20},{cols:20,rows:8}])for(const aspect of[.4,.5,.8])for(const swing of[-1,-.4,0,.65,1]){
    for(const tempo of[40,112,126,134.4,168,224,252,300]){
      const l=practiceMetronomeLayout(size,{tempo,swing},{renderProp,camera:cameraFor(renderProp,{width:size.cols*aspect,height:size.rows})});
      assert.equal(practiceMetronomeHit(l,l.weight.x,l.weight.y)?.kind,'weight');
      assert.equal(practiceMetronomeHit(l,l.pivot.x,l.pivot.y)?.kind,'pendulum');
      near(practiceMetronomeTempoAtPointer(l,l.weight.x,l.weight.y),tempo);
      assert.ok(l.body.x>=0&&l.body.x+l.body.w<=size.cols);
      assert.equal(practiceMetronomeHit(l,.1,.1),null,'empty room is not an invisible control');
      assert.equal(practiceMetronomeHit(l,l.close.x+l.close.w/2,l.close.y+l.close.h/2)?.kind,'close');
    }
  }
  assert.ok(practiceMetronomeWeightDistance(40)>practiceMetronomeWeightDistance(300),'a high weight is slow');
  near(practiceMetronomeTempoAtDistance(-1),300);near(practiceMetronomeTempoAtDistance(1),40);
});

test('grabbing the moving weight preserves the grabbed edge and only its owner may drag or release',()=>{
  const f=fixture(),s=f.scene,l=s.view().layout,p=l.point({
    x:l.pose.weight.x+Math.sin(l.pose.angle)*.006,
    y:l.pose.weight.y+Math.cos(l.pose.angle)*.006,
  });let captured=0,released=0;
  const target={setPointerCapture:id=>{assert.equal(id,7);captured++;},releasePointerCapture:()=>released++};
  s.pointer({type:'pointerdown',pointerId:7,button:0,cellX:p.x,cellY:p.y,originalEvent:{target}});
  assert.equal(f.state.held,true);assert.equal(captured,1);near(f.state.tempo,134.4);
  s.pointer({type:'pointermove',pointerId:7,cellX:p.x,cellY:p.y});near(f.state.tempo,134.4);
  s.pointer({type:'pointerdown',pointerId:8,button:0,cellX:p.x,cellY:p.y});
  s.pointer({type:'pointermove',pointerId:8,cellX:p.x,cellY:p.y+10});near(f.state.tempo,134.4);
  s.pointer({type:'pointerup',pointerId:8,button:0});assert.equal(f.state.held,true);
  s.pointer({type:'pointermove',pointerId:7,cellX:p.x,cellY:p.y+2});assert.ok(f.state.tempo>134.4);
  s.pointer({type:'pointerup',pointerId:7,button:0});assert.equal(f.state.held,false);assert.equal(released,1);
  assert.deepEqual(f.actions.filter(a=>a[0]==='hold'),[['hold',true],['hold',false]]);s.key({key:'Escape'});
});

test('literal part hover changes only focus, leaves blank space alone, and cannot steal a held grip',()=>{
  const f=fixture(),s=f.scene,l=s.view().layout;
  assert.equal(s.view().focus,'weight');
  s.pointer({type:'pointermove',pointerId:2,cellX:l.pivot.x,cellY:l.pivot.y});assert.equal(s.view().focus,'pendulum');
  s.pointer({type:'pointermove',pointerId:2,cellX:.1,cellY:.1});assert.equal(s.view().focus,'pendulum');
  s.pointer({type:'pointermove',pointerId:2,cellX:l.weight.x,cellY:l.weight.y});assert.equal(s.view().focus,'weight');
  assert.deepEqual(f.actions,[]);assert.deepEqual(f.controlEvents,[]);near(f.state.tempo,134.4);assert.equal(f.state.stopped,false);
  s.pointer({type:'pointerdown',pointerId:7,button:0,cellX:l.weight.x,cellY:l.weight.y});
  const before=f.actions.length,cues=f.controlEvents.length;
  s.pointer({type:'pointermove',pointerId:2,cellX:l.pivot.x,cellY:l.pivot.y});
  assert.equal(s.view().focus,'weight');assert.equal(f.state.held,true);assert.equal(f.actions.length,before);assert.equal(f.controlEvents.length,cues);
  s.pointer({type:'pointerup',pointerId:7});s.key({key:'ArrowUp'});
  s.pointer({type:'pointermove',pointerId:2,cellX:l.pivot.x,cellY:l.pivot.y});assert.equal(s.view().focus,'weight');assert.equal(f.state.held,true);
  s.key({key:'Escape'});
});

test('hint backings stay narrow and within the reserved surface without covering physical controls',()=>{
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const size of[{cols:120,rows:37},{cols:80,rows:25},{cols:60,rows:20}])for(const focus of['weight','pendulum']){
    const physicalSize=size.cols===60?{cols:120,rows:38}:size;
    const l=practiceMetronomeLayout(size,{tempo:134.4,swing:.7},{renderProp,camera:cameraFor(renderProp,{width:960,height:600}),physicalSize});
    const hints=practiceMetronomeHintRegions(l,{focus,footer:practiceMetronomePrompts({focus})});
    assert.ok(hints.close.text==='STEP BACK');
    for(const region of[hints.part,hints.footer,hints.close].filter(Boolean)){
      assert.ok(region.x>=0&&region.y>=0&&region.x+region.w<=size.cols&&region.y+region.h<=size.rows);
      assert.ok(region.h<=1.15,'backing is only a text line');
      assert.equal(overlap(region,l.weight.bounds),false,'text cannot cover the moving weight');
      assert.equal(overlap(region,l.pivotBounds),false,'text cannot cover the catch');
    }
  }
});

test('keyboard and normalized controller actions adjust the same weight, and durable catch does not confuse a temporary hold',()=>{
  const f=fixture(),s=f.scene;
  assert.equal(s.blocksWorld,false);assert.equal(s.worldPresentation,'visible');assert.equal(s.allowsLook,false);
  assert.equal(s.suppressesHud,false,'taking the object cannot hide live-take warnings or freeze the hunt');
  s.key({key:'ArrowUp'});near(f.state.tempo,133.4);assert.equal(f.state.held,true);
  s.key({key:'ArrowUp',repeat:true});near(f.state.tempo,132.4);
  s.keyup({key:'ArrowUp'});assert.equal(f.state.held,false);
  s.key({controllerAction:'move_down',key:'unrelated'});near(f.state.tempo,133.4);
  s.keyup({controllerAction:'move_down',key:'unrelated'});assert.equal(f.state.held,false);
  s.key({controllerAction:'move_right',key:'unrelated'});assert.equal(s.view().focus,'pendulum');
  f.state.running=false;f.state.stopped=false;f.state.held=true;
  s.key({controllerAction:'confirm',key:'Enter'});assert.equal(f.state.stopped,true,'temporary silence cannot turn a click into restart');
  s.key({controllerAction:'confirm',key:'Enter',repeat:true});assert.equal(f.state.stopped,true,'held confirm cannot chatter stop/start');
  s.key({controllerAction:'confirm',key:'Enter'});assert.equal(f.state.stopped,false);
  s.key({controllerAction:'back'});assert.equal(f.closes,1);assert.equal(scenes.has('practice-metronome'),false);
});

test('blur, cancellation, overlay and exit release a weight without restarting a stopped clock',()=>{
  for(const cancel of[s=>s.blur(),s=>s.suspend(),s=>s.pointer({type:'pointercancel'}),s=>scenes.push({id:'pause',blocksInput:true,freezesBelow:true}),s=>scenes.remove(s)]){
    const f=fixture({stopped:true,running:false}),s=f.scene,l=s.view().layout;
    s.pointer({type:'pointerdown',pointerId:3,button:0,cellX:l.weight.x,cellY:l.weight.y});assert.equal(f.state.held,true);
    cancel(s);assert.equal(f.state.held,false);assert.equal(f.state.stopped,true);
    const n=f.actions.length;s.pointer({type:'pointermove',pointerId:3,cellX:10,cellY:10});assert.equal(f.actions.length,n);
    scenes.clear();assert.equal(f.closes,1);
  }
});

test('releasing one keyboard or pad contact cannot drop a different contact still holding the weight',()=>{
  const f=fixture(),s=f.scene;
  s.key({key:'w',code:'KeyW'});s.key({key:'ArrowUp',code:'ArrowUp'});s.key({controllerAction:'confirm',key:'Enter'});
  s.keyup({key:'w',code:'KeyW'});assert.equal(f.state.held,true);
  s.keyup({key:'ArrowUp',code:'ArrowUp'});assert.equal(f.state.held,true);
  s.keyup({controllerAction:'confirm',key:'Enter'});assert.equal(f.state.held,false);
  s.key({key:'Escape'});
});

test('code-only keys and the controller menu button retain the host Escape contract',()=>{
  const f=fixture(),s=f.scene;
  s.key({code:'ArrowUp'});near(f.state.tempo,133.4);assert.equal(f.state.held,true);
  s.keyup({code:'ArrowUp'});assert.equal(f.state.held,false);
  s.key({controllerAction:'menu',key:'Escape',code:'Escape'});assert.equal(f.closes,1);
  const other=fixture();other.scene.key({code:'Escape'});assert.equal(other.closes,1);
});

test('camera arrival and return hold locomotion, release the grip immediately, and freeze behind pause or blur',()=>{
  const f=fixture({}, {reducedMotion:false}),s=f.scene;
  assert.equal(s.getCloseupMix(),0);s.key({key:'ArrowUp'});near(f.state.tempo,134.4);
  for(let i=0;i<3;i++)s.update(.1);near(s.getCloseupMix(),.6);
  s.blur();s.update(.1);near(s.getCloseupMix(),.6);s.focus();s.update(.1);s.update(.1);near(s.getCloseupMix(),1);
  assert.equal(s.view().phase,'hands');assert.equal(s.worldView().frame.mix,1);
  s.key({key:'ArrowUp'});assert.equal(f.state.held,true);s.key({key:'Escape'});
  assert.equal(f.state.held,false);assert.equal(s.view().phase,'return');assert.equal(f.closes,0);assert.equal(scenes.has(s.id),true);
  s.update(.1);const returning=s.getCloseupMix();assert.ok(returning>0&&returning<1);
  scenes.push({id:'pause',blocksInput:true,freezesBelow:true});s.update(.1);near(s.getCloseupMix(),returning);
  scenes.pop();for(let i=0;i<3;i++)s.update(.1);
  assert.equal(f.closes,1);assert.equal(s.getCloseupMix(),0);assert.equal(scenes.has(s.id),false);
});

test('a passive notice releases an old grip but does not make the visible world control inert',()=>{
  const f=fixture(),s=f.scene;s.key({key:'ArrowUp'});assert.equal(f.state.held,true);
  scenes.push({id:'passive-notice',overlay:true,blocksInput:false});assert.equal(f.state.held,false);
  const before=f.state.tempo;s.key({key:'ArrowDown'});assert.ok(f.state.tempo>before);assert.equal(f.state.held,true);
  scenes.clear();assert.equal(f.closes,1);assert.equal(f.state.held,false);
});

test('picking uses the actual physical viewport and rejects back faces, independent of a reserved hint surface',()=>{
  const camera=cameraFor(),physicalSize={cols:120,rows:38};
  const l=practiceMetronomeLayout({cols:60,rows:20},{tempo:134.4,swing:.7},{renderProp,camera,physicalSize});
  const local={...l.pose.weight,z:PICK.weightFrontZ},world=transform(practiceMetronomePlacement(renderProp),local),screen=projectPracticeMetronomePoint(world,camera);
  near(l.weight.x,screen.x*physicalSize.cols);near(l.weight.y,screen.y*physicalSize.rows);
  const hit=practiceMetronomeHit(l,l.weight.x,l.weight.y);assert.equal(hit?.kind,'weight');
  const recovered=practiceMetronomePointerOnPlane(l,l.weight.x,l.weight.y);near(recovered.x,local.x);near(recovered.y,local.y);
  assert.ok(l.close.x+l.close.w<=60,'only text uses the reserved hint territory');
  const matrix=practiceMetronomePlacement(renderProp),eye=transform(matrix,{x:0,y:.23,z:.7}),target=transform(matrix,{x:0,y:.23,z:0});
  const backCamera={...camera,eye,yaw:Math.atan2(target.x-eye.x,-(target.z-eye.z)),pitch:0};
  const back=practiceMetronomeLayout(physicalSize,{tempo:134.4,swing:.7},{renderProp,camera:backCamera});
  assert.equal(back.frontFacing,false);assert.equal(practiceMetronomeHit(back,back.weight.x,back.weight.y),null);
});

test('pointer users can catch the rod, restart it and leave, without blank clicks changing anything',()=>{
  const f=fixture(),s=f.scene,l=s.view().layout;
  click(s,{x:1,y:1});assert.equal(f.actions.length,0);
  s.pointer({type:'pointerdown',pointerId:4,button:0,cellX:l.tip.x,cellY:l.tip.y});
  assert.equal(f.state.stopped,true,'contact catches immediately before the rod can swing away');
  s.pointer({type:'pointerup',pointerId:4,button:0,cellX:1,cellY:1});
  assert.equal(f.state.stopped,true,'moving the finger away does not undo the catch');
  click(s,l.pivot);assert.equal(f.state.stopped,false);
  click(s,{x:l.close.x+l.close.w/2,y:l.close.y+l.close.h/2});assert.equal(f.closes,1);
  s.exit();assert.equal(f.closes,1);
});

test('the existing recorder transport may stop a rolling take, but this object never starts recording',()=>{
  const f=fixture(),s=f.scene;s.key({key:'r'});assert.equal(f.stops,0);
  f.recording=true;assert.match(s.view().prompts,/STOP RECORDING/);
  s.key({controllerAction:'recorder',key:'x',repeat:true});assert.equal(f.stops,0);
  s.key({controllerAction:'recorder',key:'x'});assert.equal(f.stops,1);
  assert.doesNotMatch(s.view().prompts,/STOP RECORDING/);s.key({key:'r'});assert.equal(f.stops,1);s.key({key:'Escape'});
});

test('the existing torch verb works during arrival and on a held weight without altering clock controls',()=>{
  const f=fixture({}, {reducedMotion:false}),s=f.scene;
  s.key({key:'f',code:'KeyF'});assert.equal(f.lights,1);assert.equal(s.getCloseupMix(),0);
  s.key({key:'f',code:'KeyF',repeat:true});assert.equal(f.lights,1);
  for(let i=0;i<5;i++)s.update(.1);s.key({key:'ArrowUp'});
  const tempo=f.state.tempo;s.key({controllerAction:'light',key:'unrelated'});
  assert.equal(f.lights,2);assert.equal(f.state.held,true);assert.equal(f.state.stopped,false);near(f.state.tempo,tempo);
  assert.match(s.view().prompts,/TORCH/);s.key({key:'Escape'});for(let i=0;i<4;i++)s.update(.1);
});

test('controller legends follow remapping and never reveal the puzzle solution',()=>{
  resetControllerSettings();setControllerSettings({family:'xbox',bindings:{confirm:{kind:'button',id:'north'},back:{kind:'button',id:'west'},recorder:{kind:'button',id:'rightTrigger'},light:{kind:'button',id:'leftTrigger'}}});
  setActiveInputDevice('controller',{viable:true,controllerFamily:'xbox'});
  const prompt=practiceMetronomePrompts({focus:'pendulum',recording:true});
  assert.match(prompt,/Y.*CATCH \/ RELEASE/);assert.match(prompt,/X.*STEP BACK/);assert.match(prompt,/RT.*STOP RECORDING/);
  assert.match(prompt,/LT.*TORCH/);
  assert.doesNotMatch(prompt,/stop all|solve|remaining|[0-6] \/ 6|[0-6]\/6/i);
  resetControllerSettings();setActiveInputDevice('keyboard');
});

test('the scene holds the actual transport; released edits visibly creep and explicit stops stay frozen',()=>{
  scenes.clear();let engine=stepMetronomes(freshMetronomeState(),.19).state;
  const scene=makePracticeMetronomeScene({getState:()=>metronomeVoiceState(engine,0),
    onWeightHold:held=>{engine=holdMetronomeWeight(engine,0,held);},
    onTempo:(bpm,options)=>{engine=setMetronomeTempo(engine,0,bpm,options);},
    onRunning:running=>{engine=setMetronomeRunning(engine,0,running);},
    getRenderProp:()=>renderProp,getCamera:()=>cameraFor(),getReducedMotion:()=>true});
  scenes.push(scene);scene.key({key:'ArrowDown'});const held=scene.view();
  let result=stepMetronomes(engine,2,.7);engine=result.state;
  assert.equal(result.ticks.some(t=>t.index===0),false);near(scene.view().swing,held.swing);near(scene.view().tempo,held.tempo);
  scene.keyup({key:'ArrowDown'});const before=scene.view().layout.pose.distance;
  engine=stepMetronomes(engine,10,.7).state;assert.ok(scene.view().tempo>held.tempo);assert.ok(scene.view().layout.pose.distance<before,'weight descends with audible creep');
  scene.key({key:'ArrowRight'});scene.key({key:'Enter'});const stopped=scene.view();
  engine=stepMetronomes(engine,20,1).state;assert.equal(scene.view().stopped,true);near(scene.view().swing,stopped.swing);near(scene.view().tempo,stopped.tempo);
  scene.key({key:'Escape'});
});

test('world articulation shares the close-up silhouette and honors the existing renderer transform',()=>{
  const props=practiceMetronomeGeometry();assert.equal(props.length,6);
  assert.ok(props.every(p=>p.p.length>0&&p.i.length%3===0&&p.emissive.every(v=>v===0)));
  const angle=.7,scale=1.4,base={id:'lesson',x:12,y:1.42,z:9,yaw:angle,scale,zone:3};
  for(const tempo of[40,134.4,300])for(const swing of[-1,0,.8]){
    const instances=practiceMetronomeInstances(base,{tempo,swing}),weight=instances.find(p=>p.mesh.endsWith('_weight')),m=weight.matrix;
    const p=practiceMetronomePose(tempo,swing).weight;
    near(m[12]+m[8]*C.frontZ,base.x+(Math.cos(angle)*p.x-Math.sin(angle)*p.z)*scale,2e-6);
    near(m[13]+m[9]*C.frontZ,base.y+p.y*scale,2e-6);
    near(m[14]+m[10]*C.frontZ,base.z+(Math.sin(angle)*p.x+Math.cos(angle)*p.z)*scale,2e-6);
    assert.ok(instances.every(i=>i.zone===3&&!i.interactive&&!i.blocks));
  }
});
