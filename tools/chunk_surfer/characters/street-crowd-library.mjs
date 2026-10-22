// Compact build-time wardrobe shared by the street cast. These are retained
// anatomical surfaces, fitted to the same two 54-joint rigs as the Source
// residents. Material changes do not duplicate their GLB geometry accessors.
import fs from 'node:fs';
import {MeshoptSimplifier} from 'meshoptimizer';
import {canonicalAnatomy,retargetMesh} from './vigil-tailoring.mjs';
import {parseCharacterAsset} from '../../../src/render/character-asset.js';
import {STREET_CROWD_GARMENTS} from '../../../src/data/street-crowd-characters.js';

export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,n)=>a.map(v=>v*n);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>mul(a,1/(Math.hypot(...a)||1));
export const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
export function normals(mesh){
  const out=Array(mesh.positions.length).fill(0);
  for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(v=>mesh.positions.slice(v*3,v*3+3)),n=cross(sub(b,a),sub(c,a));for(const v of ids)for(let k=0;k<3;k++)out[v*3+k]+=n[k];}
  for(let i=0;i<out.length;i+=3){const n=unit(out.slice(i,i+3));out[i]=n[0];out[i+1]=n[1];out[i+2]=n[2];}
  return{...mesh,normals:out};
}
export function compact(mesh){
  const used=[...new Set(mesh.indices)],lookup=new Map(used.map((v,i)=>[v,i])),out={...mesh};
  for(const[key,width]of[['positions',3],['normals',3],['skinIndex',4],['skinWeight',4]])out[key]=used.flatMap(v=>mesh[key].slice(v*width,v*width+width));
  out.indices=mesh.indices.map(v=>lookup.get(v));return out;
}
export function rigid(name,positions,indices,bone=0){const count=positions.length;return normals({name,positions:positions.flat(),indices,skinIndex:Array.from({length:count},()=>[bone,0,0,0]).flat(),skinWeight:Array.from({length:count},()=>[1,0,0,0]).flat()});}
export function tube(name,path,radius,bone=0,segments=10){
  const positions=[],indices=[];
  for(let row=0;row<path.length;row++){
    const direction=unit(sub(path[Math.min(row+1,path.length-1)],path[Math.max(0,row-1)])),basis=unit(cross(direction,Math.abs(direction[1])<.9?[0,1,0]:[0,0,1])),other=unit(cross(direction,basis)),r=Array.isArray(radius)?radius[row]:radius;
    for(let k=0;k<=segments;k++){const a=k*Math.PI*2/segments;positions.push(add(path[row],add(mul(basis,Math.cos(a)*r),mul(other,Math.sin(a)*r))));if(row&&k){const v=(row-1)*(segments+1)+k-1;indices.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);}}
  }
  return rigid(name,positions,indices,bone);
}
export function ellipsoid(name,center,radii,bone=0,{segments=16,rings=10,frontCut=false}={}){
  const p=[],idx=[];
  for(let j=0;j<=rings;j++)for(let k=0;k<=segments;k++){
    const phi=j/rings*Math.PI,theta=k/segments*Math.PI*2;
    p.push(add(center,[Math.sin(phi)*Math.sin(theta)*radii[0],Math.cos(phi)*radii[1],Math.sin(phi)*Math.cos(theta)*radii[2]]));
    if(j&&k){const v=(j-1)*(segments+1)+k-1,mid=(k-.5)/segments*Math.PI*2;
      if(!frontCut||Math.cos(mid)>-.30||j<rings*.25)idx.push(v,v+1,v+segments+2,v,v+segments+2,v+segments+1);
    }
  }
  return rigid(name,p,idx,bone);
}
export function lathe(name,profile,center,bone=0,segments=20){
  const p=[],idx=[];
  for(let j=0;j<profile.length;j++)for(let k=0;k<=segments;k++){const a=k*Math.PI*2/segments,[r,y]=profile[j];p.push(add(center,[Math.sin(a)*r,y,Math.cos(a)*r]));if(j&&k){const v=(j-1)*(segments+1)+k-1;idx.push(v,v+segments+2,v+1,v,v+segments+1,v+segments+2);}}
  return rigid(name,p,idx,bone);
}
export function sheet(name,center,size,bone=0,{rows=6,cols=8,curve=.012}={}){
  const p=[],idx=[];
  for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){const u=k/cols,v=j/rows;p.push(add(center,[(u-.5)*size[0],(v-.5)*size[1],Math.sin(u*Math.PI*4)*curve+v*v*.012]));if(j&&k){const a=(j-1)*(cols+1)+k-1;idx.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}}
  return rigid(name,p,idx,bone);
}

