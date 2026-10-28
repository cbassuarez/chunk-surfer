import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDemolitionExcavator} from '../tools/chunk_surfer/demolition-machinery-geometry.mjs';
import {DEMOLITION_EXCAVATOR as C} from '../src/data/demolition-machinery.js';
import {CHURCH_BOUNDS} from '../src/data/st-brendans.js';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {readFileSync} from 'node:fs';
import {exteriorFacadeCanStep,exteriorFacadeCanOccupy} from '../src/world/exterior-facade-collision.js';
import {propMaterialFactors,letteringFinishDescriptor} from '../src/render/prop-material-contract.js';
const fixture=()=>{const materials=[],mesh={name:C.mesh},quads=[],triangles=[];const report=buildDemolitionExcavator({materials,mesh:()=>mesh,addBox(){},addBeam(){},addCylinder(){},addCylinderX(){},addQuad(_m,...v){quads.push(v.slice(0,4));},addTriangle(_m,...v){triangles.push(v.slice(0,3));}});return{report,mesh,materials,quads,triangles};};
function corners(p){
 if(p.points)return p.points;
 if(p.kind==='box'){const out=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){let [a,b,c]=[x,y,z].map((q,i)=>q*p.size[i]/2);const cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),cy=Math.cos(p.yaw),sy=Math.sin(p.yaw),yy=b*cp-c*sp,zz=b*sp+c*cp;out.push([p.center[0]+a*cy-zz*sy,p.center[1]+yy,p.center[2]+a*sy+zz*cy]);}return out;}
 if(p.kind==='beam'){const out=[];for(const q of[p.a,p.b])for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])out.push(q.map((n,i)=>n+[x,y,z][i]*p.width/Math.SQRT2));return out;}
 const out=[];for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])out.push(p.axis==='x'?[p.center[0]+x*p.height/2,p.center[1]+y*p.radius,p.center[2]+z*p.radius]:[p.center[0]+x*p.radius,p.center[1]+y*p.height/2,p.center[2]+z*p.radius]);return out;
}
const area=([a,b,c])=>{const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;};

test('the existing plant has running gear, a genuinely open cab and a curved open bucket at a bounded physical scale',()=>{
 const{report,mesh,materials}=fixture(),parts=report.parts,points=parts.flatMap(corners);
 assert.equal(report.features.trackShoes,64);assert.ok(report.triangles>5000&&report.triangles<C.maximumTriangles);
 assert.equal(parts.filter(p=>/^track-\d-shoe-\d+$/.test(p.id)).length,64);
 assert.equal(parts.filter(p=>/^track-\d-roller--?[\d.]+$/.test(p.id)).length,10);
 assert.ok(parts.some(p=>p.id==='seat-cushion')&&parts.some(p=>p.id==='operator-pedal--0.7'));
 assert.ok(parts.filter(p=>p.id.startsWith('bucket-inner-')).length>=5);
 assert.ok(parts.filter(p=>p.id.startsWith('bucket-tooth-')&&p.id.includes('-top-')).length>=5);
 assert.equal(parts.some(p=>p.kind==='box'&&/cab.*glass|cab-volume|solid-bucket/.test(p.id)),false);
 assert.ok(points.every(p=>p.every(Number.isFinite)));
 const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
 assert.ok(min[1]>=-.006&&min[1]<.02,'tracks/teeth meet the ground rather than floating');
 assert.ok(max[1]>3&&max[1]<3.2,'the held attachment keeps the existing compact exterior scale');
 assert.ok(min[0]>-1.2&&max[0]<1.2&&max[2]-min[2]<5.6);
 assert.equal(mesh.extras.demolitionMachinery.parkedPose,true);
 assert.ok(materials.every(m=>!m.alphaMode&&!m.extensions&&!m.emissiveFactor&&!m.pbrMetallicRoughness.baseColorTexture),'ordinary opaque physical finishes, no glow or billboard');
 assert.ok(new Set(materials.map(m=>m.pbrMetallicRoughness.roughnessFactor)).size>=5,'paint, rubber, grease, steel and chrome respond separately');
 for(const material of materials){const p=material.pbrMetallicRoughness,factors=propMaterialFactors({roughness:p.roughnessFactor,metallic:p.metallicFactor,semantics:material.extras?.materialFactors});
  assert.equal(factors.roughness,p.roughnessFactor,'new finishes must not inherit the legacy squared roughness conversion');
  assert.equal(factors.metallic,p.metallicFactor);assert.equal(factors.legacyUnmapped,false);
  assert.equal(letteringFinishDescriptor(material.extras?.letteringFinish)?.localSpecular,true,'the scoped finishes use the approved physical local-light response');
 }
});

