import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_COASTAL_ECHOES,sourceCoastalEchoFrame,sourceCoastalEchoGeometry} from '../src/game/source-coastal-echoes.js';
import {OPENING_VEHICLE} from '../src/data/opening-vehicle.js';
import {SOURCE_CONTINUATION,continuationSurfaces} from '../src/data/source-continuation.js';
import {JOURNEY_ROUTES,JOURNEY_REFUGES} from '../src/data/source-continuation-journey.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame,sourceContinuationPresentation,installSourceContinuationMeshes,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
function hull(points){
 const rows=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const side=items=>{const out=[];for(const p of items){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
 return[...side(rows).slice(0,-1),...side([...rows].reverse()).slice(0,-1)];
}
function overlaps(poly,surface,margin=.5){
 const rect=[[surface.minX-margin,surface.minZ-margin],[surface.maxX+margin,surface.minZ-margin],[surface.maxX+margin,surface.maxZ+margin],[surface.minX-margin,surface.maxZ+margin]],axes=[[1,0],[0,1]];
 for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length];axes.push([a[1]-b[1],b[0]-a[0]]);}
 return axes.every(axis=>{const a=poly.map(p=>dot(p,axis)),b=rect.map(p=>dot(p,axis));return Math.max(...a)>=Math.min(...b)&&Math.max(...b)>=Math.min(...a);});
}
test('complete coastal rails and actual opening-vehicle body footprints clear the expanded courts and refuge necks',()=>{
 const rail=sourceCoastalEchoGeometry()['coastal-echo-rail'];
 for(const site of SOURCE_COASTAL_ECHOES){
  const c=Math.cos(site.yaw),s=Math.sin(site.yaw),points=[];
  for(let k=0;k<rail.p.length;k+=3)points.push([site.x+c*rail.p[k]-s*rail.p[k+2],site.z+s*rail.p[k]+c*rail.p[k+2]]);
  const footprints=[hull(points)],body=sourceCoastalEchoFrame({phase:'wrong-return',chartId:site.chartId}).find(p=>p.id.startsWith(site.id+'-')&&p.mesh==='opening_drive_vehicle_body');
  if(site.wreck){
   assert.ok(body,'the wreck must retain the real opening vehicle');const corners=[];
   for(const x of[OPENING_VEHICLE.bodyBox.min[0]-.18,OPENING_VEHICLE.bodyBox.max[0]+.18])for(const y of[OPENING_VEHICLE.bodyBox.min[1],OPENING_VEHICLE.bodyBox.max[1]])for(const z of[OPENING_VEHICLE.bodyBox.min[2]-.18,OPENING_VEHICLE.bodyBox.max[2]+.18]){const p=transform(body.matrix,[x,y,z]);corners.push([p[0],p[2]]);}
   footprints.push(hull(corners));
  }
  const supports=continuationSurfaces({chartId:site.chartId}).filter(p=>p.kind==='rect'&&Math.abs(p.y-site.y)<=SOURCE_CONTINUATION.maximumStep);
  for(const poly of footprints)for(const support of supports)assert.equal(overlaps(poly,support),false,`${site.id}: visible fragment overlaps ${support.id} or its body-clearance margin`);
 }
});
function installedCatalog(){
 let id=0;const no=()=>{},gl={ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_INT:5125,TEXTURE_2D:3553,ACTIVE_TEXTURE:34016,TEXTURE_BINDING_2D:32873,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,LINEAR_MIPMAP_LINEAR:9987,LINEAR:9729,REPEAT:10497,CLAMP_TO_EDGE:33071,
  createBuffer:()=>({id:++id}),createVertexArray:()=>({id:++id}),createTexture:()=>({id:++id}),getParameter:()=>0};
 for(const name of['bindBuffer','bufferData','bindVertexArray','enableVertexAttribArray','disableVertexAttribArray','vertexAttribPointer','vertexAttribDivisor','vertexAttrib1f','bindTexture','pixelStorei','texImage2D','generateMipmap','texParameteri','activeTexture'])gl[name]=no;
 const pack={catalog:new Map()};installSourceContinuationMeshes(gl,pack,{maps:{texture:{},normalTexture:{},ormTexture:{},letteringFinish:{}}});return pack.catalog;
}
const catalog=installedCatalog();
function outside(points,view){
 const {forward,right,up}=view.basis,planes=[];
 for(const [axis,width]of[[right,.95*16/9],[up,.95]])for(const sign of[-1,1])planes.push(forward.map((v,k)=>v*width+axis[k]*sign));
 planes.push(forward);
 return planes.some(normal=>points.every(p=>dot(normal,p.map((v,k)=>v-view.eye[k]))<-.001));
}
test('ordinary route views cull only wholly out-of-view native details and retain their uploaded geometry and canonical owners',()=>{
 const main=JOURNEY_ROUTES.main,points=[{x:0,z:2,feet:0,chartId:0},...main.filter((_,n)=>n%4===0),...JOURNEY_REFUGES];let rejected=0,checked=0;
 for(const point of points)for(const yaw of[0,Math.PI/2,Math.PI,-Math.PI/2]){
  const state={...freshSourceContinuation(),...point,status:'active',phase:'wrong-return',yaw,pitch:0},frame=sourceContinuationRenderFrame(state),view=sourceContinuationPresentation(state),submitted=new Set(frame.props.filter(p=>!p.portalDestination).map(p=>p.id));
  assert.ok(frame.props.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances,'culling must not merely move the overrun to another ordinary heading');
  assert.equal(frame.voidLoop.omittedVisible||0,0,'the native lower/upper world keeps all of its visible seam geometry');
  for(const prop of frame.canonicalProps){
   if(prop.archipelago||prop.exitPassage||prop.surroundings||prop.physicalKind)continue;
   const geometry=catalog.get(prop.mesh)?.primitives?.[0]?.nativeReceiverGeometry;if(!geometry)continue;
   checked++;if(submitted.has(prop.id))continue;
   const points=[];for(let n=0;n<geometry.positions.length;n+=3)points.push(transform(prop.matrix,Array.from(geometry.positions.slice(n,n+3))));
   assert.equal(outside(points,view),true,`${prop.id}: omitted actual uploaded vertices can still intersect the camera cone`);rejected++;
  }
 }
 assert.ok(checked>500&&rejected>50,'the test must exercise whole-mesh rejection throughout real route headings');
});
