import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRecordingEmbodiment,RECORDING_EMBODIMENT} from '../src/game/recording-embodiment.js';
import {recordingEmbodimentInstances,recordingEmbodimentCameraBasis,installRecordingEmbodimentMaterials,
  prewarmRecordingEmbodimentMeshes,RECORDING_EMBODIMENT_MESHES,RECORDING_EMBODIMENT_CONTACTS,
  recordingEmbodimentViewPull} from '../src/render/recording-embodiment.js';
import * as HUNTER from '../src/game/take-hunter.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {liveTakePanelRect,recorderControlRegions,recordingOverlayButtons} from '../src/render/recorder-view.js';
import {uiCellMetrics,uiSetScale} from '../src/render/ui.js';

const take=(extra={})=>({takeId:'real-take-1',recording:true,takeProgress:.9,...extra});
const settled=(extra={})=>{const d=createRecordingEmbodiment();for(let n=0;n<100;n++)d.update(1/60,take(extra));return d.snapshot();};
const camera=(extra={})=>({eye:[12,-2.38,24],yaw:.7,pitch:-.2,tanHalfFov:.95,width:1280,height:720,...extra});
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[12+k]);
const bytes=readFileSync(new URL('../public/'+RECORDING_EMBODIMENT.asset,import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
function vertices(entry,descriptor){
 const pose=sampleCharacterPose(asset,entry,descriptor),points=[];
 for(const p of entry.primitives)for(let at=0;at<p.positions.length;at+=3){
  const point=Array.from(p.positions.slice(at,at+3));
  for(let m=0;m<p.targets.length;m++)for(let k=0;k<3;k++)point[k]+=p.targets[m].positions[at+k]*pose.morphs[m];
  const out=[0,0,0],index=at/3*4;
  for(let n=0;n<4;n++){const matrix=pose.bones.slice(p.joints[index+n]*16,p.joints[index+n]*16+16),v=transform(matrix,point);for(let k=0;k<3;k++)out[k]+=v[k]*p.weights[index+n];}
  points.push(out);
 }return points;
}
function projected(frame,view){
 const basis=recordingEmbodimentCameraBasis(view),parts=recordingEmbodimentInstances(frame,view),aspect=view.width/view.height;
 return parts.map((part,k)=>vertices(asset.entries[k],part.character).map((p,index)=>{
  const world=transform(part.matrix,p),d=world.map((n,k)=>n-basis.eye[k]),depth=dot(d,basis.forward);
  return{x:(1+dot(d,basis.right)/(depth*view.tanHalfFov*aspect))/2,
    y:(1-dot(d,basis.up)/(depth*view.tanHalfFov))/2,depth,
    wrist:asset.entries[k].primitives[0].positions[index*3+2]>.025};
 }));
}

test('the same pair seats asymmetrically and strains before the usable-take point without new hunter or audio authority',()=>{
 const d=createRecordingEmbodiment(),seen=[];
 for(let n=0;n<=600;n++){const frame=d.update(1/60,take({takeProgress:n/600}));if(n%60===0)seen.push(frame);}
 const visible=seen.filter(f=>f.active);
 for(let n=1;n<visible.length;n++)assert.ok(visible[n].proximity>=visible[n-1].proximity);
 assert.ok(new Set(visible.map(f=>f.phase)).has('seat'));assert.ok(new Set(visible.map(f=>f.phase)).has('strain'));
 assert.equal(visible.at(-1).phase,'draw-back');
 const depths=visible.map(f=>recordingEmbodimentInstances(f,camera())[0].diagnostics.depth);
 assert.ok(depths[0]<0&&depths.at(-1)>.05&&depths.at(-1)<.25,
  'the hands originate behind the eye and curl around to the temples');
 const seated=settled({takeProgress:.40}),strained=settled({takeProgress:.66}),full=settled({takeProgress:.72});
 assert.ok(seated.hands[0].seat>seated.hands[1].seat,'one hand finds contact before the other');
 assert.ok(strained.hands[0].traction>.8&&strained.hands[1].traction>.5);
 assert.ok(full.hands.every(h=>h.traction===1));assert.ok(full.progress<.75);
 assert.equal(RECORDING_EMBODIMENT.additionalAudio,0);assert.equal(RECORDING_EMBODIMENT.damage,0);
 assert.equal(RECORDING_EMBODIMENT.changesStopPermission,false);
});

test('a stopped take releases the same hands outwards promptly; a new take never inherits the old grip',()=>{
 const d=createRecordingEmbodiment();for(let n=0;n<100;n++)d.update(1/60,take());
 const original=d.snapshot(),before=recordingEmbodimentInstances(original,camera())[0];
 const release=d.update(.08,{recording:false}),after=recordingEmbodimentInstances(release,camera())[0];
 assert.equal(release.phase,'release');assert.equal(release.takeId,original.takeId);
 assert.ok(after.diagnostics.depth<before.diagnostics.depth&&Math.abs(after.diagnostics.lateral)>Math.abs(before.diagnostics.lateral),
  'release withdraws toward the rear outside the peripheral view');
 for(let n=0;n<6;n++)d.update(.08,{recording:false});assert.equal(d.snapshot().active,false);
 const fresh=d.update(1/60,take({takeId:'take-2',takeProgress:0}));
 assert.equal(fresh.proximity,0);assert.equal(fresh.grip,0);assert.equal(fresh.takeId,'take-2');
});

test('actual seized STOP attempts brace the same contact; only real transport closure releases it',()=>{
 const d=createRecordingEmbodiment();let frame;
 for(let n=0;n<100;n++)frame=d.update(1/60,take({takeProgress:.66}));
 let hunter={...HUNTER.armTakeHunter(HUNTER.freshTakeHunter(),{roll:0}),cells:6,
   warningSeconds:HUNTER.TAKE_HUNTER.dragWarningSeconds,contactWindowElapsed:0};
 const beforeIds=recordingEmbodimentInstances(frame,camera()).map(p=>p.id),
   emit=()=>d.update(.02,take({takeProgress:.66,transport:HUNTER.takeHunterTransport(hunter)}));
 frame=emit();assert.equal(frame.phase,'braced');assert.equal(frame.release,0);
 const first=HUNTER.tryCancelTake(hunter);assert.equal(first.resisted,true);hunter=first.state;
 frame=emit();assert.ok(frame.hands.every(h=>h.recoil===1&&h.resistance===1));
 assert.equal(frame.transport.tries,1);assert.equal(frame.phase,'braced');assert.equal(frame.release,0);
 assert.deepEqual(recordingEmbodimentInstances(frame,camera()).map(p=>p.id),beforeIds);
 const counter=recordingEmbodimentInstances(frame,camera());
 for(let n=0;n<20;n++)frame=emit();assert.ok(frame.hands.every(h=>h.recoil===0));
 assert.notDeepEqual(Array.from(counter[0].matrix),Array.from(recordingEmbodimentInstances(frame,camera())[0].matrix));
 const next=HUNTER.tryCancelTake(hunter);hunter=next.state;frame=emit();assert.equal(frame.hands[0].recoil,1);
 const held=d.update(30,take({takeProgress:.90,transport:HUNTER.takeHunterTransport(hunter),suspended:true}));
 assert.deepEqual(held,frame,'pause holds a registered refusal rather than silently using its recovery time');
 hunter={...hunter,quiet:HUNTER.TAKE_HUNTER.seizeQuietSeconds};frame=emit();
 assert.equal(frame.transport.quietReleased,true);assert.notEqual(frame.phase,'release','mechanical eligibility is not an actual STOP');
 frame=d.update(.08,{recording:false});assert.equal(frame.phase,'release');
});

test('snapshot grip data cannot mutate the live per-side performance or transport',()=>{
 const d=createRecordingEmbodiment();for(let n=0;n<100;n++)d.update(1/60,take({takeProgress:.66}));
 const snap=d.snapshot();snap.hands[0].seat=0;snap.transport.tries=40;snap.viewPull.left.strength=0;
 assert.equal(d.snapshot().hands[0].seat,1);assert.equal(d.snapshot().transport.tries,0);
 assert.ok(d.snapshot().viewPull.left.strength>.8);
});

test('pause/focus and stalled transport do not advance pressure, release or a resumed wall-clock gap',()=>{
 const d=createRecordingEmbodiment();for(let n=0;n<10;n++)d.update(.02,take());const before=d.snapshot();
 for(const options of[{suspended:true},{stalled:true}]){
  const held=d.update(90,take({...options,takeProgress:1}));assert.deepEqual(held,before);
 }
 const resumed=d.update(90,take({takeProgress:1}));
 assert.ok(resumed.proximity-before.proximity<=.08*RECORDING_EMBODIMENT.approachRate+1e-8);
 const release=d.update(.02,{recording:false}),paused=d.update(90,{recording:false,suspended:true});assert.deepEqual(paused,release);
});

test('slate, tutorial, effects-off, a powered lamp and explicit suppression remove bodily pressure immediately',()=>{
 for(const setting of[{slating:true},{tutorial:true},{effectsMode:'off'},{lightOn:true},{enabled:false}]){
  const d=createRecordingEmbodiment();for(let n=0;n<100;n++)d.update(1/60,take());assert.ok(d.snapshot().active);
  assert.equal(d.update(1/60,take(setting)).active,false);
 }
 const d=createRecordingEmbodiment();assert.equal(d.update(.08,take({takeId:null})).active,false);
});

test('reduced motion has one stable peripheral position and Reduce Dread preserves greater separation',()=>{
 const regular=settled(),reduced=settled({reducedMotion:true}),low=settled({reducedDread:true}),
  pos=f=>recordingEmbodimentInstances(f,camera())[0];
 assert.ok(pos(low).diagnostics.depth>pos(regular).diagnostics.depth);
 const early={...reduced,proximity:.2,progress:.4,pull:0,grip:0},late={...reduced,proximity:1,progress:1,pull:1,grip:1};
 assert.deepEqual(pos(early).matrix,pos(late).matrix,'no independent moving/grain clock enters the reduced-motion pose');
 assert.deepEqual(pos(early).character,pos(late).character);
 assert.equal(pos(reduced).noShadow,true);assert.equal(pos(reduced).structural,false);
});

test('resolved current eye attachment is rigid through turns, pitch, translation and distinct hand bases',()=>{
 const frame=settled();
 for(const yaw of[-3,.2,2.6])for(const pitch of[-1.1,0,1.1]){
  const view=camera({yaw,pitch}),basis=recordingEmbodimentCameraBasis(view),parts=recordingEmbodimentInstances(frame,view);
  assert.equal(parts.length,2);assert.notEqual(parts[0].mesh,parts[1].mesh);
  for(const p of parts){
   assert.ok(Array.from(p.matrix).every(Number.isFinite));const m=p.matrix,x=Array.from(m.slice(0,3)),y=Array.from(m.slice(4,7)),z=Array.from(m.slice(8,11));
   for(const axis of[x,y,z])assert.ok(Math.abs(Math.hypot(...axis)-1)<1e-6);
   assert.ok(Math.abs(dot(x,y))<1e-6&&Math.abs(dot(x,z))<1e-6&&Math.abs(dot(y,z))<1e-6);
   const cross=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]];
   assert.ok(dot(cross,z)>.99999,'mirroring must not reflect anatomy or winding');
   const delta=[p.x-basis.eye[0],p.y-basis.eye[1],p.z-basis.eye[2]];
   assert.ok(Math.abs(dot(delta,basis.forward)-p.diagnostics.depth)<2e-6);
  }
 }
 assert.deepEqual(recordingEmbodimentInstances(frame,camera({eye:[NaN,0,0]})),[]);
});

