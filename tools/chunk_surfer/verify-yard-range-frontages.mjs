// Read-only packed-geometry proof. No renderer, browser, microphone or asset
// writes. Output is a diagnostic receipt for the exact currently baked meshes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGlb,meshFingerprint} from './rebuild-tree-crowns.mjs';
import {readExteriorAccessor} from './build-exterior-collision.mjs';
import {YARD_RANGE_FRONTAGES,YARD_RANGE_FRONTAGE_CONTRACT as C} from '../../src/data/yard-range-frontages.js';
import {YARD_SERVICE_RANGES} from '../../src/data/exterior-district.js';
import * as FP from '../../src/world/floorplan.js';
import * as PROPS from '../../src/game/props.js';
import {conservatory} from '../../src/data/floorplan/conservatory.js';
import {yardPublicRoomForRange,yardRangePublicUse} from '../../src/data/yard-public-rooms.js';
import {yardTurnPoint} from '../../src/data/yard-turn.js';
import {exteriorFacadeCanOccupy} from '../../src/world/exterior-facade-collision.js';
import {EXTERIOR_PUB,pubExteriorAt} from '../../src/data/exterior-pub.js';
import {ZONE} from '../../src/data/floorplan/legend.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function triangles(pack,name){
  const index=pack.json.meshes.findIndex(m=>m.name===name),mesh=pack.json.meshes[index];if(!mesh)throw Error(`Missing packed mesh ${name}`);
  for(const node of pack.json.nodes.filter(n=>n.mesh===index))if(node.translation||node.rotation||node.scale||node.matrix)throw Error(`${name}: unexpected source-node transform`);
  const result=[];
  for(const primitive of mesh.primitives){const positions=readExteriorAccessor(pack,primitive.attributes.POSITION),indices=readExteriorAccessor(pack,primitive.indices).flat(),material=pack.json.materials[primitive.material]?.name;
    for(let i=0;i<indices.length;i+=3)result.push({points:indices.slice(i,i+3).map(n=>positions[n]),material});
  }
  return{mesh,triangles:result};
}
function clipY(polygon,y,above){
  const result=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],ia=above?a[1]>=y:a[1]<=y,ib=above?b[1]>=y:b[1]<=y;
    if(ia)result.push(a);if(ia!==ib){const t=(y-a[1])/(b[1]-a[1]);result.push(a.map((v,k)=>v+(b[k]-v)*t));}
  }
  return result;
}
function hitX(triangle,y,z){
  const[a,b,c]=triangle.points,den=(b[1]-c[1])*(a[2]-c[2])+(c[2]-b[2])*(a[1]-c[1]);if(Math.abs(den)<1e-9)return null;
  const u=((b[1]-c[1])*(z-c[2])+(c[2]-b[2])*(y-c[1]))/den,v=((c[1]-a[1])*(z-c[2])+(a[2]-c[2])*(y-c[1]))/den;
  if(u<-.000001||v<-.000001||u+v>1.000001)return null;
  return u*a[0]+v*b[0]+(1-u-v)*c[0];
}
const intersections=(mesh,y,z,x0,x1)=>mesh.flatMap(tri=>{const x=hitX(tri,y,z);return x!=null&&x>=x0-1e-6&&x<=x1+1e-6?[{x,material:tri.material}]:[];}).sort((a,b)=>a.x-b.x);
function segmentHit(a,b,triangle){
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const[v0,v1,v2]=triangle,d=sub(b,a),e1=sub(v1,v0),e2=sub(v2,v0),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return null;
  const s=sub(a,v0),u=dot(s,h)/det;if(u<0||u>1)return null;const q=cross(s,e1),v=dot(d,q)/det;if(v<0||u+v>1)return null;
  const t=dot(e2,q)/det;return t>1e-6&&t<1-1e-6?t:null;
}
export function verifyServicePacked(){
  const propBytes=fs.readFileSync(path.join(root,'public/assets/conservatory-props.glb')),streetBytes=fs.readFileSync(path.join(root,'public/assets/opening-street.glb'));
  const pack=parseGlb(propBytes),street=parseGlb(streetBytes),skin=triangles(street,'opening_street_service_history');
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);PROPS.setColliderGroupEnabled('opening-street',true);PROPS.setColliderGroupEnabled('street-pilot',true);
  const instances=PROPS.renderInstances({inscriptions:false}),skinPose=instances.find(p=>p.mesh==='opening_street_service_history');
  const toWorld=(p,pose)=>{const c=Math.cos(pose.yaw||0),s=Math.sin(pose.yaw||0),scale=pose.scale||1,x=p[0]*scale*(pose.scaleX??1),y=p[1]*scale*(pose.scaleY??1),z=p[2]*scale*(pose.scaleZ??1);return[pose.x+x*c-z*s,pose.y+y,pose.z+x*s+z*c];};
  const toLocal=(p,pose)=>{const c=Math.cos(pose.yaw||0),s=Math.sin(pose.yaw||0),x=p[0]-pose.x,z=p[2]-pose.z,scale=pose.scale||1;return[(x*c+z*s)/(scale*(pose.scaleX??1)),(p[1]-pose.y)/(scale*(pose.scaleY??1)),(-x*s+z*c)/(scale*(pose.scaleZ??1))];};
  const skinWorld=skin.triangles.map(t=>({...t,points:t.points.map(p=>toWorld(p,skinPose))}));
  const occluderMeshes=new Map();
  const yardOccluders=instances.filter(p=>p.id.startsWith('yard-')||p.id.startsWith('arrival-')||p.id.startsWith('pub-complete-')||p.mesh.startsWith('opening_street_')).flatMap(p=>{
    let local=occluderMeshes.get(p.mesh);
    if(!local){const source=pack.json.meshes.some(m=>m.name===p.mesh)?pack:street.json.meshes.some(m=>m.name===p.mesh)?street:null;if(!source)return[];local=triangles(source,p.mesh).triangles;occluderMeshes.set(p.mesh,local);}
    return[{id:p.id,triangles:local.map(t=>t.points.map(q=>toWorld(q,p)))}];
  });
  const reports=[];
  const stands={stable:[[29,20.5],[29.5,16]],rehearsal:[[27,35.5]],baths:[[26,55]],stores:[[28,77]]};
  for(const spec of YARD_RANGE_FRONTAGES){
    const actual=triangles(pack,spec.mesh),range=YARD_SERVICE_RANGES.find(r=>r.id===spec.id),face=-range.w/2,pose=instances.find(p=>p.id===spec.id);
    const publicRoom=yardPublicRoomForRange(spec.id),publicUse=yardRangePublicUse(spec.id),roomPose=publicRoom&&instances.find(p=>p.id===publicRoom.id+'-room');
    const windowGeometry=[...actual.triangles,...(roomPose?triangles(pack,roomPose.mesh).triangles.map(t=>({...t,points:t.points.map(p=>toLocal(toWorld(p,roomPose),pose))})):[])];
    const roomDepth=publicRoom?publicRoom.bounds.x1-publicRoom.bounds.x0:C.roomDepth;
    const collisionCoverage=[];
    let allMin=Infinity,newMin=Infinity;const legacy=[];
    for(const triangle of actual.triangles){
      const points=clipY(clipY(triangle.points,0,true),2.05,false);if(!points.length)continue;
      const min=Math.min(...points.map(p=>p[0]));allMin=Math.min(allMin,min);
      if(triangle.material?.startsWith('yard '))newMin=Math.min(newMin,min);
      if(min<face-(publicRoom?C.maximumBodyProjection:C.existingBodyCollisionPad)-1e-5){
        legacy.push({material:triangle.material,projection:face-min,triangle:triangle.points});
        const centre=[0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length),world=toWorld(centre,pose);
        const aboveBody=points.every(p=>p[1]>=1.7);
        collisionCoverage.push({material:triangle.material,point:world,aboveBody,
          covered:aboveBody||!exteriorFacadeCanOccupy({x:world[0],z:world[2],feet:0,height:1.7,radius:.20},[pose]).ok});
      }
    }
    const windows=[];
    for(const opening of spec.openings.filter(o=>o.type==='window')){
      const rays=[];
      for(const fy of[.25,.43,.69,.85])for(const fz of[.15,.35,.65,.85]){
        const y=opening.y0+(opening.y1-opening.y0)*fy,z=opening.z-opening.width/2+opening.width*fz;
        const hit=intersections(windowGeometry,y,z,face-.35,face+roomDepth+.1)[0]||null;
        rays.push({y,z,firstHitU:hit?hit.x-face:null,material:hit?.material||null,pass:!!hit&&hit.x-face>.35&&hit.x-face<=roomDepth+.001});
      }
      windows.push({id:opening.id,pass:rays.every(r=>r.pass),rays});
    }
    const skinDepth=[];
    if(spec.backing&&!publicUse){
      const door=spec.acousticDoor||spec.goodsDoor;
      for(const y of[.55,1.65,2.2])for(const offset of[-.30,.30]){
        const z=door.z+offset,local=intersections(actual.triangles,y,z,face-.30,face+.2)[0];
        const localSkin=skinWorld.map(t=>({...t,points:t.points.map(p=>toLocal(p,pose))}));
        const old=intersections(localSkin,y,z,face-.4,face+.1)[0];
        const separation=old&&local?old.x-local.x:null;
        skinDepth.push({y,z,frontLocalX:local?.x??null,backingLocalX:old?.x??null,separation,pass:separation!=null&&separation>.015});
      }
    }
    const runtimeDoorProofs=[];
    if(spec.backing&&publicUse){
      const doors=publicRoom?[publicRoom.entrance]:EXTERIOR_PUB.doors;
      const frontage=publicUse==='lyric'?instances.find(p=>p.id==='pub-complete-frontage'):null;
      const shellWorld=[...actual.triangles.map(t=>({...t,points:t.points.map(p=>toWorld(p,pose))})),...(frontage?triangles(pack,frontage.mesh).triangles.map(t=>({...t,points:t.points.map(p=>toWorld(p,frontage))})):[])];
      for(const door of doors){
        const sourceStand=publicRoom?{x:publicRoom.bounds.x0-.75,z:door.z+.25}:pubExteriorAt(door.id);
        const stand=yardTurnPoint(spec.id,sourceStand),logical=FP.logicalAtPhysical(stand.x*2-.5,stand.z*2-.5,{group:'ground',floor:0});
        const origin=yardTurnPoint(spec.id,{x:0,z:0}),normalPoint=yardTurnPoint(spec.id,publicRoom?{x:1,z:0}:{x:0,z:1});
        const normal=[normalPoint.x-origin.x,normalPoint.z-origin.z],start={x:logical.x,y:logical.y};
        const request=p=>{const a=FP.logicalToPhysical(p.x,p.y),yaw=FP.arcYawOffset(p.x,p.y,a.x+.5,a.z+.5),c=Math.cos(yaw),s=Math.sin(yaw);return{x:p.x+Math.round(normal[0]*c+normal[1]*s),y:p.y+Math.round(-normal[0]*s+normal[1]*c)};};
        const original=FP.doorState().find(p=>p.id===door.id)?.open;FP.setDoorOpen(door.id,false);
        let p={...start},closedReason=null,closedAt=null;
        for(let n=0;n<7;n++){const q=request(p),step=FP.canStep(p.x,p.y,q.x,q.y,{keys:new Set()});if(!step.ok){closedReason=step.why;closedAt={...p};break;}const to=step.redirect||q;if(!PROPS.propCanOccupy(to.x,to.y,{from:p})){closedReason='prop';break;}p=to;}
        FP.setDoorOpen(door.id,true);p={...start};let openedPassageClear=true;
        for(let n=0;n<(publicRoom?7:4);n++){const q=request(p),step=FP.canStep(p.x,p.y,q.x,q.y,{keys:new Set()});if(!step.ok){openedPassageClear=false;break;}const to=step.redirect||q;if(!PROPS.propCanOccupy(to.x,to.y,{from:p})){openedPassageClear=false;break;}p=to;}
        openedPassageClear&&=FP.zoneAt(p.x,p.y)===(publicRoom?publicRoom.zone:ZONE.pub);
        FP.setDoorOpen(door.id,original);
        const rays=[];
        for(const offset of[-.30,0,.30])for(const y of[.45,1.15,1.75]){
          const sourceA=publicRoom?[publicRoom.bounds.x0-.9,y,door.z+offset]:[door.x+offset,y,EXTERIOR_PUB.frontWorldZ-1.55];
          const sourceB=publicRoom?[publicRoom.bounds.x0+1.1,y,door.z+offset]:[door.x+offset,y,EXTERIOR_PUB.frontWorldZ+1.05];
          const world=p=>{const q=yardTurnPoint(spec.id,{x:p[0],z:p[2]});return[q.x,p[1],q.z];};
          const a=world(sourceA),b=world(sourceB);rays.push({a,b,pass:!shellWorld.some(t=>segmentHit(a,b,t.points)!==null)});
        }
        runtimeDoorProofs.push({id:door.id,closedReason,closedAt,openedPassageClear,packedOpeningClear:rays.every(r=>r.pass),rays,
          pass:closedReason==='closed'&&openedPassageClear&&rays.every(r=>r.pass)});
      }
    }
    const inspectionStands=stands[spec.kind].map(([x,z],index)=>{
      const stand=yardTurnPoint(spec.id,{x,z}),logical=FP.logicalAtPhysical(stand.x*2,stand.z*2,{floor:0}),p=FP.logicalToPhysical(logical.x,logical.y),feet=FP.floorAt(logical.x,logical.y),eye=[(p.x+.5)*.5,feet+1.62,(p.z+.5)*.5];
      const target=toWorld([face,index===1?1.8:spec.kind==='stable'?3.1:spec.kind==='rehearsal'?2.6:2.5,index===1?-1.9:0],pose);
      const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2],yaw=Math.atan2(dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
      let firstHit=null;
      for(const object of yardOccluders)for(const triangle of object.triangles){const t=segmentHit(eye,target,triangle);if(t!==null&&(!firstHit||t<firstHit.t))firstHit={id:object.id,t};}
      return{id:spec.kind+(index===1?'-window':'-west'),runtimeLogical:{x:logical.x,y:logical.y},authoredLogical:{x:logical.x/2,y:logical.y/2},feet,eye,target,yaw,pitch,
        firstHit,lineClear:!firstHit||firstHit.id===spec.id&&firstHit.t>.90,
        solid:FP.isSolid(logical.x,logical.y),canOccupy:PROPS.propCanOccupy(logical.x,logical.y),canWalkNorth:!!FP.canStep(logical.x,logical.y,logical.x,logical.y-1,{keys:new Set()}),canWalkSouth:!!FP.canStep(logical.x,logical.y,logical.x,logical.y+1,{keys:new Set()})};
    });
    reports.push({id:spec.id,mesh:spec.mesh,meshSha256:meshFingerprint(pack,actual.mesh),triangles:actual.triangles.length,
      actualPose:pose,windowRays:windows,backingDepthRays:skinDepth,runtimeDoorProofs,lowerNewMaterialProjection:face-newMin,lowerWholeMeshProjection:face-allMin,
      newGeometryClearancePass:face-newMin<=C.maximumBodyProjection+1e-5,wholeMeshClearancePass:face-allMin<=C.existingBodyCollisionPad+1e-5,
      publicRoom:publicRoom?.id||null,roomDepth,collisionCoverage,
      newGeometryBodyCovered:publicRoom?collisionCoverage.every(p=>p.covered):face-newMin<=C.maximumBodyProjection+1e-5,
      wholeMeshBodyCovered:publicRoom?collisionCoverage.every(p=>p.covered):face-allMin<=C.existingBodyCollisionPad+1e-5,
      inheritedOrOtherOutliers:legacy.slice(0,4),outlierTriangles:legacy.length,inspectionStands});
  }
  const checks={actualWindowsOpen:reports.every(r=>r.windowRays.every(w=>w.pass)),newDetailsAheadOfSkins:reports.every(r=>r.backingDepthRays.every(q=>q.pass)),convertedDoorwaysAccountable:reports.every(r=>r.runtimeDoorProofs.every(q=>q.pass)),
    newBodyGeometryWithinCollisionPad:reports.every(r=>r.newGeometryClearancePass),wholeMeshesWithinCollisionPad:reports.every(r=>r.wholeMeshClearancePass),
    newBodyGeometryCoveredByCollision:reports.every(r=>r.newGeometryBodyCovered),wholeMeshBodyGeometryCoveredByCollision:reports.every(r=>r.wholeMeshBodyCovered),
    inspectionStandsClear:reports.every(r=>r.inspectionStands.every(s=>s.canOccupy&&!s.solid&&s.canWalkNorth&&s.canWalkSouth&&s.lineClear))};
  const pendingFinalPackRefresh=!checks.wholeMeshBodyGeometryCoveredByCollision&&readFileSyncSafe(path.join(root,'tools/chunk_surfer/build-props.mjs')).includes('face+side*.005');
  return{status:'CPU packed geometry and authored stand proof; final runtime perception pending',pendingFinalPackRefresh,
    limitations:['Camera stands prove ordinary cell/body clearance and selected actual packed yard, arrival, pub and opening-street occlusion. Runtime actors and full final-dither perception remain unverified.'],
    sources:{props:{path:'public/assets/conservatory-props.glb',sha256:sha(propBytes)},openingStreet:{path:'public/assets/opening-street.glb',sha256:sha(streetBytes)}},checks,reports};
}
function readFileSyncSafe(file){return fs.readFileSync(file,'utf8');}
export function writeServicePackedReceipt(){
  const result=verifyServicePacked(),out=path.join(root,'artifacts/arrival-court-realignment/service-packed-proof.json');
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({checks:result.checks,reports:result.reports.map(r=>({id:r.id,triangles:r.triangles,newProjection:r.lowerNewMaterialProjection,wholeProjection:r.lowerWholeMeshProjection,windowRays:r.windowRays.flatMap(w=>w.rays).length,stands:r.inspectionStands}))},null,2));
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))writeServicePackedReceipt();
