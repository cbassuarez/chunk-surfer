// Build-time anatomical repair and rest-space tailoring. Runtime bones retain
// identity bind rotations; these functions put every vertex into that common
// rest skeleton before the performance solver touches it.
import fs from 'node:fs';
import zlib from 'node:zlib';

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,n)=>a.map(v=>v*n);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const length=a=>Math.hypot(...a);
const unit=a=>mul(a,1/(length(a)||1));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const copy=value=>structuredClone(value);
const digits=['thumb','index','middle','ring','little'];

let contractorPhalanges;
function retainedContractorPhalanges(){
  if(contractorPhalanges)return contractorPhalanges;
  const base=new URL('../character-sources/makehuman/',import.meta.url);
  const vertices=[],body=new Set();let group='';
  for(const row of fs.readFileSync(new URL('base.obj',base),'utf8').split(/\r?\n/)){
    const fields=row.trim().split(/\s+/);
    if(fields[0]==='v')vertices.push(fields.slice(1,4).map(Number));
    else if(fields[0]==='g')group=fields[1];
    else if(fields[0]==='f'&&group==='body')for(const field of fields.slice(1))body.add(Number(field.split('/')[0])-1);
  }
  // This is the exact macro used by the retained contractor anatomical master,
  // not a guess at equally spaced joints in an already posed finger.
  for(const [age,weight]of[['young',.72],['old',.28]])for(const prefix of['caucasian-male-','universal-male-']){
    const name=prefix+age+(prefix.startsWith('universal')?'-averagemuscle-averageweight':'')+'.target.gz';
    for(const row of zlib.gunzipSync(fs.readFileSync(new URL(name,base))).toString().split(/\r?\n/)){
      const fields=row.trim().split(/\s+/);if(fields.length!==4||!/^\d+$/.test(fields[0]))continue;
      const point=vertices[Number(fields[0])];for(let axis=0;axis<3;axis++)point[axis]+=Number(fields[axis+1])*weight;
    }
  }
  const selected=[...body].map(i=>vertices[i][1]),bottom=Math.min(...selected),scale=1.78/(Math.max(...selected)-bottom);
  const game=vertices.map(p=>[p[0]*scale,(p[1]-bottom)*scale,-p[2]*scale]);
  const skeleton=JSON.parse(fs.readFileSync(new URL('default.mhskel',base),'utf8'));
  const point=key=>{
    const ids=skeleton.joints[key];if(!ids?.length)throw new Error('Missing retained anatomical joint '+key);
    return mul(ids.reduce((sum,i)=>add(sum,game[i]),[0,0,0]),1/ids.length);
  };
  contractorPhalanges={};
  for(const side of['L','R'])for(let digit=0;digit<digits.length;digit++){
    const names=[1,2,3].map(segment=>skeleton.bones[`finger${digit+1}-${segment}.${side==='L'?'R':'L'}`]);
    contractorPhalanges[digits[digit]+'_'+side]=[point(names[0].head),...names.map(b=>point(b.tail))];
  }
  return contractorPhalanges;
}

function fourWeights(influences){
  const merged=new Map();for(const[index,weight]of influences)if(weight>1e-9)merged.set(index,(merged.get(index)||0)+weight);
  const pairs=[...merged].sort((a,b)=>b[1]-a[1]).slice(0,4),total=pairs.reduce((sum,pair)=>sum+pair[1],0);
  if(total<=1e-9)throw new Error('Anatomical vertex has no skin influences');
  for(const pair of pairs)pair[1]/=total;
  while(pairs.length<4)pairs.push([0,0]);
  return pairs;
}

/** Clone a retained source, repairing the collapsed contractor finger rig.
 * Existing indices remain stable. Twenty anatomical mid/tip bones are appended
 * and each source finger influence is redistributed around its real knuckles. */
