import {ELLERY_PUBLIC_FRONT as C,ELLERY_YARD_HERO_REPAIR as R} from '../../src/data/ellery-public-front.js';

const within=(point,min,max,e=1e-4)=>point.every((v,k)=>v>=min[k]-e&&v<=max[k]+e);
const bounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
const include=(b,p)=>p.forEach((v,k)=>{b.min[k]=Math.min(b.min[k],v);b.max[k]=Math.max(b.max[k],v);});

// Weld only for ownership analysis. The actual split normals/UVs and the
// original index/winding remain untouched when a whole closed part is moved.
export function heroConnectedParts(mesh){
  const points=[],parents=[],weld=new Map(),primitives=[],triangles=[];
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parents[b]=a;};
  for(const primitive of mesh.listPrimitives()){
    const position=primitive.getAttribute('POSITION'),map=[];
    for(let i=0;i<position.getCount();i++){
      const point=position.getElement(i,[]),key=point.map(v=>Math.round(v*1e5)).join(',');
      let id=weld.get(key);if(id==null){id=points.length;weld.set(key,id);points.push(point);parents.push(id);}map.push(id);
    }
    const index=primitive.getIndices().getArray();
    for(let i=0;i<index.length;i+=3){const ids=[map[index[i]],map[index[i+1]],map[index[i+2]]];join(ids[0],ids[1]);join(ids[0],ids[2]);triangles.push({ids,material:primitive.getMaterial().getName()});}
    primitives.push({primitive,map,positions:Array.from(position.getArray()),normals:Array.from(primitive.getAttribute('NORMAL').getArray())});
  }
  const parts=new Map();
  for(const triangle of triangles){
    const id=find(triangle.ids[0]);let part=parts.get(id);
    if(!part){part={id,...bounds(),triangles:0,materials:new Set()};parts.set(id,part);}
    part.triangles++;part.materials.add(triangle.material);for(const vertex of triangle.ids)include(part,points[vertex]);
  }
  for(const part of parts.values())part.materials=[...part.materials].sort();
  for(const p of primitives)p.parts=p.map.map(find);
  return{parts,primitives};
}

export function heroPartRepair(part){
  const b=R.backstage;
  if(within(part.min,b.sourceMin,b.sourceMax)&&within(part.max,b.sourceMin,b.sourceMax)&&part.min[0]<b.minimumWestReach)
    return{kind:'backstage',translation:b.translation};
  for(const pipe of R.pipes){
    const [x,,z]=pipe.sourceCenter;
    if(part.materials.length===1&&part.materials[0]==='painted steel'
      &&Math.abs((part.min[0]+part.max[0])/2-x)<1e-4&&Math.abs((part.min[2]+part.max[2])/2-z)<1e-4
      &&Math.abs(part.min[1])<1e-4&&Math.abs(part.max[1]-pipe.sourceHeight)<1e-4
      &&Math.abs(part.max[0]-part.min[0]-.17)<1e-4&&Math.abs(part.max[2]-part.min[2]-.17)<1e-4)
      return{kind:'pipe',id:pipe.id,translation:[pipe.worldX-C.hero.anchor.x-x,0,0],scaleY:pipe.height/pipe.sourceHeight};
  }
  return null;
}

