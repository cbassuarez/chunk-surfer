import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.CS_GETIN_REPO||'/Users/seb/chunk-surfer';
const stage=process.env.CS_GETIN_STAGE_DIR;
const sourceURL=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const dataPath=stage?path.join(stage,'scene-dock-dressing.js'):path.join(root,'src/data/scene-dock-dressing.js');
const dataURL=stage?sourceURL(fs.readFileSync(dataPath,'utf8').replace("'./conservatory-doors.js'",JSON.stringify(pathToFileURL(path.join(root,'src/data/conservatory-doors.js')).href))):pathToFileURL(dataPath).href;
const D=await import(dataURL);
const geometryPath=stage?path.join(stage,'scene-dock-geometry.mjs'):path.join(root,'tools/chunk_surfer/scene-dock-geometry.mjs');
const geometryURL=sourceURL(fs.readFileSync(geometryPath,'utf8').replace("'../../src/data/scene-dock-dressing.js'",JSON.stringify(dataURL)));
const {buildSceneDockDressing}=await import(geometryURL);
const builder=fs.readFileSync(path.join(root,'tools/chunk_surfer/build-props.mjs'),'utf8');
function productionFunction(name){
 const begin=builder.indexOf(`function ${name}(`);assert.ok(begin>=0,name);
 let i=builder.indexOf('{',begin),depth=0,quote=null,line=false,block=false,escape=false;
 for(;i<builder.length;i++){
  const c=builder[i],next=builder[i+1];
  if(line){if(c==='\n')line=false;continue;}
  if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}
  if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
  if(c==='/'&&next==='/'){line=true;i++;continue;}if(c==='/'&&next==='*'){block=true;i++;continue;}
  if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return builder.slice(begin,i+1);
 }
 throw Error('Unclosed production geometry helper '+name);
}
const meshes=new Map(),parts=[];
function mesh(name){const m={name,groups:new Map()};meshes.set(name,m);return m;}
function group(m,mat){if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],indices:[],uvs:[]});return m.groups.get(mat);}
const names=['addBox','addBeam','addCylinder','addCylinderX'];
const helpers=new Function('group','signAssemblies','BUILDING_WINDOW_HOST_ORIGINS',names.map(productionFunction).join('\n')+'\nreturn{'+names.join(',')+'};')(group,{isCarrier:()=>false},{});
function bounds(vertices){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<vertices.length;i++){
 const k=i%3;min[k]=Math.min(min[k],vertices[i]);max[k]=Math.max(max[k],vertices[i]);}return{min,max};}
const api={mesh,MAT:new Proxy({},{get:(_,key)=>String(key)})};
for(const name of names)api[name]=(...args)=>{
 const m=args[0],before=new Map([...m.groups].map(([key,g])=>[key,g.positions.length]));helpers[name](...args);
 const v=[...m.groups].flatMap(([key,g])=>g.positions.slice(before.get(key)||0));if(v.length)parts.push({mesh:m.name,kind:name,args:args.slice(1),...bounds(v)});
};
buildSceneDockDressing(api);
const measured=Object.fromEntries([...meshes].map(([name,m])=>[name,bounds([...m.groups.values()].flatMap(g=>g.positions))]));

