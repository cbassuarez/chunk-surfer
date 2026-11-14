// A finite patch is a deformation of an ACTUAL receiving plane, not a decal
// guessed from the logical map. This module is CPU-only and has no clock,
// renderer ownership, collision, save, fear or gameplay writes.
//
// renderPlan is the CURRENT FP.physicalRenderPlanFor(observerX, observerY)
// result. Its originX/originY and integer cells are physical half-metre cells;
// camera.eye, AABBs, all output axes/positions and *M dimensions are METRES.
// Use the byte RGBA heights that MARCH draws, not unquantized floor/ceil arrays.
// Resolve once when a stillness bout latches. Looking must not place it again.
//
// A receiver origin is the centre of the base plane. right/up are unit axes,
// right x up = normal, and positive local Z protrudes into traversable space.
// host.min/max delimit the EXACT rectangular base-plane footprint (no padding
// outside that wall), independent of the proposed relief depthM.
import {BORROWED_INTERIOR_ZONE_BIT,CELL,F,MATERIAL} from '../data/floorplan/legend.js';
import {decodeH} from '../world/floorplan.js';
import {SOURCE_REST_ALCOVE_SOLIDS} from '../data/source-rest-alcove.js';
import {CONTINUATION_CATCH_STAGES,continuationSurfaces,continuationSurfaceContains} from '../data/source-continuation.js';
import {sourcePrintUV} from './physical-source-print.js';
import {STILLNESS_ANATOMY} from '../data/generated/stillness-anatomy.js';

export const STILLNESS_RECEIVER_LIMITS=Object.freeze({
  maxDistanceM:5,widthM:1.4,heightM:1.9,depthM:.20,minWidthM:.35,minHeightM:.50,edgeMarginM:.025,maxVerticalShiftM:.25,
});
const EPS=1e-5;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const number=(v,fallback)=>Number.isFinite(v)?v:fallback;
const vector=value=>Array.isArray(value)||ArrayBuffer.isView(value)
  ?[value[0],value[1],value[2]]:value&&[value.x,value.y,value.z];
const validVector=v=>v?.length===3&&v.every(Number.isFinite);
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalized=value=>{const v=vector(value);if(!validVector(v))return null;const m=Math.hypot(...v);return m>1e-8?v.map(n=>n/m):null;};
const protectedMaterial=material=>material===MATERIAL.roofGlass?'glass':material===MATERIAL.doorGlassDuct?'door-or-glass':material===MATERIAL.sourceVoid?'void':null;

function planReader(plan){
  if(!plan||!Number.isInteger(plan.w)||!Number.isInteger(plan.h)||plan.w<1||plan.h<1
    ||!plan.rgba||plan.rgba.length<plan.w*plan.h*4)return null;
  const ox=number(plan.originX,0),oz=number(plan.originY,0);
  return{plan,cell(x,z){
    const ix=x-ox,iz=z-oz;
    if(ix<0||iz<0||ix>=plan.w||iz>=plan.h)return null;
    const i=iz*plan.w+ix,at=i*4,flags=plan.rgba[at+2];
    const encodedCeil=decodeH(plan.rgba[at+1]);
    return{x,z,i,flags,solid:!!(flags&F.SOLID),floor:decodeH(plan.rgba[at]),
      ceil:(flags&F.SKY)&&!(flags&F.WALLED)?90:encodedCeil,
      floorByte:plan.rgba[at],ceilByte:plan.rgba[at+1],zone:plan.rgba[at+3]&~BORROWED_INTERIOR_ZONE_BIT,
      material:plan.material?.[i]||MATERIAL.serviceConcrete};
  }};
}
function bounds(value){
  const min=vector(value?.min)||[value?.minX,value?.minY,value?.minZ];
  const max=vector(value?.max)||[value?.maxX,value?.maxY,value?.maxZ];
  return validVector(min)&&validVector(max)&&min.every((n,i)=>n<=max[i])?{min,max,id:value.id||null}:null;
}
function rayBox(eye,ray,box){
  let near=0,far=Infinity;
  for(let a=0;a<3;a++){
    if(Math.abs(ray[a])<1e-9){if(eye[a]<box.min[a]||eye[a]>box.max[a])return Infinity;continue;}
    let lo=(box.min[a]-eye[a])/ray[a],hi=(box.max[a]-eye[a])/ray[a];
    if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);far=Math.min(far,hi);
    if(near>far)return Infinity;
  }
  return far>=0?near:Infinity;
}
function firstBlocker(eye,ray,blockers,maxDistance){
  let first=null;
  for(const value of blockers||[]){const box=bounds(value);if(!box)continue;
    const distance=rayBox(eye,ray,box);if(distance<maxDistance-EPS&&(!first||distance<first.distance))first={...box,distance};
  }
  return first;
}
function fail(reason,extra={}){return{supported:false,reason,...extra};}

