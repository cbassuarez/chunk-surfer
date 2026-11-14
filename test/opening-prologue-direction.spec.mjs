import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrologueDrive} from '../src/game/source-drive/prologue-drive.js';
import {createOpeningPrologueDirection,openingMemoryInstances} from '../src/game/opening-prologue-direction.js';
import {ELLERY_PUBLIC_FRONT_PROPS,ELLERY_PUBLIC_FRONT} from '../src/data/ellery-public-front.js';
import {localLightConeDescriptor,localLightConeWeight} from '../src/render/local-light-cone.js';
import {cameraBasis} from '../src/render/camera-basis.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const close=(a,b,e=2e-4)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const close3=(a,b,e)=>a.forEach((v,i)=>close(v,b[i],e));
const advance=(d,s)=>{for(let t=0;t<s-1e-8;t+=1/60)d.update(Math.min(1/60,s-t));};
function curvedDrive(){const d=createPrologueDrive();d.start();advance(d,12);return d;}

test('normalization preserves cabin glass and material-light coordinates through an actual driven bend',()=>{
 const d=curvedDrive(),raw=d.frame(metrics),direction=createOpeningPrologueDirection(),f=direction.compose(raw,{semanticPhase:'road',snap:true}),m=f.journey.normalization;
 assert.ok(Math.abs(raw.driveState.heading)>.1,'use a real bend, not an identity transform');
 close3(f.scene.eye,point(m,raw.scene.eye));
 for(const local of[[0,0,0],[.48,1.2,-1.99],[-.4,1.65,-2.2]]){
  const world=point(raw.scene.body,local),normalized=point(m,world);close3(point(f.scene.body,local),normalized);
  close3(point(f.weather.worldToCabin,normalized),point(raw.weather.worldToCabin,world));
  close3(point(f.scene.cabLight.worldToCab,normalized),point(raw.scene.cabLight.worldToCab,world));
 }
 const hand=raw.scene.props.find(p=>p.id==='drive_right_hand'),q=f.scene.props.find(p=>p.id===hand.id);assert.deepEqual(q.character,hand.character);close3(point(q.matrix,[.05,.03,.02]),point(m,point(hand.matrix,[.05,.03,.02])));
 d.dispose();
});

test('headlamp positions and shadow headings use the same normalized frame',()=>{
 const d=curvedDrive(),raw=d.frame(metrics),f=createOpeningPrologueDirection().compose(raw,{semanticPhase:'road',snap:true});
 for(const id of['drive-headlamp-0','drive-headlamp-1']){const a=raw.scene.lamps.find(l=>l.id===id),b=f.scene.lamps.find(l=>l.id===id);close3([b.x,b.y,b.z],point(f.journey.normalization,[a.x,a.y,a.z]));close(b.shadowYaw,a.shadowYaw-raw.driveState.heading,1e-6);
  if(f.physicalHeadlampCones){const cone=localLightConeDescriptor(b);assert.ok(Math.hypot(...cone.direction)>.99,'disabling the UK beam requires a real replacement emitter cone');assert.ok(localLightConeWeight(b,cone.direction)>.99);close(localLightConeWeight(b,cone.direction.map(v=>-v)),0,1e-9);}
 }
 d.dispose();
});

test('the memory preserves the canonical public front and hero registration as one construction',()=>{
 const memory=openingMemoryInstances(),front=memory.find(p=>p.id==='opening-memory:ellery-actual-public-front'),hero=memory.find(p=>p.id==='opening-memory:bay-west-elevation'),canonical=ELLERY_PUBLIC_FRONT_PROPS.find(p=>p.id==='ellery-actual-public-front');
 assert.equal(front.mesh,canonical.mesh);assert.equal(hero.mesh,ELLERY_PUBLIC_FRONT.hero.mesh);close(front.x-hero.x,-(canonical.x-ELLERY_PUBLIC_FRONT.hero.anchor.x));close(front.z-hero.z,-(canonical.y+(canonical.renderOffsetZ||0)-ELLERY_PUBLIC_FRONT.hero.anchor.z));
 assert.ok(memory.every(p=>p.matrix.length===16&&p.matrix.every(Number.isFinite)));assert.equal(new Set(memory.map(p=>p.id)).size,memory.length);
});

