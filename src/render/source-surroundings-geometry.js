import {SOURCE_SURROUNDINGS_CENTRE_ARCS} from '../data/source-surroundings.js';
import {ZONE} from '../data/floorplan/legend.js';

// Native closed solids, built once. This catalogue has no collision, route,
// camera or light authority. A body pose moves one rigid assembly, not its parts.
const PREFIX='source-surroundings-';
const freeze=Object.freeze;
const finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
const clamp=n=>Math.max(0,Math.min(1,finite(n)));
const empty=()=>({p:[],i:[]});
const materialOrder=['print','stock','back','edge'];
const materials=freeze({
  print:freeze({material:'source',materialRole:'source-surroundings-blueprint',blueprint:true,base:[.58,.67,.67,1],emissive:[0,0,0]}),
  stock:freeze({material:'cold-stone',materialRole:'source-surroundings-stock',paleStock:true,base:[.73,.77,.70,1],emissive:[0,0,0]}),
  back:freeze({material:'dark-metal',materialRole:'source-surroundings-backing',base:[.035,.052,.055,1],emissive:[0,0,0]}),
  edge:freeze({material:'dark-metal',materialRole:'source-surroundings-joint',base:[.19,.31,.31,1],emissive:[1.1,1.7,1.8]}),
});
const boxFaces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
function bounds(points){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<points.length;i++){const k=i%3;min[k]=Math.min(min[k],points[i]);max[k]=Math.max(max[k],points[i]);}
  return{min,max,center:min.map((v,k)=>(v+max[k])/2)};
}
function append(target,source,map=p=>p){
  const offset=target.p.length/3;
  for(let i=0;i<source.p.length;i+=3)target.p.push(...map(source.p.slice(i,i+3)));
  for(const i of source.i)target.i.push(offset+i);
}
function box(g,x0,x1,y0,y1,z0,z1,map){
  const p=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]].flat();
  append(g,{p,i:boxFaces.flatMap(([a,b,c,d])=>[a,b,c,a,c,d])},map);
}
function arch(g,cx,spring,inner,outer,depth,map,segments=7){
  // One closed extrusion with shared joints, rather than coplanar painted arch
  // silhouettes. Seven voussoir facets remain visible at the immense scale.
  // The arch's front/back are nonconvex. Use annular cross-sections, not a fan
  // across its empty doorway; the opening must remain real from every angle.
  const p=[],i=[];
  for(let k=0;k<=segments;k++){
    const a=k/segments*Math.PI,c=Math.cos(a),s=Math.sin(a);
    p.push(cx+c*inner,spring+s*inner,-depth/2,cx+c*outer,spring+s*outer,-depth/2,
      cx+c*outer,spring+s*outer,depth/2,cx+c*inner,spring+s*inner,depth/2);
  }
  for(let k=0;k<segments;k++)for(let side=0;side<4;side++){
    const a=k*4+side,b=k*4+(side+1)%4,c=(k+1)*4+(side+1)%4,d=(k+1)*4+side;
    i.push(a,b,c,a,c,d);
  }
  i.push(0,2,1,0,3,2);const e=segments*4;i.push(e,e+1,e+2,e,e+2,e+3);
  for(let k=0;k<i.length;k+=3)[i[k+1],i[k+2]]=[i[k+2],i[k+1]];
  append(g,{p,i},map);
}
function beam(g,a,b,width,depth=width){
  const y=b.map((v,k)=>v-a[k]),length=Math.hypot(...y);if(length<1e-6)return;
  const n=y.map(v=>v/length),seed=Math.abs(n[1])<.9?[0,1,0]:[1,0,0];
  const x=[n[1]*seed[2]-n[2]*seed[1],n[2]*seed[0]-n[0]*seed[2],n[0]*seed[1]-n[1]*seed[0]],l=Math.hypot(...x);
  for(let k=0;k<3;k++)x[k]/=l;
  const z=[x[1]*n[2]-x[2]*n[1],x[2]*n[0]-x[0]*n[2],x[0]*n[1]-x[1]*n[0]];
  box(g,-width/2,width/2,0,length,-depth/2,depth/2,p=>a.map((v,k)=>v+x[k]*p[0]+n[k]*p[1]+z[k]*p[2]));
}
const layers=()=>Object.fromEntries(materialOrder.map(key=>[key,empty()]));
function arcade(){
  const g=layers();
  box(g.print,-6.3,6.3,-4.2,-3.65,-2.4,2.4);
  box(g.stock,-6.5,6.5,-4.5,-4.2,-2.6,2.6);
  for(const x of[-4,0,4]){
    for(const sign of[-1,1]){
      box(g.stock,x+sign*1.68-.29,x+sign*1.68+.29,-3.65,.2,-1.6,1.6);
      box(g.back,x+sign*1.68-.18,x+sign*1.68+.18,-3.50,.1,-1.72,-1.61);
      box(g.edge,x+sign*1.68-.32,x+sign*1.68+.32,-.06,.08,-1.76,1.76);
    }
    arch(g.print,x,.2,1.37,1.95,3.2);
    box(g.stock,x-2,x+2,2.1,2.65,-1.9,1.9);
    box(g.back,x-1.75,x+1.75,2.2,2.48,-2.04,-1.91);
    box(g.edge,x-.13,x+.13,1.94,2.28,-1.76,1.76);
    for(const sign of[-1,1])box(g.edge,x+sign*1.4-.04,x+sign*1.4+.04,-3.5,.15,1.61,1.67);
  }
  // Stepped cornice, entablature and ribbed/coffered slab are built thickness.
  box(g.print,-6.2,6.2,2.65,3.12,-2.1,2.1);
  box(g.stock,-6.5,6.5,3.12,3.42,-2.4,2.4);
  for(let x=-5.5;x<=5.5;x+=1.1)box(g.back,x-.11,x+.11,2.76,3.10,-2.3,2.3);
  for(const z of[-2.35,2.35])box(g.edge,-6.5,6.5,3.12,3.20,z-.035,z+.035);
  return g;
}
function stair(){
  const g=layers(),steps=14,run=12/steps,rise=9/steps;
  for(let k=0;k<steps;k++){
    const x=-6+k*run,y=-4.5+(k+1)*rise;
    box(g.print,x,x+run,-4.65,y,-2,2);
    box(g.stock,x,x+run,y-.11,y,-2.12,2.12);
    box(g.edge,x+run-.045,x+run,y-.09,y+.012,-2.1,2.1);
  }
  for(const z of[-2.16,2.16]){
    beam(g.back,[-6,-4.6,z],[6,4.0,z],.30,.38);
    beam(g.stock,[-6,-3.3,z],[6,5.3,z],.12,.12);
    for(let k=0;k<=6;k++){const x=-5.8+k*1.9,y=-4.2+k*1.36;box(g.back,x-.05,x+.05,y,y+1.15,z-.06,z+.06);}
  }
  box(g.print,5.8,8.7,3.9,4.5,-2.2,2.2);
  box(g.stock,6,8.6,4.5,4.72,-2.3,2.3);
  for(const z of[-2.15,2.15])box(g.edge,5.8,8.7,4.49,4.55,z-.025,z+.025);
  return g;
}
function soundboard(){
  const g=layers();
  box(g.print,-6.2,6.2,.30,.76,-4.2,4.2);
  for(let x=-5.8;x<=5.8;x+=1.45)box(g.stock,x-.11,x+.11,-.65,.30,-4.05,4.05);
  for(let z=-3.8;z<=3.8;z+=1.52)box(g.stock,-6,6,-.65,.30,z-.10,z+.10);
  for(const z of[-4.2,4.2]){
    box(g.back,-6.2,6.2,-.83,.30,z-.11,z+.11);
    box(g.stock,-6.35,6.35,.22,.42,z-.18,z+.18);
    box(g.edge,-6.3,6.3,.39,.45,z-.035,z+.035);
  }
  for(const x of[-6.2,6.2]){
    box(g.back,x-.1,x+.1,-.83,.30,-4.1,4.1);
    box(g.edge,x-.03,x+.03,.38,.45,-4.2,4.2);
  }
  // Narrow retained string beds and binding corners imply a fabricated musical
  // load-bearing object, without using giant instruments as decorative decals.
  for(let k=0;k<9;k++){const x=-5+k*1.2;beam(g.edge,[x,.79,-3.8],[x+.55,.79,3.8],.025,.025);}
  for(const x of[-5.8,5.8])for(const z of[-3.8,3.8])box(g.back,x-.24,x+.24,-.96,.80,z-.22,z+.22);
  return g;
}
function normalizeBody(g){
  const all=materialOrder.flatMap(key=>g[key].p),b=bounds(all),size=b.max.map((v,k)=>v-b.min[k]);
  for(const key of materialOrder)for(let i=0;i<g[key].p.length;i++)g[key].p[i]=(g[key].p[i]-b.center[i%3])/size[i%3];
  return g;
}
function arcadeArc(definition){
  const g=layers(),{radius:r,width:w,depth:d,startAngle:a0,endAngle:a1}=definition;
  const count=Math.max(2,Math.ceil(Math.abs(a1-a0)*r/(w*1.15))),step=(a1-a0)/count,bay=Math.abs(step)*r;
  for(let k=0;k<count;k++){
    const a=a0+step*(k+.5),sign=Math.sign(step)||1;
    const bend=p=>{const angle=a+sign*p[0]/r,radial=r-w/2+p[1];return[Math.cos(angle)*radial,Math.sin(angle)*radial,p[2]];};
    const inner=bay*.31,outer=bay*.42,spring=w*.30;
    for(const side of[-1,1]){
      box(g.stock,side*(inner+outer)/2-(outer-inner)/2,side*(inner+outer)/2+(outer-inner)/2,0,spring,-d*.38,d*.38,bend);
      box(g.back,side*outer-bay*.05,side*outer+bay*.05,0,w*.89,-d*.48,-d*.39,bend);
      box(g.edge,side*outer-bay*.07,side*outer+bay*.07,spring-.06*w,spring+.015*w,-d*.41,d*.41,bend);
    }
    arch(g.print,0,spring,inner,outer,d*.76,bend,7);
    box(g.print,-bay*.48,bay*.48,w*.82,w*.93,-d*.44,d*.44,bend);
    box(g.stock,-bay*.50,bay*.50,w*.93,w,-d*.50,d*.50,bend);
    box(g.back,-bay*.44,bay*.44,w*.85,w*.92,-d*.49,-d*.45,bend);
    // A luminous keystone and interrupted cornice joint; never a glow ring.
    box(g.edge,-bay*.035,bay*.035,spring+outer-.07*w,spring+outer+.025*w,-d*.41,d*.41,bend);
    box(g.edge,-bay*.44,bay*.44,w*.947,w*.967,d*.46,d*.49,bend);
    for(const x of[-bay*.32,0,bay*.32])box(g.stock,x-bay*.025,x+bay*.025,w*.76,w*.82,-d*.4,d*.4,bend);
  }
  // Tangent/radial bending reverses local XY handedness for an increasing
  // angle. Restore outward winding for native back-face culling and lighting.
  if(a1>a0)for(const key of materialOrder)for(let k=0;k<g[key].i.length;k+=3)[g[key].i[k+1],g[key].i[k+2]]=[g[key].i[k+2],g[key].i[k+1]];
  return g;
}
function pieces(id,g,{archetype=null,arcId=null}={}){
  return materialOrder.filter(key=>g[key].i.length).map(key=>{
    const data=g[key],b=bounds(data.p);
    return freeze({name:PREFIX+id+'-'+key,id:id+'-'+key,kind:'detail',archetype,arcId,layer:key,sourceSurroundingsSide:arcId?2:1,...materials[key],
      p:freeze(data.p),i:freeze(data.i),bounds:freeze({min:freeze(b.min),max:freeze(b.max),center:freeze(b.center)}),triangles:data.i.length/3});
  });
}
const bodyLibrary=freeze([['arcade',arcade],['stair',stair],['soundboard',soundboard]].flatMap(([id,build])=>pieces(id,normalizeBody(build()),{archetype:id})));
const arcLibrary=freeze(SOURCE_SURROUNDINGS_CENTRE_ARCS.flatMap(definition=>pieces('arc-'+definition.id,arcadeArc(definition),{arcId:definition.id})));
const library=freeze([...bodyLibrary,...arcLibrary]);
const byBody=new Map(['arcade','stair','soundboard'].map(id=>[id,bodyLibrary.filter(p=>p.archetype===id)]));
const byArc=new Map(SOURCE_SURROUNDINGS_CENTRE_ARCS.map(row=>[row.id,arcLibrary.filter(p=>p.arcId===row.id)]));
export const SOURCE_SURROUNDINGS_EMITTER_ALIASES=freeze({tower_bell_04:PREFIX+'bell',tower_clapper_04:PREFIX+'clapper'});
export const SOURCE_SURROUNDINGS_REQUIRED_MESHES=freeze([...library.map(row=>row.name),...Object.keys(SOURCE_SURROUNDINGS_EMITTER_ALIASES),...Object.values(SOURCE_SURROUNDINGS_EMITTER_ALIASES)]);
export const SOURCE_SURROUNDINGS_GEOMETRY_STATS=freeze({meshes:library.length,triangles:library.reduce((n,p)=>n+p.triangles,0),
  arcTriangles:arcLibrary.reduce((n,p)=>n+p.triangles,0),maxBodyTriangles:Math.max(...[...byBody.values()].map(rows=>rows.reduce((n,p)=>n+p.triangles,0))),materialParts:4});
