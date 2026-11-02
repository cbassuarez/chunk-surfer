// Native panes are additional views of the submitted instrument, not pictures
// of a replacement object. A registered foreground shares the main lens; the
// second pass behind it supplies the impossible/retained interior. This module
// owns no transport, animation clock, game state, audio or operating-system UI.
import {sourceRestApertureMesh} from './source-rest-aperture-frame.js';
import {windowMediaAsset} from '../platform/window-composition.js';

export const SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS=Object.freeze({meshes:24,vertices:65536,triangles:32768,instancesPerPane:64,renderedTrianglesPerPane:65536,panes:2});
const ids=Object.freeze(['rest:source','rest:answer']),full=Object.freeze({x:0,y:0,width:1,height:1});
const finite=v=>Number.isFinite(Number(v)),num=(v,d=0)=>finite(v)?Number(v):d;
const vector=v=>v?.length===3&&Array.from(v).every(finite)?Array.from(v,Number):null;
const sub=(a,b)=>a.map((v,k)=>v-b[k]),add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,s)=>a.map(v=>v*s),
  dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit=v=>{const length=Math.hypot(...v);return length>1e-9?scale(v,1/length):null;},
  transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const frozen=v=>Object.freeze(v),matrixValid=m=>m?.length===16&&Array.from(m).every(finite);
const meshCache=new Map();
function hash(values){let h=2166136261;for(const value of values){const text=String(value);for(let k=0;k<text.length;k++)h=Math.imul(h^text.charCodeAt(k),16777619);}return(h>>>0).toString(16);}
function meshFor(row){
  const canonical=sourceRestApertureMesh(row.mesh);
  if(!canonical||row.p!==canonical.p||row.i!==canonical.i)return null;
  if(meshCache.has(row.mesh))return meshCache.get(row.mesh);
  const p=Array.from(canonical.p),i=Array.from(canonical.i),base=Array.from(canonical.base||[.45,.43,.33,1]);
  if(!p.length||p.length%3||!i.length||i.length%3||!p.every(finite)||!i.every(n=>Number.isInteger(n)&&n>=0&&n<p.length/3)||base.length!==4||!base.every(finite))return null;
  const min=[0,1,2].map(k=>Math.min(...p.filter((_,n)=>n%3===k))),max=[0,1,2].map(k=>Math.max(...p.filter((_,n)=>n%3===k))),
    value=frozen({id:row.mesh,p:frozen(p),i:frozen(i),base:frozen(base)}),entry={value,min,max,hash:hash([row.mesh,...p,...i,...base])};
  meshCache.set(row.mesh,entry);return entry;
}
function geometry(frame){
  if(!Array.isArray(frame?.geometry)||!frame.geometry.length||frame.geometry.length>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.meshes)return null;
  const meshes=new Map(),instances=[],seen=new Set();
  for(const row of frame.geometry){
    if(typeof row?.id!=='string'||row.id.length>192||seen.has(row.id)||!matrixValid(row.matrix))return null;
    const mesh=meshFor(row);if(!mesh)return null;seen.add(row.id);meshes.set(mesh.value.id,mesh);
    instances.push(frozen({id:row.id,meshId:mesh.value.id,role:String(row.role||''),matrix:frozen(Array.from(row.matrix,Number))}));
  }
  const catalogue=[...meshes.values()],vertices=catalogue.reduce((n,g)=>n+g.value.p.length/3,0),triangles=catalogue.reduce((n,g)=>n+g.value.i.length/3,0);
  if(vertices>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.vertices||triangles>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.triangles)return null;
  return{meshes,instances:frozen(instances),vertices,triangles};
}
const rect=v=>v&&['x','y','width','height'].every(k=>finite(v[k]))&&v.width>0&&v.height>0?{x:Number(v.x),y:Number(v.y),width:Number(v.width),height:Number(v.height)}:null;
const cropValue=v=>{const c=rect(v);return c&&Math.max(...Object.values(c).map(Math.abs))<=16?c:null;};
export function sourceRestWindowCrop(layout,surfaceId){
  const pane=layout?.panes?.find(p=>(p.surfaceId||p.id)===surfaceId),main=rect(layout?.mainRect),place=rect(pane?.rect);
  if(main&&place)return cropValue({x:(place.x-main.x)/main.width,y:(place.y-main.y)/main.height,width:place.width/main.width,height:place.height/main.height});
  if(pane?.crop)return cropValue(pane.crop);
  return surfaceId===ids[0]?{x:-.28,y:.08,width:.28,height:.34}:{x:1,y:.22,width:.28,height:.34};
}
/** Exact off-axis continuation of props3d.perspective and r3dProjectWorld:
 * NDC.x = right/(depth*tanHalfFov*aspect), NDC.y = up/(depth*tanHalfFov).
 * Crops outside [0,1] continue that same lens beyond the main window edge. */
