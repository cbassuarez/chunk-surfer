// The review canvas and an eventual selected rift borrow this same renderer.
// It samples a simulation-owned frame; no progression, Contact or host camera
// state is advanced here. Ellery's floor/collision bytes remain intact.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import { CELL, F, MATERIAL, ZONE } from '../data/floorplan/legend.js';
import { buildSourceFalseReturnLayout } from '../game/source-false-return-layout.js';
import { sourceFalseReturnRenderFrame } from './source-false-return-renderer.js';
import { assetUrl } from '../platform/paths.js';
import { sourcePrintRows } from './physical-source-print.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, finite(n)));
const copy = value => {
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  return value;
};
const matrix = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]);
};
const positioned = (id, mesh, x, y, z, yaw = 0, scale = 1, extra = {}) => ({
  id, mesh, x, y, z, yaw, scale, matrix: matrix(x,y,z,yaw,scale,scale,scale), zone: ZONE.practice, structural: true, ...extra,
});
const paperTextMatrix = (x,y,z,yaw,width=.18,height=.038) => {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new Float32Array([c*width,0,s*width,0,s*height,0,-c*height,0,0,1,0,0,x,y,z,1]);
};
const optionOf = frame => ['bad-bar', 'after-company', 'fifth-chair'].includes(frame?.optionId)
  ? frame.optionId : 'bad-bar';
const sourceBounds = Object.freeze({
  'bad-bar': { minX: 51, maxX: 59.5, minZ: 47.5, maxZ: 53.5 },
  'after-company': { minX: 63.5, maxX: 76.5, minZ: 68, maxZ: 76.5 },
  'fifth-chair': { minX: 63.5, maxX: 76.5, minZ: 61, maxZ: 67.5 },
});
const sourceSeams = Object.freeze({
  'bad-bar':{minX:51,maxX:53,minZ:48.75,maxZ:49.75},
  'after-company':{minX:68.75,maxX:70.25,minZ:70.75,maxZ:71.25},
  'fifth-chair':{minX:71.5,maxX:73,minZ:61.5,maxZ:62},
});

/** Only the material changes: no floor, ceiling, flag, door or support moves. */
export function conservatoryRiftPlan(original, frame = {}) {
  if (!original || original.rgba?.length !== original.w * original.h * 4)
    throw new TypeError('The rift requires Ellery\'s resolved physical plan.');
  const plan = { ...original, rgba: new Uint8Array(original.rgba), material: new Uint8Array(original.material),
    ambient: original.ambient ? new Uint8Array(original.ambient) : undefined };
  const optionId=optionOf(frame),leak = Math.round(clamp(frame.leak)*64)/64, bounds = frame.leakBounds || sourceBounds[optionId],seam=sourceSeams[optionId], mask = new Uint8Array(plan.w*plan.h);
  let changed = 0;
  for (let z=0; z<plan.h; z++) for (let x=0; x<plan.w; x++) {
    const i=z*plan.w+x, xm=(finite(plan.originX)+x+.5)*CELL, zm=(finite(plan.originY)+z+.5)*CELL;
    if (xm < bounds.minX || xm > bounds.maxX || zm < bounds.minZ || zm > bounds.maxZ) continue;
    // A stepped, seam-first invasion grows from fixed world cells. Elapsed
    // render time cannot animate a paused simulation or rearrange this mask.
    const hash = ((Math.imul(x+17,73856093) ^ Math.imul(z+53,19349663)) >>> 0) / 4294967296;
    const wall = !!(plan.rgba[i*4+2] & F.SOLID), threshold = wall ? hash*.62 : .46+hash*.54;
    const seamCell=xm>=seam.minX&&xm<=seam.maxX&&zm>=seam.minZ&&zm<=seam.maxZ;
    if (!seamCell && (leak<=0||threshold > leak)) continue;
    plan.material[i] = wall && hash < .13 ? MATERIAL.sourceFault : MATERIAL.sourceField;
    mask[i] = 1; changed++;
  }
  return { plan, mask, changed };
}

