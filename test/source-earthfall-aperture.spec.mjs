import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_EARTHFALL as C,sourceEarthfallCellLayout,sourceEarthfallReleasePlan,sourceEarthfallControlledDrop} from '../src/data/source-earthfall.js';
import {freshSourceEarthfall,stepSourceEarthfall} from '../src/game/source-earthfall.js';
import {sourceEarthfallGeometry,sourceEarthfallRenderFrame} from '../src/render/source-earthfall-renderer.js';
import {sourceContinuationMeshPayload} from '../src/render/source-continuation-renderer.js';

const cells=sourceEarthfallCellLayout();
const payloads=new Map(sourceEarthfallGeometry().filter(p=>p.kind==='earth').map(p=>[p.name,sourceContinuationMeshPayload(p)]));
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const packedTriangle=([a,b,c])=>[...a,...b.map((v,k)=>v-a[k]),...c.map((v,k)=>v-a[k])];
function blocks(origin,direction,t){
  const [dx,dy,dz]=direction,px=dy*t[8]-dz*t[7],py=dz*t[6]-dx*t[8],pz=dx*t[7]-dy*t[6];
  const det=t[3]*px+t[4]*py+t[5]*pz;if(Math.abs(det)<1e-10)return false;
  const inv=1/det,tx=origin[0]-t[0],ty=origin[1]-t[1],tz=origin[2]-t[2],u=(tx*px+ty*py+tz*pz)*inv;
  if(u<0||u>1)return false;
  const qx=ty*t[5]-tz*t[4],qy=tz*t[3]-tx*t[5],qz=tx*t[4]-ty*t[3],v=(dx*qx+dy*qy+dz*qz)*inv;
  if(v<0||u+v>1)return false;
  const f=(t[6]*qx+t[7]*qy+t[8]*qz)*inv;return f>1e-6&&f<1-1e-6;
}
function uploadedEarth(frame,legacy=false){
  const top=[],all=[];
  for(const prop of frame.props.filter(p=>p.earthfallRole==='earth')){
    const payload=payloads.get(prop.mesh),cell=cells[prop.cell];
    for(let i=0;i<payload.positions.length;i+=9){
      const points=[0,1,2].map(k=>{
        const local=[...payload.positions.slice(i+k*3,i+k*3+3)];
        return legacy?legacyPoint(cell,local.map((v,a)=>v+payload.bounds.center[a]),frame.source.elapsed):transform(prop.matrix,local);
      });
      const triangle=packedTriangle(points);all.push(triangle);if(payload.normals[i+1]>.99)top.push(triangle);
    }
  }
  assert.equal(top.length,240);assert.equal(all.length,1440);return{top,all};
}
function stateAt(elapsed,moving){
  let state=freshSourceEarthfall({runId:'aperture-proof'});
  while(!state.committed)state=stepSourceEarthfall(state,{dt:C.fixedStep,forward:1}).state;
  while(state.elapsed+1e-7<elapsed)state=stepSourceEarthfall(state,{dt:Math.min(C.fixedStep,elapsed-state.elapsed),forward:moving?1:0}).state;
  return state;
}
const targets=targetY=>Array.from({length:21},(_,i)=>(i-10)*.65).flatMap(x=>Array.from({length:59},(_,i)=>[x,targetY,-44+i*.75]));
export function earthfallApertureProbe({age,moving=false,reduced=false,legacy=false}){
  const state=stateAt(C.footingLossAt+age,moving),frame=sourceEarthfallRenderFrame(state,{reducedMotion:reduced}),triangles=uploadedEarth(frame,legacy);
  const origin=frame.authoredCamera.eye,points=targets(frame.source.catchSurfaceY+.004),clear=kind=>points.filter(target=>{
    const direction=target.map((v,k)=>v-origin[k]);return !triangles[kind].some(t=>blocks(origin,direction,t));
  }).length;
  const down=[0,frame.source.catchSurfaceY+.004-origin[1],0];
  return{age,moving,reduced,legacy,eye:origin,feet:state.feet,samples:points.length,clearTop:clear('top'),clearAll:clear('all'),directDownClear:!triangles.all.some(t=>blocks(origin,down,t))};
}

// Retain the failed inward-gather bank as a CPU-only mutation fixture. These
// are its original finite centre-pivot poses, applied to the SAME current GPU
// triangle payload. It separated shared edges but left the entire path covered.
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const oldHash=(index,salt)=>{let n=Math.imul(index+71,0x45d9f3b)^Math.imul(salt+13,0x27d4eb2d);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
function legacyPoint(cell,point,elapsed){
  const plan=sourceEarthfallReleasePlan(cell.index,cell.center),age=Math.max(0,elapsed-plan.releaseAt),fold=smooth(age/.8),gather=smooth(age/2.6),x=cell.center.x,z=cell.center.z;
  const dx=Math.sign(-x),dz=Math.sign(-21-z),pitch=dz*.028*fold,roll=-dx*(x<0?.16:.13)*fold,yaw=(oldHash(cell.index,8)-.5)*.016*fold;
  const px=point[0]-x,py=point[1]-100,pz=point[2]-z,a=Math.cos(pitch),b=Math.sin(pitch),c=Math.cos(roll),d=Math.sin(roll);
  const u=c*px-d*a*py+d*b*pz,v=d*px+c*a*py-c*b*pz,w=b*py+a*pz;
  return[x+dx*Math.min(Math.abs(x)*.12,1.4)*gather+Math.cos(yaw)*u+Math.sin(yaw)*w,
    100-sourceEarthfallControlledDrop(elapsed,plan.releaseAt,180,plan.departureSpeed)+v,
    z+dz*Math.min(Math.abs(-21-z)*.04,.45)*gather-Math.sin(yaw)*u+Math.cos(yaw)*w];
}

for(const moving of[false,true])test(`actual uploaded fragments reveal the lower path from the ${moving?'forward-moving':'stopped'} body instead of cofalling as a continuous field`,t=>{
  for(const age of[.6,1.5,3])for(const reduced of[false,true]){
    const probe=earthfallApertureProbe({age,moving,reduced});t.diagnostic(JSON.stringify(probe));
    assert.ok(probe.clearTop/probe.samples>.8,'the top field still blankets the view of the existing lower path');
    assert.ok(probe.clearAll/probe.samples>.8,'fragment sides still occlude the intended path aperture');
    assert.equal(probe.directDownClear,true,'the player must see real underfoot depth through the opened slot');
  }
});

test('the path-aperture criterion rejects the prior inward bank despite its separated pivots and edges',t=>{
  for(const moving of[false,true]){
    const failed=earthfallApertureProbe({age:1.5,moving,legacy:true});t.diagnostic(JSON.stringify(failed));
    assert.equal(failed.clearTop,0);assert.equal(failed.clearAll,0);assert.equal(failed.directDownClear,false);
    const corrected=earthfallApertureProbe({age:1.5,moving});assert.ok(corrected.clearAll/corrected.samples>.8);
  }
});