// A short, exact DDA through the renderer's current slice. Stops at the FIRST
// encountered surface; it never searches through a wall, doorway or floor for
// a more convenient receiver. The full-height wall's material belongs to the
// room-side cell, exactly as in MARCH's `hitCell = nc.solid ? cell : nxt`.
export function traceStillnessWall({renderPlan,camera,direction,maxDistanceM=5,blockedPropAABBs=[]}={}){
  const reader=planReader(renderPlan),eye=vector(camera?.eye),ray=normalized(direction);
  if(!reader)return fail('invalid-plan');
  if(!validVector(eye)||!ray)return fail('invalid-camera');
  const maxDistance=clamp(number(maxDistanceM,5),.05,20);
  let x=Math.floor(eye[0]/CELL),z=Math.floor(eye[2]/CELL),current=reader.cell(x,z),entered=0;
  if(!current)return fail('open-edge');
  if(current.solid)return fail('eye-in-solid');
  if(eye[1]<current.floor-EPS||(!(current.flags&F.SKY)&&eye[1]>current.ceil+EPS))return fail('eye-outside-span');
  const sx=ray[0]<0?-1:1,sz=ray[2]<0?-1:1;
  let tx=Math.abs(ray[0])<1e-9?Infinity:((x+(sx>0?1:0))*CELL-eye[0])/ray[0];
  let tz=Math.abs(ray[2])<1e-9?Infinity:((z+(sz>0?1:0))*CELL-eye[2])/ray[2];
  const dx=Math.abs(ray[0])<1e-9?Infinity:CELL/Math.abs(ray[0]),dz=Math.abs(ray[2])<1e-9?Infinity:CELL/Math.abs(ray[2]);
  for(let guard=0;guard<128;guard++){
    if(current.flags&F.DOOR)return fail('door',{distanceM:entered});
    const alongX=tx<tz,boundary=Math.min(tx,tz),exit=Math.min(boundary,maxDistance);
    if(Math.abs(ray[1])>1e-9){
      const floor=(current.floor-eye[1])/ray[1],ceiling=(current.ceil-eye[1])/ray[1];
      if(ray[1]<0&&floor>=entered-EPS&&floor<=exit+EPS)return fail(current.material===MATERIAL.wetTile?'water-or-wet-floor':'floor',{distanceM:floor});
      if(ray[1]>0&&!(current.flags&F.SKY)&&ceiling>=entered-EPS&&ceiling<=exit+EPS)return fail('ceiling',{distanceM:ceiling});
    }
    if(boundary>maxDistance+EPS||!Number.isFinite(exit))return fail('out-of-range');
    const nx=x+(alongX?sx:0),nz=z+(alongX?0:sz),next=reader.cell(nx,nz),point=add(eye,ray,exit);
    if(!next)return fail('open-edge',{distanceM:exit});
    if(next.flags&F.DOOR)return fail('door',{distanceM:exit});
    if(next.solid){
      if(point[1]<current.floor-.001||point[1]>current.ceil+.001)return fail('outside-wall-height',{distanceM:exit});
      const protectedReason=protectedMaterial(current.material);
      if(protectedReason)return fail(protectedReason,{distanceM:exit});
      const blocked=firstBlocker(eye,ray,blockedPropAABBs,exit);
      if(blocked)return fail('blocked-prop',{distanceM:blocked.distance,propId:blocked.id});
      return{supported:true,point,normal:alongX?[-sx,0,0]:[0,0,-sz],cell:current,
        distanceM:exit,planeAxis:alongX?0:2,planeCoordinate:point[alongX?0:2],sliceKey:renderPlan.key||null};
    }
    if(point[1]<next.floor)return fail('riser',{distanceM:exit});
    if(point[1]>next.ceil&&!(next.flags&F.SKY))return fail('header',{distanceM:exit});
    x=nx;z=nz;current=next;entered=exit;if(alongX)tx+=dx;else tz+=dz;
  }
  return fail('step-budget');
}
function semanticMatch(a,b){
  return b&&!b.solid&&!(b.flags&F.DOOR)&&a.zone===b.zone&&a.material===b.material
    &&a.floorByte===b.floorByte&&a.ceilByte===b.ceilByte
    &&(a.flags&(F.SKY|F.WALLED|F.BRICKED))===(b.flags&(F.SKY|F.WALLED|F.BRICKED));
}
function rectangleBounds(origin,right,up,width,height){
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>add(add(origin,right,x*width/2),up,y*height/2));
  return{min:[0,1,2].map(a=>Math.min(...corners.map(p=>p[a]))),max:[0,1,2].map(a=>Math.max(...corners.map(p=>p[a])))};
}
function receiverAt(hit,{renderPlan,camera,widthM,heightM,depthM,blockedPropAABBs}){
  const reader=planReader(renderPlan),axis=hit.planeAxis,along=axis===0?2:0,base=hit.cell;
  const originCell=along===0?base.x:base.z;
  const validHost=offset=>{
    const x=base.x+(along===0?offset:0),z=base.z+(along===2?offset:0),inside=reader.cell(x,z);
    const behind=reader.cell(x-hit.normal[0],z-hit.normal[2]);
    return semanticMatch(base,inside)&&behind?.solid;
  };
  let lo=0,hi=0;
  const cells=Math.ceil(widthM/CELL)+1;
  for(let k=1;k<=cells&&validHost(-k);k++)lo=-k;
  for(let k=1;k<=cells&&validHost(k);k++)hi=k;
  const margin=STILLNESS_RECEIVER_LIMITS.edgeMarginM;
  let minAlong=(originCell+lo)*CELL+margin,maxAlong=(originCell+hi+1)*CELL-margin;
  let bottom=base.floor+margin,top=base.ceil-margin;
  // A prop can protect writing or obscure part of the otherwise valid host.
  // Clip away its complete projected rectangular extent instead of drawing a
  // face through it. The interval containing the acquired point is retained.
  const acquiredY=clamp(vector(camera.eye)[1]-.10,bottom,top);
  for(const value of blockedPropAABBs||[]){const b=bounds(value);if(!b)continue;
    const plane=hit.planeCoordinate,normalAxis=axis;
    if(plane<b.min[normalAxis]-.04||plane>b.max[normalAxis]+.04)continue;
    const blo=b.min[along]-margin,bhi=b.max[along]+margin;
    if(bhi<minAlong||blo>maxAlong||b.max[1]<bottom||b.min[1]>top)continue;
    if(b.max[1]<acquiredY)bottom=Math.max(bottom,b.max[1]+margin);
    else if(b.min[1]>acquiredY)top=Math.min(top,b.min[1]-margin);
    else if(bhi<hit.point[along])minAlong=Math.max(minAlong,bhi);
    else if(blo>hit.point[along])maxAlong=Math.min(maxAlong,blo);
    else return fail('protected-prop-on-host',{propId:b.id});
  }
  // Keep anatomy near the acquired gaze after a board, shelf or dado removes
  // the lower wall. Fitting a full-height head and lifting its centre above the
  // player showed only a chin. Shrink uniformly before moving it; the allowed
  // centre interval is at most 25cm from the original eye-height reference.
  const shift=STILLNESS_RECEIVER_LIMITS.maxVerticalShiftM;
  const visibleHeight=Math.max(0,Math.min(top-bottom,2*(acquiredY+shift-bottom),2*(top-acquiredY+shift)));
  const fit=Math.min(1,(maxAlong-minAlong)/widthM,visibleHeight/heightM);
  const width=widthM*fit,height=heightM*fit;
  if(width<STILLNESS_RECEIVER_LIMITS.minWidthM-EPS)return fail('insufficient-width',{availableWidthM:Math.max(0,width)});
  if(height<STILLNESS_RECEIVER_LIMITS.minHeightM-EPS)return fail('insufficient-height',{availableHeightM:Math.max(0,height)});
  const origin=[...hit.point];origin[along]=clamp(origin[along],minAlong+width/2,maxAlong-width/2);
  origin[1]=clamp(acquiredY,bottom+height/2,top-height/2);origin[axis]=hit.planeCoordinate;
  const normal=hit.normal,right=cross([0,1,0],normal),up=[0,1,0],rect=rectangleBounds(origin,right,up,width,height);
  const materialId=base.material;
  return{supported:true,id:`stillness-wall:${renderPlan.key||renderPlan.group||'slice'}:${axis}:${hit.planeCoordinate}:${base.x},${base.z}`,
    origin,right,up,normal,widthM:width,heightM:height,depthM,materialId,material:materialId,zone:base.zone,
    space:'overworld',distanceM:hit.distanceM,
    host:{...rect,planeAxis:axis,planeCoordinate:hit.planeCoordinate,cell:{x:base.x,z:base.z},
      sliceKey:renderPlan.key||null,group:renderPlan.group||null,originX:number(renderPlan.originX,0),originY:number(renderPlan.originY,0),
      materialId,zone:base.zone,floorM:base.floor,ceilingM:base.ceil}};
}

