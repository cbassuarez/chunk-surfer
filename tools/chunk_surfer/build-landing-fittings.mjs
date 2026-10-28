// Dedicated replacements for the existing four landing sign/lamp assemblies.
// The sign and ink datums remain shared with corridor-lettering.js. Nothing in
// this builder changes copy, glyphs, placement, the base pack or runtime code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Document, NodeIO} from '@gltf-transform/core';
import {CORRIDOR_LETTERING_FACES} from '../../src/data/corridor-lettering.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(path.join(ROOT,file));
const PANEL=CORRIDOR_LETTERING_FACES.landing;
export const LANDING_FITTING_REAR_PLANES=Object.freeze({
  stair_sconce_pair_opal:.17,
  stair_bulkhead_pair:.14,
});
export const LANDING_FITTING_ENVELOPES=Object.freeze({
  stair_sconce_pair_opal:{min:[-1.56,-.20,-.49],max:[1.56,.39,.17]},
  stair_bulkhead_pair:{min:[-1.59,-.299,-.22],max:[1.59,.299,.14]},
});
const PROTECTED=['public/assets/conservatory-props.glb','public/assets/conservatory-props.stats.json',
  'public/assets/conservatory-props.credits.json','src/data/corridor-lettering.js'];
const SOURCES=['tools/chunk_surfer/build-landing-fittings.mjs','src/data/corridor-lettering.js'];
const materialSpecs=[
  ['tarnished brass',[.31,.245,.105],.68,.68],
  ['dull painted steel',[.18,.195,.18],.82,.45],
  ['aged opal glass',[.78,.765,.675],.67,0],
  ['sign black enamel',[.025,.028,.030],.40,.15],
  ['backboard exposed timber',[.255,.175,.105],.95,0],
  ['backboard old dark paint',[.115,.128,.113],.90,0],
  ['unfaded repair paint',[.073,.087,.075],.83,0],
  ['exposed iron edge',[.215,.19,.15],.88,.52],
  ['fastener oxidation',[.24,.155,.085],.98,.12],
  ['brass verdigris',[.14,.235,.185],.94,.30],
  ['screw slot',[.021,.024,.021],.98,.10],
];
const MAT=Object.fromEntries(materialSpecs.map(([name])=>[name,name]));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const unit=v=>{const l=Math.hypot(...v);return v.map(n=>n/l);};
const emptyBounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
const include=(b,p)=>{for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],p[k]);b.max[k]=Math.max(b.max[k],p[k]);}};

