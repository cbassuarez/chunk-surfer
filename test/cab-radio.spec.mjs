import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {CAB_RADIO,CAB_RADIO_FREQUENCIES,CAB_RADIO_PACK,CAB_RADIO_ROAD_CLOCK,cabRadioKeyPoint,cabRadioLeanProject,cabRadioPoint,cabRadioPose,cabRadioVolumePoint} from '../src/data/cab-radio.js';
import {SEVEN_SEGMENTS,cabRadioRoadClock,cabRadioRoadView,cabRadioVfdFrame,createCabRadioFace,segmentsFor,sweptFrequency} from '../src/render/cab-radio-vfd.js';
import {openingVehicleInstances,setOpeningVehicleRadioPose} from '../src/data/opening-vehicle.js';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('the pack replaces the old radio by name, in both the drive and the parked cab, and adds what moves',async()=>{
  const file=new URL(`../public/${CAB_RADIO_PACK}`,import.meta.url);
  assert.ok(existsSync(file));
  const doc=await new NodeIO().read(file.pathname.replace(/^\/([A-Za-z]:)/,'$1')),names=new Set(doc.getRoot().listMeshes().map(mesh=>mesh.getName()));
  for(const base of['drive_radio','drive_radio_readout','drive_radio_knob',...CAB_RADIO.keys.map(key=>`drive_radio_key_${key.id}`)]){
    assert.ok(names.has(base),base);assert.ok(names.has(`opening_${base}`),`opening_${base}`);
  }
  const renderer=source('src/game/source-drive-renderer.js');
  assert.match(renderer,/key:'cabRadio'[^\n]*after:'drive'/,'it lands after the pack holding the mesh it replaces');
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