export function resolveStillnessReceivers({renderPlan,camera,profile=0,maxDistanceM=5,widthM=1.4,heightM=1.9,depthM=.20,
  blockedPropAABBs=[],viewRay=false}={}){
  if(profile===1||profile===2)return sourceStillnessReceivers(profile);
  const eye=vector(camera?.eye);
  if(!planReader(renderPlan))return{receivers:[],rejected:[fail('invalid-plan')]};
  if(!validVector(eye))return{receivers:[],rejected:[fail('invalid-camera')]};
  const widthCap=clamp(number(widthM,1.4),.01,1.4),heightCap=clamp(number(heightM,1.9),.01,1.9);
  const fittedWidth=Math.min(widthCap,heightCap*STILLNESS_ANATOMY.widthToHeight);
  const options={renderPlan,camera,widthM:fittedWidth,heightM:fittedWidth/STILLNESS_ANATOMY.widthToHeight,
    depthM:clamp(number(depthM,.20),.001,.35),blockedPropAABBs};
  const yaw=number(camera.yaw,0),pitch=number(camera.pitch,0);
  const rays=viewRay?[[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)]]:[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
  const receivers=[],rejected=[];
  for(const direction of rays){
    const hit=traceStillnessWall({renderPlan,camera,direction,maxDistanceM,blockedPropAABBs});
    const result=hit.supported?receiverAt(hit,options):hit;
    if(result.supported)receivers.push(result);else rejected.push({...result,direction});
  }
  receivers.sort((a,b)=>a.distanceM-b.distanceM);
  return{receivers,rejected};
}

