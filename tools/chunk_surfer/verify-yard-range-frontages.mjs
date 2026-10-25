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
export function verifyServicePacked(){
  const propBytes=fs.readFileSync(path.join(root,'public/assets/conservatory-props.glb')),streetBytes=fs.readFileSync(path.join(root,'public/assets/opening-street.glb'));
  const pack=parseGlb(propBytes),street=parseGlb(streetBytes),skin=triangles(street,'opening_street_service_history');
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);PROPS.setColliderGroupEnabled('opening-street',true);PROPS.setColliderGroupEnabled('street-pilot',true);
  const instances=PROPS.renderInstances({inscriptions:false}),skinPose=instances.find(p=>p.mesh==='opening_street_service_history');
  const toWorld=(p,pose)=>{const c=Math.cos(pose.yaw||0),s=Math.sin(pose.yaw||0);return[pose.x+p[0]*c-p[2]*s,pose.y+p[1],pose.z+p[0]*s+p[2]*c];};
  const skinWorld=skin.triangles.map(t=>({...t,points:t.points.map(p=>toWorld(p,skinPose))}));
  const reports=[];
  const stands={stable:[[24,18],[29.5,16]],rehearsal:[[27,34]],baths:[[26,55]],stores:[[28,77]]};
  for(const spec of YARD_RANGE_FRONTAGES){
    const actual=triangles(pack,spec.mesh),range=YARD_SERVICE_RANGES.find(r=>r.id===spec.id),face=-range.w/2,pose=instances.find(p=>p.id===spec.id);
    let allMin=Infinity,newMin=Infinity;const legacy=[];
    for(const triangle of actual.triangles){
      const points=clipY(clipY(triangle.points,0,true),2.05,false);if(!points.length)continue;
      const min=Math.min(...points.map(p=>p[0]));allMin=Math.min(allMin,min);
      if(triangle.material?.startsWith('yard '))newMin=Math.min(newMin,min);
      if(min<face-C.existingBodyCollisionPad-1e-5)legacy.push({material:triangle.material,projection:face-min,triangle:triangle.points});
    }
    const windows=[];
    for(const opening of spec.openings.filter(o=>o.type==='window')){
      const rays=[];
      for(const fy of[.25,.43,.69,.85])for(const fz of[.15,.35,.65,.85]){
        const y=opening.y0+(opening.y1-opening.y0)*fy,z=opening.z-opening.width/2+opening.width*fz;
        const hit=intersections(actual.triangles,y,z,face-.3,face+C.roomDepth+.1)[0]||null;
        rays.push({y,z,firstHitU:hit?hit.x-face:null,material:hit?.material||null,pass:!!hit&&hit.x-face>.35&&hit.x-face<=C.roomDepth+.001});
      }
      windows.push({id:opening.id,pass:rays.every(r=>r.pass),rays});
    }
    const skinDepth=[];
    if(spec.backing){
      const door=spec.acousticDoor||spec.goodsDoor;
      for(const y of[.55,1.65,2.2])for(const offset of[-.30,.30]){
        const z=door.z+offset,local=intersections(actual.triangles,y,z,face-.30,face+.2)[0];
        const target=toWorld([face,y,z],pose),old=intersections(skinWorld,target[1],target[2],target[0]-.4,target[0]+.1)[0];
        const front=local?toWorld([local.x,y,z],pose)[0]:null,separation=old&&front!=null?old.x-front:null;
        skinDepth.push({y,z,worldZ:target[2],frontX:front,backingX:old?.x??null,separation,pass:separation!=null&&separation>.015});
      }
    }
    const inspectionStands=stands[spec.kind].map(([x,z],index)=>{
      const logical=FP.logicalAtPhysical(x*2,z*2,{floor:0}),p=FP.logicalToPhysical(logical.x,logical.y),feet=FP.floorAt(logical.x,logical.y),eye=[(p.x+.5)*.5,feet+1.62,(p.z+.5)*.5];
      const target=[pose.x+face,index===1?1.8:spec.kind==='stable'?3.1:spec.kind==='rehearsal'?2.6:2.5,pose.z+(index===1?-1.9:0)];
      const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2],yaw=Math.atan2(dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz));
      return{id:spec.kind+(index===1?'-window':'-west'),runtimeLogical:{x:logical.x,y:logical.y},authoredLogical:{x:logical.x/2,y:logical.y/2},feet,eye,target,yaw,pitch,
        solid:FP.isSolid(logical.x,logical.y),canOccupy:PROPS.propCanOccupy(logical.x,logical.y),canWalkNorth:!!FP.canStep(logical.x,logical.y,logical.x,logical.y-1,{keys:new Set()}),canWalkSouth:!!FP.canStep(logical.x,logical.y,logical.x,logical.y+1,{keys:new Set()})};
    });
    reports.push({id:spec.id,mesh:spec.mesh,meshSha256:meshFingerprint(pack,actual.mesh),triangles:actual.triangles.length,
      actualPose:pose,windowRays:windows,backingDepthRays:skinDepth,lowerNewMaterialProjection:face-newMin,lowerWholeMeshProjection:face-allMin,
      newGeometryClearancePass:face-newMin<=C.maximumBodyProjection+1e-5,wholeMeshClearancePass:face-allMin<=C.existingBodyCollisionPad+1e-5,
      inheritedOrOtherOutliers:legacy.slice(0,4),outlierTriangles:legacy.length,inspectionStands});
  }
  const checks={actualWindowsOpen:reports.every(r=>r.windowRays.every(w=>w.pass)),newDetailsAheadOfSkins:reports.every(r=>r.backingDepthRays.every(q=>q.pass)),
    newBodyGeometryWithinCollisionPad:reports.every(r=>r.newGeometryClearancePass),wholeMeshesWithinCollisionPad:reports.every(r=>r.wholeMeshClearancePass),
    inspectionStandsClear:reports.every(r=>r.inspectionStands.every(s=>s.canOccupy&&!s.solid&&s.canWalkNorth&&s.canWalkSouth))};
  const pendingFinalPackRefresh=!checks.wholeMeshesWithinCollisionPad&&readFileSyncSafe(path.join(root,'tools/chunk_surfer/build-props.mjs')).includes('face+side*.005');
  return{status:'CPU packed geometry and authored stand proof; final runtime perception pending',pendingFinalPackRefresh,
    limitations:['Camera stands prove ordinary cell/body clearance. The hedge is now trimmed; broad plaza overview acceptance remains subject to current final-dither gameplay inspection.'],
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