export function canonicalAnatomy(source){
  const out=copy(source),splits=new Map();
  const retained=source.id==='contractor'?retainedContractorPhalanges():null;
  for(const side of['L','R'])for(const digit of digits){
    const name=digit+'_'+side,index=out.bones.findIndex(b=>b.name===name),bone=out.bones[index];
    if(!bone||out.bones.some(b=>b.name===digit+'_mid_'+side))continue;
    const original=copy(bone),axis=sub(original.tail,original.head),size=length(axis);
    if(size<1e-6)throw new Error('Degenerate anatomical finger '+name);
    let points=retained?.[name];
    if(points){
      const error=Math.max(length(sub(points[0],bone.head)),length(sub(points[3],bone.tail)));
      if(error>.0001)throw new Error(`Retained contractor ${name} differs from its master by ${error} metres`);
      points=[bone.head,points[1],points[2],bone.tail].map(p=>p.slice());
    }else points=[bone.head,mix(bone.head,bone.tail,.39),mix(bone.head,bone.tail,.73),bone.tail];
    const middle=out.bones.length,tip=middle+1;
    bone.tail=points[1];
    out.bones.push({name:digit+'_mid_'+side,parent:name,head:points[1],tail:points[2]},
      {name:digit+'_tip_'+side,parent:digit+'_mid_'+side,head:points[2],tail:points[3]});
    const along=p=>dot(sub(p,original.head),axis)/(size*size);
    splits.set(index,{indices:[index,middle,tip],original,along,knuckles:[along(points[1]),along(points[2])]});
  }
  if(!splits.size)return out;
  for(const mesh of out.meshes)for(let vertex=0;vertex<mesh.positions.length/3;vertex++){
    const point=mesh.positions.slice(vertex*3,vertex*3+3),influences=[];
    for(let slot=0;slot<4;slot++){
      const at=vertex*4+slot,index=mesh.skinIndex[at],weight=mesh.skinWeight[at];if(!weight)continue;
      const split=splits.get(index);if(!split){influences.push([index,weight]);continue;}
      const t=clamp(split.along(point)),[first,second]=split.knuckles;
      // A narrow smooth bridge at each knuckle keeps the crease articulated;
      // the middle of each phalanx stays rigid rather than bending as rubber.
      const halfBand=Math.min(.075,(second-first)*.28,first*.28,(1-second)*.28);
      const firstBlend=smooth((t-(first-halfBand))/(2*halfBand)),secondBlend=smooth((t-(second-halfBand))/(2*halfBand));
      influences.push([split.indices[0],weight*(1-firstBlend)],
        [split.indices[1],weight*(firstBlend-secondBlend)],
        [split.indices[2],weight*secondBlend]);
    }
    const pairs=fourWeights(influences);
    for(let slot=0;slot<4;slot++){mesh.skinIndex[vertex*4+slot]=pairs[slot][0];mesh.skinWeight[vertex*4+slot]=pairs[slot][1];}
  }
  out.stats={...out.stats,bones:out.bones.length,fingerSegments:3};
  return out;
}

function frame(bone,bones){
  const y=unit(sub(bone.tail,bone.head));let reference=[0,0,-1];
  if(/^(hand|thumb|index|middle|ring|little)/.test(bone.name)){
    const side=bone.name.endsWith('_L')?'L':'R',hand=bones.get('hand_'+side),index=bones.get('index_'+side),little=bones.get('little_'+side);
    if(hand&&index&&little){const longitudinal=sub(index.head,hand.head),across=sub(little.head,index.head);reference=unit(cross(longitudinal,across));}
  }
  let z=sub(reference,mul(y,dot(reference,y)));
  if(length(z)<1e-6)z=sub([1,0,0],mul(y,y[0]));
  z=unit(z);const x=unit(cross(y,z));z=unit(cross(x,y));
  return{x,y,z};
}
const local=(value,basis)=>[dot(value,basis.x),dot(value,basis.y),dot(value,basis.z)];
const world=(value,basis)=>add(add(mul(basis.x,value[0]),mul(basis.y,value[1])),mul(basis.z,value[2]));

/** Tailor a skinned donor mesh into the target rest skeleton, then apply the
 * cast member's global proportions. Unlike a joint-name substitution, this
 * aligns both ends of every sleeve with the new elbow and wrist before posing.
 * All returned skin indices refer to target.bones. */