export function sourceSurroundingsGeometryLibrary(){return library;}

// Alias only material ownership. The native VAOs, geometry, textures, instance
// buffers and glTF factors remain the original resources. Instance batches are
// uploaded and drawn sequentially, so sharing their existing buffer is safe.
// Rebuilding these two tiny records also repairs a deleted/stale alias without
// allocating a GPU object or modifying the original bell-field material.
export function installSourceSurroundingsEmitterAliases(_gl,pack){
  if(!pack?.catalog?.get||!pack.catalog.set)return[];
  const installed=[];
  for(const [source,name] of Object.entries(SOURCE_SURROUNDINGS_EMITTER_ALIASES)){
    const native=pack.catalog.get(source);if(!native)continue;
    pack.catalog.set(name,{...native,name,
      extras:{...native.extras,sourceSurroundings:true,sourceSurroundingsSide:1,canonicalMesh:source},
      primitives:(native.primitives||[]).map(primitive=>({...primitive,sourceSurroundingsSide:1})),
    });
    installed.push(name);
  }
  return installed;
}

export function sourceSurroundingsMeshPayload(piece){
  const positions=new Float32Array(piece.i.length*3),normals=new Float32Array(positions.length),uvs=new Float32Array(piece.i.length*2);
  for(let j=0;j<piece.i.length;j+=3){
    const ps=piece.i.slice(j,j+3).map(index=>piece.p.slice(index*3,index*3+3));
    const a=ps[1].map((v,k)=>v-ps[0][k]),b=ps[2].map((v,k)=>v-ps[0][k]);
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
    if(length<1e-12)throw Error('Degenerate Source surroundings triangle: '+piece.name);
    for(let k=0;k<3;k++)n[k]/=length;
    const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),tile=piece.arcId?8:.035;
    for(let k=0;k<3;k++){
      const p=ps[k],at=(j+k)*3;positions.set(p,at);normals.set(n,at);
      uvs.set(axis===1?[p[0]/tile,p[2]/tile]:axis===0?[-Math.sign(n[0])*p[2]/tile,-p[1]/tile]:[Math.sign(n[2])*p[0]/tile,-p[1]/tile],(j+k)*2);
    }
  }
  return{positions,normals,uvs,indices:Uint32Array.from({length:piece.i.length},(_,i)=>i),
    bounds:{min:piece.bounds.min,max:piece.bounds.max,center:[0,0,0]},geometricCenter:piece.bounds.center,triangles:piece.triangles};
}

