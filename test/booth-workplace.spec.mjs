import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {boothGuardRenderInstance} from '../src/game/booth-presentation.js';
import {boothGuardHeldInstances,guardPointToBooth,boothGuardPose} from '../src/render/booth-guard-performance.js';
import {createBoothTelevision,BOOTH_TV} from '../src/render/booth-tv.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP,CONSERVATORY_PROPS.filter(p=>p.id.startsWith('yard-booth')));
const instances=PROPS.renderInstances({inscriptions:false}),at=id=>instances.find(p=>p.id===id);
const world=(p,q)=>[p.x+q[0]*Math.cos(p.yaw)-q[2]*Math.sin(p.yaw),p.y+q[1],p.z+q[0]*Math.sin(p.yaw)+q[2]*Math.cos(p.yaw)];
const doc=await new NodeIO().read(new URL('../public/assets/booth-guard-props.glb',import.meta.url).pathname);

test('real floorplan poses put shell, repaired opening and anatomical guard west',()=>{
  const shell=at('yard-booth'),window=at('yard-booth-glazing'),body=boothGuardRenderInstance(at('yard-booth-guard-idle'));
  assert.ok(world(shell,[0,0,-1])[0]<shell.x-.99,'original shell public face');
  assert.ok(world(window,[0,0,1])[0]<window.x-.99,'repaired workplace public face');
  assert.ok(world(body,[0,0,-1])[0]<body.x-.99,'actual retained character facial forward');
  assert.equal(CONSERVATORY_PROPS.find(p=>p.id==='yard-booth').inspectAt.x,72.3);
  for(const pose of['ledger','handoff']){
    const options={pose,previousPose:pose,poseElapsedSec:1.2,timeSec:2},body=boothGuardRenderInstance(at('yard-booth-guard-'+pose),options),hand=boothGuardPose(options).contacts.find(c=>c.side==='R');
    const actual=world(body,hand.point),expected=world(window,guardPointToBooth(hand.point));
    assert.ok(Math.hypot(...actual.map((v,k)=>v-expected[k]))<1e-6,'real hand and page share physical space');
    assert.ok(boothGuardHeldInstances(body,options).every(p=>p.x<24));
  }
});

test('programme sits above counter, has a curved 4:3 face and direct texture UVs',()=>{
  const m=doc.getRoot().listMeshes().find(m=>m.getName()===BOOTH_TV.mesh),p=m.listPrimitives()[0],a=p.getAttribute('POSITION').getArray(),uv=p.getAttribute('TEXCOORD_0').getArray();
  const axes=[0,1,2].map(k=>Array.from(a).filter((_,i)=>i%3===k)),bounds=axes.map(a=>[Math.min(...a),Math.max(...a)]);
  assert.ok(bounds[1][0]>1.8,'visible over the 1.55m opaque counter');
  assert.ok(Math.abs((bounds[0][1]-bounds[0][0])/(bounds[1][1]-bounds[1][0])-4/3)<1e-5);
  assert.ok(bounds[2][1]-bounds[2][0]>.004);
  assert.ok(Array.from(uv).every(v=>v>=-1e-5&&v<=1.00001));
  const dressing=doc.getRoot().listMeshes().find(m=>m.getName()==='yard_booth_workplace');
  assert.ok(dressing.listPrimitives().length>=6);
  const credits=JSON.parse(fs.readFileSync(new URL('../public/video/booth-night-road.credits.json',import.meta.url)));
  assert.equal(credits.output.audio,false);assert.ok(credits.bytes<1_500_000);assert.match(credits.rights,/Project-owned/);
});

function fixture(){let plays=0,pauses=0,uploads=0,visible=true;const video={paused:true,currentTime:0,readyState:2,videoWidth:320,videoHeight:240,setAttribute(){},removeAttribute(){},load(){},addEventListener(){},play(){this.paused=false;plays++;return Promise.resolve();},pause(){this.paused=true;pauses++;}};return{video,tv:createBoothTelevision({createVideo:()=>video,upload:()=>{uploads++;return true;},visible:()=>visible,url:'local:test.mp4'}),counts:()=>({plays,pauses,uploads}),hide:()=>{visible=false;}};}

test('TV decodes locally only near lodge and uploads changed frames at bounded cadence',async()=>{
  const f=fixture();assert.equal(f.tv.update({eye:[100,2,100],now:0}),false);assert.equal(f.counts().plays,0);
  f.tv.update({eye:[24,2,14],now:0});await Promise.resolve();assert.equal(f.counts().plays,1);assert.equal(f.video.muted,true);
  for(let n=1;n<=100;n++){f.video.currentTime=n/100;f.tv.update({eye:[24,2,14],now:n/100});}
  assert.ok(f.counts().uploads<=16);assert.ok(f.counts().uploads>=13);
  f.tv.update({eye:[24,2,14],now:2});const count=f.counts().uploads;f.tv.update({eye:[24,2,14],now:2.2});assert.equal(f.counts().uploads,count,'same decoded frame is not uploaded again');
  f.hide();f.tv.update({eye:[24,2,14],now:3});assert.equal(f.video.paused,true);
  f.tv.dispose();assert.equal(f.tv.snapshot().disposed,true);
});
