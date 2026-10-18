// Fabricated sign carriers. These keep the existing envelope and print datum;
// a bevel changes the actual normal/silhouette rather than drawing a dark box
// around the copy. Repeating finish maps are shared across the entire pack.
import {deflateSync} from 'node:zlib';
import {cross,printedFaceGeometry,railingBannerSurface,railingBannerPatch,railingBannerHemLift,RAILING_BANNER_CLOTH} from './face-geometry.mjs';

const add=(a,b)=>a.map((v,k)=>v+b[k]);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const RAILING_BANNER_REPAIRS=Object.freeze([
  Object.freeze({role:'upper repaired hem',window:Object.freeze([.742,.002,.938,.014]),material:'terracotta'}),
  Object.freeze({role:'lower repaired hem',window:Object.freeze([.030,.985,.180,.997]),material:'slate'}),
]);
function closeSurfaceEdges(front,back,nx,ny){
  const boundary=[];
  for(let x=0;x<=nx;x++)boundary.push(x);
  for(let y=1;y<=ny;y++)boundary.push(y*(nx+1)+nx);
  for(let x=nx-1;x>=0;x--)boundary.push(ny*(nx+1)+x);
  for(let y=ny-1;y>0;y--)boundary.push(y*(nx+1));
  const sides={positions:[],normals:[],uvs:[],indices:[]};
  for(let j=0;j<boundary.length;j++){
    const a=boundary[j],b=boundary[(j+1)%boundary.length],points=[front.positions.slice(a*3,a*3+3),front.positions.slice(b*3,b*3+3),back.positions.slice(b*3,b*3+3),back.positions.slice(a*3,a*3+3)];
    const sn=unit(cross(sub(points[1],points[0]),sub(points[2],points[0]))),base=sides.positions.length/3;
    for(const point of points){sides.positions.push(...point);sides.normals.push(...sn);sides.uvs.push(0,0);}
    sides.indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  return sides;
}
const CARRIERS=/^(?:hall_entrance_sign|tower_plaque|public_exit_sign|exterior_story_plaque|yard_sign|notice_board|rekey_ledger|hymn_board|tower_peal_board|scene_dock_sign_.+|vigil_part_sign_.+|vigil_part_banner|outskirts_shelter_timetable|chapel_key_ring_.+)$/;
export const isSignAssembly=name=>CARRIERS.test(name);

export function chamferedBoxGeometry(center,size,{bevelM=.0018,yaw=0,pitch=0,grainAxis}={}){
  const half=size.map(v=>v/2),b=Math.max(0,Math.min(bevelM,...half.map(v=>v*.3)));
  const positions=[],normals=[],uvs=[],indices=[];
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const rotate=p=>{const [x,y,z]=p,t=y*cp-z*sp,u=y*sp+z*cp;return[x*cy-u*sy,t,x*sy+u*cy];};
  const major=grainAxis??(size[0]>=size[1]&&size[0]>=size[2]?0:size[1]>=size[2]?1:2);
  const face=(points)=>{
    const base=positions.length/3,n=unit(cross(sub(points[1],points[0]),sub(points[2],points[0]))),rn=rotate(n);
    const normalAxis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
    // .25m across / 1m along the grain. Every box member gets genuine metre
    // coordinates, including end grain: no face is stretched to the same 0..1.
    const axes=[0,1,2].filter(k=>k!==normalAxis),along=axes.includes(major)?major:axes[1],across=axes.find(k=>k!==along);
    for(const p of points){positions.push(...add(rotate(p),center));normals.push(...rn);uvs.push((p[across]+center[across])/.25,(p[along]+center[along])/1);}
    for(let i=1;i<points.length-1;i++)indices.push(base,base+i,base+i+1);
  };
  // Six full planes, twelve real edge bevels, eight clipped corners. The
  // original planes and total envelope are exact; all chamfers recede inward.
  for(let axis=0;axis<3;axis++)for(const sign of[-1,1]){
    const u=(axis+1)%3,v=(axis+2)%3,points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,c])=>{
      const p=[0,0,0];p[axis]=sign*half[axis];p[u]=a*(half[u]-b);p[v]=c*(half[v]-b);return p;
    });
    if(sign<0)points.reverse();face(points);
  }
  if(b>0)for(let along=0;along<3;along++){
    const u=(along+1)%3,v=(along+2)%3;
    for(const a of[-1,1])for(const c of[-1,1]){
      const points=[[-1,0],[-1,1],[1,1],[1,0]].map(([t,edge])=>{const p=[0,0,0];p[along]=t*(half[along]-b);p[u]=a*(half[u]-(edge?b:0));p[v]=c*(half[v]-(edge?0:b));return p;});
      const n=cross(sub(points[1],points[0]),sub(points[2],points[0]));if(n[u]*a+n[v]*c<0)points.reverse();face(points);
    }
  }
  if(b>0)for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){
    const s=[x,y,z],points=[0,1,2].map(axis=>s.map((q,k)=>q*(half[k]-(k===axis?0:b))));
    if(cross(sub(points[1],points[0]),sub(points[2],points[0])).reduce((sum,v,k)=>sum+v*s[k],0)<0)points.reverse();face(points);
  }
  return{positions,normals,uvs,indices,bevelM:b,grainAxis:major};
}