export function sourceRestWindowOffAxisProjection({tanHalfFov=.95,aspect=16/9,near=.05,far=300}={},crop=full){
  if(![tanHalfFov,aspect,near,far].every(finite)||tanHalfFov<=0||aspect<=0||near<=0||far<=near||!cropValue(crop))return null;
  const l=(crop.x*2-1)*near*tanHalfFov*aspect,r=((crop.x+crop.width)*2-1)*near*tanHalfFov*aspect,
    t=(1-crop.y*2)*near*tanHalfFov,b=(1-(crop.y+crop.height)*2)*near*tanHalfFov;
  return frozen([2*near/(r-l),0,0,0,0,2*near/(t-b),0,0,(r+l)/(r-l),(t+b)/(t-b),-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0]);
}
function camera(eye,basis,projection,crop=full){
  const e=vector(eye),right=vector(basis?.right),up=vector(basis?.up),forward=vector(basis?.forward),matrix=sourceRestWindowOffAxisProjection(projection,crop);
  if(!e||!right||!up||!forward||!matrix)return null;
  if([right,up,forward].some(v=>Math.abs(Math.hypot(...v)-1)>.0001)||Math.max(Math.abs(dot(right,up)),Math.abs(dot(right,forward)),Math.abs(dot(up,forward)))>.0001)return null;
  return frozen({eye:frozen(e),basis:frozen({right:frozen(right),up:frozen(up),forward:frozen(forward)}),projection:frozen({...projection}),crop:frozen({...crop}),matrix});
}
export function sourceRestWindowProject(point,view){
  const p=vector(point);if(!p||!view)return null;const delta=sub(p,view.eye),depth=dot(delta,view.basis.forward);if(depth<=0)return null;
  const x=(dot(delta,view.basis.right)/(depth*view.projection.tanHalfFov*view.projection.aspect)+1)/2,
    y=(1-dot(delta,view.basis.up)/(depth*view.projection.tanHalfFov))/2,c=view.crop;
  return{x:(x-c.x)/c.width,y:(y-c.y)/c.height,mainX:x,mainY:y,depth};
}
function segmentTriangle(a,b,t){
  const ray=sub(b,a),ab=sub(t[1],t[0]),ac=sub(t[2],t[0]),h=cross(ray,ac),det=dot(ab,h);if(Math.abs(det)<1e-10)return false;
  const inv=1/det,s=sub(a,t[0]),u=dot(s,h)*inv;if(u<0||u>1)return false;
  const q=cross(s,ab),v=dot(ray,q)*inv;if(v<0||u+v>1)return false;const along=dot(ac,q)*inv;
  return along>1e-5&&along<1-1e-5;
}
/** One bounded, initial-layout diagnostic. A seam is an actual uploaded string
 * triangle intersecting the main frustum boundary with no case/rib in front.
 * It never manufactures a wire or moves a native window on a later note. */