export async function buildLandingFittings({outputDir=path.join(ROOT,'public/assets')}={}){
  const protectedBefore=Object.fromEntries(PROTECTED.map(file=>[file,sha(read(file))]));
  const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Existing landing fittings');
  const materials=new Map(materialSpecs.map(([name,rgb,roughness,metallic])=>[name,
    doc.createMaterial(name).setBaseColorFactor([...rgb,1]).setRoughnessFactor(roughness).setMetallicFactor(metallic).setDoubleSided(false)]));
  const meshes=new Map();
  const mesh=name=>{const value={name,groups:new Map(),parts:[],triangles:0,bounds:emptyBounds()};meshes.set(name,value);return value;};
  function part(m,id,role,material,points,indices){
    const volume=indices.reduce((sum,_,i)=>i%3?sum:sum+dot(points[indices[i]],cross(points[indices[i+1]],points[indices[i+2]]))/6,0);
    if(Math.abs(volume)<1e-15)throw Error(`Zero-volume part: ${id}`);
    if(!m.groups.has(material))m.groups.set(material,{p:[],n:[],i:[]});
    const g=m.groups.get(material),startTriangle=g.i.length/3,bounds=emptyBounds();
    for(let at=0;at<indices.length;at+=3){
      const ids=volume>0?indices.slice(at,at+3):[indices[at],indices[at+2],indices[at+1]];
      const p=ids.map(i=>points[i].map(Math.fround)),normal=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),start=g.p.length/3;
      if(!normal.every(Number.isFinite))throw Error(`Degenerate triangle: ${id}`);
      for(const v of p){g.p.push(...v);g.n.push(...normal);include(bounds,v);include(m.bounds,v);}
      g.i.push(start,start+1,start+2);
    }
    const triangles=indices.length/3;
    m.parts.push({id,role,material,startTriangle,triangles,bounds,closed:true});m.triangles+=triangles;
  }
  const cubeFaces=[
    [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],
    [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],
    [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],
    [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],
    [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]],
  ];
  function box(m,id,role,material,c,s,basis=[[1,0,0],[0,1,0],[0,0,1]]){
    const p=[],i=[];
    for(const face of cubeFaces){const at=p.length;for(const v of face)p.push(c.map((value,k)=>value+v.reduce((sum,n,a)=>sum+n*s[a]/2*basis[a][k],0)));i.push(at,at+1,at+2,at,at+2,at+3);}
    part(m,id,role,material,p,i);
  }
  function beam(m,id,role,material,a,b,w){
    const direction=sub(b,a),axis=unit(direction),ref=Math.abs(axis[1])<.9?[0,1,0]:[1,0,0],u=unit(cross(ref,axis)),v=cross(axis,u);
    box(m,id,role,material,a.map((n,k)=>(n+b[k])/2),[w,w,Math.hypot(...direction)],[u,v,axis]);
  }
  function cylinder(m,id,role,material,c,r,h,sides=12,axis='y'){
    const local=(x,y,z)=>axis==='z'?[c[0]+x,c[1]+z,c[2]+y]:[c[0]+x,c[1]+y,c[2]+z];
    const p=[local(0,-h/2,0),local(0,h/2,0)],i=[];
    for(let n=0;n<sides;n++){const a=n/sides*Math.PI*2;p.push(local(Math.cos(a)*r,-h/2,Math.sin(a)*r),local(Math.cos(a)*r,h/2,Math.sin(a)*r));}
    for(let n=0;n<sides;n++){const a=2+n*2,b=2+(n+1)%sides*2;i.push(a,a+1,b+1,a,b+1,b,0,a,b,1,b+1,a+1);}
    part(m,id,role,material,p,i);
  }
  function coating(m,id,material,rear){
    // A thin, closed paint skin with six local losses around its perimeter.
    // The continuous substrate remains intact beneath the missing paint.
    const outline=[[-1.51,-.192],[-1.502,-.20],[-1.11,-.20],[-1.105,-.194],[-1.075,-.194],[-1.07,-.20],
      [.76,-.20],[.766,-.196],[.807,-.196],[.813,-.20],[1.502,-.20],[1.51,-.192],
      [1.51,.134],[1.505,.14],[1.505,.164],[1.51,.17],[1.51,.192],[1.502,.20],
      [.91,.20],[.905,.195],[.863,.195],[.858,.20],[-.67,.20],[-.676,.193],[-.715,.193],[-.721,.20],
      [-1.502,.20],[-1.51,.192],[-1.51,-.105],[-1.505,-.111],[-1.505,-.14],[-1.51,-.146]];
    const front=rear-.036,p=[[0,0,front],[0,0,front+.008]],i=[];
    for(const[x,y]of outline)p.push([x,y,front],[x,y,front+.008]);
    for(let n=0;n<outline.length;n++){const a=2+n*2,b=2+(n+1)%outline.length*2;i.push(0,b,a,1,a+1,b+1,a,b,b+1,a,b+1,a+1);}
    part(m,id,'worn-backboard-paint',material,p,i);
  }
  function supportedPanel(m,rear,substrate){
    box(m,'continuous-backboard','wall-contact-backboard',substrate,[0,0,rear-.015],[3.02,.40,.030]);
    coating(m,'chipped-backboard-coat',MAT['backboard old dark paint'],rear);
    for(const x of[-1.09,1.09])for(const y of[-.135,.095]){
      const front=PANEL.panelCenter[2]+PANEL.panelSize[2]/2-.002,back=rear-.028;
      box(m,`panel-standoff:${x}:${y}`,'integral-panel-standoff',MAT['dull painted steel'],[x,y,(front+back)/2],[.105,.045,back-front]);
    }
    box(m,'original-sign-panel','unchanged-lettering-panel',MAT['sign black enamel'],PANEL.panelCenter,PANEL.panelSize);
    for(const x of[-1.155,1.155])for(const y of[-.17,.09]){
      cylinder(m,`fixing-patina:${x}:${y}`,'localized-fixing-patina',MAT['fastener oxidation'],[x,y,-.05265],.0075,.0007,10,'z');
      cylinder(m,`original-fixing:${x}:${y}`,'sign-fixing',MAT['tarnished brass'],[x,y,-.0530],.004,.0016,10,'z');
      box(m,`fixing-slot:${x}:${y}`,'screw-slot',MAT['screw slot'],[x,y,-.05385],[.005,.0007,.0002]);
    }
    for(const[x,y,w,h]of[[-.78,.114,.12,.006],[.62,-.194,.084,.007],[1.174,-.11,.008,.039]])
      box(m,`enamel-edge-loss:${x}`,'localized-enamel-edge-loss',MAT['exposed iron edge'],[x,y,-.05265],[w,h,.0007]);
    for(const[x,y,w]of[[.71,.18,.18],[-1.35,.165,.075]])
      box(m,`unfaded-repair:${x}`,'localized-unfaded-repair',MAT['unfaded repair paint'],[x,y,rear-.0367],[w,.026,.0016]);
  }
  {
    const m=mesh('stair_sconce_pair_opal'),rear=LANDING_FITTING_REAR_PLANES[m.name];
    supportedPanel(m,rear,MAT['backboard exposed timber']);
    for(const x of[-1.42,1.42]){
      box(m,`sconce-foot:${x}`,'lamp-wall-foot',MAT['tarnished brass'],[x,0,.08],[.08,.24,.18]);
      beam(m,`sconce-arm:${x}`,'lamp-arm',MAT['tarnished brass'],[x,0,0],[x,.10,-.28],.045);
      cylinder(m,`opal:${x}`,'original-opal-lamp',MAT['aged opal glass'],[x,.18,-.35],.14,.30,16);
      cylinder(m,`cap:${x}`,'lamp-cap',MAT['tarnished brass'],[x,.36,-.35],.075,.06,12);
      box(m,`foot-patina:${x}`,'localized-brass-patina',MAT['brass verdigris'],[x-.022,-.077,-.0105],[.018,.026,.0018]);
    }
  }
  {
    const m=mesh('stair_bulkhead_pair'),rear=LANDING_FITTING_REAR_PLANES[m.name];
    supportedPanel(m,rear,MAT['exposed iron edge']);
    for(const x of[-1.42,1.42]){
      box(m,`bulkhead-foot:${x}`,'lamp-wall-foot',MAT['dull painted steel'],[x,0,.06],[.34,.28,.16]);
      cylinder(m,`bulkhead-opal:${x}`,'original-opal-lamp',MAT['aged opal glass'],[x,0,-.08],.14,.10,16);
      for(let n=0;n<6;n++){const a=n*Math.PI/3,xx=x+Math.cos(a)*.16,dy=Math.sin(a)*.16;
        beam(m,`cage:${x}:${n}`,'lamp-cage',MAT['dull painted steel'],[xx,-.16+dy,-.15],[xx,.16+dy,-.15],.018);
        beam(m,`cage-return:${x}:${n}`,'integral-cage-return',MAT['dull painted steel'],
          [xx,dy,-.15],[xx,Math.max(-.12,Math.min(.12,dy)),.10],.012);
      }
      box(m,`cage-wear:${x}`,'localized-cage-paint-loss',MAT['exposed iron edge'],[x+.16,-.104,-.1592],[.018,.031,.0007]);
    }
  }
  const stats={schemaVersion:1,asset:'assets/conservatory-landing-fittings.glb',frontAxis:'-z',localOrigin:[0,0,0],
    letteringFace:structuredClone(PANEL),maximumTriangles:4000,totalTriangles:0,meshes:{},sourceSha256:{},protectedSha256:protectedBefore};
  const accessor=(type,array)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  for(const[name,data]of meshes){
    const rear=LANDING_FITTING_REAR_PLANES[name],envelope=LANDING_FITTING_ENVELOPES[name],renderMesh=doc.createMesh(name);
    const rearContact={axis:'z',coordinate:rear,normal:[0,0,1],partId:'continuous-backboard',rectangle:{min:[-1.51,-.20,rear],max:[1.51,.20,rear]}};
    renderMesh.setExtras({frontAxis:'-z',localOrigin:[0,0,0],rearContact,letteringFace:structuredClone(PANEL)});
    scene.addChild(doc.createNode(name).setMesh(renderMesh));
    for(const[material,g]of data.groups)renderMesh.addPrimitive(doc.createPrimitive()
      .setAttribute('POSITION',accessor('VEC3',Float32Array.from(g.p))).setAttribute('NORMAL',accessor('VEC3',Float32Array.from(g.n)))
      .setIndices(accessor('SCALAR',Uint16Array.from(g.i))).setMaterial(materials.get(material)));
    for(let k=0;k<3;k++)if(data.bounds.min[k]<envelope.min[k]-1e-7||data.bounds.max[k]>envelope.max[k]+1e-7)throw Error(`Expanded original envelope: ${name}`);
    stats.meshes[name]={triangles:data.triangles,bounds:data.bounds,originalEnvelope:envelope,rearContact,parts:data.parts};stats.totalTriangles+=data.triangles;
  }
  if(stats.totalTriangles>=4000)throw Error('Landing fitting triangle budget exceeded');
  fs.mkdirSync(outputDir,{recursive:true});
  const out=path.join(outputDir,'conservatory-landing-fittings.glb');await new NodeIO().write(out,doc);
  const bytes=fs.readFileSync(out);stats.bytes=bytes.length;stats.sha256=sha(bytes);stats.materials=materialSpecs.map(([name])=>name);
  stats.sourceSha256=Object.fromEntries(SOURCES.map(file=>[file,sha(read(file))]));
  for(const[file,before]of Object.entries(protectedBefore))if(sha(read(file))!==before)throw Error(`Protected source changed: ${file}`);
  fs.writeFileSync(path.join(outputDir,'conservatory-landing-fittings.stats.json'),JSON.stringify(stats,null,2)+'\n');
  const credits={schemaVersion:1,license:'Project source',origin:'Project-authored closed code-native geometry and materials; original lamp geometry and sign datums retained.',
    source:'tools/chunk_surfer/build-landing-fittings.mjs',sourceSha256:stats.sourceSha256,pack:{file:'public/assets/conservatory-landing-fittings.glb',bytes:bytes.length,sha256:stats.sha256},
    lettering:'No new text, font, glyph or atlas. Existing corridor lettering overlays reuse unchanged panel and ink datums.',
    aging:'Localized closed paint-skin edge losses, fastener oxidation, sparse repairs and brass/cage wear. The central lettering region is untouched.',
    meshes:Object.entries(stats.meshes).map(([name,m])=>({name,triangles:m.triangles,bounds:m.bounds,rearContact:m.rearContact}))};
  fs.writeFileSync(path.join(outputDir,'conservatory-landing-fittings.credits.json'),JSON.stringify(credits,null,2)+'\n');
  return stats;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const stats=await buildLandingFittings();
  console.log(JSON.stringify({asset:stats.asset,bytes:stats.bytes,triangles:stats.totalTriangles,sha256:stats.sha256,rearPlanes:LANDING_FITTING_REAR_PLANES}));
}
