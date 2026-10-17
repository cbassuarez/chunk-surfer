// Build-time identities for the six vigil participants. The retained scalp is
// the actual MakeHuman head topology, rather than a hat placed over the skull.
// Eye surfaces, eyelids and head accessories receive one continuous warp.
import fs from 'node:fs';
import zlib from 'node:zlib';

export const VIGIL_IDENTITY_PROFILES=Object.freeze({
  ruth:{old:.68,jaw:1.055,cheek:1.035,forehead:1.015,nose:.0020,chin:.0015,hair:'swept-bob',description:'softened broad jaw, fuller cheek, short greying swept bob'},
  leila:{old:.08,jaw:.925,cheek:.970,forehead:.985,nose:-.0015,chin:.0020,hair:'tied-back',description:'younger tapered jaw, compact nose, tied-back hair and a low folded bun'},
  denise:{old:.36,jaw:1.025,cheek:1.075,forehead:1.020,nose:.0010,chin:-.0010,hair:'close-curls',description:'rounder cheek and broader face, close gathered curls'},
  owen:{old:.94,jaw:.925,cheek:.960,forehead:.990,nose:.0030,chin:.0030,hair:'receding',description:'aged narrow jaw and longer nose, thin grey sides and exposed crown'},
  malcolm:{old:.52,jaw:1.080,cheek:1.035,forehead:1.025,nose:-.0010,chin:.0015,hair:'concealed',description:'broad square lower face beneath the raised hood'},
  kit:{old:.04,jaw:1.035,cheek:.970,forehead:.980,nose:-.0010,chin:.0010,hair:'tousled',description:'young lean cheeks, firmer chin and short swept hair under headphones'},
});
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const norm=a=>mul(a,1/(Math.hypot(...a)||1)),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const gaussian=(v,c,w)=>Math.exp(-(((v-c)/w)**2));
const sourceRoot=new URL('../character-sources/makehuman/',import.meta.url),repoRoot=new URL('../../../',import.meta.url),ageCache=new Map();

function meshNormals(positions,indices){
  const out=new Array(positions.length).fill(0);
  for(let i=0;i<indices.length;i+=3){
    const ids=indices.slice(i,i+3),p=ids.map(v=>positions.slice(v*3,v*3+3)),n=cross(sub(p[1],p[0]),sub(p[2],p[0]));
    for(const v of ids)for(let k=0;k<3;k++)out[v*3+k]+=n[k];
  }
  for(let i=0;i<out.length;i+=3){const n=norm(out.slice(i,i+3));for(let k=0;k<3;k++)out[i+k]=n[k];}
  return out;
}

function ageField(design){
  const female=design.source==='woman',key=female?'woman':'man';
  if(!ageCache.has(key)){
    const base=[],body=new Set();let group='';
    for(const row of fs.readFileSync(new URL('base.obj',sourceRoot),'utf8').split(/\r?\n/)){
      const f=row.trim().split(/\s+/);
      if(f[0]==='v')base.push(f.slice(1,4).map(Number));
      else if(f[0]==='g')group=f[1];
      else if(f[0]==='f'&&group==='body')for(const corner of f.slice(1))body.add(Number(corner.split('/')[0])-1);
    }
    const targets={young:base.map(()=>[0,0,0]),old:base.map(()=>[0,0,0])};
    for(const age of ['young','old'])for(const prefix of female?['african-female-','universal-female-']:['caucasian-male-','universal-male-']){
      const name=prefix+age+(prefix.startsWith('universal')?'-averagemuscle-averageweight':'')+'.target.gz';
      const file=female?new URL('artifacts/bus-woman-design/anatomy/sources/'+name,repoRoot):new URL(name,sourceRoot);
      for(const row of zlib.gunzipSync(fs.readFileSync(file)).toString().split(/\r?\n/)){
        const f=row.trim().split(/\s+/);if(f.length!==4||!/^\d+$/.test(f[0]))continue;
        const out=targets[age][Number(f[0])];for(let k=0;k<3;k++)out[k]+=Number(f[k+1]);
      }
    }
    const sourceOld=female?.53:.28,raw=base.map((p,i)=>add(p,add(mul(targets.young[i],1-sourceOld),mul(targets.old[i],sourceOld))));
    const ys=[...body].map(i=>raw[i][1]),bottom=Math.min(...ys),scale=(female?1.70:1.78)/(Math.max(...ys)-bottom);
    // Restrict the field to real head vertices. Head accessories use smooth
    // nearest-neighbour displacement from those same anatomical landmarks.
    const points=[...body].filter(i=>(raw[i][1]-bottom)*scale>(female?1.445:1.535)).map(i=>({
      p:[raw[i][0]*scale,(raw[i][1]-bottom)*scale,-raw[i][2]*scale],
      delta:sub(targets.old[i],targets.young[i]).map((v,k)=>v*scale*(k===2?-1:1)),
    }));
    ageCache.set(key,{points,sourceOld,height:female?1.70:1.78});
  }
  const field=ageCache.get(key),scale=[design.width,design.height/field.height,design.depth];
  const points=field.points.map(v=>({p:v.p.map((n,k)=>n*scale[k]),delta:v.delta.map((n,k)=>n*scale[k])}));
  return{points,sourceOld:field.sourceOld};
}