export function retargetMesh(mesh,template,target,design){
  const templateBones=new Map(template.bones.map(b=>[b.name,b]));
  const targetBones=new Map(target.bones.map(b=>[b.name,b]));
  const lookup=new Map(target.bones.map((b,i)=>[b.name,i]));
  const scale=[design.width,design.height/target.height,design.depth];
  const same=template.bones.length===target.bones.length&&template.bones.every(b=>{
    const other=targetBones.get(b.name);return other&&length(sub(b.head,other.head))<1e-9&&length(sub(b.tail,other.tail))<1e-9;
  });
  const overall=target.height/template.height;
  const shoulderRatio=Math.abs((targetBones.get('upperarm_L')?.head[0]||1)/(templateBones.get('upperarm_L')?.head[0]||1));
  const maps=template.bones.map(bone=>{
    const destination=targetBones.get(bone.name)||targetBones.get(bone.name.replace(/_(mid|tip)_/,'_'));
    if(!destination)throw new Error('No target rest bone for '+bone.name);
    const donorLength=length(sub(bone.tail,bone.head)),targetLength=length(sub(destination.tail,destination.head));
    const torso=/^(pelvis|spine|chest|neck|head|jaw|clavicle)/.test(bone.name),transverse=torso?shoulderRatio:overall;
    return{source:bone,target:destination,from:frame(bone,templateBones),to:frame(destination,targetBones),
      factors:[transverse,targetLength/Math.max(1e-6,donorLength),overall],index:lookup.get(destination.name)};
  });
  const positions=[],normals=[],skinIndex=[],skinWeight=[];
  for(let vertex=0;vertex<mesh.positions.length/3;vertex++){
    const p=mesh.positions.slice(vertex*3,vertex*3+3),n=mesh.normals.slice(vertex*3,vertex*3+3),influences=[];let position=[0,0,0],normal=[0,0,0];
    for(let slot=0;slot<4;slot++){
      const at=vertex*4+slot,weight=mesh.skinWeight[at];if(!weight)continue;
      const map=maps[mesh.skinIndex[at]];if(!map)throw new Error('Invalid donor skin joint');
      let point=p,direction=n;
      if(!same){
        const restLocal=local(sub(p,map.source.head),map.from);
        point=add(map.target.head,world(restLocal.map((v,i)=>v*map.factors[i]),map.to));
        // Inverse transpose of the complete rest affine map, including the
        // different along-bone scale, rather than rotating a stale normal.
        direction=world(local(n,map.from).map((v,i)=>v/map.factors[i]),map.to);
      }
      position=add(position,mul(point,weight));normal=add(normal,mul(direction,weight));influences.push([map.index,weight]);
    }
    const pairs=fourWeights(influences),total=influences.reduce((sum,pair)=>sum+pair[1],0);
    positions.push(...position.map((v,i)=>v/total*scale[i]));
    normals.push(...unit(normal.map((v,i)=>v/scale[i])));
    skinIndex.push(...pairs.map(pair=>pair[0]));skinWeight.push(...pairs.map(pair=>pair[1]));
  }
  return{...mesh,positions,normals,skinIndex,skinWeight};
}

/** Extend cropped anatomical wrist openings beneath the coat cuff. Mesh and
 * bones must share the same rest-space units/proportions. Only closed boundary
 * loops centred on their own wrist qualify; face/hair/other openings remain
 * untouched. Original vertices and skin weights are retained exactly. */