/** Miniatures are the real room's resolved furniture at one uniform scale. */
export function conservatoryRiftMiniature(layout, frame = {}) {
  const anchor = layout.props.find(p => p.id === 'practice-stand-6');
  const board=frame.miniature?.board;
  const center = frame.miniature?.center || (board?[board.x,finite(frame.feet,board.y-.726),board.z]:[finite(anchor?.x,72), 4.8, finite(anchor?.z,62.5)]);
  const floor = finite(frame.floorH,finite(frame.feet,center[1])), scale = .09, top = finite(board?.y,floor+.726);
  const props = [], x = center[0], z = center[2];
  const desk = positioned('rift-miniature-desk','school_desk',x,floor,z,0,1);
  desk.matrix = matrix(x,floor,z,0,2.15,1,2.15); props.push(desk);
  const paperBounds=PROP_BOUNDS.loose_note;
  const paper = positioned('rift-miniature-paper','loose_note',x,top,z,0,1);
  paper.matrix = matrix(x,top,z,0,1.10/(paperBounds.max[0]-paperBounds.min[0]),.10,.65/(paperBounds.max[2]-paperBounds.min[2])); props.push(paper);
  const source = layout.props.filter(p => /practice-(?:ensemble|chair|stand|marimba|piano)/.test(p.id)
    && finite(p.y,4.8) < 5.2 && p.x >= 64 && p.x <= 76 && p.z >= 68.5 && p.z <= 75.5
    && !/metronome|inscription|attachment/.test(p.id) && !/chair|score|pages|note/.test(p.mesh));
  for (const p of source) {
    // The same actual instrument meshes occupy the model's far half. Keep
    // the four entrances and listening chair clear in the near half.
    const xx=x+(p.x-70)*.07, zz=z-.17+(p.z-72)*.035, yy=top+.01+(finite(p.y,4.8)-4.8)*scale;
    props.push(positioned('rift-miniature:'+p.id,p.mesh,xx,yy,zz,finite(p.yaw),finite(p.scale,1)*scale,{ miniatureOf:p.id }));
  }
  const pointOnBoard = (u,v) => [x+(clamp(u)-.5)*1.04,z+(clamp(v)-.5)*.62];
  const completed = new Set((frame.marks||[]).map(mark=>typeof mark==='number'?mark:mark.index));
  const marks = [.18,.39,.61,.82].map((u,index)=>({index,x:u,z:.5}));
  const issued = new Set((frame.issuedMarks||[]).map(m=>typeof m==='number'?m:m.index));
  for(const mark of marks){
    const [xx,zz]=pointOnBoard(mark.x,mark.z),done=issued.has(mark.index)||mark.issued===true;
    // The physical monitoring model is a new arrangement of retained chairs.
    // Four entrances occupy four seats; the listener's fifth seat remains
    // empty until the same simulation that anticipates the marks reveals it.
    props.push(positioned('rift-miniature-player-chair-'+mark.index,'chair',xx,top+.010,zz-.105,Math.PI,scale,
      { riftPlayerChair:mark.index,miniatureOf:'practice-ensemble-chair-a' }));
    props.push(positioned('rift-miniature-mark-'+mark.index,'calibration_pin',xx,top+.014,zz,0,.20,
      { riftEntrance:mark.index,issued:done,marked:completed.has(mark.index),emissive:done?[.20,.25,.19,.30]:completed.has(mark.index)?[.70,.32,.12,.28]:[.12,.15,.12,.15] }));
    if(done)props.push(positioned('rift-miniature-issued-'+mark.index,'calibration_pin',xx,top+.020,zz,0,.24,
      { riftIssued:mark.index,emissive:[.22,.27,.20,.30] }));
  }
  if(clamp(frame.leak)>=.25)props.push(positioned('rift-miniature-listener-chair','chair',x,top+.010,z+.14,0,scale,
    { riftListenerChair:true,miniatureOf:'practice-ensemble-chair-a',emissive:[.14,.20,.18,.20] }));
  const entrance = Math.round(clamp(frame.entrance ?? frame.markerIndex ?? frame.choiceIndex ?? 0,0,3));
  const fallback=marks.find(m=>m.index===entrance)||marks[0]||{x:.18,z:.5};
  const [selectedX,selectedZ]=pointOnBoard(finite(frame.token?.x,fallback.x),finite(frame.token?.z,fallback.z));
  props.push(positioned('rift-miniature-entrance','calibration_pin',selectedX,top+.028,selectedZ,0,.38,
    { riftMarker:true,emissive:[.80,.31,.12,.38] }));
  const lights = [{ id:'rift-miniature-task',x,y:floor+2.35,z:z-.25,radius:3.4,intensity:1.5,color:[.72,.81,.83],penetration:0 },
    { id:'rift-miniature-entrance-light',x:selectedX,y:top+.18,z:selectedZ,radius:.45,intensity:.36,color:[.89,.50,.31],penetration:1 }];
  return { props, lights, center:[x,top,z], sourceIds:source.map(p=>p.id), scale,token:[selectedX,top+.028,selectedZ] };
}