test('the finite authored mesh is deterministic with nondegenerate bucket, belts, shell sections and hydraulic cylinders',()=>{
 const a=fixture(),b=fixture();assert.deepEqual(a.report,b.report);assert.deepEqual(a.materials,b.materials);
 for(const t of a.triangles)assert.ok(area(t)>1e-10,'no collapsed cap/plate fan');
 for(const q of a.quads){assert.ok(area(q.slice(0,3))>1e-10);assert.ok(area([q[0],q[2],q[3]])>1e-10);}
 const rods=a.report.parts.filter(p=>p.material==='chrome');assert.ok(rods.length>=72,'all three actual rams have cylindrical exposed piston surfaces');
 assert.ok(a.report.parts.filter(p=>p.id.startsWith('hydraulic-hose-')).length>30,'retained hydraulic paths connect the mechanical joints');
});

test('the complete parked shape clears the real cathedral/tower envelope and its public approach',()=>{
 const{report}=fixture(),p=C.placement,c=Math.cos(p.yaw),s=Math.sin(p.yaw),world=report.parts.flatMap(corners).map(([x,y,z])=>({x:p.x+x*c-z*s,y,z:p.z+x*s+z*c}));
 for(const v of world){assert.ok(v.x>CHURCH_BOUNDS.x1+3,'machine and attachment stay well beyond actual stone/buttress envelope');assert.ok(v.x>C.pedestrianLane.x1+.65,'not merely the root but every part clears the walking band');}
 const authored=CONSERVATORY_PROPS.find(v=>v.id===C.id);assert.ok(authored?.blocks);
 assert.equal(authored.x,p.x+50);assert.equal(authored.y,p.z+200);assert.equal(authored.yaw,p.yaw);
 assert.equal(PROP_MESH[C.mesh].w,C.baseCollision.width);assert.equal(PROP_MESH[C.mesh].d,C.baseCollision.depth);
 FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP,[authored]);
 const at=(x,z)=>{const v=FP.logicalAtPhysical(x*2-.5,z*2-.5,{group:'ground',floor:0});assert.ok(v);return v;};
 let previous=at(27.5,58.5);
 for(let z=59;z<=76;z+=.5){const next=at(27.5,z);assert.equal(FP.canStep(previous.x,previous.y,next.x,next.y,{keys:new Set()}).ok,true);assert.equal(PROPS.propCanOccupy(next.x,next.y,{from:previous}),true,'ordinary person can pass between the cathedral and parked plant');previous=next;}
 const body=at(p.x,p.z);assert.equal(PROPS.propCanOccupy(body.x,body.y),false,'the parked undercarriage remains a real blocking body');
});

test('the installed attachment has exact surface collision while empty space below the raised boom stays usable',()=>{
 const bytes=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url));
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),mesh=json.meshes.find(m=>m.name===C.mesh);
 assert.equal(mesh?.extras?.demolitionMachinery?.revision,C.revision,'install the explicit candidate mesh before claiming packed contact acceptance');
 const pose={id:C.id,mesh:C.mesh,x:C.placement.x,y:0,z:C.placement.z,yaw:C.placement.yaw,scale:1},c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
 const world=(x,z)=>({x:pose.x+x*c-z*s,z:pose.z+x*s+z*c,feet:0});
 const bucket=exteriorFacadeCanStep({from:world(1.1,-3.3),to:world(.20,-3.3),height:1.7,radius:.20,stepUp:.45},[pose]);
 assert.equal(bucket.ok,false,'the actual curved bucket side blocks a normal body outside the tracked-base box');
 const belowBoom=exteriorFacadeCanOccupy({...world(.20,-2.3),height:1.7,radius:.20},[pose],{stepUp:.45});
 assert.equal(belowBoom.ok,true,'do not replace the whole attachment envelope with an invisible floor-to-boom wall');
});