export function extendWristUnderlap(mesh,bones){
  const out={...mesh,positions:[...mesh.positions],normals:[...mesh.normals],indices:[...mesh.indices],skinIndex:[...mesh.skinIndex],skinWeight:[...mesh.skinWeight]};
  if(mesh.uv)out.uv=[...mesh.uv];
  const edges=new Map(),key=(a,b)=>a<b?a+':'+b:b+':'+a;
  for(let i=0;i<mesh.indices.length;i+=3)for(let edge=0;edge<3;edge++){
    const a=mesh.indices[i+edge],b=mesh.indices[i+(edge+1)%3],k=key(a,b),entry=edges.get(k);
    if(entry)entry.count++;else edges.set(k,{a,b,count:1});
  }
  const boundary=[...edges.values()].filter(edge=>edge.count===1),adjacent=new Map();
  for(const edge of boundary){for(const[a,b]of[[edge.a,edge.b],[edge.b,edge.a]]){if(!adjacent.has(a))adjacent.set(a,[]);adjacent.get(a).push(b);}}
  const visited=new Set(),loops=[];
  for(const start of adjacent.keys())if(!visited.has(start)){
    const vertices=[start];visited.add(start);
    for(let i=0;i<vertices.length;i++)for(const next of adjacent.get(vertices[i]))if(!visited.has(next)){visited.add(next);vertices.push(next);}
    if(vertices.length>=8&&vertices.every(vertex=>adjacent.get(vertex).length===2))loops.push(vertices);
  }
  const repairs=[];
  for(const side of['L','R']){
    const hand=bones.find(b=>b.name==='hand_'+side),forearm=bones.find(b=>b.name==='forearm_'+side),forearmJoint=bones.indexOf(forearm);
    if(!hand||!forearm)continue;
    const loop=loops.find(vertices=>{
      const center=mul(vertices.reduce((sum,vertex)=>add(sum,mesh.positions.slice(vertex*3,vertex*3+3)),[0,0,0]),1/vertices.length);
      if(length(sub(center,hand.head))>.025)return false;
      if(vertices.some(vertex=>length(sub(mesh.positions.slice(vertex*3,vertex*3+3),hand.head))>.075))return false;
      // Some non-anatomical meshes may happen to have an opening near a hand.
      // Require that this is skin already attached to the same wrist/forearm.
      return vertices.every(vertex=>{
        let total=0;for(let slot=0;slot<4;slot++){const j=mesh.skinIndex[vertex*4+slot],name=bones[j]?.name||'';if(name==='hand_'+side||name==='forearm_'+side)total+=mesh.skinWeight[vertex*4+slot];}
        return total>.5;
      });
    });
    if(!loop)continue;
    const loopSet=new Set(loop),loopEdges=boundary.filter(edge=>loopSet.has(edge.a)&&loopSet.has(edge.b)),axis=unit(sub(forearm.tail,forearm.head)),rows=[];
    let previous=new Map(loop.map(vertex=>[vertex,vertex]));
    for(let row=1;row<=3;row++){
      const t=row/3,current=new Map();
      for(const vertex of loop){
        const p=mesh.positions.slice(vertex*3,vertex*3+3),delta=sub(p,hand.head),radial=sub(delta,mul(axis,dot(delta,axis))),buried=add(sub(hand.head,mul(axis,.03)),mul(radial,.96)),index=out.positions.length/3;
        out.positions.push(...mix(p,buried,t));out.normals.push(0,0,0);current.set(vertex,index);
        const weights=[[forearmJoint,t]];for(let slot=0;slot<4;slot++)weights.push([mesh.skinIndex[vertex*4+slot],mesh.skinWeight[vertex*4+slot]*(1-t)]);
        const normalized=fourWeights(weights);out.skinIndex.push(...normalized.map(pair=>pair[0]));out.skinWeight.push(...normalized.map(pair=>pair[1]));
        if(out.uv)out.uv.push(...mesh.uv.slice(vertex*2,vertex*2+2));
      }
      for(const {a,b}of loopEdges)out.indices.push(previous.get(b),previous.get(a),current.get(a),previous.get(b),current.get(a),current.get(b));
      rows.push([...current.values()]);previous=current;
    }
    repairs.push({side,boundary:[...loop],rings:rows,forearmJoint,depth:.03});
  }
  if(repairs.length){
    out.normals.fill(0);
    for(let i=0;i<out.indices.length;i+=3){const ids=out.indices.slice(i,i+3),points=ids.map(vertex=>out.positions.slice(vertex*3,vertex*3+3)),normal=cross(sub(points[1],points[0]),sub(points[2],points[0]));for(const vertex of ids)for(let axis=0;axis<3;axis++)out.normals[vertex*3+axis]+=normal[axis];}
    for(let i=0;i<out.normals.length;i+=3){const normal=unit(out.normals.slice(i,i+3));for(let axis=0;axis<3;axis++)out.normals[i+axis]=normal[axis];}
  }
  return{...out,wristUnderlap:repairs};
}