export function appendSignGeometry(target,geometry){
  // Existing builder groups may predate physical UVs. Backfill those vertices
  // before appending, otherwise the exporter would discard the entire channel.
  const base=target.positions.length/3;
  while(target.uvs.length<base*2)target.uvs.push(0,0);
  target.positions.push(...geometry.positions);target.normals.push(...geometry.normals);
  target.uvs.push(...geometry.uvs);target.indices.push(...geometry.indices.map(i=>base+i));
}

function crc32(data){let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
const chunk=(type,data)=>{const t=Buffer.from(type),h=Buffer.alloc(4),crc=Buffer.alloc(4);h.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([h,t,data,crc]);};
function png(width,height,rgba){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)rgba.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const periodic=(x,y)=>Math.sin(x*2*Math.PI)*Math.cos(y*2*Math.PI);
export function carrierFinishTile(profile,{size=128}={}){
  const albedo=Buffer.alloc(size*size*4),normal=Buffer.alloc(size*size*4),orm=Buffer.alloc(size*size*4);
  const wood=profile==='timber-frame',cloth=profile==='cloth-reverse',paper=profile==='paper-stock',metal=profile==='brass-plate';
  const sample=(u,v)=>wood?
    Math.sin(2*Math.PI*(u*13+.12*Math.sin(v*2*Math.PI)+.06*Math.sin(v*6*Math.PI)))*.55+periodic(u*31,v*4)*.20:
    // Real cloth threads are below this shared tile's sampling limit. Resolve
    // their aggregate response into roughness; never invent a coarse visible
    // checker or basket weave to fill the missing frequency band.
    cloth?periodic(u*17,v*13)*.20:paper?periodic(u*17,v*19)*.45+periodic(u*31,v*29)*.20:periodic(u*19,v*23)*.3;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,n=sample(u,v),i=(y*size+x)*4;
    const shade=clamp(wood?.935+n*.05:paper?.985+n*.013:cloth?.99+n*.01:metal?.985+n*.01:.99+n*.007,.82,1);
    albedo.set([Math.round(shade*255),Math.round(shade*255),Math.round(shade*255),255],i);
    const amp=wood?.10:cloth?.006:paper?.014:.009,dx=(sample(u+1/size,v)-sample(u-1/size,v))*amp,dy=(sample(u,v+1/size)-sample(u,v-1/size))*amp;
    const nn=unit([-dx,-dy,1]);normal.set([...nn.map(q=>Math.round((q*.5+.5)*255)),255],i);
    // Factors carry the intended absolute roughness. This shared tile varies
    // that finish slightly; bare brass alone is metallic. AO is neutral one.
    orm.set([255,Math.round(clamp(.96+n*(wood?.045:.022),.86,1)*255),255,255],i);
  }
  return{profile,width:size,height:size,physicalTileM:[.25,1],albedo:png(size,size,albedo),normal:png(size,size,normal),orm:png(size,size,orm),rgbaBaseLevelBytes:size*size*4*3};
}