test('dedicated models emit valid finite surfaces and modest bounded geometry through the actual pack helpers',()=>{
 assert.deepEqual([...meshes.keys()].sort(),Object.keys(D.SCENE_DOCK_MESHES).sort());
 for(const[name,m]of meshes){
  let triangles=0;
  for(const g of m.groups.values()){
   assert.ok(g.positions.every(Number.isFinite),name);assert.equal(g.positions.length,g.normals.length,name);assert.equal(g.indices.length%3,0,name);
   assert.ok(g.indices.every(i=>Number.isInteger(i)&&i>=0&&i<g.positions.length/3),name);triangles+=g.indices.length/3;
  }
  assert.ok(triangles>20&&triangles<6000,`${name}: ${triangles} triangles`);
  const b=measured[name],d=D.SCENE_DOCK_MESHES[name];
  for(const[k,size]of [[0,d.w],[1,d.h],[2,d.d]])assert.ok(b.max[k]-b.min[k]<=size+.016,`${name} axis${k}: ${b.max[k]-b.min[k]} > ${size}`);
 }
});
test('all three existing apertures retain an unobstructed 0.9m body section above the shallow material sill',()=>{
 const o=D.SCENE_DOCK_FABRIC.origin;
 for(const p of D.SCENE_DOCK_PORTALS){
  const x=p.x-o.x,z=p.z-o.z;
  const hit=parts.filter(q=>q.mesh==='scene_dock_room_fabric'&&q.max[1]>.05&&q.min[1]<2.2&&
   (p.axis==='x'?q.max[0]>x-.45&&q.min[0]<x+.45&&q.max[2]>z-.015&&q.min[2]<z+.015:q.max[2]>z-.45&&q.min[2]<z+.45&&q.max[0]>x-.015&&q.min[0]<x+.015));
  assert.equal(hit.length,0,`${p.id}: ${JSON.stringify(hit.map(h=>h.args))}`);
  const sills=parts.filter(q=>q.mesh==='scene_dock_room_fabric'&&q.max[1]<.03&&q.min[0]<=x&&q.max[0]>=x&&q.min[2]<=z&&q.max[2]>=z);
  assert.ok(sills.length>0,p.id+' gets a flush, material threshold');
 }
 assert.equal(D.SCENE_DOCK_PORTALS.find(p=>p.id==='dock-grey-exterior').width,3);
});
test('the clipboard work plane, open recorder cavity and full-height rigging cage match their physical roles',()=>{
 const desk=parts.filter(p=>p.mesh==='scene_dock_dispatch_desk'&&p.kind==='addBox');
 const top=desk.find(p=>p.args[1][0]===1.55);assert.ok(top);assert.ok(Math.abs(top.max[1]-.7175)<1e-9);
 const cavity=parts.filter(p=>p.mesh==='scene_dock_road_case_open'&&p.min[1]>.13&&p.min[0]<0&&p.max[0]>0&&p.min[2]<0&&p.max[2]>0);
 assert.equal(cavity.length,0,'no solid block fills the open recorder-shaped absence');
 assert.ok(measured.scene_dock_chandelier_cage.max[1]>2.5);
 assert.ok(measured.scene_dock_hand_truck.max[1]>1.2);
});
test('the maintenance ledge is physical and remains outside both the freight spine and goods approach',()=>{
 for(const c of D.SCENE_DOCK_COLLIDERS)for(const route of[D.SCENE_DOCK_FABRIC.clearSpine,D.SCENE_DOCK_FABRIC.goodsRun]){
  assert.ok(c.x+c.width/2<route.x0||c.x-c.width/2>route.x1||c.y+c.depth/2<route.z0||c.y-c.depth/2>route.z1);
 }
});