test('world-image grip anchors are exact retained, morphed distal vertices in the rendered hand transform',()=>{
 const frame=settled({takeProgress:.66});
 for(const yaw of[-2,.7,2.4])for(const pitch of[-1,0,.9]){
  const view=camera({yaw,pitch}),parts=recordingEmbodimentInstances(frame,view),pull=recordingEmbodimentViewPull(frame,view),points=projected(frame,view);
  assert.equal(pull.active,true);
  for(let k=0;k<2;k++){
   const source=RECORDING_EMBODIMENT_CONTACTS[k],p=asset.entries[k].primitives[0],index=source.vertex,
     contact=points[k][index],side=pull[source.side];
   assert.deepEqual(source.position,Array.from(p.positions.slice(index*3,index*3+3)));
   assert.deepEqual(source.brace,Array.from(p.targets[0].positions.slice(index*3,index*3+3)));
   assert.ok(Math.abs(side.anchor[0]-contact.x)<1e-6&&Math.abs(side.anchor[1]-contact.y)<1e-6);
   assert.ok(Math.abs(Math.hypot(...side.pull)-1)<1e-12);assert.ok(side.pull[0]*(k===0?-1:1)>0);
   assert.ok(side.pull[1]<0,'pull runs outward and upward in top-left UV');
   assert.equal(parts[k].diagnostics.contactVertex,index);
  }
 }
 const early=settled({takeProgress:.20}),earlyPull=recordingEmbodimentViewPull(early,camera());
 assert.equal(earlyPull.active,false);assert.equal(earlyPull.right.strength,0,
  'a hand behind the eye is not clamped into a fictional visible grip');
 assert.equal(recordingEmbodimentViewPull(settled({reducedMotion:true}),camera()).active,false);
 const released=recordingEmbodimentViewPull({...frame,release:.9},camera());assert.ok(released.strength<pullStrength(frame));
 function pullStrength(f){return recordingEmbodimentViewPull(f,camera()).strength;}
});