export function sourceRestWindowArchitectureSeam(frame,{edge='left',maxCandidates=96}={}){
  const g=geometry(frame),projection={tanHalfFov:num(frame?.viewport?.tanHalfFov,.95),aspect:num(frame?.viewport?.aspect,16/9),near:.05,far:300},
    view=camera(frame?.eye,frame?.basis,projection,full);if(!g||!view||!['left','right','top','bottom'].includes(edge))return null;
  const vertices=new Map(),world=row=>{if(vertices.has(row.id))return vertices.get(row.id);const p=g.meshes.get(row.meshId).value.p,points=[];for(let n=0;n<p.length;n+=3)points.push(transform(row.matrix,p.slice(n,n+3)));vertices.set(row.id,points);return points;},
    opaque=g.instances.filter(row=>['case','lining','bridge','soundboard','manual-bed','lid','wrestplank','pins'].includes(row.role)),occluders=[];
  for(const row of opaque){const p=world(row),i=g.meshes.get(row.meshId).value.i;for(let n=0;n<i.length;n+=3)occluders.push({id:row.id,p:[p[i[n]],p[i[n+1]],p[i[n+2]]]});}
  const plane=point=>{const delta=sub(point,view.eye),depth=dot(delta,view.basis.forward),right=dot(delta,view.basis.right),up=dot(delta,view.basis.up);
    return edge==='left'?right+depth*projection.tanHalfFov*projection.aspect:edge==='right'?right-depth*projection.tanHalfFov*projection.aspect:edge==='top'?up-depth*projection.tanHalfFov:up+depth*projection.tanHalfFov;};
  let candidates=0;const limit=Math.min(128,Math.max(1,Math.floor(num(maxCandidates,96))));
  for(const row of g.instances.filter(row=>row.role==='strings')){
    const p=world(row),i=g.meshes.get(row.meshId).value.i;
    for(let n=0;n<i.length;n+=3)for(let k=0;k<3;k++){
      const a=p[i[n+k]],b=p[i[n+(k+1)%3]],fa=plane(a),fb=plane(b);if(fa*fb>0||fa===fb)continue;
      const t=fa/(fa-fb),point=add(a,scale(sub(b,a),t)),q=sourceRestWindowProject(point,view);
      if(!q||q.depth<=projection.near||(edge==='left'||edge==='right'?q.y<0||q.y>.68:q.x<0||q.x>1))continue;
      if(++candidates>limit)return null;
      if(occluders.some(triangle=>segmentTriangle(view.eye,point,triangle.p)))continue;
      return frozen({sourceId:row.id,meshId:row.meshId,triangle:n/3,edge,point:frozen(point),main:frozen({x:q.mainX,y:q.mainY}),depth:q.depth,occlusionChecked:true,candidates});
    }
  }
  return null;
}
function bounds(rows,meshes){
  const points=[];for(const row of rows){const g=meshes.get(row.meshId);if(!g)continue;for(const x of[g.min[0],g.max[0]])for(const y of[g.min[1],g.max[1]])for(const z of[g.min[2],g.max[2]])points.push(transform(row.matrix,[x,y,z]));}
  if(!points.length)return null;const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
  return{centre:min.map((v,k)=>(v+max[k])/2),radius:Math.max(.3,Math.hypot(...sub(max,min))/2)};
}
function interiorView(frame,g,index,aspect){
  // Frame the actual playable instrument anatomy, not the empty bounding
  // sphere of all three storeys of thin courses. The monumental strings and
  // ribs remain in the same draw and can cross this nearer interior view.
  const roles=frame.phase==='catch'?['soundboard','manual-bed','naturals','accidentals']:['chamber'],
    focus=g.instances.filter(row=>roles.includes(row.role)),extent=bounds(focus.length?focus:g.instances,g.meshes),
    reference=g.instances.find(row=>row.role===(frame.phase==='catch'?'case':'core'))||g.instances[0],m=reference.matrix,
    right=unit([m[0],m[1],m[2]]),up=unit([m[4],m[5],m[6]]),forward=unit([-m[8],-m[9],-m[10]]);
  if(!extent||!right||!up||!forward)return null;
  if(frame.phase==='catch'){
    // Two literal in-case vantage points. The first is just beyond the real
    // broken cheek, looking up along the architectural courses; the other
    // looks back through those courses towards the actual two-manual bay.
    // Framing a 24m sparse bounding sphere made this a tiny detached object.
    const origin=[m[12],m[13],m[14]],point=(r,y,f)=>add(add(add(origin,scale(right,r)),scale(up,y)),scale(forward,f)),
      eye=index?point(-1.65,2.60,3.80):point(.65,1.65,1.70),target=index?point(-1.50,1.05,-.90):point(-.75,5.60,5.80),
      look=unit(sub(target,eye)),r=unit(cross(look,up));
    return r?camera(eye,{right:r,up:unit(cross(r,look)),forward:look},{tanHalfFov:.95,aspect,near:.05,far:300},full):null;
  }
  const direction=unit(add(add(scale(right,index?-.86:.82),scale(forward,index?-.42:.62)),scale(up,index?.60:.34))),
    eye=add(extent.centre,scale(direction,extent.radius*1.72)),look=unit(sub(extent.centre,eye)),
    upHint=frame.phase==='wrong-return'&&!index?right:up,r=unit(cross(look,upHint));
  return r?camera(eye,{right:r,up:unit(cross(r,look)),forward:look},{tanHalfFov:.95,aspect,near:.05,far:300},full):null;
}
function film(value,sourceSeconds){
  const assetId=typeof value==='string'?value:value?.assetId,asset=windowMediaAsset(assetId);if(!asset||asset.sensitivity==='clinical')return null;
  return frozen({assetId,mediaTime:Math.max(0,num(value?.mediaTime,sourceSeconds)),layer:'background',occluded:true});
}
const stage=amount=>amount<.42?'intact':amount<.63?'opening':amount<.79?'unmoored':'last-intact';
function architecturalCut(crop){
  const left=crop.x+crop.width/2<.5,seam=(Number(left?0:1)-crop.x)/crop.width;
  let start,end;
  if(seam>=0&&seam<=1){start=Math.max(0,seam-(left?.14:.28));end=Math.min(1,seam+(left?.28:.14));}
  else{start=left?.72:0;end=left?1:.28;}
  const edge=start>1e-8&&end<1-1e-8?'both':start>1e-8?'left':'right';
  return{clip:frozen({x:start,y:0,width:end-start,height:1,edge,edgeWidth:.018,edgeShade:.38}),
    seam:seam>=0&&seam<=1?seam:null};
}