if(!stage){
 const {CONSERVATORY_PROPS,PROP_MESH}=await import(pathToFileURL(path.join(root,'src/data/conservatory-props.js')).href);
 const source=await import(pathToFileURL(path.join(root,'src/data/source-landing.js')).href);
 test('production retains investigation identities and keeps architectural fabric outside the remembered Source room',()=>{
  for(const id of ['dock-desk-1','dock-hand-truck','dock-freight-crates','dock-road-case','dock-cable-reel','dock-shutter-bar','dock-chandelier-frame']){
   const p=CONSERVATORY_PROPS.find(p=>p.id===id);assert.ok(p?.dockInvestigation,id);assert.ok(p.mesh.startsWith('scene_dock_'),id);
  }
  assert.ok(!source.SOURCE_GET_IN_PROP_IDS.includes('dock-scene-fabric'));
  assert.ok(source.SOURCE_GET_IN_PROP_IDS.includes('dock-scene-roof'));
  const cage=CONSERVATORY_PROPS.find(p=>p.id==='dock-chandelier-frame');assert.equal(cage.blocks,true);
  for(const p of CONSERVATORY_PROPS.filter(p=>p.mesh.startsWith('scene_dock_')))assert.ok(PROP_MESH[p.mesh],p.id);
 });
 test('actual blocking furniture preserves a 0.9m walkable spine through the existing room',()=>{
  const clear=D.SCENE_DOCK_FABRIC.clearSpine;
  for(const p of CONSERVATORY_PROPS.filter(p=>p.id.startsWith('dock-')&&p.blocks!==false)){
   const d=PROP_MESH[p.mesh];if(!d?.blocks&&p.blocks!==true)continue;
   const w=d.w*(p.scale||1),depth=d.d*(p.scale||1),c=Math.cos(p.yaw||0),s=Math.sin(p.yaw||0);
   const halfX=(Math.abs(c)*w+Math.abs(s)*depth)/2,halfZ=(Math.abs(s)*w+Math.abs(c)*depth)/2;
   assert.ok(p.x+halfX<clear.x0||p.x-halfX>clear.x1||p.y+halfZ<clear.z0||p.y-halfZ>clear.z1,p.id);
  }
 });
}
if(process.env.CS_GETIN_RECEIPT){
 fs.writeFileSync(process.env.CS_GETIN_RECEIPT,JSON.stringify({bounds:measured,meshCount:meshes.size,triangleCounts:Object.fromEntries([...meshes].map(([name,m])=>[name,[...m.groups.values()].reduce((n,g)=>n+g.indices.length/3,0)]))},null,2)+'\n');
}