export function createSignAssemblies({materials,group,MAT}){
  const materialCache=new Map(),finishTiles=new Map(),records=[];
  const profileFor=(name,source,size)=>{
    if(source===MAT.brass)return'brass-plate';
    if(source===MAT.dark&&size&&((name==='hall_entrance_sign'&&size[1]<.20)||(['tower_plaque','tower_peal_board'].includes(name)&&size[2]<=.03)))return'enamel';
    if(source===MAT.dark||source===MAT.wood)return'timber-frame';
    if(source===MAT.stone||source===MAT.terracotta||source===MAT.concrete)return'mineral-carrier';
    if(source===MAT.paper)return'paper-stock';
    if(name==='vigil_part_banner'||source===MAT.cloth)return'cloth-reverse';
    if(name.startsWith('vigil_part_sign_')&&source===MAT.agedWhite)return'painted-card';
    return'enamel';
  };
  const finishMaterial=(name,source,profile=profileFor(name,source))=>{
    const key=`${source}:${profile}`;
    if(materialCache.has(key))return materialCache.get(key);
    const original=materials[source],index=materials.length;
    const pbr={...original.pbrMetallicRoughness};
    if(profile==='brass-plate'){pbr.metallicFactor=1;pbr.roughnessFactor=.48;}
    else if(profile==='enamel'||profile==='painted-card'||profile==='paper-stock'||profile==='cloth-reverse'||profile==='timber-frame'||profile==='mineral-carrier')pbr.metallicFactor=0;
    if(profile==='enamel')pbr.roughnessFactor=.43;
    if(profile==='timber-frame')pbr.roughnessFactor=source===MAT.wood?.61:.50;
    if(profile==='paper-stock'||profile==='painted-card')pbr.roughnessFactor=.87;
    materials.push({...original,name:`sign assembly ${profile}: ${original.name}`,pbrMetallicRoughness:pbr,
      extras:{...original.extras,materialFactors:'gltf',letteringFinish:{version:1,profile,localSpecular:true},
        physicalSurface:{version:1,profile,tileM:[.25,1],wear:'no invented corrosion or directional deposits'}}});
    materialCache.set(key,index);if(!finishTiles.has(profile))finishTiles.set(profile,carrierFinishTile(profile));
    return index;
  };
  const box=(m,center,size,source,yaw=0,pitch=0)=>{
    const profile=profileFor(m.name,source,size),material=finishMaterial(m.name,source,profile);
    const thin=Math.min(...size),bevelM=['paper-stock','painted-card','cloth-reverse'].includes(profile)?0:Math.min(thin*.16,profile==='mineral-carrier'?.0035:profile==='timber-frame'?.0023:.0014);
    const geometry=chamferedBoxGeometry(center,size,{bevelM,yaw,pitch});
    appendSignGeometry(group(m,material),geometry);
    const record={kind:'fabricated-member',center,size,material,profile,bevelM:geometry.bevelM,grainAxis:geometry.grainAxis,
      grainTileM:profile==='timber-frame'?[.25,1]:undefined,frontPlanePreserved:true};
    (m.extras||={}).signAssemblyVersion=1;(m.extras.signAssemblies||=[]).push(record);records.push({mesh:m.name,...record});
  };
  const fixing=(m,{center,readerRight=[1,0,0],up=[0,1,0],radiusM=.004,source=MAT.brass})=>{
    const n=unit(cross(readerRight,up)),material=finishMaterial(m.name,source,'brass-plate'),g=group(m,material);
    const ring=[],segments=12,slotHalf=radiusM*.09;
    for(let i=0;i<segments;i++){const a=i/segments*2*Math.PI;ring.push([Math.cos(a)*radiusM,Math.sin(a)*radiusM]);}
    const positions=[],normals=[],uvs=[],indices=[];
    const clip=(poly,side)=>{
      const out=[];for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],insideA=a[1]*side>=slotHalf,insideB=b[1]*side>=slotHalf;
        if(insideA)out.push(a);
        if(insideA!==insideB){const t=(slotHalf*side-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,slotHalf*side]);}
      }return out;
    };
    for(const side of[-1,1]){
      const polygon=clip(ring,side),base=positions.length/3;
      for(const p of polygon){positions.push(...center.map((v,k)=>v+readerRight[k]*p[0]+up[k]*p[1]));normals.push(...n);uvs.push(.5+p[0]/(radiusM*2),.5+p[1]/(radiusM*2));}
      for(let i=1;i<polygon.length-1;i++)indices.push(base,base+i,base+i+1);
    }
    appendSignGeometry(g,{positions,normals,uvs,indices});
    // The head is actually split at the screw slot. Its dark floor sits below
    // the two metal lobes rather than hovering as a painted stripe on a disc.
    const slot=printedFaceGeometry({center:center.map((v,k)=>v-n[k]*.00015),readerRight,up,widthM:radiusM*1.99,heightM:slotHalf*2});
    appendSignGeometry(group(m,finishMaterial(m.name,MAT.black,'enamel')),slot);
    const record={kind:'seated-slotted-fixing',center,radiusM,slotDepthM:.00015,material};
    (m.extras||={}).signAssemblyVersion=1;(m.extras.signAssemblies||=[]).push(record);records.push({mesh:m.name,...record});
  };
  const sheet=(m,{center,readerRight=[-1,0,0],up=[0,1,0],widthM,heightM,drapeM=0,shape='rectangle',thicknessM=.0009,source=MAT.cloth,profile=source===MAT.cloth?'cloth-reverse':'paper-stock'})=>{
    const n=unit(cross(readerRight,up)),material=finishMaterial(m.name,source,profile);
    const curved=shape==='railing-banner';
    const front=printedFaceGeometry({center:curved?center:center.map((v,k)=>v-n[k]*.00025),readerRight,up,widthM,heightM,drapeM,shape});
    if(curved)for(let i=0;i<front.positions.length;i++)front.positions[i]-=front.normals[i]*.00025;
    const originalUvs=front.uvs;
    front.uvs=[];
    for(let i=0;i<front.positions.length;i+=3){
      const p=front.positions.slice(i,i+3).map((v,k)=>v-center[k]);
      front.uvs.push(...(curved?[(originalUvs[i/3*2]-.5)*widthM/.25,(.5-originalUvs[i/3*2+1])*heightM]:[p.reduce((s,v,k)=>s+v*readerRight[k],0)/.25,p.reduce((s,v,k)=>s+v*up[k],0)]));
    }
    const back={...front,positions:front.positions.map((v,i)=>v-(curved?front.normals[i]:n[i%3])*thicknessM),normals:front.normals.map(v=>-v),indices:[]};
    for(let i=0;i<front.indices.length;i+=3)back.indices.push(front.indices[i],front.indices[i+2],front.indices[i+1]);
    appendSignGeometry(group(m,material),front);appendSignGeometry(group(m,material),back);
    // Close the actual sheet perimeter. The edge has the same curved datum;
    // it cannot become a straight floating strip across a sagging banner.
    const [nx,ny]=front.grid||[drapeM?20:1,drapeM?6:1];
    appendSignGeometry(group(m,material),closeSurfaceEdges(front,back,nx,ny));
    const record={kind:'thin-backed-sheet',center,widthM,heightM,thicknessM,drapeM,shape,frontPlanePreserved:!curved,nominalDatumPreserved:true};
    (m.extras||={}).signAssemblyVersion=1;(m.extras.signAssemblies||=[]).push(record);records.push({mesh:m.name,...record});
  };
  const railingBanner=(m,{center,readerRight=[-1,0,0],up=[0,1,0],widthM,heightM,source=MAT.agedWhite})=>{
    const frame={center,readerRight,up,widthM,heightM},spec=RAILING_BANNER_CLOTH,material=finishMaterial(m.name,source,'cloth-reverse');
    sheet(m,{...frame,shape:spec.shape,thicknessM:spec.clothThicknessM,source,profile:'cloth-reverse'});
    const hu=spec.hemWidthM/widthM,hv=spec.hemWidthM/heightM;
    const strips=[{edge:'top',window:[0,0,1,hv],nx:spec.segmentsX,ny:3},
      {edge:'bottom',window:[0,1-hv,1,1],nx:spec.segmentsX,ny:3},
      {edge:'left',window:[0,hv,hu,1-hv],nx:3,ny:spec.segmentsY},
      {edge:'right',window:[1-hu,hv,1,1-hv],nx:3,ny:spec.segmentsY}];
    for(const strip of strips){
      const distance=(u,v)=>strip.edge==='top'?v*heightM:strip.edge==='bottom'?(1-v)*heightM:strip.edge==='left'?u*widthM:(1-u)*widthM;
      const front=railingBannerPatch({...frame,materialWindow:strip.window,segmentsX:strip.nx,segmentsY:strip.ny,physicalUv:true,
        offset:(u,v)=>railingBannerHemLift(u,v,widthM,heightM)});
      const back=railingBannerPatch({...frame,materialWindow:strip.window,segmentsX:strip.nx,segmentsY:strip.ny,physicalUv:true,reverse:true,
        offset:(u,v)=>-(.00025+spec.clothThicknessM+spec.hemReturnDepthM*Math.sin(Math.PI*.5*clamp(distance(u,v)/spec.hemWidthM,0,1)))});
      for(const piece of[front,back,closeSurfaceEdges(front,back,strip.nx,strip.ny)])appendSignGeometry(group(m,material),piece);
      const record={kind:'curved-folded-cloth-hem',edge:strip.edge,materialWindow:strip.window,widthM:spec.hemWidthM,returnDepthM:spec.hemReturnDepthM};
      m.extras.signAssemblies.push(record);records.push({mesh:m.name,...record});
    }
    for(const repair of RAILING_BANNER_REPAIRS){
      const tapeMaterial=finishMaterial(m.name,MAT[repair.material],'painted-card'),nx=24,ny=3;
      const common={...frame,materialWindow:repair.window,segmentsX:nx,segmentsY:ny,physicalUv:true};
      const front=railingBannerPatch({...common,offset:(u,v)=>railingBannerHemLift(u,v,widthM,heightM)+spec.tapeThicknessM});
      const back=railingBannerPatch({...common,reverse:true,offset:(u,v)=>railingBannerHemLift(u,v,widthM,heightM)+.00006});
      for(const piece of[front,back,closeSurfaceEdges(front,back,nx,ny)])appendSignGeometry(group(m,tapeMaterial),piece);
      const record={kind:'adhered-cloth-hem-repair',role:repair.role,materialWindow:repair.window,thicknessM:spec.tapeThicknessM};
      m.extras.signAssemblies.push(record);records.push({mesh:m.name,...record});
    }
    const anchors=[[0,0],[1,0],[0,1],[1,1]].map(([u,v])=>({materialUv:[u,v],point:railingBannerSurface({...frame,u,v}).position}));
    const record={kind:'railing-supported-cloth',...spec,nominalCenter:center,anchors,
      support:'Existing park-railing banner placement; four original corner datums retained. World rail contact requires live encounter inspection.',
      copy:'Unchanged UV-space glyph coverage; the cloth carries the paint through the deformation.'};
    m.extras.signAssemblies.push(record);records.push({mesh:m.name,...record});
  };
  return{box,fixing,sheet,railingBanner,finishMaterial,materialCache,finishTiles,records,isCarrier:isSignAssembly};
}