const sourceName=(region,kind,id)=>`source-continuation-${region}-${kind}-${String(id).replace(/[^a-zA-Z0-9_-]/g,'-')}`;
function sourceUvFrame(origin,right,up,normal,metres){
  const uvOrigin=sourcePrintUV(origin,normal,metres),atRight=sourcePrintUV(add(origin,right),normal,metres),atUp=sourcePrintUV(add(origin,up),normal,metres);
  return{uvOrigin,uvRight:atRight.map((v,i)=>v-uvOrigin[i]),uvUp:atUp.map((v,i)=>v-uvOrigin[i])};
}
// Native Source receivers explicitly name the real runtime donor, so the
// renderer clones its complete primitive material/print/UV contract. They do
// not pretend a wood surround is the generic MARCH wall material.
export function sourceStillnessReceivers(profile){
  const receivers=[],rejected=[],margin=.02;
  if(profile===1){
    for(const suffix of['west-north-jamb','west-south-jamb']){
      const solid=SOURCE_REST_ALCOVE_SOLIDS.find(row=>row.id===`rest-alcove-${suffix}`);
      if(!solid)continue;
      const width=solid.maxZ-solid.minZ-margin*2,height=Math.min(width/STILLNESS_ANATOMY.widthToHeight,solid.maxY-solid.minY-margin*2);
      const normal=[1,0,0],up=[0,1,0],right=[0,0,-1];
      const origin=[solid.maxX,solid.minY+(solid.maxY-solid.minY)/2,(solid.minZ+solid.maxZ)/2];
      const host={...rectangleBounds(origin,right,up,width,height),
        availableMin:[solid.maxX,solid.minY+margin,solid.minZ+margin],availableMax:[solid.maxX,solid.maxY-margin,solid.maxZ-margin],
        planeAxis:0,planeCoordinate:solid.maxX,sourceId:solid.id,chartId:solid.chartId,group:'wrong-return'};
      const receiver={id:`stillness-source-ii:${suffix}`,origin,right,up,normal,widthM:width,heightM:height,depthM:.23,
        materialId:solid.material,sourceMaterial:solid.material,donorName:sourceName('wrong-return','solid',solid.id),space:'source-II',host,
        ...sourceUvFrame(origin,right,up,normal,2.8)};
      if(width<STILLNESS_RECEIVER_LIMITS.minWidthM)rejected.push({...receiver,supported:false,reason:'insufficient-width',availableWidthM:width});
      else receivers.push({...receiver,supported:true});
    }
  }else if(profile===2){
    const surfaces=continuationSurfaces({phase:'catch'});
    for(const stage of CONTINUATION_CATCH_STAGES){
      const surface=surfaces.find(row=>row.id===`catch-${stage.level}-${stage.id}`);if(!surface)continue;
      const angle=stage.level===0?Math.atan2(8.3,5.7):stage.refugeAngle;
      const radius=stage.level===0?Math.hypot(5.7,8.3):(stage.innerRadius+stage.outerRadius)/2;
      const origin=[surface.center.x+Math.cos(angle)*radius,stage.y,surface.center.z+Math.sin(angle)*radius];
      const normal=[0,1,0],up=[-Math.cos(angle),0,-Math.sin(angle)],right=cross(up,normal);
      const height=2.2,width=Math.min(1.6,height*STILLNESS_ANATOMY.widthToHeight),rect=rectangleBounds(origin,right,up,width,height);
      // Check an area grid, not only its AABB: annular sectors have a real
      // inner opening, missing wedge and tessellated outer edge.
      let supported=true;
      for(let u=0;u<=4;u++)for(let v=0;v<=4;v++){
        const point=add(add(origin,right,(u/4-.5)*width),up,(v/4-.5)*height);
        if(!continuationSurfaceContains(surface,point[0],point[2],margin))supported=false;
      }
      const receiver={supported,id:`stillness-source-iii:floor-${stage.level}`,origin,right,up,normal,widthM:width,heightM:height,depthM:.20,
        materialId:surface.material,sourceMaterial:surface.material,donorName:sourceName('catch','surface',surface.id),space:'source-III',
        host:{...rect,planeAxis:1,planeCoordinate:stage.y,sourceId:surface.id,chartId:0,level:stage.level,group:'catch'},
        ...sourceUvFrame(origin,right,up,normal,surface.material==='cold-stone'?8:2.8)};
      if(supported)receivers.push(receiver);else rejected.push({...receiver,reason:'outside-receiving-surface'});
    }
  }
  return{receivers,rejected};
}