export function repairHeroYard(doc,mesh,buffer){
  const analysis=heroConnectedParts(mesh),repairs=new Map(),receipt=[];
  for(const part of analysis.parts.values()){
    const repair=heroPartRepair(part);if(!repair)continue;repairs.set(part.id,repair);
    const moved=point=>point.map((v,k)=>v*(k===1?repair.scaleY||1:1)+(repair.translation[k]||0));
    receipt.push({...part,repair,after:{min:moved(part.min),max:moved(part.max)}});
  }
  if(receipt.filter(p=>p.repair.kind==='pipe').length!==R.pipes.length)throw Error('The two original rainwater components must be identified exactly.');
  if(receipt.filter(p=>p.repair.kind==='backstage').length<20)throw Error('The closed backstage parts were not identified.');
  let n=0;
  for(const p of analysis.primitives){
    if(!p.parts.some(id=>repairs.has(id)))continue;
    for(let i=0;i<p.parts.length;i++){
      const repair=repairs.get(p.parts[i]);if(!repair)continue;
      for(let k=0;k<3;k++)p.positions[i*3+k]=p.positions[i*3+k]*(k===1?repair.scaleY||1:1)+(repair.translation[k]||0);
      if(repair.scaleY){const normal=p.normals.slice(i*3,i*3+3);normal[1]/=repair.scaleY;const length=Math.hypot(...normal)||1;for(let k=0;k<3;k++)p.normals[i*3+k]=normal[k]/length;}
    }
    p.primitive.setAttribute('POSITION',doc.createAccessor('yard-repair-position-'+n).setType('VEC3').setArray(new Float32Array(p.positions)).setBuffer(buffer));
    p.primitive.setAttribute('NORMAL',doc.createAccessor('yard-repair-normal-'+n++).setType('VEC3').setArray(new Float32Array(p.normals)).setBuffer(buffer));
  }
  return{parts:receipt,movedTriangles:receipt.reduce((n,p)=>n+p.triangles,0),addedTriangles:0};
}

// Brackets join the repositioned goods to the actual skin. A short roof neck
// and a receiving shoe/grating make the two ends physically intelligible.
export function appendHeroRainwaterConnections(doc,mesh,buffer){
  const groups=new Map(),parts=[];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function box(id,center,size,material='painted steel'){
    const group=groups.get(material)||{positions:[],normals:[],uvs:[],indices:[]};groups.set(material,group);
    const points=Array.from({length:8},(_,i)=>center.map((v,k)=>v+(i&(1<<k)?1:-1)*size[k]/2));
    for(const face of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]]){
      const p=face.map(i=>points[i]),normal=cross(p[1].map((v,k)=>v-p[0][k]),p[2].map((v,k)=>v-p[0][k])),length=Math.hypot(...normal),start=group.positions.length/3;
      for(const point of p){group.positions.push(point[0]-C.hero.anchor.x,point[1],point[2]-C.hero.anchor.z);group.normals.push(...normal.map(v=>v/length));group.uvs.push(point[2],point[1]);}
      group.indices.push(start,start+1,start+2,start,start+2,start+3);
    }
    parts.push({id,center,size,material});
  }
  for(const p of R.pipes){
    for(const y of[1.1,p.height*.5,p.height-.5])box(p.id+'-wall-clamp-'+y,[p.worldX+.14,y,p.worldZ],[.32,.065,.25]);
    box(p.id+'-hopper',[p.worldX,p.height-.08,p.worldZ],[.28,.3,.3]);
    box(p.id+'-roof-neck',[49.55,p.roofHeight-.2,p.worldZ],[1.1,.15,.18]);
    box(p.id+'-shoe',[48.86,.10,p.worldZ],[.38,.16,.18]);
    box(p.id+'-gully-frame',[48.70,.025,p.worldZ],[.46,.05,.56],'chapel stone');
    for(let i=0;i<5;i++)box(p.id+'-gully-bar-'+i,[48.70,.055,p.worldZ-.20+i*.10],[.37,.025,.035]);
  }
  for(const [name,g]of groups){
    const material=doc.getRoot().listMaterials().find(m=>m.getName()===name);if(!material)throw Error('Original rainwater material absent: '+name);
    const attribute=(label,type,values,integer=false)=>doc.createAccessor('rainwater-'+name+'-'+label).setType(type).setArray(integer?new Uint32Array(values):new Float32Array(values)).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',attribute('positions','VEC3',g.positions)).setAttribute('NORMAL',attribute('normals','VEC3',g.normals)).setAttribute('TEXCOORD_0',attribute('uvs','VEC2',g.uvs)).setIndices(attribute('indices','SCALAR',g.indices,true)).setMaterial(material));
  }
  return{parts,addedTriangles:parts.length*12};
}

export function inHeroRepairSourceRegion(point){
  if(within(point,R.backstage.sourceMin,R.backstage.sourceMax))return true;
  return R.pipes.some(p=>within(point,[p.sourceCenter[0]-.086,-.001,p.sourceCenter[2]-.086],[p.sourceCenter[0]+.086,p.sourceHeight+.001,p.sourceCenter[2]+.086]));
}