export async function loadStreetCrowdLibrary(root){
  await MeshoptSimplifier.ready;
  const read=file=>JSON.parse(fs.readFileSync(root+file)),masters={male:canonicalAnatomy(read('public/assets/recordist-characters/contractor.json')),female:canonicalAnatomy(read('artifacts/bus-woman-production/anatomy.json'))};
  const bytes=fs.readFileSync(root+'public/assets/academic-society-characters.glb'),academic=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  const cache=new Map(),stats=[];
  function simplify(mesh,{ratio=.32,error=.002,skin=false,source:sourceKind}={}){
    const out={...mesh},locks=new Uint8Array(mesh.positions.length/3),source=mesh.indices.length;
    // The whole hand, every knuckle and every fingertip is protected. A head
    // can lose invisible tessellation; a finger must retain its separate tip.
    const fingers=skin?new Set(masters[sourceKind].bones.flatMap((b,i)=>/^(thumb|index|middle|ring|little)_/.test(b.name)?[i]:[])):null;
    if(skin)for(let v=0;v<locks.length;v++)for(let k=0;k<4;k++){const j=mesh.skinIndex[v*4+k];if(mesh.skinWeight[v*4+k]>.02&&fingers.has(j))locks[v]=1;}
    const [indices,reachedError]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(mesh.indices),new Float32Array(mesh.positions),3,new Float32Array(mesh.normals),3,[0,0,0],locks,Math.floor(mesh.indices.length*ratio/3)*3,error,['LockBorder','ErrorAbsolute','RegularizeLight']);
    out.indices=[...indices];const result=compact(normals(out));stats.push({name:mesh.name,beforeTriangles:source/3,triangles:indices.length/3,vertices:result.positions.length/3,error:reachedError});return result;
  }
  const neutral=(mesh,source,donor=masters[source])=>retargetMesh(mesh,donor,masters[source],{height:masters[source].height,width:1,depth:1});
  function cached(key,make){if(!cache.has(key))cache.set(key,make());return cache.get(key).map(m=>({...m}));}
  function face(source,name,headwear){return cached('face:'+source+':'+name+':'+headwear,()=>{
    const entry=academic.entries.find(e=>e.name===`academic_society_${name}`||e.name===`academic_population_${name}`);if(!entry)throw Error('Unknown crowd face '+name);
    return entry.primitives.flatMap(p=>{const role=academic.json.materials[p.material].extras.characterRole;if(!['skin','hair','lip','eye white','iris'].includes(role))return[];
      const mesh={name:`retained ${name} ${role}`,role,positions:[...p.positions],normals:[...p.normals],skinIndex:[...p.joints],skinWeight:[...p.weights],indices:[...p.indices]};
      if(role==='hair'){
        // Academic identities have coiffures tailored for another period.
        // Preserve the fitted hairline/brows while keeping this modern street
        // crown under its actual cap/hood, rather than protruding through it.
        const height=masters[source].height,limit=height+(headwear?-.015:.012),start=height-.17;
        const top=Math.max(...mesh.positions.filter((_,i)=>i%3===1));
        for(let i=1;i<mesh.positions.length;i+=3)if(mesh.positions[i]>start&&top>limit)mesh.positions[i]=start+(mesh.positions[i]-start)/(top-start)*(limit-start);
      }
      return [simplify(mesh,{ratio:role==='skin'?.25:.22,error:role==='skin'?.0025:.003,skin:role==='skin',source})];
    });
  });}
  function lower(source){return cached('lower:'+source,()=>masters[source].meshes.flatMap(m=>{
    const role=/tailored-trousers|denim-trousers|sock/.test(m.name)?'trouser':/closed-leather-shoe|leather-shoe|shoe-sole|shoe-welt/.test(m.name)?'shoe':null;if(!role)return[];
    return[{...simplify(neutral(m,source),{ratio:role==='shoe'?.23:.22,error:role==='shoe'?.002:.004}),role}];
  }));}
  function clothes(source,wardrobe){return cached('clothes:'+source+':'+wardrobe,()=>{
    const master=masters.female,parts=[],target=masters[source],bodyHeight=target.height;
    const coatNames=/^option2-(continuous-tailored-coat|continuous-sleeve|cuff|folded-collar|collar-binding|front-closure|hem-binding)/;
    for(const m of master.meshes)if(coatNames.test(m.name)){
      const out=neutral(m,source,master),base=neutral(master.meshes.find(m=>m.name==='option2-continuous-tailored-coat'),source,master),bottom=Math.min(...base.positions.filter((_,i)=>i%3===1)),waist=bodyHeight*.67;
      const hem=STREET_CROWD_GARMENTS[wardrobe].hem*bodyHeight/1.70;
      for(let i=0;i<out.positions.length;i+=3){const y=out.positions[i+1];if(y<waist&&/continuous-tailored-coat|front-closure|hem-binding/.test(m.name))out.positions[i+1]=hem+(y-bottom)/(waist-bottom)*(waist-hem);
        const torso=Math.max(0,1-Math.abs(out.positions[i+1]-bodyHeight*.64)/(.35*bodyHeight));
        if(Math.abs(out.positions[i])<.24){out.positions[i]*=wardrobe==='duffle'?1.12:wardrobe==='cardigan'?.98:1.04;out.positions[i+2]*=1+torso*(wardrobe==='work-jacket'?.07:wardrobe==='duffle'?.08:.015);}
      }
      parts.push({...simplify(normals(out),{ratio:.22,error:.004}),role:/binding|closure/.test(m.name)?'trim':'coat'});
    }
    for(const m of masters.male.meshes)if(m.name==='contractor-folded-pale-collar')parts.push({...simplify(neutral(m,source,masters.male),{ratio:.35,error:.001}),role:'shirt'});
    const chest=target.bones.findIndex(b=>b.name==='chest'),c=bodyHeight/1.70;
    if(wardrobe==='duffle')for(const y of[1.21,1.10,.99]){
      parts.push({...tube('duffle toggle loop',[[-.055*c,y*c,-.155*c],[.055*c,y*c,-.155*c]],.006*c,chest,8),role:'trim'});
      parts.push({...ellipsoid('rounded duffle horn toggle',[.028*c,y*c,-.165*c],[.027*c,.008*c,.009*c],chest,{segments:10,rings:6}),role:'trim'});
    }
    if(wardrobe==='work-jacket')for(const x of[-.115,.115])parts.push({...sheet('work jacket shaped chest pocket',[x*c,1.20*c,-.175*c],[.10*c,.10*c],chest,{rows:4,cols:4,curve:.001}),role:'trim'});
    if(wardrobe==='anorak')parts.push({...tube('anorak breast storm seam',[[-.17*c,1.19*c,-.16*c],[0,1.17*c,-.185*c],[.17*c,1.19*c,-.16*c]],.007*c,chest,8),role:'trim'});
    return parts;
  });}
  function headwear(source,hat,wardrobe){return cached('hat:'+source+':'+hat+':'+wardrobe,()=>{
    if(!hat)return[];const target=masters[source],head=target.bones.findIndex(b=>b.name==='head'),neck=target.bones.findIndex(b=>b.name==='neck'),h=target.height,c=h/1.70;
    if(hat==='knit-cap')return masters.female.meshes.filter(m=>/woman-soft-wool-cap|woman-cap-turned-rim/.test(m.name)).map(m=>({...simplify(neutral(m,source,masters.female),{ratio:.45,error:.001}),role:'trim'}));
    if(hat==='flat-cap')return[{...ellipsoid('flat cap soft crown',[0,h-.037*c,.020*c],[.111*c,.046*c,.131*c],head,{segments:20,rings:8}),role:'trim'},
      {...ellipsoid('flat cap projecting rounded peak',[0,h-.064*c,-.105*c],[.105*c,.009*c,.095*c],head,{segments:18,rings:6}),role:'trim'}];
    return[{...ellipsoid('open rain hood over anatomical head',[0,h-.135*c,.018*c],[.115*c,.165*c,.13*c],head,{segments:20,rings:14,frontCut:true}),role:'coat'},
      {...tube('hood shaped neck opening',[[-.10*c,h-.22*c,-.045*c],[-.075*c,h-.29*c,-.09*c],[0,h-.31*c,-.11*c],[.075*c,h-.29*c,-.09*c],[.10*c,h-.22*c,-.045*c]],.018*c,neck,8),role:'trim'}];
  });}
  function scarf(source){return cached('scarf:'+source,()=>masters.female.meshes.filter(m=>/option2-mustard-neck-scarf|option2-ribbed-scarf-end/.test(m.name)).map(m=>({...simplify(neutral(m,source,masters.female),{ratio:.30,error:.001}),role:'scarf'})));}
  function reflective(source){return cached('reflective:'+source,()=>{
    const c=masters[source].height/1.78,parts=[];
    for(const[y,bone]of[[1.22,'chest'],[.99,'spine_lower']]){
      const p=[],idx=[],cols=12;for(let row=0;row<2;row++)for(let k=0;k<=cols;k++){const x=(k/cols-.5)*.405;p.push([x*c,(y+(row-.5)*.041)*c,(-.167-.019*(1-(x/.23)**2))*c]);if(row&&k){const a=k-1;idx.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}}
      parts.push({...rigid('sewn high visibility reflective torso band',p,idx,masters[source].bones.findIndex(b=>b.name===bone)),role:'reflective'});
    }
    return parts;
  });}
  return{masters,stats,cache,parts(d){return[...face(d.source,d.face,d.headwear),...lower(d.source),...clothes(d.source,d.wardrobe),...headwear(d.source,d.headwear,d.wardrobe),...(d.scarf?[...scarf(d.source)]:[]),...(d.highVis?reflective(d.source):[])];}};
}