const clapperBounds=freeze({min:freeze([-.13,-1.28,-.127]),max:freeze([.13,-.06,.127])});
const bellBounds=freeze({min:freeze([-.64,-1.02,-.637]),max:freeze([.64,.14,.637])});
const emitterBounds=new Map([['tower_bell_04',bellBounds],['tower_clapper_04',clapperBounds]]);
function matrix(position,rotation,size,origin,canonical=null){
  const x=finite(rotation?.x),y=finite(rotation?.y),z=finite(rotation?.z),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  // Rz*Ry*Rx: column vectors rotate around local X, then Y, then Z.
  const rows=[[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx],[sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx],[-sy,cy*sx,cy*cx]];
  const scales=[finite(size?.x,1),finite(size?.y,1),finite(size?.z,1)],center=[0,0,0];
  if(canonical)for(let k=0;k<3;k++){center[k]=(canonical.min[k]+canonical.max[k])/2;scales[k]/=canonical.max[k]-canonical.min[k];}
  const m=new Float32Array(16);m[15]=1;
  for(let c=0;c<3;c++)for(let r=0;r<3;r++)m[c*4+r]=rows[r][c]*scales[c];
  for(let r=0;r<3;r++)m[12+r]=finite(position?.[['x','y','z'][r]])+finite(origin?.[['x','y','z'][r]])-m[r]*center[0]-m[4+r]*center[1]-m[8+r]*center[2];
  return m;
}
function transformedBounds(local,m){
  const center=local.min.map((v,k)=>(v+local.max[k])/2),half=local.max.map((v,k)=>(v-local.min[k])/2),at=[],radius=[];
  for(let r=0;r<3;r++){
    at[r]=m[12+r]+m[r]*center[0]+m[4+r]*center[1]+m[8+r]*center[2];
    radius[r]=Math.abs(m[r])*half[0]+Math.abs(m[4+r])*half[1]+Math.abs(m[8+r])*half[2];
  }
  return{min:at.map((v,k)=>v-radius[k]),max:at.map((v,k)=>v+radius[k]),center:at,cullRadius:Math.hypot(...radius)};
}
/** Bounded allocation: four rigid parts per body/arc and one per native sender part. */
export function sourceSurroundingsProps(frame,{origin={x:0,y:0,z:0}}={}){
  const props=[];
  const put=(row,piece,m,canonical=null)=>{
    const b=transformedBounds(canonical||piece.bounds,m),loading=clamp(row.loading);
    const matrixScale=Math.max(1,...[0,4,8].map(k=>Math.hypot(m[k],m[k+1],m[k+2])));
    props.push({id:PREFIX+frame.world+'-'+row.id+(canonical?'':'-'+piece.layer),mesh:canonical?SOURCE_SURROUNDINGS_EMITTER_ALIASES[row.mesh]:piece.name,
      x:b.center[0],y:b.center[1],z:b.center[2],matrix:m,zone:ZONE.sourceSpace,structural:true,surroundings:true,
      decorative:true,walkable:false,noCollision:true,world:frame.world,bodyId:row.id,loading,sourceSurroundingsSide:canonical?1:piece.sourceSurroundingsSide,
      materialRole:canonical?'source-surroundings-emitter':piece.materialRole,
      fixturePower:piece?.layer==='edge'?.35+.65*loading:1,
      ...(canonical?{emissive:[.10,.17,.23,.75]}:{}),
      physicalBounds:{min:b.min,max:b.max},cullRadius:b.cullRadius/matrixScale,worldCullRadius:b.cullRadius,worldBounds:b,
    });
  };
  if(!frame||!['fall','centre'].includes(frame.world))return props;
  for(const row of frame.bodies||[]){
    if(row.opacity===0)continue;const pieces=byBody.get(row.archetype);if(!pieces)continue;
    const m=matrix(row.position,row.rotation,row.size,origin);
    for(const piece of pieces)put(row,piece,m);
  }
  for(const row of frame.emitters||[]){
    const canonical=emitterBounds.get(row.mesh);
    if(row.opacity===0||!canonical)continue;
    put(row,null,matrix(row.position,row.rotation,row.size,origin,canonical),canonical);
  }
  for(const row of frame.arcs||[]){
    if(row.opacity===0)continue;const pieces=byArc.get(row.id);if(!pieces)continue;
    const m=matrix(row.position,row.rotation,{x:1,y:1,z:1},origin);
    for(const piece of pieces)put(row,piece,m);
  }
  return props;
}