test('rear approach crosses the near plane outside the frame; visible retained anatomy preserves footing',()=>{
 for(const width of[800,1280,1920])for(const height of[720,1080])for(const tanHalfFov of[.35,.65,.95,1.3,1.5]){
  for(const frame of[settled({takeProgress:.20}),settled({takeProgress:.4}),settled({takeProgress:.55}),settled({takeProgress:.66}),settled({takeProgress:.72}),{...settled(),release:.8}]){
   const view=camera({width,height,tanHalfFov}),points=projected(frame,view);
   for(const hand of points)for(const p of hand){
    if(p.depth<=0)continue;
    assert.ok(p.depth>.05||p.x<0||p.x>1||p.y<0||p.y>1,
      'rear anatomy may cross the near plane only outside the view');
    if(p.depth<=.05)continue;
    assert.equal(p.x>.30&&p.x<.70&&p.y>.43,false,'the central lower view remains bodily stable and readable');
    assert.equal(p.x>=0&&p.x<=1&&p.y>.70&&p.y<=1,false,'hands cannot cover immediate footing');
   }
  }
 }
});

test('the complete approach passes behind and around the eye without a visible near-plane cut',()=>{
 const d=createRecordingEmbodiment();let behind=false,front=false;
 for(let n=0;n<=90;n++){
  const frame=d.update(.08,take({takeProgress:n/90}));
  if(!frame.active)continue;
  for(const tanHalfFov of[.35,1.5]){
   const view=camera({tanHalfFov}),parts=recordingEmbodimentInstances(frame,view),points=projected(frame,view);
   behind ||= parts.every(p=>p.diagnostics.depth<0);
   front ||= parts.every(p=>p.diagnostics.enterView===1);
   for(const hand of points)for(const p of hand)
    if(p.depth>0&&p.depth<=.05)assert.ok(p.x<0||p.x>1||p.y<0||p.y>1,
     'the full retained hand clears the screen before crossing the near plane');
  }
 }
 assert.ok(behind&&front,'the path includes genuine rear origin and resolved frontal temple contact');
});

