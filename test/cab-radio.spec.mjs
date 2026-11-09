import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {CAB_RADIO,CAB_RADIO_FREQUENCIES,CAB_RADIO_LEAN,CAB_RADIO_PACK,CAB_RADIO_ROAD_CLOCK,cabRadioKeyPoint,cabRadioLeanAngles,cabRadioLeanProject,cabRadioPoint,cabRadioPose,cabRadioVolumePoint} from '../src/data/cab-radio.js';
import {SEVEN_SEGMENTS,cabRadioRoadClock,cabRadioRoadView,cabRadioVfdFrame,createCabRadioFace,segmentsFor,sweptFrequency} from '../src/render/cab-radio-vfd.js';
import {openingVehicleInstances,setOpeningVehicleRadioPose} from '../src/data/opening-vehicle.js';
import {createDoorDriveTeaser} from '../src/game/source-drive/door-teaser.js';
import {makeGetInDriveTeaserScene} from '../src/game/get-in-drive-teaser-scene.js';
import {openingRoadSurfaceAt} from '../src/game/source-drive/opening-road.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {wheelHandInstances,wheelHandDiagnostics,resetWheelHands} from '../src/game/source-drive/geometry/wheel-hands-pose.js';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('the exported receiver control surfaces meet the current hand targets',async()=>{
  const doc=await new NodeIO().read(new URL(`../public/${CAB_RADIO_PACK}`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
  const meshes=new Map(doc.getRoot().listMeshes().map(mesh=>[mesh.getName(),mesh]));
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const ray=(origin,[a,b,c])=>{const d=[0,0,-1],e1=sub(b,a),e2=sub(c,a),p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-10)return Infinity;const t=sub(origin,a),u=dot(t,p)/det,q=cross(t,e1),v=dot(d,q)/det;return u<0||u>1||v<0||u+v>1?Infinity:dot(e2,q)/det;};
  const controls=[{mesh:'drive_radio_knob',point:cabRadioVolumePoint(),base:cabRadioVolumePoint(0)},...CAB_RADIO.keys.map((key,i)=>({mesh:`drive_radio_key_${key.id}`,point:cabRadioKeyPoint(i),base:cabRadioKeyPoint(i,0)}))];
  for(const control of controls){
    const mesh=meshes.get(control.mesh);assert.ok(mesh,control.mesh);
    const origin=sub(control.point,control.base);origin[2]+=.05;let distance=Infinity;
    for(const primitive of mesh.listPrimitives()){
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray();
      for(let i=0;i<indices.length;i+=3){const triangle=Array.from(indices.slice(i,i+3),index=>positions.getElement(index,[])),hit=ray(origin,triangle);if(hit>=0)distance=Math.min(distance,hit);}
      assert.equal(primitive.getMaterial().getAlphaMode(),'OPAQUE');
    }
    assert.ok(Math.abs(distance-.05)<.0007,`${control.mesh}: contact error ${distance-.05}`);
  }
});

test('the pack replaces the old radio by name, in both the drive and the parked cab, and adds what moves',async()=>{
  const file=new URL(`../public/${CAB_RADIO_PACK}`,import.meta.url);
  assert.ok(existsSync(file));
  const doc=await new NodeIO().read(file.pathname.replace(/^\/([A-Za-z]:)/,'$1')),names=new Set(doc.getRoot().listMeshes().map(mesh=>mesh.getName()));
  for(const base of['drive_radio','drive_radio_readout','drive_radio_knob',...CAB_RADIO.keys.map(key=>`drive_radio_key_${key.id}`)]){
    assert.ok(names.has(base),base);assert.ok(names.has(`opening_${base}`),`opening_${base}`);
  }
  const renderer=source('src/game/source-drive-renderer.js');
  assert.match(renderer,/key:'cabRadio'[^\n]*after:'drive'/,'it loads after the pack containing the mesh it replaces');
});