export function conservatoryRiftRenderFrame(layout, frame = {}, {planCache=null}={}) {
  const optionId=optionOf(frame), camera=frame.camera;
  if (!camera || !Array.isArray(camera.eye) || camera.eye.length!==3 || !camera.eye.every(Number.isFinite))
    throw new TypeError('A rift frame needs its simulation-owned camera in metres.');
  const feet=finite(frame.floorH,finite(frame.feet,4.8)),doorOpen={...layout.doorOpen,...frame.doorOpen},doorMotion={...layout.doorMotion};
  for(const d of frame.doorOverrides||[]){const fraction=clamp(d.fraction);doorOpen[d.id]=fraction>0;doorMotion[d.id]={from:fraction,to:fraction>0,startedAt:0,duration:1};}
  const body={x:camera.eye[0],z:camera.eye[2],feet,yaw:finite(camera.yaw),pitch:finite(camera.pitch),
    opened:[],sourceDoors:[],doorOpen,doorMotion,elapsed:0};
  const supplied=layout.planFor?.(body)||{},view={...layout,...supplied},finishKey=optionId+':'+Math.round(clamp(frame.leak)*64)+':'+JSON.stringify(frame.leakBounds||null);
  let cache=planCache?.get(view.plan),planView=cache?.get(finishKey);
  if(!planView){planView=conservatoryRiftPlan(view.plan,frame);if(planCache){if(!cache){cache=new Map();planCache.set(view.plan,cache);}cache.set(finishKey,planView);if(cache.size>4)cache.delete(cache.keys().next().value);}}
  const ordinary=sourceFalseReturnRenderFrame(view,body,{planView:{...planView,wedges:[],sourceDoors:[]}});
  const hidden=new Set(frame.hiddenProps||[]), additions=copy(frame.props||[]), lights=copy(frame.lights||[]);
  let miniature=null;
  if(optionId==='fifth-chair' && frame.miniature!==false) {
    miniature=conservatoryRiftMiniature(view,frame); additions.push(...miniature.props); lights.push(...miniature.lights);
    hidden.add('practice-stand-6');hidden.add('practice-score-parts');
  }
  const props=ordinary.props.filter(p=>!hidden.has(p.id)).map(p=>({...p,id:String(p.id).replace('source-false-return-','conservatory-rift-')}));
  props.push(...additions);
  const floorLight=optionId==='bad-bar'
    ? { id:'rift-reference-worklamp',x:53.25,y:feet+2.6,z:49.2,radius:5.5,intensity:1.0,color:[.89,.73,.52],penetration:0 }
    : { id:'rift-after-worklamp',x:69.3,y:feet+2.6,z:71.3,radius:7,intensity:.88,color:[.53,.67,.73],penetration:0 };
  const seam=sourceSeams[optionId],seamLight={id:'rift-source-seam',x:(seam.minX+seam.maxX)/2,y:feet+1.7,z:(seam.minZ+seam.maxZ)/2,
    radius:2.3,intensity:.57,color:[.51,.70,.75],penetration:0};
  const keyAt=optionId==='bad-bar'?{x:53.3,z:49.5}:optionId==='after-company'?{x:69.6,z:71.25}:{x:finite(miniature?.center?.[0],72),z:finite(miniature?.center?.[2],62.5)-.35};
  const keyLight={id:'rift-reading-practical',x:keyAt.x,y:feet+1.95,z:keyAt.z,radius:2.6,intensity:optionId==='bad-bar'?1.18:.84,
    color:[.96,.77,.51],penetration:0};
  const routeLights=[];
  if(optionId==='after-company'){
    const paper=view.props.find(p=>p.id==='practice-score-parts')||frame.audio?.referenceSource||{x:72,y:feet+1.2,z:62.5};
    routeLights.push({id:'rift-paper-reference-practical',x:paper.x-.45,y:finite(paper.y,feet+1.2)+.95,z:paper.z+.40,radius:4.5,intensity:1.65,color:[.93,.75,.49],penetration:0});
    for(const z of[63.5,70.5])routeLights.push({id:'rift-corridor-practical-'+z,x:61.25,y:feet+2.55,z,radius:5.6,intensity:1.24,color:[.57,.69,.73],penetration:0});
  }
  const eye=camera.eye, allLights=[...lights,...routeLights,keyLight,seamLight,floorLight,...ordinary.lights].sort((a,b)=>
    (a.x-eye[0])**2+(a.y-eye[1])**2+(a.z-eye[2])**2-((b.x-eye[0])**2+(b.y-eye[1])**2+(b.z-eye[2])**2)).slice(0,8);
  const labels=copy(frame.labels||[]);
  if(frame.label?.text&&!labels.length){
    // This is a physical transfer slip, not a camera-relative title. The
    // observer may turn away and all three views share the same world pass.
    const p=optionId==='fifth-chair'?{x:finite(miniature?.center?.[0],72),y:finite(miniature?.center?.[1],feet+.726),z:finite(miniature?.center?.[2],62.5)+.28,yaw:0}:
      optionId==='after-company'?(view.props.find(p=>p.id==='practice-score-parts')||{x:72,y:feet+1.20,z:62.5,yaw:1.77}):
        (view.props.find(p=>p.id==='practice-score-exam')||{x:53,y:feet+.94,z:49,yaw:-Math.PI/2});
    const labelYaw=optionId==='bad-bar'?-Math.PI/2:finite(p.yaw);
    const transfer=positioned('rift-transfer-paper','loose_note',p.x,p.y+.030,p.z,labelYaw,1,{riftTransferBacking:true});
    transfer.matrix=matrix(p.x,p.y+.030,p.z,labelYaw,1.10,.15,.25);props.push(transfer);
    labels.push({id:'rift-transfer-label',text:frame.label.text,
      matrix:paperTextMatrix(p.x,p.y+.036,p.z,labelYaw,.30,.045),color:[.025,.028,.026,1]});
  }
  if(miniature){
    const [mx,my,mz]=miniature.center;
    for(const [index,row]of sourcePrintRows().slice(0,3).entries())labels.push({id:'rift-paper-source-'+index,text:row.text,color:[.08,.15,.11,1],
      matrix:new Float32Array([.90,0,0,0,0,0,-.032,0,0,1,0,0,mx,my+.032,mz-.24+index*.052,1])});
  }
  return {optionId,phase:frame.phase||'',token:frame.token||'',camera:copy(camera),floorH:feet,plan:planView.plan,props,lights:allLights,
    lightingContext:copy(view.lightingContext||{}),changedCells:planView.changed,mask:planView.mask,labels,
    miniature:miniature?{center:miniature.center,scale:miniature.scale,sourceIds:miniature.sourceIds,token:miniature.token}:null,
    hiddenProps:[...hidden],counts:{props:props.length,lights:allLights.length},key:[supplied.key||view.plan.key||'fixed',optionId,Math.round(clamp(frame.leak)*64)].join(':')};
}