export function sourceRestWindowArchitecture(frame,{layout=null,retainedFrame=null,filmBySurface={},reducedMotion=false}={}){
  if(!['wrong-return','catch'].includes(frame?.phase)||!finite(frame.mediaTime)||frame.mediaTime<0||num(frame.degradation)>=.95)return null;
  const current=geometry(frame),retained=retainedFrame?.phase===frame.phase&&num(retainedFrame.degradation)<.42?geometry(retainedFrame):null;
  if(!current)return null;const reference=retained||current,referenceFrame=retained?retainedFrame:frame,
    allMeshes=new Map([...current.meshes,...reference.meshes]),sourceSeconds=Number(frame.mediaTime),panes=[],
    projection={tanHalfFov:num(frame.viewport?.tanHalfFov,.95),aspect:num(frame.viewport?.aspect,16/9),near:.05,far:300};
  if(allMeshes.size>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.meshes)return null;
  for(let index=0;index<ids.length;index++){
    const surfaceId=ids[index],crop=sourceRestWindowCrop(layout,surfaceId);if(!crop)return null;
    const registered=camera(frame.eye,frame.basis,projection,crop);if(!registered)return null;
    const inside=index?reference:current,insideFrame=index?referenceFrame:frame,
      paneAspect=crop.width*projection.aspect/crop.height,interior=interiorView(insideFrame,inside,index,paneAspect);if(!interior)return null;
    // The near lid physically occupies every higher left-hand crop too. An
    // explicit cut straddles the MEASURED main edge, including when a pane
    // overlaps the main window. Never assume that shared edge is pane.x=1.
    // Hard endgrain is drawn only where actual case geometry meets each cut.
    const cutSpec=frame.phase==='catch'&&!index?architecturalCut(crop):null,cut=cutSpec?.clip||null;
    const layers=frozen([frozen({id:index?'retained-interior':'impossible-interior',camera:interior,instances:inside.instances}),
      frozen({id:'registered-foreground',camera:registered,instances:current.instances,...(cut?{clip:cut}:{})})]);
    const instanceCount=inside.instances.length+current.instances.length,
      renderedTriangles=[...inside.instances,...current.instances].reduce((n,row)=>n+allMeshes.get(row.meshId).value.i.length/3,0);
    if(instanceCount>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.instancesPerPane||renderedTriangles>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.renderedTrianglesPerPane)return null;
    const background=film(filmBySurface[surfaceId],sourceSeconds);
    panes.push(frozen({surfaceId,camera:registered,instances:current.instances,layers,
      view:frozen({kind:frame.phase==='catch'?(index?'case-return':'string-crossing'):(index?(retained?'last-intact-chamber':'current-chamber'):'incompatible-up-chamber'),
        registeredForeground:true,architecturalCut:!!cut,registeredSpan:cut?.width??1,mainSeam:cutSpec?.seam??null,
        referenceSeconds:index?num(referenceFrame.mediaTime):sourceSeconds,upRelation:frame.phase==='wrong-return'&&!index?'incompatible':'case-local',
        registration:layout?.mainRect?'measured-main-content':'explicit-crop',phase:stage(num(frame.degradation))}),
      ...(background?{background}:{})}));
  }
  const entries=[...allMeshes.values()].sort((a,b)=>a.value.id.localeCompare(b.value.id)),meshes=frozen(entries.map(row=>row.value)),
    vertices=entries.reduce((n,g)=>n+g.value.p.length/3,0),triangles=entries.reduce((n,g)=>n+g.value.i.length/3,0);
  if(vertices>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.vertices||triangles>SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS.triangles)return null;
  return frozen({version:1,meshRevision:hash(entries.map(g=>g.hash)),sourceSeconds,phase:frame.phase,meshes,panes:frozen(panes),
    diagnostics:frozen({canonicalMeshes:meshes.length,vertices,triangles,retained:!!retained,
      sourcePhase:stage(num(frame.degradation)),electronic:Math.max(0,Math.min(1,num(frame.revoicing?.electronic))),
      reducedMotion:!!reducedMotion,independentClock:false,rasterReadback:false,newWorldGeometry:false})});
}

// The owner resets this bounded memory on stand/phase/ending. Retention never
// advances music, announces progress, or replaces the live registered camera.
export function createSourceRestWindowArchitectureComposer(){
  let phase=null,retained=null,last=null;
  function reset(){phase=retained=last=null;}
  function compose(frame,options={}){
    if(phase&&phase!==frame?.phase)reset();
    const packet=sourceRestWindowArchitecture(frame,{...options,retainedFrame:retained});if(!packet)return null;
    phase=frame.phase;
    if(num(frame.degradation)<.42){
      retained=frozen({...frame,eye:frozen([...frame.eye]),basis:frozen(Object.fromEntries(Object.entries(frame.basis).map(([key,value])=>[key,frozen([...value])]))),
        geometry:frozen(frame.geometry.map(row=>frozen({...row,matrix:frozen([...row.matrix])})))});
    }
    last=packet;return packet;
  }
  return{compose,reset,snapshot:()=>({phase,retainedSeconds:retained?.mediaTime??null,sourceSeconds:last?.sourceSeconds??null,meshRevision:last?.meshRevision??null})};
}