test('the print names no maker',()=>{
  const face=source('tools/chunk_surfer/source-drive-study/render-cab-radio-face.py'),builder=source('tools/chunk_surfer/source-drive-study/build-cab-radio.mjs');
  for(const text of[face.replace(/"""[\s\S]*?"""/,''),builder.replace(/credits\.json[\s\S]*?\}, null, 2\)/,'')])assert.doesNotMatch(text.replace(/^\s*(?:#|\/\/).*$/gm,''),/\b(?:ford|pioneer|grundig|blaupunkt|philips)\b/i);
});

test('the face fits the hole in the dash and nothing overlaps along the rows',()=>{
  const{face,surround,keys,keyRow,tune,tone,volume,noise,readout,door,seek}=CAB_RADIO;
  assert.ok(face.w<surround.w&&face.h<surround.h);
  const row=[{x:tune.x,w:tune.w},...keys.map(key=>({x:key.x,w:keyRow.w})),{x:tone.x,w:tone.r*2},{x:volume.x,w:volume.r*2},{x:noise.x,w:noise.w}];
  for(let i=1;i<row.length;i++)assert.ok(row[i-1].x+row[i-1].w/2<row[i].x-row[i].w/2,`bottom row ${i}`);
  const top=[{x:readout.x,w:readout.w},{x:door.x,w:door.w},...seek.map(s=>({x:s.x,w:s.w}))];
  for(let i=1;i<top.length;i++)assert.ok(top[i-1].x+top[i-1].w/2<top[i].x-top[i].w/2,`top row ${i}`);
  for(const item of[...row,...top])assert.ok(Math.abs(item.x)+item.w/2<=face.w/2,'inside the face');
});

test('the hands and targets press the keys they can see',()=>{
  const scene=source('src/game/source-drive/scene.js');
  assert.match(scene,/toWheel\(cabRadioKeyPoint\(/);assert.match(scene,/toWheel\(cabRadioVolumePoint\(\)\)/);assert.match(scene,/cabPoint\(cabRadioKeyPoint\(i\)\)/);
  assert.doesNotMatch(scene,/drive_radio_needle/);
  const key=cabRadioKeyPoint(1);assert.deepEqual(key,cabRadioPoint(CAB_RADIO.keys[1].x,CAB_RADIO.keyRow.y,CAB_RADIO.keyRow.proud));
  assert.ok(cabRadioVolumePoint()[2]>key[2],'the knob stands further out than the keys');
});

test('a key latches only while the set is on, and the knob goes to its stop at off',()=>{
  const on=cabRadioPose({on:true,preset:2,volume:.5}),off=cabRadioPose({on:false,preset:2,volume:.5});
  assert.deepEqual(on.keys.map(Boolean),[false,false,true,false]);assert.ok(off.keys.every(depth=>depth===0));
  assert.equal(off.volumeAngle,CAB_RADIO.volume.offAngle);
  assert.ok(cabRadioPose({on:true,volume:1}).volumeAngle<cabRadioPose({on:true,volume:0}).volumeAngle,'clockwise is louder');
});

test('the parked cab places the same set, with no needle, and shows what the owner last said',()=>{
  const anchor={x:0,y:0,z:0,yaw:0,zone:'dock'},meshes=()=>openingVehicleInstances(anchor);
  const names=meshes().map(row=>row.mesh);
  for(const name of['opening_drive_radio','opening_drive_radio_readout','opening_drive_radio_knob','opening_drive_radio_key_4'])assert.ok(names.includes(name),name);
  assert.ok(!names.includes('opening_drive_radio_needle'));
  const y=name=>meshes().find(row=>row.mesh===name).z;
  setOpeningVehicleRadioPose(cabRadioPose({on:false}));const out=y('opening_drive_radio_key_2');
  setOpeningVehicleRadioPose(cabRadioPose({on:true,preset:1,volume:.5}));assert.ok(y('opening_drive_radio_key_2')<out,'pressed in, away from the driver');
  setOpeningVehicleRadioPose(null);
});

test('the digits are real seven-segment shapes',()=>{
  assert.equal(segmentsFor('8'),'abcdefg');assert.equal(segmentsFor('1'),'bc');assert.equal(segmentsFor(' '),'');assert.equal(segmentsFor('?'),'');
  for(let i=0;i<10;i++)assert.match(SEVEN_SEGMENTS[i],/^[a-g]+$/);
});

test('the tube shows the preset, band and stereo when on, and only a clock when off',()=>{
  const on=cabRadioVfdFrame({on:true,preset:2,name:'MUSIC',clock:'21:22'});
  assert.equal(on.frequency,String(Math.round(CAB_RADIO_FREQUENCIES[2]*10)));assert.equal(on.band,'FM');assert.equal(on.stereo,true);assert.equal(on.preset,3);assert.equal(on.name,'MUSIC');assert.equal(on.clock,'21:22');
  const low=cabRadioVfdFrame({on:true,preset:0});assert.equal(low.frequency,` ${Math.round(CAB_RADIO_FREQUENCIES[0]*10)}`,'a leading blank, not a nought');
  const off=cabRadioVfdFrame({on:false,preset:2,clock:'21:22'});
  assert.equal(off.frequency,'');assert.equal(off.stereo,false);assert.equal(off.name,'');assert.equal(off.clock,'21:22');
  assert.equal(cabRadioVfdFrame({on:true,preset:0,receiving:false}).stereo,false);
});

test('with no time to show it blinks an empty colon, the way the blank night clock does',()=>{
  const a=cabRadioVfdFrame({on:false,clock:null,seconds:0}),b=cabRadioVfdFrame({on:false,clock:null,seconds:1});
  assert.equal(a.clock,'  :  ');assert.equal(b.clock,'  :  ');assert.notEqual(a.colon,b.colon);assert.notEqual(a.key,b.key);
  assert.equal(cabRadioVfdFrame({on:false,clock:'  :  ',seconds:0}).clock,'  :  ');
});

test('a dial turn runs the digits out and back, and they come home to the preset',()=>{
  const base=CAB_RADIO_FREQUENCIES[1],at=fraction=>sweptFrequency(base,{serial:3,fraction});
  assert.equal(at(0),base);assert.equal(at(1),base);assert.ok(Math.abs(at(.5)-base)>3);
  for(const fraction of[.1,.3,.5,.7,.9])assert.ok(at(fraction)>=87.5&&at(fraction)<=108,'on the band');
  const mid=cabRadioVfdFrame({on:true,preset:1,name:'COMPANY',tuning:{serial:3,fraction:.5}});
  assert.equal(mid.stereo,false);assert.equal(mid.preset,0);assert.equal(mid.name,'');assert.notEqual(mid.frequency,String(Math.round(base*10)));
});

test('a long name scrolls in its cells, and a volume change takes the row for a moment',()=>{
  const scroll=seconds=>cabRadioVfdFrame({on:true,preset:3,name:'A NAME MUCH LONGER THAN THE ROW IS',seconds}).name;
  assert.equal(scroll(0).length,15);assert.notEqual(scroll(0),scroll(1));
  assert.equal(cabRadioVfdFrame({on:true,preset:0,name:'MUSIC',volumeFlash:.5}).name,'VOL 15');
});

test('the clock on the way in only goes forward, and stops short of the time on the gate',()=>{
  const order=['road','figure','again','oncoming','stalled','bus','edge'],stamp=id=>CAB_RADIO_ROAD_CLOCK[id][0]*60+CAB_RADIO_ROAD_CLOCK[id][1];
  for(let i=1;i<order.length;i++)assert.ok(stamp(order[i])>stamp(order[i-1]),order[i]);
  assert.equal(cabRadioRoadClock({id:'road',time:0}),'20:52');assert.equal(cabRadioRoadClock({id:'road',time:125}),'20:54');
  assert.equal(cabRadioRoadClock({id:'edge',time:9000}),'21:37');
  assert.equal(cabRadioRoadClock(null),null,'after the first drive nobody has set it');assert.equal(cabRadioRoadClock({id:'nowhere',time:0}),null);
  const view=cabRadioRoadView({driveState:{radioOn:true,station:'company',volume:.65},vehiclePose:{stretch:{id:'bus',time:0},tuning:null}});
  assert.equal(view.preset,1);assert.equal(view.name,'COMPANY');assert.equal(view.clock,'21:29');
  assert.equal(cabRadioRoadView({driveState:{radioOn:false}}).on,false);
});

test('it only paints and uploads when what is showing has changed, and retries an upload that failed',()=>{
  const rect=()=>{},ctx=new Proxy({},{get:(_,name)=>name==='createLinearGradient'?()=>({addColorStop(){}}):rect,set:()=>true});
  const canvas={width:0,height:0,getContext:()=>ctx};let uploads=0,accept=false;
  const face=createCabRadioFace({mesh:'drive_radio_readout',upload:()=>{uploads++;return accept;},createCanvas:()=>canvas});
  const view={on:true,preset:0,name:'SERVICE',clock:'20:52',volume:.65};
  assert.equal(face.sync(view,0),false);assert.equal(uploads,1,'the mesh was not ready');
  accept=true;assert.equal(face.sync(view,.1),true);assert.equal(uploads,2);
  assert.equal(face.sync(view,.2),false);assert.equal(uploads,2,'nothing changed');
  assert.equal(face.sync({...view,clock:'20:53'},.3),true);assert.equal(uploads,3);
  face.sync({...view,clock:'20:53',volume:.4},.4);assert.equal(uploads,4,'the volume takes the row');
  face.sync({...view,clock:'20:53',volume:.4},3);assert.equal(uploads,5,'and gives it back');
});

test('the lean looks at the face, and the panel is gone',()=>{
  const middle=cabRadioLeanProject(0,0,0);assert.ok(Math.abs(middle.x-.5)<.02&&Math.abs(middle.y-.5)<.02);
  const left=cabRadioLeanProject(-CAB_RADIO.face.w/2,0),right=cabRadioLeanProject(CAB_RADIO.face.w/2,0);
  assert.ok(left.x>.02&&right.x<.98,'the whole set fits');assert.ok(right.x-left.x>.4,'and you are close enough to read it');
  const inspection=source('src/game/opening-cab-inspection.js'),branch=inspection.slice(inspection.indexOf("if(m.kind==='radio'){\n        // There's no panel"),inspection.indexOf("uiScrim(m.kind==='status'"));
  assert.ok(branch.length>0);assert.doesNotMatch(branch,/uiScrim|drawLampButton|drawVfdText/);
  assert.doesNotMatch(inspection,/A \/ D TUNE/);
});

test('it never reaches the 6:00 scene, and rides with the van where the van tumbles',()=>{
  assert.doesNotMatch(source('src/data/cab-radio.js'),/6:00|06:00/);
  const teaser=source('src/game/source-drive/teaser-scene.js');
  assert.match(teaser,/radio\(\?:_\\w\+\)\?/,'every part of it attaches to the van');
  assert.match(source('src/render/ending-drive-off-renderer.js'),/\^drive_\(\?:cabin\|radio/);
});

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
const advance=(c,seconds,input={})=>{for(let t=0;t<seconds-1e-9;){const h=Math.min(1/60,seconds-t);c.update(h,{input});t+=h;}};
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} is not ${b}`);

test('the real drive frame gives the tube its stretch and its dial turn, where the renderer reads them',()=>{
  const c=createDoorDriveTeaser();c.start();advance(c,.81);
  const frame=c.frame(metrics).renderFrame,view=cabRadioRoadView(frame,0);
  assert.equal(frame.vehiclePose,undefined,'the render frame carries the pose under cinematic, not at the top');
  assert.ok(frame.cinematic.vehiclePose.stretch?.id,'a first drive knows its stretch');
  assert.match(view.clock,/^\d\d:\d\d$/,'so the clock runs, rather than blinking as if nobody had set it');
  assert.equal(view.clock,cabRadioRoadClock(frame.cinematic.vehiclePose.stretch));
});

test('leaning toward the set moves the head while the van keeps going',()=>{
  const c=createDoorDriveTeaser();c.start();advance(c,.81);
  const seat=c.frame(metrics).renderFrame,start=c.snapshot().driveState.z;
  assert.equal(c.snapshot().vehiclePose.radioLean,0);
  assert.equal(c.setRadioLean(true),true);advance(c,CAB_RADIO_LEAN.seconds*.4);
  const part=c.snapshot().vehiclePose.radioLean;assert.ok(part>0&&part<1,'it takes a moment to get there');
  advance(c,CAB_RADIO_LEAN.seconds);
  const leaning=c.frame(metrics).renderFrame,scene=leaning.scene,want=scene.cabPoint(CAB_RADIO_LEAN.eye),to=cabRadioLeanAngles();
  assert.equal(c.snapshot().vehiclePose.radioLean,1);
  for(let i=0;i<3;i++)near(scene.eye[i],want[i],1e-5);
  assert.ok(Math.hypot(...scene.eye.map((v,i)=>v-seat.scene.eye[i]))>.3,'the head has really moved');
  near(c.snapshot().vehiclePose.lookYawOffset,to.yaw);near(c.snapshot().vehiclePose.lookPitchOffset,to.pitch);
  assert.ok(Math.abs(c.snapshot().driveState.z-start)>.5,'the road is still going by');
  const heading=c.snapshot().driveState.heading;advance(c,.6,{right:true});assert.notEqual(c.snapshot().driveState.heading,heading,'and you can still steer');
});

test('letting go puts the head back where it was looking, and it can not be looked around while it is down',()=>{
  const c=createDoorDriveTeaser();c.start();advance(c,.81);
  assert.equal(c.setLook({yaw:.4,pitch:-.1}),true);
  c.setRadioLean(true,{immediate:true});
  assert.equal(c.setLook({yaw:-.4,pitch:.2}),false);assert.equal(c.lookDelta(50,50),false);
  c.setRadioLean(false);advance(c,CAB_RADIO_LEAN.seconds+.05);
  const pose=c.snapshot().vehiclePose;assert.equal(pose.radioLean,0);near(pose.lookYawOffset,.4);near(pose.lookPitchOffset,-.1);
  assert.equal(c.setLook({yaw:0,pitch:0}),true);
});

test('there is no lean before the player has the van, and it lets go when control goes',()=>{
  const c=createDoorDriveTeaser();
  assert.equal(c.setRadioLean(true),false);c.start();
  assert.equal(c.snapshot().controlsEnabled,false);assert.equal(c.setRadioLean(true),false);
  advance(c,.81);assert.equal(c.setRadioLean(true,{immediate:true}),true);
  assert.equal(c.setRadioLean(false,{immediate:true}),true);assert.equal(c.snapshot().vehiclePose.radioLean,0);
});

test('Q and LB keep the head down, repeats do nothing, and a menu releases it',()=>{
  const calls=[];
  const scene=makeGetInDriveTeaserScene({createRenderer:()=>({}),createIntrusion:()=>({snapshot:()=>({}),cancel(){}}),getPresentation:()=>({reducedMotion:false}),
    createController:()=>({setPaused(){},dispose(){},setRadioLean:(on,options)=>calls.push([on,!!options?.immediate])})});
  scene.key({key:'q'});assert.deepEqual(calls,[],'not while the picture is paused');
  scene.setPaused(false);scene.key({key:'q'});scene.key({key:'q',repeat:true});assert.deepEqual(calls,[[true,false]]);
  scene.keyup({key:'q'});assert.deepEqual(calls.at(-1),[false,false]);
  scene.key({key:'q',controllerAction:'tabPrev'});assert.deepEqual(calls.at(-1),[true,false]);
  scene.setPaused(true);assert.equal(calls.at(-1)[0],false,'pausing releases the lean');
  const still=[];
  const reduced=makeGetInDriveTeaserScene({createRenderer:()=>({}),createIntrusion:()=>({snapshot:()=>({}),cancel(){}}),getPresentation:()=>({reducedMotion:true}),
    createController:()=>({setPaused(){},dispose(){},setRadioLean:(on,options)=>still.push([on,!!options?.immediate])})});
  reduced.setPaused(false);reduced.key({key:'q'});assert.deepEqual(still,[[true,true]],'reduced motion goes straight there');
});

test('a dial cut does not lift the head, and you can come down during one',()=>{
  const c=createDoorDriveTeaser();c.start();advance(c,.81);c.setRadioLean(true,{immediate:true});
  const steer=()=>{const d=c.snapshot().driveState,r=openingRoadSurfaceAt(d.x,d.z),err=r.offset+1.35,head=Math.atan2(Math.sin(d.heading-r.heading),Math.cos(d.heading-r.heading)),score=err*.35+head*2.2;return{forward:true,left:score>.04,right:score<-.04};};
  let during=null;for(let t=0;t<90&&!during;t+=1/60){c.update(1/60,{input:steer()});if(c.snapshot().vehiclePose?.tuning)during=c.snapshot().vehiclePose;}
  assert.ok(during,'the first stretch ends in a dial cut');assert.equal(during.radioLean,1,'still down while the dial turns');
  c.setRadioLean(false,{immediate:true});assert.equal(c.setRadioLean(true,{immediate:true}),true,'and a press during the cut counts');
  for(let t=0;t<8&&c.snapshot().vehiclePose?.tuning;t+=1/60)c.update(1/60);
  assert.equal(c.snapshot().vehiclePose.tuning,null);assert.equal(c.snapshot().vehiclePose.radioLean,1,'and still down when the picture comes back');
});

test('nothing in the cab stands in front of the set',async()=>{
  const doc=await new NodeIO().read(new URL('../public/assets/source-drive/drive.glb',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
  let right=-Infinity;const mesh=doc.getRoot().listMeshes().find(row=>row.getName()==='drive_recorder_cradle');
  for(const primitive of mesh.listPrimitives()){const position=primitive.getAttribute('POSITION'),at=[];for(let i=0;i<position.getCount();i++){position.getElement(i,at);right=Math.max(right,at[0]);}}
  const edge=metrics.recorder.center[0]+right,left=CAB_RADIO.center[0]-CAB_RADIO.surround.w/2;
  assert.ok(edge<=left,`the recorder's cradle reaches ${edge.toFixed(3)}, the set starts at ${left.toFixed(3)}`);
});

test('the tube shows its detail only once the head is down',()=>{
  const renderer=source('src/game/source-drive-renderer.js');
  assert.match(renderer,/radioClose=\(frame\.cinematic\?\.vehiclePose\?\.radioLean\|\|0\)>\.01/);assert.match(renderer,/close:\(\)=>radioClose/);
  const main=source('src/main.js');assert.match(main,/`\$\{[^`]*'LB':'Q'\} · THE RADIO/);assert.match(main,/1 2 3 STATION   O POWER/);
});


