// Hand-drawn paint on the existing moving Ellery bus's lower body panels.
// The separate, local-space mesh rides the real vehicle; no collision, lights,
// shared source pack, windows, destination board or lamps are modified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.BUS_GRAFFITI_OUT_DIR||path.join(root,'public/assets');
fs.mkdirSync(output,{recursive:true});
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Bus panel markings');
const mesh=doc.createMesh('ambient_bus_graffiti');
const palette=[
  {name:'bus tag charcoal shadow',color:[.032,.032,.030,1]},
  {name:'bus tag weathered pale paint',color:[.68,.66,.51,1]},
  {name:'bus tag dull sea green',color:[.19,.36,.32,1]},
  {name:'bus tag faded ochre',color:[.65,.39,.18,1]},
];
const groups=palette.map(()=>({positions:[],normals:[],uvs:[],indices:[]}));
const materials=palette.map(({name,color})=>doc.createMaterial(name).setBaseColorFactor(color)
  .setMetallicFactor(0).setRoughnessFactor(.95).setDoubleSided(true).setExtras({materialFactors:'gltf'}));
const paths=[];
// Coordinates are metres in the bus's local z/y plane. Each polyline has
// deliberately uneven angles and widths: painted gestures, not typeset signs.
function stroke(side,points,width,colour,{outline=true}={}){
  paths.push({side,points,width,colour,outline});
  const line=(a,b,w,material,layer)=>{
    const dz=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dz,dy);
    if(length<1e-8)throw Error('zero-length paint stroke');
    const nz=-dy/length*w/2,ny=dz/length*w/2,x=side*(1.225+layer);
    const corners=[[x,a[1]+ny,a[0]+nz],[x,a[1]-ny,a[0]-nz],[x,b[1]-ny,b[0]-nz],[x,b[1]+ny,b[0]+nz]];
    if(side<0)corners.reverse();
    const g=groups[material],base=g.positions.length/3;
    for(const p of corners){g.positions.push(...p);g.normals.push(side,0,0);g.uvs.push(p[2],p[1]);}
    g.indices.push(base,base+1,base+2,base,base+2,base+3);
  };
  for(let i=1;i<points.length;i++){
    if(outline)line(points[i-1],points[i],width+.047,0,.004);
    line(points[i-1],points[i],width,colour,.008);
  }
}
// Four loose hand-rendered letters, highlight scratches and a descending tail.
// z is mirrored on the opposite side so each face is composed independently.
const letters=[
 [[-1.56,.87],[-1.51,1.30],[-1.22,1.28],[-1.16,1.17],[-1.25,1.10],[-1.48,1.09]],
 [[-1.31,1.10],[-1.12,.87]],
 [[-.93,.88],[-.89,1.29]],
 [[-.98,1.31],[-.76,1.31]],[[-1.01,.88],[-.79,.88]],
 [[-.62,.88],[-.58,1.31],[-.27,1.30]],[[-.60,1.10],[-.34,1.11]],
 [[-.16,1.29],[.18,1.30]],[[.02,1.29],[-.02,.88]],
];
for(const p of letters)stroke(1,p,.052,1);
stroke(1,[[-1.66,.80],[-1.19,.77],[-.64,.79],[-.05,.78],[.31,.84]],.025,2);
stroke(1,[[.24,1.23],[.36,1.34],[.48,1.21],[.36,1.07],[.24,1.23]],.027,2);
stroke(1,[[.36,1.36],[.37,1.03]],.020,2,{outline:false});
stroke(1,[[-1.26,.86],[-1.25,.76]],.015,1,{outline:false});
stroke(1,[[-.48,.90],[-.49,.83]],.014,1,{outline:false});
// A second, unrelated scrawl on the nearside: linked 4/7-like gestures and a
// loose flourish, not a duplicate or an official route number.
for(const p of [
 [[-1.33,1.30],[-1.55,1.04],[-1.17,1.05]],[[-1.25,1.26],[-1.29,.87]],
 [[-.98,1.29],[-.58,1.31],[-.83,.88]],
 [[-.37,.90],[-.30,1.29],[-.04,.88],[.03,1.30]],
])stroke(-1,p,.048,3);
stroke(-1,[[-1.61,.82],[-1.35,.78],[-.98,.81],[-.55,.79],[-.11,.83],[.17,.77]],.025,1);
stroke(-1,[[.30,1.08],[.38,1.20],[.48,1.10],[.38,.98],[.30,1.08]],.024,1);
stroke(-1,[[-.78,.89],[-.77,.78]],.013,3,{outline:false});
for(let i=0;i<groups.length;i++){
  const g=groups[i],access=(name,data,type,index=false)=>doc.createAccessor(name).setBuffer(buffer)
    .setType(type).setArray(index?new Uint32Array(data):new Float32Array(data));
  const primitive=doc.createPrimitive().setAttribute('POSITION',access('positions',g.positions,'VEC3'))
    .setAttribute('NORMAL',access('normals',g.normals,'VEC3')).setAttribute('TEXCOORD_0',access('uv',g.uvs,'VEC2'))
    .setIndices(access('indices',g.indices,'SCALAR',true)).setMaterial(materials[i]);
  mesh.addPrimitive(primitive);
}
mesh.setExtras({purpose:'non-colliding paint on lower side panels of ambient_late_bus',busLocal:true,
  mounting:'x=±1.229–1.233m, authored body skin x=±1.225m',paths:paths.length,
  bounds:{min:[-1.45,0,-4.8],max:[1.45,3.1,4.8]},
  avoids:['windows','destination board','windscreen','lamps','wheels']});
scene.addChild(doc.createNode('ambient_bus_graffiti').setMesh(mesh));doc.getRoot().setDefaultScene(scene);
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));
const stats={version:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
  mesh:'ambient_bus_graffiti',triangles:groups.reduce((n,g)=>n+g.indices.length/3,0),paths:paths.length,
  description:'Original hand-drawn matte spray marks on both lower bus side panels',
  bodyPlaneX:1.225,paintPlaneAbsX:[1.229,1.233],source:'tools/chunk_surfer/build-bus-graffiti.mjs',
  pending:['native final-dither visibility and motion inspection']};
fs.writeFileSync(path.join(output,'bus-graffiti.glb'),bytes);
fs.writeFileSync(path.join(output,'bus-graffiti.stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(output,'bus-graffiti.credits.json'),JSON.stringify({pack:'bus-graffiti.glb',author:'Chunk Surfer project',license:'Original project artwork',sha256:stats.sha256,source:stats.source},null,2)+'\n');
console.log(JSON.stringify(stats,null,2));