if(!stage){
 const {CONSERVATORY_PROPS}=await import(pathToFileURL(path.join(root,'src/data/conservatory-props.js')).href);
 const {MESH_SURFACE,PROP_BOUNDS}=await import(pathToFileURL(path.join(root,'src/data/generated/prop-geometry.js')).href);
 const {sourceLandingPropPlacements}=await import(pathToFileURL(path.join(root,'src/data/source-landing.js')).href);
 const renderer=fs.readFileSync(path.join(root,'src/render/props3d.js'),'utf8');
 const renderMath=renderer.slice(renderer.indexOf('function identity(){'),renderer.indexOf('\nfunction perspective('));
 const ordinaryMatrix=new Function(renderMath+';return modelMatrix;')();
 const sourceRuntime=fs.readFileSync(path.join(root,'src/game/source-space-runtime.js'),'utf8');
 const sourceMath=sourceRuntime.slice(sourceRuntime.indexOf('function mul(a, b)'),sourceRuntime.indexOf('\nfunction treeOffsets(')).replace('export function sourceMatrix','function sourceMatrix');
 const sourceMatrix=new Function(sourceMath+';return sourceMatrix;')();
 const point=(m,v)=>[0,1,2].map(k=>m[k]*v[0]+m[4+k]*v[1]+m[8+k]*v[2]+m[12+k]);
 const local=(m,v)=>{const d=v.map((x,k)=>x-m[12+k]);return[0,1,2].map(k=>(d[0]*m[k*4]+d[1]*m[k*4+1]+d[2]*m[k*4+2])/(m[k*4]**2+m[k*4+1]**2+m[k*4+2]**2));};
 const verts=b=>[b.min[0],b.max[0]].flatMap(x=>[b.min[1],b.max[1]].flatMap(y=>[b.min[2],b.max[2]].map(z=>[x,y,z])));
 const ordinary=p=>ordinaryMatrix({...p,x:Math.round(p.x*2)/2+(p.renderOffsetX||0),z:Math.round(p.y*2)/2+(p.renderOffsetZ||0),y:p.on?MESH_SURFACE.scene_dock_dispatch_desk:p.elevation||0});
 test('hosted clipboard clears pigeonhole joinery and stamp in both actual render coordinate systems',()=>{
  const authored=id=>CONSERVATORY_PROPS.find(p=>p.id===id),remembered=sourceLandingPropPlacements();
  const configs=[
   {name:'ordinary',desk:ordinary(authored('dock-desk-1')),paper:ordinary(authored('dock-work-order-clipboard'))},
   ...[0].map(()=>{const d=remembered.find(p=>p.sourcePropId==='dock-desk-1'),p=remembered.find(p=>p.sourcePropId==='dock-work-order-clipboard');return{name:'Source',desk:sourceMatrix({x:d.x*.5,y:d.y,z:d.z*.5,yaw:d.yaw,scaleX:d.scale,scaleY:d.scale,scaleZ:d.scale}),paper:sourceMatrix({x:p.x*.5,y:p.y,z:p.z*.5,yaw:p.yaw,scaleX:p.scale,scaleY:p.scale,scaleZ:p.scale})};}),
  ];
  for(const c of configs){
   const pts=verts(PROP_BOUNDS.loose_note).map(v=>local(c.desk,point(c.paper,v)));
   const b={min:[0,1,2].map(k=>Math.min(...pts.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...pts.map(v=>v[k])))};
   assert.ok(b.min[0]>-.775&&b.max[0]<.775&&b.min[2]>-.37&&b.max[2]<.37,c.name+' paper is supported');
   const hit=parts.filter(p=>p.mesh==='scene_dock_dispatch_desk'&&p.max[1]>b.min[1]+.001&&p.min[1]<b.max[1]-.001&&p.max[0]>b.min[0]&&p.min[0]<b.max[0]&&p.max[2]>b.min[2]&&p.min[2]<b.max[2]);
   assert.equal(hit.length,0,c.name+' paper must not intersect joinery/stamp: '+JSON.stringify(hit.map(p=>p.args)));
  }
 });
 test('ordinary chandelier suspension, tag and heavy wrench rest against their actual modeled supports',()=>{
  const get=id=>CONSERVATORY_PROPS.find(p=>p.id===id),stats=JSON.parse(fs.readFileSync(path.join(root,'public/assets/conservatory-acquisitions.stats.json'),'utf8'));
  const lamp=stats.meshes?.chandelier_03?.bounds||stats.models?.chandelier_03?.bounds||stats.catalog?.chandelier_03?.bounds;
  assert.ok(lamp,'acquisition bounds expose the actual chandelier');
  const crossbar=parts.find(p=>p.mesh==='scene_dock_chandelier_cage'&&p.kind==='addBeam'&&p.args[0][1]===2.51);
  const intact=get('dock-chandelier-intact'),tag=get('dock-chandelier-tag'),spent=get('dock-chandelier-spent');
  const hook=intact.elevation+lamp.max[1]*intact.scale;
  assert.ok(Math.abs(crossbar.min[1]-hook)<.011,'hook touches the underside of the crossbar');
  assert.ok(tag.elevation-crossbar.max[1]>=0&&tag.elevation-crossbar.max[1]<.012,'paper tag rests above the crossbar');
  const deck=parts.find(p=>p.mesh==='scene_dock_chandelier_cage'&&p.kind==='addBox'&&p.args[0][1]===.30);
  const fallen=spent.elevation+lamp.min[1]*spent.scale*(spent.scaleY??1);
  assert.ok(fallen-deck.max[1]>=0&&fallen-deck.max[1]<.015,'spent glass rests on the cage deck');
  const wrench=get('getin-heavy-stillson'),wm=ordinary(wrench),wpts=verts(PROP_BOUNDS.stillson_wrench).map(v=>point(wm,v));
  const wb={min:[0,1,2].map(k=>Math.min(...wpts.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...wpts.map(v=>v[k])))};
  assert.ok(Math.abs(wb.min[1]-.83)<.004,'wrench contacts ledge top');
  assert.ok(wb.min[0]>=69.7-.004&&wb.max[0]<=71.9+.004&&wb.min[2]>=3.94-.004&&wb.max[2]<=4.56+.004,'wrench stays on its supporting ledge after grid projection');
 });
}
