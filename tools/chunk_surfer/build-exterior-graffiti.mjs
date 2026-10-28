// Hand-drawn strokes are literal pigment geometry, with no rectangular decal
// backing; the masonry and its dither remain visible between strokes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {EXTERIOR_GRAFFITI_COURTS,EXTERIOR_GRAFFITI_MARKS} from '../../src/data/exterior-graffiti.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=process.env.EXTERIOR_GRAFFITI_OUT||path.join(root,'public/assets');
fs.mkdirSync(output,{recursive:true});
// Single-stroke lettering, with variable angles and incomplete weathered tips.
// Coordinates are in em units and deliberately differ from typeset lettering.
const glyph={
 A:[[[.02,0],[.35,1],[.68,0]],[[.14,.38],[.56,.42]]],
 D:[[[.05,0],[.05,1],[.38,.98],[.65,.73],[.64,.24],[.39,.03],[.05,0]]],
 E:[[[.64,.98],[.04,1],[.03,.02],[.68,.03]],[[.04,.50],[.49,.52]]],
 H:[[[.02,0],[.04,1]],[[.66,0],[.64,1]],[[.03,.49],[.65,.53]]],
 I:[[[.05,.98],[.55,1]],[[.30,.98],[.27,.02]],[[.02,.02],[.57,0]]],
 K:[[[.04,0],[.05,1]],[[.64,1],[.07,.47],[.66,0]]],
 L:[[[.05,1],[.03,.02],[.62,0]]],
 M:[[[.02,0],[.04,1],[.34,.48],[.65,1],[.70,0]]],
 N:[[[.02,0],[.05,1],[.65,0],[.68,1]]],
 O:[[[.12,.15],[.02,.55],[.12,.90],[.34,1],[.58,.88],[.68,.52],[.57,.12],[.33,.01],[.12,.15]]],
 R:[[[.04,0],[.05,1],[.47,.97],[.65,.76],[.56,.56],[.05,.51]],[[.30,.51],[.70,.01]]],
 S:[[[.65,.87],[.45,1],[.13,.91],[.02,.66],[.53,.38],[.64,.16],[.48,.02],[.05,.10]]],
 T:[[[0,.98],[.70,1]],[[.36,.99],[.30,0]]],
 U:[[[.03,1],[.04,.24],[.18,.03],[.45,0],[.65,.20],[.68,1]]],
 V:[[[.01,1],[.30,0],[.68,1]]],
 X:[[[.03,1],[.66,0]],[[.65,1],[.03,0]]],
};
const colours=[['faded oxblood aerosol',[.27,.105,.09]],['weathered ivory aerosol',[.61,.56,.43]],['dull blue green aerosol',[.105,.30,.27]]];
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Graffiti on existing court walls');
const materials=colours.map(([name,rgb])=>doc.createMaterial(name).setBaseColorFactor([...rgb,1]).setMetallicFactor(0).setRoughnessFactor(.97));
const accessor=(name,data,type,integer=false)=>doc.createAccessor(name).setArray(integer?new Uint32Array(data):new Float32Array(data)).setType(type).setBuffer(buffer);
const stats={pack:'exterior-graffiti.glb',source:'tools/chunk_surfer/build-exterior-graffiti.mjs',meshes:{},marks:{},pending:['native final-dither inspection']};
for(const [courtIndex,court] of EXTERIOR_GRAFFITI_COURTS.entries()){
  const name=`exterior_graffiti_${court.id}`,mesh=doc.createMesh(name),groups=colours.map(()=>({p:[],n:[],uv:[],i:[]}));
  const markStats=[];
  EXTERIOR_GRAFFITI_MARKS[court.id].forEach(([side,center,y,text,colour],markIndex)=>{
    const group=groups[colour],seed=courtIndex*4+markIndex;
    const height=.47+(seed%4)*.035,width=.28+(seed%3)*.026,advance=.36+(seed%3)*.025;
    const slant=[.12,-.06,.18,.04][seed%4],total=(text.length-1)*advance+.70*width+Math.abs(slant)*height;
    const zStart=center-total/2,normal=-side,plane=side*4.45+normal*.008;
    let strokeIndex=0;
    function stroke(a,b,thickness,target=group,layer=plane){
      const dz=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dz,dy);if(length<1e-6)return;
      const oz=-dy/length*thickness/2,oy=dz/length*thickness/2;
      const points=[[layer,a[1]+oy,a[0]+oz],[layer,a[1]-oy,a[0]-oz],[layer,b[1]-oy,b[0]-oz],[layer,b[1]+oy,b[0]+oz]];
      const k=target.p.length/3;
      for(const p of points){target.p.push(...p);target.n.push(normal,0,0);target.uv.push(p[2],p[1]);}
      // First triangle's normal is -X for this ordered rectangle.
      target.i.push(...(normal<0?[k,k+1,k+2,k,k+2,k+3]:[k,k+2,k+1,k,k+3,k+2]));
    }
    for(const [index,char] of [...text].entries()){
      for(const path of glyph[char]||[]){
        const lift=((index*3+seed)%5-2)*.014,lean=slant+((index+seed)%3-1)*.025;
        const points=path.map(([x,v])=>[zStart+index*advance+x*width+lean*v*height,y+lift+v*height]);
        for(let j=1;j<points.length;j++){
          const a=points[j-1],b=points[j],variation=(index*7+strokeIndex*3+markIndex)%5;
          const thickness=.022+variation*.0025;
          // A short interrupted segment reads as worn paint, without a fake
          // board underneath the writing or pixel-sized dust geometry.
          if(variation===2){const mix=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];stroke(a,mix(.43),thickness);stroke(mix(.50),b,thickness*.86);}
          else stroke(a,b,thickness);
          strokeIndex++;
        }
      }
    }
    // Loose, imperfect underline and occasional short drip: made of the same
    // pigment, kept clear of masonry plinth and all doors.
    if(seed%3!==0){
      stroke([zStart-.05,y-.07],[zStart+total*.52,y-.11],.020);
      stroke([zStart+total*.52,y-.11],[zStart+total+.08,y-.05],.016);
    }else{
      stroke([zStart-.05,y+.04],[zStart-.11,y+.17],.019);
      stroke([zStart-.11,y+.17],[zStart-.04,y+.24],.016);
    }
    if(seed%2===0)stroke([zStart+total*.72,y+.03],[zStart+total*.73,y-.16],.015);
    // A few nearby writers crossed each other's older marks. The second hand
    // has its own shallower, differently coloured zig and long loose curl.
    if(seed%4===1){
      const other=groups[(colour+1)%groups.length],over=plane+normal*.002;
      const scribble=[[.13,.22],[.31,.39],[.44,.19],[.59,.38],[.74,.17],[.86,.31]];
      for(let j=1;j<scribble.length;j++)stroke(
        [zStart+scribble[j-1][0]*total,y+scribble[j-1][1]],
        [zStart+scribble[j][0]*total,y+scribble[j][1]],.014,other,over);
    }
    markStats.push({side,center,y,text,minZ:zStart-.14,maxZ:zStart+total+.13,minY:y-.17,maxY:y+height+.03,plane});
  });
  let triangles=0;
  groups.forEach((g,i)=>{if(!g.i.length)return;triangles+=g.i.length/3;mesh.addPrimitive(doc.createPrimitive()
    .setAttribute('POSITION',accessor(name+'-positions',g.p,'VEC3')).setAttribute('NORMAL',accessor(name+'-normals',g.n,'VEC3'))
    .setAttribute('TEXCOORD_0',accessor(name+'-uv',g.uv,'VEC2')).setIndices(accessor(name+'-indices',g.i,'SCALAR',true)).setMaterial(materials[i]));});
  scene.addChild(doc.createNode(name).setMesh(mesh));stats.meshes[name]={triangles};stats.marks[court.id]=markStats;
}
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));stats.bytes=bytes.length;stats.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(path.join(output,stats.pack),bytes);
fs.writeFileSync(path.join(output,'exterior-graffiti.stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(output,'exterior-graffiti.credits.json'),JSON.stringify({pack:{author:'Chunk Surfer project',license:'project source',sha256:stats.sha256},construction:'Original hand-drawn opaque pigment strokes on existing court masonry; no external artwork.'},null,2)+'\n');
console.log(JSON.stringify({bytes:stats.bytes,sha256:stats.sha256,meshes:stats.meshes}));