function identityWarp(meshes,bones,design,profile){
  const head=bones.find(b=>b.name==='head'),neck=bones.find(b=>b.name==='neck'),eyes=meshes.filter(m=>/eyes|iris/.test(m.name));
  const eyeYs=eyes.flatMap(m=>m.positions.filter((_,i)=>i%3===1)),eyeY=eyeYs.length?eyeYs.reduce((n,v)=>n+v,0)/eyeYs.length:head.head[1]+.05;
  const age=ageField(design),headBottom=head.head[1]-.065,blendSpan=head.head[1]-neck.head[1]+.025;
  return point=>{
    const blend=smooth((point[1]-headBottom)/blendSpan);if(blend<=0)return point.slice();
    const nearest=[];
    for(const item of age.points){const dx=point[0]-item.p[0],dy=point[1]-item.p[1],dz=point[2]-item.p[2],d=dx*dx+dy*dy+dz*dz;if(nearest.length<5||d<nearest.at(-1).d){nearest.push({d,item});nearest.sort((a,b)=>a.d-b.d);if(nearest.length>5)nearest.pop();}}
    let displacement=[0,0,0],sum=0;
    for(const n of nearest){const w=1/(n.d+.00008);displacement=add(displacement,mul(n.item.delta,w));sum+=w;}
    displacement=mul(displacement,(profile.old-age.sourceOld)/sum);
    // A full macro also changes stature and skull proportions. Keep this local
    // identity pass within the existing head/neck rig's anatomical envelope.
    const ageDistance=Math.hypot(...displacement);if(ageDistance>1e-9)displacement=mul(displacement,.012*Math.tanh(ageDistance/.012)/ageDistance);
    // All changes are broad anatomical fields, not extra geometry painted on
    // the face. The maximum authored nose/chin relief is three millimetres.
    const x=point[0]-head.head[0],y=point[1],front=smooth((head.head[2]-.008-point[2])/.055);
    const jaw=gaussian(y,head.head[1]-.022,.040),cheek=gaussian(y,eyeY-.027,.032),forehead=gaussian(y,eyeY+.045,.045);
    displacement[0]+=x*((profile.jaw-1)*jaw+(profile.cheek-1)*cheek+(profile.forehead-1)*forehead);
    displacement[2]-=front*(profile.nose*gaussian(x,0,.022)*gaussian(y,eyeY-.025,.029)+profile.chin*gaussian(x,0,.035)*gaussian(y,head.head[1]-.041,.024));
    // Kit's headphones have authored shell contact targets. Preserve the
    // temples/ears and crown exactly; only his lower frontal face varies.
    const contactSafe=profile.hair==='tousled'
      ?smooth((head.head[2]-.035-point[2])/.035)*(1-smooth((point[1]-(head.head[1]+.025))/.035))
      :1;
    return add(point,mul(displacement,blend*contactSafe));
  };
}