test('late hands have actual vertices visible below the existing five-row matte and outside recorder controls',()=>{
 uiSetScale(1);const frame=settled({takeProgress:.96}),metrics=uiCellMetrics();
 for(const[width,height]of[[800,720],[1280,720],[1920,1080]]){
  const rect=liveTakePanelRect({cols:width/metrics.cellW,rows:height/metrics.cellH,progress:.96}),
   controls=recorderControlRegions(rect,recordingOverlayButtons({rolling:true})),view=camera({width,height}),points=projected(frame,view),
   bar=rect.bar*metrics.cellH/height;
  for(const hand of points){
   const shown=hand.filter(p=>p.x>3*metrics.cellW/width&&p.x<1-3*metrics.cellW/width&&p.y>bar&&p.y<1-bar);
   assert.ok(shown.length>100,'a material share of each anatomical hand survives the real matte');
   for(const p of shown)for(const c of controls){
    const inside=p.x>=c.x*metrics.cellW/width&&p.x<=(c.x+c.w)*metrics.cellW/width&&p.y>=c.y*metrics.cellH/height&&p.y<=(c.y+c.h)*metrics.cellH/height;
    assert.equal(inside,false,'near-field anatomy cannot cover STOP, REC or TAKES');
   }
  }
 }
});

test('seated fingers remain visible while cropped wrists stop reading as two complete floating gloves',()=>{
 uiSetScale(1);const width=1280,height=720,metrics=uiCellMetrics();
 for(const progress of[.66,.72]){
  const frame=settled({takeProgress:progress}),rect=liveTakePanelRect({cols:width/metrics.cellW,rows:height/metrics.cellH,progress}),bar=rect.bar*metrics.cellH/height;
  for(const hand of projected(frame,camera({width,height}))){
   const visible=hand.filter(p=>p.x>0&&p.x<1&&p.y>bar&&p.y<1-bar),
    widthFraction=Math.max(...visible.map(p=>p.x))-Math.min(...visible.map(p=>p.x)),heightFraction=Math.max(...visible.map(p=>p.y))-Math.min(...visible.map(p=>p.y));
   assert.ok(widthFraction>.15&&widthFraction<.36,'a peripheral contact, rather than a whole enlarged glove');
   assert.ok(heightFraction>.10,'actual fingers extend below the real matte');
   assert.equal(visible.filter(p=>p.wrist).length,0,'the unsupported cropped wrist seam stays behind the matte');
   assert.ok(Math.min(...hand.map(p=>p.depth))>.05);
  }
 }
 // This is geometric occupancy, never proof of shaded or dithered prominence.
});