export function createConservatoryRiftRenderer({ layout, floorplan, props=[], propSources=[], lights=[], renderer=R3, propRenderer=P3,
  getTorch=()=>({on:true,look:{power:1}}),resolveAsset=assetUrl,onRelease=()=>{} }={}) {
  const source=layout||buildSourceFalseReturnLayout({floorplan,props,propSources,lights}),local=copy(source);
  if(!local?.plan && typeof local?.planFor!=='function') throw new TypeError('The rift needs the actual Ellery layout.');
  const hostDoors=floorplan?.doorState?.()||[];
  local.doorOpen={...local.doorOpen,...Object.fromEntries(hostDoors.map(d=>[d.id,finite(d.openFraction,Number(d.open))]))};
  local.doorMotion={...local.doorMotion,...Object.fromEntries(hostDoors.filter(d=>d.openFraction>0&&d.openFraction<1)
    .map(d=>[d.id,{from:d.openFraction,to:d.open,startedAt:0,duration:1}]))};
  const upper=local.planFor?.({x:53.65,z:49.4,feet:4.8})||local;
  const required=new Set([...upper.props.map(p=>p.mesh),'school_desk','loose_pages','loose_note','calibration_pin','chair','open_score']);
  for(const d of upper.doors||[]) for(const m of[d.frameMesh,d.headMesh,d.mesh]) if(m) required.add(m);
  const planCache=new WeakMap();
  let initialized=false,released=false,acquired=false,loading=null,error=null,last=null,lastPlanKey=null,lastLabelKey='';
  const resident=()=>{const known=new Set(propRenderer.propMeshCatalog?.()||[]);return[...required].every(m=>known.has(m));};
  function clearShared(){
    renderer.r3dSetHorizon?.(null);renderer.r3dSetSourceShore?.(null);renderer.r3dSetSourceEmergency?.(0);renderer.r3dSetSourceWhiteout?.(0);renderer.r3dSetSourceFault?.(0);
    renderer.r3dSetSourcePortals?.([]);renderer.r3dSetSourceOpenings?.([]);renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetSourceDoorLights?.([]);renderer.r3dSetSourceCrossing?.(null);
    renderer.r3dSetSourceReflection?.(null);renderer.r3dSetLocalLights?.([]);renderer.r3dSetEmergencyShadows?.([]);renderer.r3dSetSourceTextInstances?.([]);
    renderer.r3dSetProps?.([]);renderer.r3dSetDynamicProps?.([]);propRenderer.setPressureInstances?.([]);renderer.r3dSetIndoorRain?.(0);
  }
  function initialize(){
    if(loading)return loading;
    loading=(async()=>{
      if(released)return false;
      if(await renderer.r3dBasePropsReady?.()===false)throw Error('Ellery\'s base prop catalog is not ready.');
      if(released)return false;
      // These are the original upper-floor packs. The host begins them after
      // its base promise; direct review can acquire this scene before that
      // background chain reaches the stair and acquisitions. Load only a
      // missing actual dependency, not every optional floor in Ellery.
      // Retained ornament is optional in the original building and its copy.
      if(required.has('main_stair_wall_treatment')&&!new Set(propRenderer.propMeshCatalog?.()||[]).has('main_stair_wall_treatment')){
        try{await propRenderer.addPropPack(resolveAsset('assets/conservatory-stair-walls.glb'));}
        catch{required.delete('main_stair_wall_treatment');}
        if(released)return false;
      }
      const packs=[[/^door_/,'assets/conservatory-doors.glb'],[/^main_open_well_stair$/,'assets/conservatory-main-stair.glb'],
        [/^textile_/,'assets/conservatory-textiles.glb'],[/^(?:green_chair_01|lantern_chandelier_01|wooden_chair_01|power_box_01)$/,'assets/conservatory-acquisitions.glb']];
      for(const[pattern,url]of packs){const known=new Set(propRenderer.propMeshCatalog?.()||[]);
        if([...required].some(m=>pattern.test(m)&&!known.has(m)))await propRenderer.addPropPack(resolveAsset(url));if(released)return false;
      }
      if(released)return false;
      const actual=new Set(propRenderer.propMeshCatalog?.()||[]),missing=[...required].filter(m=>!actual.has(m));
      if(missing.length)throw Error('Rift original meshes missing: '+missing.slice(0,12).join(', '));
      clearShared();acquired=true;
      renderer.r3dSetSourceSurface?.(sourcePrintRows().map(r=>r.text));
      renderer.r3dSetSourceScene?.({key:'conservatory:source-rift',corpus:[],staticInstances:[],dynamicInstances:[],look:{roomMemoryActive:false,chroma:1,paper:0,sunrise:0},weather:{rain:0,clouds:0,moon:0}});
      renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();
      initialized=true;return true;
    })().catch(reason=>{error=String(reason?.message||reason);throw reason;});
    return loading;
  }
  function render(frame){
    if(!initialized||released)return false;
    if(!resident())throw Error('The rift lost its original Ellery prop catalog.');
    last=conservatoryRiftRenderFrame(local,frame,{planCache});
    if(last.key!==lastPlanKey){const p=last.plan;renderer.r3dSetPlan(p.rgba,p.w,p.h,p.material,{ambient:p.ambient,originX:p.originX,originY:p.originY,heightOffset:p.heightOffset});lastPlanKey=last.key;}
    renderer.r3dSetLightingContext?.(last.lightingContext);
    const labelKey=last.labels.map(l=>String(l.text||l.source?.text||'')).join('\n');
    if(labelKey || lastLabelKey){
      renderer.r3dSetSourceScene?.({key:'conservatory:source-rift',atlasKey:'conservatory:source-rift:'+labelKey,
        corpus:last.labels.map(l=>({text:l.text||l.source?.text||''})),staticInstances:[],dynamicInstances:last.labels,
        look:{roomMemoryActive:false,chroma:1,paper:0,sunrise:0},weather:{rain:0,clouds:0,moon:0}});
      lastLabelKey=labelKey;
    }
    renderer.r3dSetProps(last.props);renderer.r3dSetLocalLights(last.lights);renderer.r3dSetDynamicProps?.([]);
    const torch=getTorch?.()||{},camera=last.camera;
    return renderer.r3dFrame({px:camera.eye[0]/CELL-.5,py:camera.eye[2]/CELL-.5,floorH:last.floorH,authoredCamera:camera,
      tileW:last.plan.w,tileH:last.plan.h,plan:true,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,
      light:torch.on?1:0,torchLook:copy(torch.look||{}),water:{active:false},sensoryProfile:'story',textSpace:false,sourceVoidPhysical:false})!==false;
  }
  function dispose(){if(released)return false;released=true;initialized=false;if(acquired)clearShared();onRelease();return true;}
  return{initialize,render,dispose,clear:()=>renderer.r3dClearScreen?.(),ready:()=>initialized&&!released&&!error&&resident(),
    diagnostics:()=>({ready:initialized&&!released&&!error&&resident(),released,error,meshCount:required.size,
      frame:last?{optionId:last.optionId,camera:copy(last.camera),changedCells:last.changedCells,miniature:copy(last.miniature),counts:{...last.counts},hiddenProps:[...last.hiddenProps]}:null})};
}
