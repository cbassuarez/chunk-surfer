// Picking follows the metronome that the ordinary world renderer actually
// draws. This module paints no replacement object, panel or slider.
import {uiSize,uiPhysicalSize,uiText,uiFill} from './ui.js';
import {fitText} from './fit-text.js';
import {cameraBasis} from './camera-basis.js';
import {PRACTICE_METRONOME_SHAPE as C,PRACTICE_METRONOME_PICK_GEOMETRY as PICK,
  practiceMetronomePose,practiceMetronomeTempoAtDistance,practiceMetronomePlacement} from './practice-metronome-model.js';

const number=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const point3=p=>Array.isArray(p)?p:[number(p?.x),number(p?.y),number(p?.z)];
const transform=(m,p)=>({x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]});
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// Pure counterpart for tests. The host supplies r3dProjectWorld in live play,
// including its actual eased eye, active lens and viewport dimensions.
export function projectPracticeMetronomePoint(point,camera={}){
  const eye=point3(camera.eye),p=point3(point),d=p.map((v,i)=>v-eye[i]);
  const basis=cameraBasis(number(camera.yaw),number(camera.pitch)),depth=dot(d,basis.forward);
  if(depth<=.01)return{x:.5,y:.5,depth,visible:false};
  const tan=Math.max(.02,number(camera.tanHalfFov,.95)),aspect=Math.max(.1,number(camera.width,1280)/Math.max(1,number(camera.height,800)));
  const x=dot(d,basis.right)/(depth*tan*aspect),y=dot(d,basis.up)/(depth*tan);
  return{x:(x+1)/2,y:(1-y)/2,depth,visible:Math.abs(x)<=1.08&&Math.abs(y)<=1.08};
}
function inverseAffine(m){
  const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];
  const A=e*i-f*h,B=c*h-b*i,Cc=b*f-c*e,D=f*g-d*i,E=a*i-c*g,F=c*d-a*f,G=d*h-e*g,H=b*g-a*h,I=a*e-b*d;
  const det=a*A+b*D+c*G;if(Math.abs(det)<1e-10)return null;
  const inv=new Float64Array([A/det,D/det,G/det,0,B/det,E/det,H/det,0,Cc/det,F/det,I/det,0,0,0,0,1]);
  inv[12]=-(inv[0]*m[12]+inv[4]*m[13]+inv[8]*m[14]);
  inv[13]=-(inv[1]*m[12]+inv[5]*m[13]+inv[9]*m[14]);
  inv[14]=-(inv[2]*m[12]+inv[6]*m[13]+inv[10]*m[14]);return inv;
}
export function practiceMetronomePointerOnPlane(layout,x,y,z=PICK.weightFrontZ){
  if(!layout.valid||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))return null;
  const camera=layout.camera,basis=cameraBasis(camera.yaw,camera.pitch),eye=point3(camera.eye);
  const aspect=Math.max(.1,camera.width/Math.max(1,camera.height)),tan=camera.tanHalfFov;
  const sx=(2*x/layout.cols-1)*aspect*tan,sy=(1-2*y/layout.rows)*tan;
  const direction=basis.forward.map((n,k)=>n+basis.right[k]*sx+basis.up[k]*sy);
  const inv=layout.inverse,origin=transform(inv,{x:eye[0],y:eye[1],z:eye[2]});
  const local={x:inv[0]*direction[0]+inv[4]*direction[1]+inv[8]*direction[2],
    y:inv[1]*direction[0]+inv[5]*direction[1]+inv[9]*direction[2],z:inv[2]*direction[0]+inv[6]*direction[1]+inv[10]*direction[2]};
  // Back surfaces cannot catch an input through the wooden case.
  if(origin.z>=z||local.z<=1e-8)return null;
  const t=(z-origin.z)/local.z;if(t<=0)return null;
  return{x:origin.x+local.x*t,y:origin.y+local.y*t,z};
}
function bounds(points){
  const p=points.filter(q=>q&&q.depth>.01&&Number.isFinite(q.x)&&Number.isFinite(q.y));
  if(!p.length)return{x:0,y:0,w:0,h:0};
  const x=Math.min(...p.map(q=>q.x)),y=Math.min(...p.map(q=>q.y));
  return{x,y,w:Math.max(...p.map(q=>q.x))-x,h:Math.max(...p.map(q=>q.y))-y};
}
export function practiceMetronomeLayout(size={},state={},options={}){
  const physical=options.physicalSize||size,cols=Math.max(1,number(physical.cols,120)),rows=Math.max(1,number(physical.rows,38));
  const hintCols=Math.max(1,number(size.cols,cols)),hintRows=Math.max(1,number(size.rows,rows));
  const sourceCamera=options.camera||{},camera={...sourceCamera,eye:sourceCamera.eye,
    yaw:number(sourceCamera.yaw),pitch:number(sourceCamera.pitch),tanHalfFov:Math.max(.02,number(sourceCamera.tanHalfFov,.95)),
    width:Math.max(1,number(sourceCamera.width,1280)),height:Math.max(1,number(sourceCamera.height,800))};
  const pose=practiceMetronomePose(state.tempo,state.swing),prop=options.renderProp;
  const matrix=prop?practiceMetronomePlacement(prop):null,inverse=matrix?inverseAffine(matrix):null;
  const eye=Array.isArray(sourceCamera.eye)?sourceCamera.eye:[sourceCamera.eye?.x,sourceCamera.eye?.y,sourceCamera.eye?.z];
  const valid=!!prop&&!!inverse&&eye.every(Number.isFinite),localEye=valid?transform(inverse,{x:eye[0],y:eye[1],z:eye[2]}):null;
  const projectWorld=typeof options.projectWorld==='function'?options.projectWorld:p=>projectPracticeMetronomePoint(p,camera);
  const point=local=>{
    if(!valid)return{x:0,y:0,depth:-1,visible:false};
    const world=transform(matrix,{x:number(local.x),y:number(local.y),z:number(local.z,PICK.weightFrontZ)}),p=projectWorld(world);
    return{x:p.x*cols,y:p.y*rows,depth:p.depth,visible:!!p.visible,world};
  };
  const hinge=(across,along,z)=>({x:Math.cos(pose.angle)*across+Math.sin(pose.angle)*along,
    y:C.pivotY-Math.sin(pose.angle)*across+Math.cos(pose.angle)*along,z});
  const pivot=point({x:0,y:C.pivotY,z:PICK.pivotFrontZ}),tip=point({...pose.tip,z:C.frontZ});
  const pivotBounds=bounds([[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>point({x:x*.014,y:C.pivotY+y*.014,z:PICK.pivotFrontZ})));
  const weightCenter=point({...pose.weight,z:PICK.weightFrontZ});
  const polygon=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>point(hinge(x*C.weightWidth/2,pose.distance+y*C.weightHeight/2,PICK.weightFrontZ)));
  const body=bounds([[-.108,0],[.108,0],[-.045,C.height],[.045,C.height]].map(([x,y])=>point({x,y,z:PICK.caseFrontZ})));
  const closeWidth=Math.min(hintCols<40?5.5:10.5,hintCols-1);
  const l={cols,rows,hintCols,hintRows,camera,matrix,inverse,valid,frontFacing:!!localEye&&localEye.z<PICK.caseFrontZ,pose,point,pivot,pivotBounds,tip,body,
    weight:{...weightCenter,...bounds(polygon),center:weightCenter,polygon,angle:pose.angle},
    close:{x:hintCols<cols-.5||hintRows<rows-.5?1:Math.max(0,hintCols-closeWidth-1),y:Math.max(0,hintRows-2.55),w:closeWidth,h:1.15,label:hintCols<40?'BACK':'STEP BACK'},
    footerY:hintRows-1.23,worldVisibleToY:0};
  // x/y continue to mean the control's centre; bounds remain separately named.
  l.weight.bounds=bounds(polygon);l.weight.x=weightCenter.x;l.weight.y=weightCenter.y;
  l.local=(x,y)=>practiceMetronomePointerOnPlane(l,x,y);return l;
}
const inside=(r,x,y)=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;
export function practiceMetronomeHit(layout,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  if(inside(layout.close,x,y))return{kind:'close'};
  if(!layout.valid)return null;
  const p=practiceMetronomePointerOnPlane(layout,x,y,PICK.weightFrontZ),a=layout.pose.angle;
  if(p){const dy=p.y-C.pivotY,across=p.x*Math.cos(a)-dy*Math.sin(a),along=p.x*Math.sin(a)+dy*Math.cos(a);
    if(Math.abs(across)<=C.weightWidth/2+1e-8&&Math.abs(along-layout.pose.distance)<=C.weightHeight/2+1e-8)return{kind:'weight',distance:along};
  }
  const screw=practiceMetronomePointerOnPlane(layout,x,y,PICK.weightScrewFrontZ);
  if(screw&&Math.hypot(screw.x-layout.pose.weight.x,screw.y-layout.pose.weight.y)<=PICK.weightScrewRadius)return{kind:'weight',distance:layout.pose.distance};
  const pivot=practiceMetronomePointerOnPlane(layout,x,y,PICK.pivotFrontZ);
  if(pivot&&Math.hypot(pivot.x,pivot.y-C.pivotY)<=.014)return{kind:'pendulum'};
  const rod=practiceMetronomePointerOnPlane(layout,x,y,C.frontZ);
  if(rod){const dy=rod.y-C.pivotY,across=rod.x*Math.cos(a)-dy*Math.sin(a),along=rod.x*Math.sin(a)+dy*Math.cos(a);
    if(Math.abs(across)<=PICK.rodPickRadius&&along>=-.016&&along<=C.rodLength+1e-8)return{kind:'pendulum'};
  }return null;
}
export function practiceMetronomeDistanceAtPointer(layout,x,y){
  const p=practiceMetronomePointerOnPlane(layout,x,y);if(!p)return null;
  return p.x*Math.sin(layout.pose.angle)+(p.y-C.pivotY)*Math.cos(layout.pose.angle);
}
export function practiceMetronomeTempoAtPointer(layout,x,y,grabOffset=0){
  const distance=practiceMetronomeDistanceAtPointer(layout,x,y);
  return distance==null?null:practiceMetronomeTempoAtDistance(distance-number(grabOffset));
}
export function practiceMetronomeHintRegions(layout,{focus='weight',footer=''}={}){
  const l=layout,partText=focus==='pendulum'?'pendulum':'weight',anchor=focus==='pendulum'?l.pivot:l.weight.center;
  const control=focus==='pendulum'?l.pivotBounds:l.weight.bounds,w=partText.length+.5;
  let x=control.x+control.w+.8;if(x+w>l.hintCols-.5)x=control.x-w-.8;
  const desiredY=anchor.y-.58,y=Math.max(.2,Math.min(l.hintRows-3.2,desiredY));
  const part=l.valid&&anchor.visible&&x>=.4&&x+w<=l.hintCols-.4&&Math.abs(y-desiredY)<1.5
    ?{x,y,w,h:1.15,text:partText}:null;
  const footerRegion={x:.75,y:l.footerY,w:l.hintCols-1.5,h:1.15};
  const controls=[l.weight.bounds,l.pivotBounds,bounds([l.pivot,l.tip])];
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  if(controls.some(control=>overlaps(footerRegion,control))){
    const left=Math.min(...controls.map(control=>control.x))-.8-footerRegion.x;
    if(left>=8)footerRegion.w=Math.min(footerRegion.w,left);
  }
  const footerText=fitText(footer,Math.max(1,Math.floor(footerRegion.w-.5)));
  return{part,footer:footerText?{...footerRegion,w:Math.min(footerRegion.w,footerText.length+.5),text:footerText}:null,
    close:{...l.close,text:l.close.label}};
}
export function drawPracticeMetronomeHint(region){
  if(!region?.text)return;
  // Only the printed hint's footprint is shaded. The object, its controls and
  // the rest of the room retain their actual acquired light and material.
  uiFill(region.x,region.y,region.w,region.h,'rgba(6,7,9,0.72)');
  uiText(region.x+.25,region.y+.075,region.text,'ui-dim',1,Math.max(1,Math.floor(region.w-.5)));
}
export function drawPracticeMetronome(view={},size=uiSize(),options={}){
  const l=options.layout||practiceMetronomeLayout(size,view,{...options,physicalSize:options.physicalSize||uiPhysicalSize()});
  if(!l.valid||view.closing||number(view.closeupMix,1)<.98)return l;
  drawPracticeMetronomeHint(practiceMetronomeHintRegions(l,{focus:view.focus}).part);return l;
}
