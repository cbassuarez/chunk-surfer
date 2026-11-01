import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_EARTHFALL as C,sourceEarthfallCellLayout,sourceEarthfallReleasePlan,sourceEarthfallControlledDrop,sourceEarthfallFracturePose,sourceEarthfallPoint,sourceEarthfallBodyContacts,sourceEarthfallStructuralLayout,sourceEarthfallStructuralPose} from '../src/data/source-earthfall.js';
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
        return transform(prop.matrix,local);
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

// Aperture percentages remain diagnostic measurements, not a demand that all
// mass evacuates a convenient shaft. The former>80%clear-ray test rewarded
// the exact unsupported chute that this study is intended to remove.
test('cap loads connect to actual ribs before either bond releases',()=>{
 const structure=sourceEarthfallStructuralLayout(),members=new Map(structure.map(m=>[m.id,m]));
 for(const cell of cells){
  const plan=sourceEarthfallReleasePlan(cell.index,cell.center);
  assert.equal(plan.hostSupports.length,2);
  for(const id of plan.hostSupports){const host=members.get(id);assert.ok(host,`missing host ${id}`);assert.ok(plan.releaseAt>host.failureAt,'a cap cannot detach before its connected rib bond fails');}
  for(const elapsed of[0,1,2]){
   const pose=sourceEarthfallFracturePose(cell.index,elapsed,cell.center);
   for(const id of plan.hostSupports){const host=members.get(id),support=sourceEarthfallStructuralPose(host,elapsed);assert.ok(Math.abs(pose.y-cell.depth-(support.y+host.size.y/2))<1e-7,'an intact cap must contact the actual supporting rib top');}
  }
 }
});

test('settled middle ribs meet their ledges with actual rotated corners',()=>{
 for(const member of sourceEarthfallStructuralLayout().filter(m=>m.type==='rib'&&!m.retainedSide))for(const elapsed of[C.footingLossAt+3,C.footingLossAt+7,25]){
  const pose=sourceEarthfallStructuralPose(member,elapsed),corners=[];
  for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])corners.push(sourceEarthfallPoint(pose,[member.center.x+x*member.size.x/2,member.center.y+y*member.size.y/2,member.center.z+z*member.size.z/2],member.center));
  const lowest=Math.min(...corners.map(p=>p[1]));assert.ok(Math.abs(lowest-92.65)<1e-8,`rotated ${member.id} floats or embeds by ${lowest-92.65}m`);
 }
});

test('the default controlled body has no cap, rib, bearing or ledge penetration at120Hz',t=>{
 let state=freshSourceEarthfall({runId:'physical-contact-proof'}),ticks=0,loss=null,maximum=0,contacts=0;
 while(!state.committed)state=stepSourceEarthfall(state,{dt:C.fixedStep,forward:1}).state;
 while(state.phase!=='landed'&&ticks++<1800){
  const result=stepSourceEarthfall(state,{dt:C.fixedStep});state=result.state;
  if(result.events.some(e=>e.type==='footing-loss')){assert.equal(state.phase,'falling');loss={elapsed:state.elapsed,feet:state.feet};}
  maximum=Math.max(maximum,...sourceEarthfallBodyContacts(state,state.elapsed).map(c=>c.penetration),0);contacts+=state.contactCount;
 }
 assert.equal(state.phase,'landed');assert.ok(loss&&loss.feet>97&&loss.feet<100,'the local support must be lost before the deep fall');
 assert.ok(contacts>0,'the collision test must actually exercise debris contacts');
 assert.ok(maximum<1e-5,`capsule remains inside physical material by ${maximum}m`);
 t.diagnostic(JSON.stringify({ticks,footingLoss:loss,contactResolutions:contacts,residualPenetration:maximum,landed:{x:state.x,z:state.z,feet:state.feet}}));
});

test('fragment volume remains rigid and shallow mass remains after the body falls below it',()=>{
 for(const cell of cells){
  const initial=sourceEarthfallFracturePose(cell.index,0,cell.center),after=sourceEarthfallFracturePose(cell.index,10,cell.center);
  const corners=[...cell.points,...cell.points.map(p=>[p[0],p[1]-cell.depth,p[2]])];
  const a=corners.map(p=>sourceEarthfallPoint(initial,p,cell.center)),b=corners.map(p=>sourceEarthfallPoint(after,p,cell.center));
  for(let i=1;i<corners.length;i++)assert.ok(Math.abs(Math.hypot(...a[i].map((v,k)=>v-a[0][k]))-Math.hypot(...b[i].map((v,k)=>v-b[0][k])))<1e-9,'a fragment cannot shrink to fake clearance');
  assert.ok(after.y>85,'debris must not accelerate down and disappear below the player');
 }
});

test('actual uploaded material keeps the data rigid transform used for collision',()=>{
 for(const elapsed of[0,2,3.4,4,5.5,10]){
  const state={...freshSourceEarthfall({runId:'uploaded-proof'}),committed:true,committedAt:0,clock:elapsed,elapsed,phase:elapsed<3?'fracturing':'falling'};
  const frame=sourceEarthfallRenderFrame(state);
  for(const prop of frame.props.filter(p=>p.earthfallRole==='earth')){
   const cell=cells[prop.cell],payload=payloads.get(prop.mesh),pose=sourceEarthfallFracturePose(cell.index,elapsed,cell.center);
   for(const point of cell.points){
    const uploaded=transform(prop.matrix,point.map((v,k)=>v-payload.bounds.center[k])),physical=sourceEarthfallPoint(pose,point,cell.center);
    assert.ok(uploaded.every((v,k)=>Math.abs(v-physical[k])<2e-5),'GPU and collision disagree about a real cap corner');
   }
  }
 }
});
