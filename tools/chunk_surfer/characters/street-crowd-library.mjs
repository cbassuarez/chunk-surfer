// Compact build-time wardrobe shared by the street cast. These are retained
// anatomical surfaces, fitted to the same two 54-joint rigs as the Source
// residents. Material changes do not duplicate their GLB geometry accessors.
import fs from 'node:fs';
import {MeshoptSimplifier} from 'meshoptimizer';
import {canonicalAnatomy,retargetMesh,extendWristUnderlap} from './vigil-tailoring.mjs';
import {retainedBody,fittedProxyGarment,fitClothToEnvelope} from './vigil-body-fit.mjs';
import {extendOuterwear} from './vigil-garment-drape.mjs';
import {parseCharacterAsset} from '../../../src/render/character-asset.js';
import {STREET_CROWD_GARMENTS,STREET_CROWD_DESIGNS} from '../../../src/data/street-crowd-characters.js';
import {streetCrowdPose} from '../../../src/render/street-crowd-performance.js';

export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,n)=>a.map(v=>v*n);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
export const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
export function normals(mesh){
  const out=Array(mesh.positions.length).fill(0),indices=[];
  for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(v=>mesh.positions.slice(v*3,v*3+3)),n=cross(sub(b,a),sub(c,a));if(Math.hypot(...n)<1e-13)continue;indices.push(...ids);for(const v of ids)for(let k=0;k<3;k++)out[v*3+k]+=n[k];}
  const seams=new Map(),key=i=>mesh.positions.slice(i,i+3).map(v=>Math.round(v*1e8)).join(',');
  for(let i=0;i<out.length;i+=3)if(Math.hypot(...out.slice(i,i+3))>1e-12){const k=key(i),sum=seams.get(k)||[0,0,0];seams.set(k,add(sum,out.slice(i,i+3)));}
  for(let i=0;i<out.length;i+=3){const n=unit(Math.hypot(...out.slice(i,i+3))>1e-12?out.slice(i,i+3):seams.get(key(i))||mesh.normals?.slice(i,i+3)||[0,1,0]);out[i]=n[0];out[i+1]=n[1];out[i+2]=n[2];}
  return{...mesh,indices,normals:out};
}
export function compact(mesh){
  const used=[...new Set(mesh.indices)],lookup=new Map(used.map((v,i)=>[v,i])),out={...mesh};
  for(const[key,width]of[['positions',3],['normals',3],['skinIndex',4],['skinWeight',4],...(mesh.uv?[['uv',2]]:[])])out[key]=used.flatMap(v=>mesh[key].slice(v*width,v*width+width));
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

/** Apply sewn return thickness after surface simplification. Decimating a
 * 2 mm outer/inner sandwich at a 2 mm tolerance collapses its hem into ragged
 * alternating triangles. The fitted outer is simplified alone; its exact
 * finished edge then receives a matching 28 mm inward facing. */
export function streetCrowdFacing(mesh,depth=.028,thickness=.0022){
  const outer=normals(mesh),count=outer.positions.length/3,edges=new Map(),neighbors=Array.from({length:count},()=>[]),distance=new Float64Array(count).fill(Infinity),queue=[];
  for(let i=0;i<outer.indices.length;i+=3)for(let k=0;k<3;k++){const a=outer.indices[i+k],b=outer.indices[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a;if(edges.has(key))edges.get(key).count++;else{edges.set(key,{a,b,count:1});const d=Math.hypot(...sub(outer.positions.slice(a*3,a*3+3),outer.positions.slice(b*3,b*3+3)));neighbors[a].push([b,d]);neighbors[b].push([a,d]);}}
  const boundary=[...edges.values()].filter(e=>e.count===1);
  for(const e of boundary)for(const v of[e.a,e.b])if(distance[v]!==0){distance[v]=0;queue.push(v);}
  for(let i=0;i<queue.length;i++){const a=queue[i];for(const[b,d]of neighbors[a])if(distance[a]+d<Math.min(depth,distance[b])){distance[b]=distance[a]+d;queue.push(b);}}
  const positions=[...outer.positions],skinIndex=[...outer.skinIndex],skinWeight=[...outer.skinWeight],indices=[...outer.indices],lookup=new Map();
  const inside=v=>{if(lookup.has(v))return lookup.get(v);const at=positions.length/3;positions.push(...sub(outer.positions.slice(v*3,v*3+3),mul(outer.normals.slice(v*3,v*3+3),thickness)));skinIndex.push(...outer.skinIndex.slice(v*4,v*4+4));skinWeight.push(...outer.skinWeight.slice(v*4,v*4+4));lookup.set(v,at);return at;};
  let liningTriangles=0;for(let i=0;i<outer.indices.length;i+=3){const[a,b,c]=outer.indices.slice(i,i+3);if([a,b,c].some(v=>distance[v]<depth)){indices.push(inside(a),inside(c),inside(b));liningTriangles++;}}
  for(const{a,b}of boundary)indices.push(b,a,inside(a),b,inside(a),inside(b));
  return{...normals({...outer,positions,indices,skinIndex,skinWeight,uv:undefined}),facing:{depth,thickness,outerTriangles:outer.indices.length/3,liningTriangles,returnEdges:boundary.length,outerVertices:count}};
}

/** Cut the cardigan's front as real cloth edges, preserving interpolated skin
 * weights. The cotton underneath is a separate fitted layer, never skin or a
 * dark painted stripe masquerading as an opening. */
export function streetCrowdFrontOpening(mesh,halfWidth=.025){
  const out={...mesh,positions:[...mesh.positions],normals:[...mesh.normals],skinIndex:[...mesh.skinIndex],skinWeight:[...mesh.skinWeight],indices:[],uv:undefined},cache=new Map();
  const crossing=(a,b,sign)=>{const key=[a,b].sort((a,b)=>a-b).join(':')+':'+sign;if(cache.has(key))return cache.get(key);const ax=out.positions[a*3],bx=out.positions[b*3],t=(sign*halfWidth-ax)/(bx-ax),id=out.positions.length/3,weights=new Map();
    for(let k=0;k<3;k++)out.positions.push(out.positions[a*3+k]+(out.positions[b*3+k]-out.positions[a*3+k])*t);out.normals.push(...unit([0,1,2].map(k=>out.normals[a*3+k]+(out.normals[b*3+k]-out.normals[a*3+k])*t)));
    for(const[v,w]of[[a,1-t],[b,t]])for(let k=0;k<4;k++){const at=v*4+k,j=out.skinIndex[at];weights.set(j,(weights.get(j)||0)+out.skinWeight[at]*w);}const pairs=[...weights].filter(p=>p[1]>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4),total=pairs.reduce((n,p)=>n+p[1],0);while(pairs.length<4)pairs.push([0,0]);out.skinIndex.push(...pairs.map(p=>p[0]));out.skinWeight.push(...pairs.map(p=>p[1]/total));cache.set(key,id);return id;
  };
  for(let i=0;i<mesh.indices.length;i+=3){const triangle=mesh.indices.slice(i,i+3),front=triangle.every(v=>mesh.positions[v*3+2]<-.02);if(!front){out.indices.push(...triangle);continue;}
    for(const sign of[-1,1]){const polygon=[];for(let e=0;e<3;e++){const a=triangle[e],b=triangle[(e+1)%3],insideA=sign*out.positions[a*3]>=halfWidth-1e-9,insideB=sign*out.positions[b*3]>=halfWidth-1e-9;if(insideA)polygon.push(a);if(insideA!==insideB)polygon.push(crossing(a,b,sign));}for(let k=1;k<polygon.length-1;k++)out.indices.push(polygon[0],polygon[k],polygon[k+1]);}
  }
  return compact(normals({...out,frontOpening:{halfWidth}}));
}

export async function loadStreetCrowdLibrary(root){
  await MeshoptSimplifier.ready;
  const read=file=>JSON.parse(fs.readFileSync(root+file)),masters={male:canonicalAnatomy(read('public/assets/recordist-characters/contractor.json')),female:canonicalAnatomy(read('artifacts/bus-woman-production/anatomy.json'))};
  const bytes=fs.readFileSync(root+'public/assets/academic-society-characters.glb'),academic=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  const cache=new Map(),stats=[];
  function simplify(mesh,{ratio=.32,error=.002,skin=false,source:sourceKind,normalWeight=.006}={}){
    const out={...mesh},locks=new Uint8Array(mesh.positions.length/3),source=mesh.indices.length;
    // The whole hand, every knuckle and every fingertip is protected. A head
    // can lose invisible tessellation; a finger must retain its separate tip.
    const fingers=skin?new Set(masters[sourceKind].bones.flatMap((b,i)=>/^(thumb|index|middle|ring|little)_/.test(b.name)?[i]:[])):null;
    if(skin)for(let v=0;v<locks.length;v++)for(let k=0;k<4;k++){const j=mesh.skinIndex[v*4+k];if(mesh.skinWeight[v*4+k]>.02&&fingers.has(j))locks[v]=1;}
    const [indices,reachedError]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(mesh.indices),new Float32Array(mesh.positions),3,new Float32Array(mesh.normals),3,[normalWeight,normalWeight,normalWeight],locks,Math.floor(mesh.indices.length*ratio/3)*3,error,['LockBorder','ErrorAbsolute','RegularizeLight']);
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
      const covered=role==='skin'?extendWristUnderlap(mesh,masters[source].bones):mesh;
      return [simplify(covered,{ratio:role==='skin'?.25:.22,error:role==='skin'?.0025:.003,skin:role==='skin',source})];
    });
  });}
  function lower(source){return cached('lower:'+source,()=>masters[source].meshes.flatMap(m=>{
    const role=/tailored-trousers|denim-trousers|sock/.test(m.name)?'trouser':/closed-leather-shoe|leather-shoe|shoe-sole|shoe-welt/.test(m.name)?'shoe':null;if(!role)return[];
    return[{...simplify(neutral(m,source),{ratio:role==='shoe'?.23:.22,error:role==='shoe'?.002:.004}),role}];
  }));}
  const bodyCache=new Map();
  const bodyFor=source=>{if(!bodyCache.has(source))bodyCache.set(source,retainedBody(masters[source]));return bodyCache.get(source);};
  // Project actual sewn cloth, including its skinning, for every applied detail.
  // A pocket, button or stripe must follow the garment rather than float on a
  // guessed constant-depth plane when the chest or abdomen changes shape.
  function surface(mesh){
    const cells=new Map(),step=.035,triangles=[],spanCache=new Map();
    for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3);let arm=0;for(const v of ids)for(let k=0;k<4;k++)if(/^(upperarm|forearm|hand|thumb|index|middle|ring|little)/.test(mesh.bones?.[mesh.skinIndex[v*4+k]]?.name||''))arm+=mesh.skinWeight[v*4+k]/3;if(arm>.20)continue;const p=ids.map(v=>mesh.positions.slice(v*3,v*3+3)),den=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);if(Math.abs(den)<1e-10)continue;
      const item={ids,p,den};triangles.push(item);for(let x=Math.floor(Math.min(...p.map(v=>v[0]))/step);x<=Math.floor(Math.max(...p.map(v=>v[0]))/step);x++)for(let y=Math.floor(Math.min(...p.map(v=>v[1]))/step);y<=Math.floor(Math.max(...p.map(v=>v[1]))/step);y++){const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);}
    }
    const query=(x,y)=>{let best;
      for(const t of cells.get(Math.floor(x/step)+':'+Math.floor(y/step))||[]){const[a,b,c]=t.p,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/t.den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/t.den,w=1-u-v;if(Math.min(u,v,w)<-1e-5)continue;const z=a[2]*u+b[2]*v+c[2]*w;if(!best||z<best.z)best={...t,bary:[u,v,w],z};}
      if(!best)throw Error(`No sewn cloth behind detail at ${x}, ${y}`);
      const influences=new Map();for(let v=0;v<3;v++)for(let k=0;k<4;k++){const at=best.ids[v]*4+k,j=mesh.skinIndex[at];influences.set(j,(influences.get(j)||0)+mesh.skinWeight[at]*best.bary[v]);}const pairs=[...influences].filter(p=>p[1]>1e-9).sort((a,b)=>b[1]-a[1]).slice(0,4),total=pairs.reduce((n,p)=>n+p[1],0);while(pairs.length<4)pairs.push([0,0]);return{z:best.z,joints:pairs.map(p=>p[0]),weights:pairs.map(p=>p[1]/total)};
    };
    query.span=y=>{const key=Math.round(y*1e6);if(spanCache.has(key))return spanCache.get(key);const xs=[];for(const t of triangles)for(let e=0;e<3;e++){const a=t.p[e],b=t.p[(e+1)%3];if((a[1]<y)===(b[1]<y)||Math.abs(a[1]-b[1])<1e-9)continue;xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}const span=xs.length?[Math.min(...xs),Math.max(...xs)]:null;spanCache.set(key,span);return span;};
    return query;
  }
  function applied(name,path,width,query,{layer=.003,role='trim',columns=2}={}){
    const positions=[],indices=[],skinIndex=[],skinWeight=[],points=[];
    for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],n=Math.max(1,Math.ceil(Math.hypot(...sub(a,b))/.012));for(let j=i===1?0:1;j<=n;j++)points.push(a.map((v,k)=>v+(b[k]-v)*j/n));}
    for(let row=0;row<points.length;row++)for(let col=0;col<=columns;col++){const y=points[row][1],span=query.span(y),x=clamp(points[row][0]+(col/columns-.5)*width,span[0]+.003,span[1]-.003),s=query(x,y);positions.push(x,y,s.z-layer);skinIndex.push(...s.joints);skinWeight.push(...s.weights);if(row&&col){const a=(row-1)*(columns+1)+col-1;indices.push(a,a+1,a+columns+2,a,a+columns+2,a+columns+1);}}
    return{...normals({name,positions,indices,skinIndex,skinWeight}),role};
  }
  function clothes(source,wardrobe,posture='standing'){return cached('clothes:'+source+':'+wardrobe+':'+posture,()=>{
    const target=masters[source],body=bodyFor(source),h=target.height,c=h/1.70,garment=STREET_CROWD_GARMENTS[wardrobe],hem=garment.hem*c;
    // Evaluate retained .mhclo barycentric cloth against the hidden full body.
    // Native set-in sleeves keep shoulder, elbow and wrist cross sections;
    // short jackets crop the torso instead of crushing a long coat into a belt.
    const asset=['raincoat','duffle'].includes(wardrobe)?'male_elegantsuit01':'male_casualsuit01',proxy=fittedProxyGarment(target,{},asset),ease={raincoat:.008,duffle:.014,anorak:.010,'work-jacket':.006,cardigan:.003}[wardrobe];
    for(let i=0;i<proxy.positions.length;i+=3){const y=proxy.positions[i+1],blend=smooth((y-(target.bones.find(b=>b.name==='pelvis').head[1]-.03))/.14);for(let a=0;a<3;a++)proxy.positions[i+a]+=proxy.normals[i+a]*ease*blend;}
    const design={height:h,width:1,depth:1,hem,hemSpread:garment.hemSpread},draped=extendOuterwear(proxy,target.bones,design,{body,thickness:.0022}),members=Object.values(STREET_CROWD_DESIGNS).filter(d=>d.source===source&&d.wardrobe===wardrobe&&d.posture===posture),poses=[null,...members.map(d=>streetCrowdPose(d.id,{reducedMotion:true}))];
    const fitted=fitClothToEnvelope(draped,body,{ease:.009,poses,bones:target.bones}),outer={...fitted,indices:[]};
    for(let i=0;i<fitted.indices.length;i+=3){const tri=fitted.indices.slice(i,i+3);if(tri.every(v=>v<draped.drape.outerVertices))outer.indices.push(...tri);}
    const simplified=simplify(compact(outer),{ratio:.28,error:.0020,normalWeight:.004}),coat=streetCrowdFacing(wardrobe==='cardigan'?streetCrowdFrontOpening(simplified,.026*c):simplified);coat.name=`anatomically fitted ${wardrobe} set-in sleeves and sewn hanging panels`;coat.role='coat';coat.tailoring={source:asset,hem,posture,restError:proxy.restError,drape:draped.drape,envelopeFit:fitted.envelopeFit,facing:coat.facing};
    const q=surface(coat),parts=[coat],chest=target.bones.findIndex(b=>b.name==='chest'),neck=target.bones.find(b=>b.name==='neck'),top=neck.head[1]-.095,bottom=Math.max(hem+.055,target.bones.find(b=>b.name==='pelvis').head[1]-.07);
    // Properly fitted underlayer seals the collar opening with curved cotton.
    const bodySurface=surface(body),p=[],idx=[],skinIndex=[],skinWeight=[],cols=16,rows=wardrobe==='cardigan'?22:8,baseY=wardrobe==='cardigan'?hem+.015*c:target.bones.find(b=>b.name==='chest').head[1]-.02;
    for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){const y=baseY+(neck.head[1]-.065-baseY)*j/rows,span=bodySurface.span(y),half=Math.min(.13*c,(span[1]-span[0])/2-.004),x=(span[0]+span[1])/2+(k/cols*2-1)*half,s=bodySurface(x,y);p.push(x,y,s.z-.0025);skinIndex.push(...s.joints);skinWeight.push(...s.weights);if(j&&k){const a=(j-1)*(cols+1)+k-1;idx.push(a,a+1,a+cols+2,a,a+cols+2,a+cols+1);}}
    parts.unshift({...normals({name:'fitted curved cotton collar underlayer',positions:p,indices:idx,skinIndex,skinWeight}),role:'shirt'});
    if(wardrobe==='cardigan')for(const sign of[-1,1])parts.push(applied('cardigan sewn open-front rib binding',[[sign*.032*c,top],[sign*.032*c,hem+.004*c]],.008*c,q));
    else parts.push(applied(`${wardrobe} sewn front closure`,[[.008*c,top],[.008*c,bottom]],wardrobe==='anorak'?.014*c:.012*c,q));
    if(wardrobe==='duffle')for(let n=0;n<3;n++){const y=top-.08-n*.11*c,s=q(.024*c,y),button=ellipsoid('rounded duffle horn toggle',[.024*c,y,s.z-.008],[.028*c,.007*c,.006*c],chest,{segments:10,rings:6});for(let v=0;v<button.skinIndex.length;v+=4){button.skinIndex.splice(v,4,...s.joints);button.skinWeight.splice(v,4,...s.weights);}parts.push({...button,role:'trim'},applied('duffle flat sewn toggle fastening',[[0,y+.003],[.070*c,y-.003]],.010*c,q,{columns:2,layer:.004}));}
    else if(['raincoat','cardigan'].includes(wardrobe))for(let n=0;n<4;n++){const y=top-.05-(top-bottom-.10)*n/3,x=(wardrobe==='cardigan'?.040:.008)*c,s=q(x,y),button=ellipsoid('small sewn coat button',[x,y,s.z-.005],[.0045*c,.0045*c,.002*c],chest,{segments:8,rings:5});for(let v=0;v<button.skinIndex.length;v+=4){button.skinIndex.splice(v,4,...s.joints);button.skinWeight.splice(v,4,...s.weights);}parts.push({...button,role:'trim'});}
    const pocketY=wardrobe==='work-jacket'?top-.16*c:Math.max(hem+.115*c,target.bones.find(b=>b.name==='pelvis').head[1]+.11*c);
    for(const sign of[-1,1]){const x=sign*.115*c;if(wardrobe==='work-jacket')parts.push(applied('field jacket fitted patch pocket',[[x,pocketY-.085*c],[x,pocketY]],.085*c,q,{columns:6,layer:.0035}));parts.push(applied(`${wardrobe} pocket bound welt`,[[x-.037*c,pocketY],[x+.037*c,pocketY-.010*c]],.009*c,q,{layer:.006}));}
    if(wardrobe==='anorak')parts.push(applied('anorak sewn storm yoke',[[0,top-.13*c],[.14*c,top-.12*c]],.011*c,q));
    if(wardrobe==='work-jacket')parts.push(applied('work-jacket fitted lower rib band',[[0,hem+.015*c],[0,hem+.045*c]],.28*c,q,{columns:24,layer:.003}));
    if(wardrobe==='cardigan')for(const sign of[-1,1])parts.push(applied('cardigan fitted lower rib band',[[sign*.10*c,hem+.012*c],[sign*.10*c,hem+.035*c]],.12*c,q,{columns:12,layer:.003}));
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
  function reflective(source,wardrobe,posture){return cached('reflective:'+source+':'+wardrobe+':'+posture,()=>{
    const target=masters[source],c=target.height/1.70,coat=clothes(source,wardrobe,posture).find(m=>m.role==='coat'),q=surface(coat),hem=STREET_CROWD_GARMENTS[wardrobe].hem*c,top=target.bones.find(b=>b.name==='neck').head[1]-.27*c;
    return[top,hem+.085*c].map(y=>{const span=q.span(y),width=(span[1]-span[0])*.93;return applied('sewn high visibility reflective torso band',[[0,y-.020*c],[0,y+.020*c]],width,q,{columns:32,role:'reflective',layer:.004});});
  });}
  return{masters,stats,cache,parts(d){return[...face(d.source,d.face,d.headwear),...lower(d.source),...clothes(d.source,d.wardrobe,d.posture),...headwear(d.source,d.headwear,d.wardrobe),...(d.scarf?[...scarf(d.source)]:[]),...(d.highVis?reflective(d.source,d.wardrobe,d.posture):[])];}};
}