test('the moved recorder stays reachable with fixed arm lengths and the right hand on the wheel',()=>{
  for(const kind of ['record','play','stop']){
    resetWheelHands();const state=createDrive();let contact=null,maxAdvance=0;
    for(let step=0;step<=78;step++){
      const elapsed=step/100;state.programTime=10+elapsed;
      makeDriveScene(state,metrics,{cabOnly:true,handControl:elapsed<.72?{kind,elapsed}:null});
      const diagnostic=wheelHandDiagnostics(),reach=diagnostic.reach;
      assert.ok(!reach?.rejected,`${kind}: ${reach?.reason}`);
      for(const side of ['left','right']){const arm=diagnostic.hands[side];assert.equal(arm.unreachable,false,`${kind} ${side} at ${elapsed}`);near(arm.upperLength,.34,1e-8);near(arm.forearmLength,.32,1e-8);}
      assert.equal(diagnostic.hands.right.controlReach,false);assert.equal(diagnostic.hands.right.open,0);
      assert.deepEqual(diagnostic.hands.right.shoulder,[.16,.03,.69]);
      if(reach?.atContact){contact=reach;assert.ok(reach.contactErrorM<1e-8);}
      if(reach?.shoulderAdvance)maxAdvance=Math.max(maxAdvance,Math.hypot(...reach.shoulderAdvance));
      if(elapsed>.72)assert.deepEqual(diagnostic.hands.left.shoulder,[-.16,.03,.69]);
    }
    assert.ok(contact,`${kind} reaches the actual key`);assert.ok(maxAdvance<=.06);
  }
  resetWheelHands();wheelHandInstances([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],0,{timeSec:0,reach:{kind:'record',elapsed:0,target:[-3,0,0]}});
  assert.equal(wheelHandDiagnostics().reach.rejected,true);resetWheelHands();
});