test('ordinary camera transitions remain continuous while the physical journey keeps moving',()=>{
 for(const reducedMotion of[false,true]){
  const d=createPrologueDrive();d.start();const direction=createOpeningPrologueDirection({reducedMotion});let last=null,maxStep=0,lastVeil=0;
  for(const spec of[{semanticPhase:'road',stageId:'dark',seconds:1},{semanticPhase:'recognition',stageId:'woken',seconds:3.5},{semanticPhase:'recognition',stageId:'interval',seconds:10},{semanticPhase:'ellery',stageId:'ellery',seconds:9},{semanticPhase:'personal',stageId:'fate3',seconds:10},{semanticPhase:'return',stageId:'gone',seconds:10}]){
   for(let i=0;i<Math.ceil(spec.seconds*30);i++){d.update(1/30);const f=direction.compose(d.frame(metrics),{...spec,dt:1/30,stage:{radius:1.3}});assert.equal(f.journey.renderOwner,'opening-drive');assert.equal(f.scene.driveLand,null);if(last){const step=Math.hypot(...f.scene.eye.map((v,k)=>v-last[k]));maxStep=Math.max(maxStep,step);if(reducedMotion&&step>=2)assert.ok(Math.max(lastVeil,f.journey.opticalVeil)>.99,'the matched reduced-motion cut is fully occluded');else assert.ok(step<2,'no visible camera teleport');}last=[...f.scene.eye];lastVeil=f.journey.opticalVeil;assert.ok(Number.isFinite(f.look.yaw)&&Number.isFinite(f.look.pitch));}
   assert.equal(direction.view().established,true,spec.stageId);
  }
  assert.ok(d.snapshot().driveState.odometer>650);assert.ok(maxStep>.01);d.dispose();
 }
});

test('a precise level look remains level rather than being treated as a missing value',()=>{
 const d=createPrologueDrive();d.start();const raw=d.frame(metrics);raw.look={yaw:raw.driveState.heading,pitch:0};const f=createOpeningPrologueDirection().compose(raw,{semanticPhase:'road',snap:true});close(f.look.pitch,0,1e-7);d.dispose();
});

test('the full-width Cinematic frame aims at its real subject without the removed right-column yaw bias',()=>{
 const d=createPrologueDrive();d.start();d.lookBy(.12,0);const raw=d.frame(metrics),direction=createOpeningPrologueDirection();
 try{
  for(const spec of[{semanticPhase:'road',stageId:'dark'},{semanticPhase:'recognition',stageId:'interval'},{semanticPhase:'recognition',stageId:'grip'},
   {semanticPhase:'ellery',stageId:'ellery'},{semanticPhase:'personal',stageId:'fate3'}]){
   const f=direction.compose(raw,{...spec,snap:true}),j=f.journey,delta=j.target.map((n,k)=>n-j.eye[k]);
   close(j.yaw-Math.atan2(delta[0],-delta[2]),.12,1e-6,'head look remains responsive without a column offset');
   if(spec.stageId==='grip'){
    const wheel=f.scene.props.find(p=>p.mesh==='drive_wheel');close3(j.target,[wheel.x,wheel.y+.05,wheel.z]);
   }
  }
 }finally{d.dispose();}
});

test('the unchanged apparition is framed above the five-reply exchange, with the school and hand shots retained',()=>{
 const d=createPrologueDrive();d.start();
 try{
  const f=createOpeningPrologueDirection().compose(d.frame(metrics),{semanticPhase:'recognition',stageId:'interval',snap:true}),j=f.journey;
  const basis=cameraBasis(j.yaw,j.pitch),delta=j.hole.map((n,k)=>n-j.eye[k]),dot=v=>v.reduce((sum,n,k)=>sum+n*delta[k],0),depth=dot(basis.forward);
  // The physical driving renderer's actual .65 tan-half-FOV. This measures
  // the optical centre, not a claim that every refracted ring pixel fits.
  const imageY=.5-dot(basis.up)/(2*.65*depth);
  assert.ok(imageY>.15&&imageY<.30,`the eye/void centre is in the upper picture: ${imageY}`);
  close(j.radius,1.15);close3(j.hole,[0,44,-115]);
  assert.equal(f.journey.memoryInstanceCount,openingMemoryInstances().length);
 }finally{d.dispose();}
});

test('the actual physical-drive branch acquires the horizon before the shared dither rather than bypassing it',()=>{
 const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),driveRenderer=readFileSync(new URL('../src/game/source-drive-renderer.js',import.meta.url),'utf8');
 assert.match(driveRenderer,/r3dFrame\(\{[\s\S]*?sourceVoidPhysical:true/,'the opening really enters the physical acquisition branch');
 const dispatch=renderer.slice(renderer.indexOf('if(sourceVoidPhysicalActive){'));assert.match(dispatch,/^if\(sourceVoidPhysicalActive\)\{\s*drawSourceVoidPhysical\([\s\S]*?return;/);
 const start=renderer.indexOf('function drawSourceVoidPhysical('),end=renderer.indexOf('\nfunction drawTextSpace(',start),physical=renderer.slice(start,end);assert.ok(start>=0&&end>start);
 const acquisition=physical.lastIndexOf('gl.drawArrays('),horizon=physical.indexOf('runSourceRestHorizonPass('),recording=physical.indexOf('runPixelMeshPass(');
 assert.ok(acquisition>=0&&horizon>acquisition,'the emitting horizon must be composited into acquired colour/depth, not only the building/text path');
 assert.ok(recording>horizon,'the lens and eyes must enter the same final dither as the cab and world');
 assert.equal((physical.match(/runSourceRestHorizonPass\(/g)||[]).length,1,'one acquisition receives one optical pass');
});