function boundaryEdges(mesh){
  const edges=new Map();for(let i=0;i<mesh.indices.length;i+=3)for(let k=0;k<3;k++){
    const a=mesh.indices[i+k],b=mesh.indices[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a;
    if(edges.has(key))edges.get(key).count++;else edges.set(key,{a,b,count:1});
  }
  return[...edges.values()].filter(e=>e.count===1);
}

function subdivide(mesh,steps=2){
  let out=structuredClone(mesh);
  for(let step=0;step<steps;step++){
    const cache=new Map(),indices=[],mid=(a,b)=>{
      const key=a<b?a+':'+b:b+':'+a;if(cache.has(key))return cache.get(key);
      const v=out.positions.length/3,p=mul(add(out.positions.slice(a*3,a*3+3),out.positions.slice(b*3,b*3+3)),.5);out.positions.push(...p);
      out.skinIndex.push(...out.skinIndex.slice(a*4,a*4+4));out.skinWeight.push(...out.skinWeight.slice(a*4,a*4+4));
      if(out.uv)out.uv.push(...mul(add(out.uv.slice(a*2,a*2+2),out.uv.slice(b*2,b*2+2)),.5));cache.set(key,v);return v;
    };
    for(let i=0;i<out.indices.length;i+=3){const[a,b,c]=out.indices.slice(i,i+3),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);indices.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
    out.indices=indices;
  }
  return out;
}

function closeHairShell(mesh,thickness=.002){
  const out=structuredClone(mesh),n=mesh.positions.length/3,normals=meshNormals(mesh.positions,mesh.indices),edges=boundaryEdges(mesh);
  for(let i=0;i<n;i++)out.positions.push(...sub(mesh.positions.slice(i*3,i*3+3),mul(normals.slice(i*3,i*3+3),thickness)));
  out.skinIndex.push(...mesh.skinIndex);out.skinWeight.push(...mesh.skinWeight);if(out.uv)out.uv.push(...mesh.uv);
  for(let i=0;i<mesh.indices.length;i+=3)out.indices.push(mesh.indices[i]+n,mesh.indices[i+2]+n,mesh.indices[i+1]+n);
  for(const{a,b}of edges)out.indices.push(a,b+n,b,a,a+n,b+n);
  out.normals=meshNormals(out.positions,out.indices);return out;
}

function scalpBase(cap,skin,head,profile){
  const out=structuredClone(cap),center=add(head.head,[0,.055,.005]),boundary=new Set(boundaryEdges(cap).flatMap(e=>[e.a,e.b]));
  for(let i=0;i<out.positions.length;i+=3){
    const point=out.positions.slice(i,i+3),radial=norm(sub(point,center));let p=sub(point,mul(radial,.0035));
    if(boundary.has(i/3)){
      let nearest=null,distance=.014**2;
      for(let j=0;j<skin.positions.length;j+=3){const q=skin.positions.slice(j,j+3),d=dot(sub(q,point),sub(q,point));if(d<distance){distance=d;nearest=q;}}
      if(nearest)p=nearest;
    }
    for(let k=0;k<3;k++)out.positions[i+k]=p[k];
  }
  return stitchSkinScalp(skin,out,head,profile);
}

function stitchSkinScalp(skin,cap,head,profile){
  // Join at real shared vertices before subdivision. This makes the forehead
  // and crown one anatomical surface, rather than two coincident patches whose
  // edge normals merely look similar.
  const originalCount=skin.positions.length/3,capBoundary=new Set(boundaryEdges(cap).flatMap(e=>[e.a,e.b])),lookup=new Map();
  const key=p=>p.map(v=>Math.round(v*1e6)).join(':');
  for(const v of new Set(skin.indices))lookup.set(key(skin.positions.slice(v*3,v*3+3)),v);
  const capMap=[];
  for(let v=0;v<cap.positions.length/3;v++){
    const p=cap.positions.slice(v*3,v*3+3),existing=capBoundary.has(v)?lookup.get(key(p)):undefined;
    if(existing!==undefined){capMap[v]=existing;continue;}
    capMap[v]=skin.positions.length/3;skin.positions.push(...p);skin.skinIndex.push(...cap.skinIndex.slice(v*4,v*4+4));skin.skinWeight.push(...cap.skinWeight.slice(v*4,v*4+4));
    if(skin.uv)skin.uv.push(...(cap.uv?.slice(v*2,v*2+2)||[0,0]));
  }
  let tags=new Array(skin.indices.length/3).fill(false);skin.indices.push(...cap.indices.map(v=>capMap[v]));tags.push(...new Array(cap.indices.length/3).fill(true));
  const seamSeeds=[...capBoundary].map(v=>skin.positions.slice(capMap[v]*3,capMap[v]*3+3));
  for(let pass=0;pass<2;pass++){
    const marked=new Set(),edgeKey=(a,b)=>a<b?a+':'+b:b+':'+a;
    for(let i=0;i<skin.indices.length;i+=3){
      const tri=skin.indices.slice(i,i+3),center=mul(tri.reduce((sum,v)=>add(sum,skin.positions.slice(v*3,v*3+3)),[0,0,0]),1/3);
      let nearSeam=false;
      if(center[1]>head.head[1]+.065&&center[2]<head.head[2]-.030&&Math.abs(center[0]-head.head[0])<.10)for(const seed of seamSeeds){const dx=center[0]-seed[0],dy=center[1]-seed[1],dz=center[2]-seed[2];if(dx*dx+dy*dy+dz*dz<.014*.014){nearSeam=true;break;}}
      const scalpDetail=tags[i/3]&&(profile.hair!=='receding'||pass===0);
      if(scalpDetail||nearSeam)for(let k=0;k<3;k++)marked.add(edgeKey(tri[k],tri[(k+1)%3]));
    }
    const mids=new Map(),mid=(a,b)=>{
      const k=edgeKey(a,b);if(!marked.has(k))return null;if(mids.has(k))return mids.get(k);
      const v=skin.positions.length/3;skin.positions.push(...mul(add(skin.positions.slice(a*3,a*3+3),skin.positions.slice(b*3,b*3+3)),.5));
      const weights=new Map();for(const vertex of [a,b])for(let slot=0;slot<4;slot++){const joint=skin.skinIndex[vertex*4+slot];weights.set(joint,(weights.get(joint)||0)+skin.skinWeight[vertex*4+slot]*.5);}
      const pairs=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=pairs.reduce((n,p)=>n+p[1],0);while(pairs.length<4)pairs.push([0,0]);skin.skinIndex.push(...pairs.map(p=>p[0]));skin.skinWeight.push(...pairs.map(p=>p[1]/sum));
      if(skin.uv)skin.uv.push(...mul(add(skin.uv.slice(a*2,a*2+2),skin.uv.slice(b*2,b*2+2)),.5));mids.set(k,v);return v;
    };
    const indices=[],nextTags=[],emit=(tag,...triangles)=>{for(const tri of triangles){indices.push(...tri);nextTags.push(tag);}};
    for(let i=0;i<skin.indices.length;i+=3){
      let[a,b,c]=skin.indices.slice(i,i+3),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);const count=[ab,bc,ca].filter(v=>v!==null).length,tag=tags[i/3];
      if(!count)emit(tag,[a,b,c]);
      else if(count===3)emit(tag,[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);
      else if(count===1){if(bc!==null){[a,b,c]=[b,c,a];ab=bc;}else if(ca!==null){[a,b,c]=[c,a,b];ab=ca;}emit(tag,[a,ab,c],[ab,b,c]);}
      else{if(ab===null){[a,b,c]=[b,c,a];[ab,bc]=[bc,ca];}else if(bc===null){[a,b,c]=[c,a,b];[ab,bc]=[ca,ab];}emit(tag,[ab,b,bc],[a,ab,c],[ab,bc,c]);}
    }
    skin.indices=indices;tags=nextTags;
  }
  const adjacent=Array.from({length:skin.positions.length/3},()=>new Set()),use=new Uint8Array(adjacent.length);
  for(let i=0;i<skin.indices.length;i+=3)for(let k=0;k<3;k++){const a=skin.indices[i+k],b=skin.indices[i+(k+1)%3];adjacent[a].add(b);adjacent[b].add(a);use[a]|=tags[i/3]?1:2;}
  const seam=[...use].flatMap((v,i)=>v===3?[i]:[]),baseline=skin.positions.slice(),amounts=new Float32Array(adjacent.length);
  for(let v=0;v<adjacent.length;v++){
    const p=baseline.slice(v*3,v*3+3);if(p[1]<head.head[1]+.022)continue;
    if(profile.hair==='tousled'&&(Math.abs(p[0]-head.head[0])>.055||p[2]>head.head[2]-.035||p[1]>head.head[1]+.110))continue;
    let distance=Infinity;for(const s of seam){const dx=p[0]-baseline[s*3],dy=p[1]-baseline[s*3+1],dz=p[2]-baseline[s*3+2];distance=Math.min(distance,dx*dx+dy*dy+dz*dz);}
    const forehead=p[1]>head.head[1]+.065&&p[2]<head.head[2]-.030?Math.exp(-distance/(.018*.018)):0;
    amounts[v]=Math.max(use[v]===1?smooth((p[1]-head.head[1]-.022)/.045):0,forehead);
  }
  for(let pass=0;pass<12;pass++){
    const next=skin.positions.slice(),step=pass%2?-.33:.32;
    for(let v=0;v<adjacent.length;v++)if(amounts[v]&&adjacent[v].size){
      for(let axis=0;axis<3;axis++){let mean=0;for(const n of adjacent[v])mean+=skin.positions[n*3+axis];next[v*3+axis]+=(mean/adjacent[v].size-skin.positions[v*3+axis])*step*amounts[v];}
      const delta=sub(next.slice(v*3,v*3+3),baseline.slice(v*3,v*3+3)),distance=Math.hypot(...delta),limit=use[v]===1?.003:.002;if(distance>limit)for(let axis=0;axis<3;axis++)next[v*3+axis]=baseline[v*3+axis]+delta[axis]*limit/distance;
    }skin.positions=next;
  }
  skin.normals=meshNormals(skin.positions,skin.indices);skin.identityScalp=true;skin.identityOriginalVertexCount=originalCount;skin.identitySeamVertices=seam.length;
  const capIndices=skin.indices.filter((_,i)=>tags[Math.floor(i/3)]),used=[...new Set(capIndices)],compact=new Map(used.map((v,i)=>[v,i]));
  const scalp={name:'identity continuous anatomical scalp',material:skin.material,positions:[],normals:[],indices:capIndices.map(v=>compact.get(v)),skinIndex:[],skinWeight:[]};
  for(const v of used){scalp.positions.push(...skin.positions.slice(v*3,v*3+3));scalp.normals.push(...skin.normals.slice(v*3,v*3+3));scalp.skinIndex.push(...skin.skinIndex.slice(v*4,v*4+4));scalp.skinWeight.push(...skin.skinWeight.slice(v*4,v*4+4));}
  return scalp;
}

function hairstyle(scalp,head,design,profile,mat){
  if(profile.hair==='concealed')return[];
  const clean=profile.hair==='receding'?recedingScalpBand(scalp,head,mat.hair):combedBob(scalp,head,mat.hair,profile.hair),result=[clean];
  if(profile.hair==='tied-back')result.push(foldedBun(scalp,head,mat.hair));
  return result;
}

function scalpSampler(scalp,head){
  const center=add(head.head,[0,.055,.005]),points=[];
  // Only the upper skull contributes to the root fit. The retained scalp's
  // lowest triangles include detailed ear folds; those are anatomy, not locks
  // of hair, and must never be stretched into a hanging bob hem.
  const used=[...new Set(scalp.indices)],stride=Math.max(1,Math.ceil(used.length/420));
  for(let i=0;i<used.length;i+=stride){const vertex=used[i];
    const p=scalp.positions.slice(vertex*3,vertex*3+3);if(p[1]<center[1]-.004)continue;
    const v=sub(p,center),radius=Math.hypot(...v);points.push({direction:mul(v,1/radius),radius});
  }
  const radiusFor=direction=>{
    let sum=0,radius=0;for(const p of points){const similarity=dot(direction,p.direction),w=Math.exp((similarity-1)*85);sum+=w;radius+=p.radius*w;}
    return radius/Math.max(1e-12,sum);
  };
  return{center,radiusFor,top:Math.max(...scalp.positions.filter((_,i)=>i%3===1))};
}

function combedBob(scalp,head,material,style='swept-bob'){
  const{center,radiusFor,top}=scalpSampler(scalp,head),segments=128,rows=32,positions=[],indices=[],skinIndex=[],skinWeight=[],headIndex=scalp.skinIndex[0];
  const append=p=>{positions.push(...p);skinIndex.push(headIndex,0,0,0);skinWeight.push(1,0,0,0);};
  append([center[0]+(style==='swept-bob'?.003:style==='tousled'?.005:0),top+(style==='swept-bob'?.010:style==='tousled'?.014:.006),center[2]]);
  for(let row=1;row<=rows;row++)for(let k=0;k<segments;k++){
    const angle=k*2*Math.PI/segments,front=smooth((Math.cos(angle)+.02)/.82),side=Math.abs(Math.sin(angle)),sweepAngle=Math.atan2(Math.sin(angle+.32),Math.cos(angle+.32));
    const line=style==='swept-bob'?head.head[1]-.018+.107*front-.013*gaussian(sweepAngle,0,.45)*front
      :head.head[1]+.024+.067*front+(style==='tousled'?-.005*front*Math.cos(angle*5+.8):style==='close-curls'?.0015*Math.sin(angle*29):0);
    const upper=top-center[1],thetaEnd=line>=center[1]?Math.acos(clamp((line-center[1])/upper,-1,1)):Math.PI/2+.80*(center[1]-line)/.080,theta=thetaEnd*row/rows,query=Math.min(Math.PI/2,theta),direction=[Math.sin(angle)*Math.sin(query),Math.cos(query),-Math.cos(angle)*Math.sin(query)],radius=radiusFor(direction),root=add(center,mul(direction,radius));
    const crown=Math.max(0,Math.cos(theta)),relief=.0015*Math.cos(angle*19+query*6)+.0008*Math.cos(angle*9-query*3);
    const thickness=style==='swept-bob'?.007+.006*side+.004*(1-front)+relief
      :style==='tied-back'?.0035+.002*(1-front)+relief*.4
      :style==='close-curls'?.007+.003*(1-front)+.0025*Math.cos(angle*31+query*24)*Math.cos(angle*22-query*27)
      :.004+.010*crown*crown+.0025*crown*Math.sin(angle*6+query*4)+relief*.7;
    const p=add(root,mul(direction,thickness));
    if(theta>Math.PI/2){const lower=(theta-Math.PI/2)/(thetaEnd-Math.PI/2),tuck=.004*smooth(lower);p[0]-=Math.sin(angle)*tuck;p[2]+=Math.cos(angle)*tuck;p[1]=center[1]+(line-center[1])*lower;}
    // Broad side sweep changes the crown silhouette; shallow continuous comb
    // relief supplies hair direction without spikes or detached tube strands.
    p[0]+=(style==='swept-bob'?.006:style==='tousled'?.005:0)*crown*crown;p[2]+=.0025*crown*Math.sin(angle+query);append(p);
    const current=1+(row-1)*segments+k,next=1+(row-1)*segments+(k+1)%segments;
    if(row===1)indices.push(0,next,current);
    else{const previous=current-segments,previousNext=next-segments;indices.push(previous,previousNext,next,previous,next,current);}
  }
  const mesh={name:`identity ${style} continuous scalp loft`,material,positions,indices,skinIndex,skinWeight,identityStyle:style};
  return closeHairShell(mesh,.002);
}

function recedingScalpBand(scalp,head,material){
  const{center,radiusFor,top}=scalpSampler(scalp,head),segments=72,rows=12,positions=[],indices=[],skinIndex=[],skinWeight=[],headIndex=scalp.skinIndex[0];
  for(let row=0;row<=rows;row++)for(let k=0;k<=segments;k++){
    const angle=1.08+(2*Math.PI-2.16)*k/segments,back=smooth((-.05-Math.cos(angle))/.85),low=head.head[1]+.021+.005*back,high=head.head[1]+.063+.041*back,y=low+(high-low)*row/rows,cos=clamp((y-center[1])/(top-center[1]),-.35,.99),theta=Math.acos(cos),query=Math.min(Math.PI/2,theta),direction=[Math.sin(angle)*Math.sin(query),Math.cos(query),-Math.cos(angle)*Math.sin(query)],radius=radiusFor(direction),p=add(center,mul(direction,radius+.0023+.00045*Math.cos(angle*31+row*.3)));
    p[1]=y;positions.push(...p);skinIndex.push(headIndex,0,0,0);skinWeight.push(1,0,0,0);
    if(row&&k){const a=(row-1)*(segments+1)+k-1,b=a+1,c=row*(segments+1)+k,d=c-1;indices.push(a,c,b,a,d,c);}
  }
  return closeHairShell({name:'identity receding continuous side-back hair',material,positions,indices,skinIndex,skinWeight,identityStyle:'receding'},.0012);
}

function foldedBun(scalp,head,material){
  const headIndex=scalp.skinIndex[0],back=Math.max(...scalp.positions.filter((_,i)=>i%3===2)),center=[head.head[0],head.head[1]+.057,back+.020],positions=[],indices=[],skinIndex=[],skinWeight=[],rings=14,segments=40;
  // One folded continuous knot grows from the occipital scalp. The compressed
  // side profile and broad seam read as tied hair rather than a detached ball.
  for(let j=1;j<rings;j++)for(let k=0;k<segments;k++){
    const t=j*Math.PI/rings,a=k*2*Math.PI/segments,fold=1+.075*Math.cos(a*8+t*2),radial=Math.sin(t);
    positions.push(center[0]+.029*radial*Math.cos(a)*fold,center[1]+.024*Math.cos(t),center[2]+.019*radial*Math.sin(a)*fold);
    skinIndex.push(headIndex,0,0,0);skinWeight.push(1,0,0,0);
    if(j>1){const p=(j-2)*segments+k,q=(j-2)*segments+(k+1)%segments,r=(j-1)*segments+(k+1)%segments,s=(j-1)*segments+k;indices.push(p,q,r,p,r,s);}
  }
  const north=positions.length/3,south=north+1;positions.push(center[0],center[1]+.024,center[2],center[0],center[1]-.024,center[2]);
  skinIndex.push(headIndex,0,0,0,headIndex,0,0,0);skinWeight.push(1,0,0,0,1,0,0,0);
  for(let k=0;k<segments;k++){const next=(k+1)%segments,last=(rings-2)*segments;indices.push(north,next,k,south,last+k,last+next);}
  return{name:'identity folded occipital bun',material,positions,indices,skinIndex,skinWeight,normals:meshNormals(positions,indices)};
}

/** Return independently owned, already-scaled meshes. No skeleton, clothing,
 * bind weights or hand geometry changes. Call before adding coat/dress meshes. */
export function refineVigilIdentity(meshes,bones,design,materials){
  const id=design.mesh.split('_')[1],profile=VIGIL_IDENTITY_PROFILES[id];if(!profile)throw Error('Unknown vigil identity '+id);
  const head=bones.find(b=>b.name==='head');if(!head)throw Error('Vigil identity requires a head bone');
  const warp=identityWarp(meshes,bones,design,profile),out=[],caps=[];
  for(const mesh of meshes){
    // The old detached temple tubes duplicated highlights and could enter the
    // face when the head turned. Their replacement is one fitted hair surface.
    if(/temple/.test(mesh.name))continue;
    const cloned=structuredClone(mesh);
    if(!/^headphone-/.test(mesh.name))for(let i=0;i<cloned.positions.length;i+=3){const p=warp(cloned.positions.slice(i,i+3));for(let k=0;k<3;k++)cloned.positions[i+k]=p[k];}
    cloned.normals=meshNormals(cloned.positions,cloned.indices);
    if(/grey[ie]ng-hair|sculpted-hair/.test(mesh.name))caps.push(cloned);else out.push(cloned);
  }
  const skin=out.find(m=>/anatomical-skin|ordinary-face-neck/.test(m.name));
  if(skin)for(const cap of caps){
    const base=scalpBase(cap,skin,head,profile);base.material=materials.skin;
    out.push(...hairstyle(base,head,design,profile,materials));
  }
  return out;
}
