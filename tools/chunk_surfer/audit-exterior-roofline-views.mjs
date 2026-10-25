// CPU qualification for native roofline cameras. A successful screenshot is
// meaningless if its diagnostic fixture put the eye inside a solid outbuilding.
import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{fileURLToPath}from'node:url';
import*as FP from'../../src/world/floorplan.js';import*as PROPS from'../../src/game/props.js';import{conservatory}from'../../src/data/floorplan/conservatory.js';import{YARD_SERVICE_RANGES}from'../../src/data/exterior-district.js';import{OUTDOOR_ZONES}from'../../src/data/floorplan/legend.js';
import{EXTERIOR_ROOFLINE_PACK,exteriorRooflineInstance,exteriorRoofArchitectureInstances}from'../../src/data/exterior-roofline.js';import{propInstanceVisible}from'../../src/render/props3d.js';import{cameraBasis}from'../../src/render/camera-basis.js';import{parseGlb}from'./rebuild-tree-crowns.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
export const ROOFLINE_DIAGNOSTIC_VIEWS=[
  {id:'invalid-inside-rehearsal-annex',eye:[33,1.62,32],yaw:1.57,pitch:.45,target:[62.82,17.78,41]},
  {id:'invalid-inside-baths-plant',eye:[43,1.62,56],yaw:1.55,pitch:.32,target:[49.00,10.94,56]},
  {id:'school-gap-qualified-candidate',eye:[25,1.62,62],yaw:Math.PI/2,pitch:.30,target:[49.00,10.94,62]},
  {id:'hall-gap-qualified-candidate',eye:[25,1.62,44],yaw:1.49,pitch:.35,target:[62.82,17.78,41]},
];
const accessor=(p,id)=>{const a=p.json.accessors[id],v=p.json.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE'}[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>p.bin[method](off+i*stride+k*size)));};
function rayTriangle(origin,delta,[a,b,c]){const e1=sub(b,a),e2=sub(c,a),h=cross(delta,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return null;const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)return null;const q=cross(s,e1),v=dot(delta,q)/det;if(v<0||u+v>1)return null;const t=dot(e2,q)/det;return t>1e-7&&t<=1.002?t:null;}
export function pointInsideYardRange(eye,range){return Math.abs(eye[0]-range.physical.x)<range.w/2&&Math.abs(eye[2]-range.physical.y)<range.d/2&&eye[1]>0&&eye[1]<range.height;}
export function projectRooflinePoint(point,view,{width=1280,height=885}={}){const b=cameraBasis(view.yaw,view.pitch),d=sub(point,view.eye),depth=dot(d,b.forward),x=dot(d,b.right)/(.95*width/height*depth),y=dot(d,b.up)/(.95*depth);return{pixel:[(x+1)*width/2,(1-y)*height/2],depth,inside:depth>.05&&depth<90&&Math.abs(x)<=1&&Math.abs(y)<=1};}
export function auditExteriorRooflineViews(){
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  const ground=PROPS.renderInstances({group:'ground',inscriptions:false}),roof=PROPS.renderInstances({group:'academicRoof',inscriptions:false}),closure=exteriorRooflineInstance({zone:1,group:'ground'}),instances=[...ground,...exteriorRoofArchitectureInstances(roof,{zone:1,group:'ground'}),closure].filter((p,i,a)=>p&&a.findIndex(q=>q?.id===p.id)===i);
  const packFiles=['public/assets/conservatory-props.glb','public/assets/conservatory-acquisitions.glb','public/assets/exterior-frontages.glb','public/assets/exterior-stationers.glb','public'+EXTERIOR_ROOFLINE_PACK,'public/assets/opening-street.glb','public/assets/academic-gallery.glb'],catalog=new Map(),inputs={};
  for(const file of packFiles){if(!fs.existsSync(path.join(ROOT,file)))continue;const bytes=fs.readFileSync(path.join(ROOT,file)),p=parseGlb(bytes);inputs[file]=sha(bytes);for(const mesh of p.json.meshes)catalog.set(mesh.name,{p,mesh});}
  const localTriangles=new Map(),trianglesFor=name=>{if(localTriangles.has(name))return localTriangles.get(name);const entry=catalog.get(name),triangles=[];if(!entry)return[];for(const g of entry.mesh.primitives){const pos=accessor(entry.p,g.attributes.POSITION),idx=accessor(entry.p,g.indices).flat();for(let i=0;i<idx.length;i+=3)triangles.push(idx.slice(i,i+3).map(j=>pos[j]));}localTriangles.set(name,triangles);return triangles;};
  const toLocal=(p,i)=>{const yaw=i.yaw||0,c=Math.cos(yaw),s=Math.sin(yaw),dx=p[0]-i.x,dz=p[2]-i.z,scale=i.scale||1;return[(dx*c+dz*s)/(scale*(i.scaleX??1)),(p[1]-(i.y||0))/(scale*(i.scaleY??1)),(-dx*s+dz*c)/(scale*(i.scaleZ??1))];};
  const nearest=(eye,target)=>{
    let nearest=null;
    for(const instance of instances){
      if(!instance.structural||!propInstanceVisible(instance,eye))continue;
      const a=toLocal(eye,instance),b=toLocal(target,instance),delta=sub(b,a);
      for(const t of trianglesFor(instance.mesh)){const f=rayTriangle(a,delta,t);if(f!==null&&(!nearest||f<nearest.f))nearest={id:instance.id,mesh:instance.mesh,f,world:eye.map((v,k)=>v+(target[k]-v)*f)};}
    }
    return nearest;
  };
  const views=ROOFLINE_DIAGNOSTIC_VIEWS.map(view=>{
    const p=FP.logicalAtPhysical(view.eye[0]*2-.5,view.eye[2]*2-.5,{group:'ground',floor:0}),inside=YARD_SERVICE_RANGES.filter(r=>pointInsideYardRange(view.eye,r)).map(r=>({id:r.id,bounds:{x0:r.physical.x-r.w/2,x1:r.physical.x+r.w/2,z0:r.physical.y-r.d/2,z1:r.physical.y+r.d/2,height:r.height}})),bodyOccupancy=p?PROPS.propCanOccupy(p.x,p.y):false;
    return{...view,inside,bodyOccupancy,logical:p&&{x:p.x,y:p.y,zone:p.zone,owner:p.owner},targetProjection:projectRooflinePoint(view.target,view),nearestArchitecturalHit:nearest(view.eye,view.target),closureVisible:propInstanceVisible(closure,view.eye),closureSkyExposed:closure.skyExposed};
  });
  const pathFailures=[];let previous=null;
  for(let i=0;i<=36;i++){const z=44+i*.5,p=FP.logicalAtPhysical(49.5,z*2-.5,{group:'ground',floor:0});if(!p){pathFailures.push({z,reason:'missing floor'});continue;}if(!PROPS.propCanOccupy(p.x,p.y))pathFailures.push({z,reason:'body blocked'});if(previous){const step=FP.canStep(previous.x,previous.y,p.x,p.y,{keys:new Set()});if(!step.ok||step.redirect)pathFailures.push({z,reason:'ordinary step refused',step});}previous=p;}
  return{version:1,inputs,instances:instances.filter(i=>['bay-west-elevation','yard-rehearsal-annex','yard-baths-plant','ellery-west-roofline-closure'].includes(i.id)).map(i=>({id:i.id,mesh:i.mesh,x:i.x,y:i.y,z:i.z,zone:i.zone,skyEligible:OUTDOOR_ZONES.includes(i.zone)||i.skyExposed===true,skyExposed:i.skyExposed===true})),views,ordinaryRouteBetweenCandidates:{worldX:25,z0:44,z1:62,metres:18,samples:37,stepMetres:.5,failures:pathFailures,result:pathFailures.length?'FAILED':'PASS'},qualification:'CPU camera occupancy, projection and selected static architectural ray intersections only. Native final dither, vegetation/transient occlusion and human recognition remain pending.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const report=auditExteriorRooflineViews(),file=path.join(ROOT,'artifacts/ellery-fabric-finish/roofline-view-audit.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