test('material aliases preserve original hand resources, ordinary skin and morph ownership',()=>{
 const donors=['rest_hand_left','rest_hand_right'],catalog=new Map(donors.map((name,k)=>[name,{name,extras:{original:true},primitives:[{vao:{id:k},base:[.47,.32,.245,1],emissive:[0,0,0]}],characterAsset:{retained:true},characterEntry:{name}}])),
  originals=donors.map(name=>catalog.get(name)),before=originals.map(p=>structuredClone(p));
 assert.deepEqual(installRecordingEmbodimentMaterials(null,{catalog}),RECORDING_EMBODIMENT_MESHES);
 for(let k=0;k<2;k++){
  const copied=catalog.get(RECORDING_EMBODIMENT_MESHES[k]);assert.equal(copied.characterAsset,originals[k].characterAsset);
  assert.equal(copied.primitives[0].vao,originals[k].primitives[0].vao);assert.deepEqual(originals[k],before[k]);
  assert.deepEqual(copied.primitives[0].base,[...originals[k].primitives[0].base.slice(0,3).map(v=>v*.7),1]);
  assert.deepEqual(copied.primitives[0].emissive,[0,0,0],'anatomical plane contrast must not be a uniform glowing silhouette');
  assert.equal(copied.primitives[0].materialRole,null);
 }
 const alias=catalog.get(RECORDING_EMBODIMENT_MESHES[0]);installRecordingEmbodimentMaterials(null,{catalog});assert.equal(catalog.get(RECORDING_EMBODIMENT_MESHES[0]),alias);
 // A retained pack can survive the authoring module's reload. Its old black
 // material must not bypass the correction merely because VAOs stayed resident.
 catalog.set(RECORDING_EMBODIMENT_MESHES[0],{...alias,recordingMaterialRevision:1,
  primitives:alias.primitives.map(p=>({...p,base:[.008,.011,.010,1],emissive:[.042,.049,.045]}))});
 installRecordingEmbodimentMaterials(null,{catalog});const repaired=catalog.get(RECORDING_EMBODIMENT_MESHES[0]);
 assert.equal(repaired.primitives[0].vao,alias.primitives[0].vao);assert.deepEqual(repaired.primitives[0].base,alias.primitives[0].base);
 assert.deepEqual(repaired.primitives[0].emissive,[0,0,0]);
 assert.equal(installRecordingEmbodimentMaterials(null,{catalog:new Map()}),false);
});

test('prewarm is transactional, coalesces pending work and can re-establish aliases after residency loss',async()=>{
 const catalog=new Map();let loads=0,installs=0;
 const props={propMeshCatalog:()=>[...catalog.keys()],addCharacterPack:async(_url,{allowedMeshes})=>{loads++;assert.deepEqual([...allowedMeshes],['rest_hand_left','rest_hand_right']);for(const name of allowedMeshes)catalog.set(name,{name,primitives:[]});},
  installAuthoredPropMeshes:installer=>{installs++;return installer(null,{catalog});}},renderer={r3dBasePropsReady:async()=>true};
 assert.deepEqual(await Promise.all([prewarmRecordingEmbodimentMeshes({renderer,props,resolveAsset:v=>v}),prewarmRecordingEmbodimentMeshes({renderer,props,resolveAsset:v=>v})]),[true,true]);
 assert.equal(loads,1);assert.equal(installs,1);catalog.delete(RECORDING_EMBODIMENT_MESHES[0]);
 assert.equal(await prewarmRecordingEmbodimentMeshes({renderer,props}),true);assert.equal(loads,1);
 assert.equal(await prewarmRecordingEmbodimentMeshes({renderer:{r3dBasePropsReady:async()=>false},props}),false);
});
