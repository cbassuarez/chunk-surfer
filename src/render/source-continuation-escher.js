// The Source II fall seen as the space it really is: an endless house of
// stairs. The exact 3x3 lattice of native apertures stays authoritative near
// the crossing; these merged images only widen the gluing plane into a whole
// world, stacked with the loop's own period, and line the abyss under every
// copy with the same construction turned over and on its sides.
//
// Nothing here moves a body, chooses a landing, adds a light or advances a
// clock. Each chart uses a merged copy of its own real construction, so
// its lattice is invariant under the translation that chart's wrap applies.
import {SOURCE_CONTINUATION as C,continuationSurfaces,continuationSolids} from '../data/source-continuation.js';
import {continuationVoidDomain,continuationVoidDomains} from '../data/source-continuation-void.js';

export const SOURCE_ESCHER=Object.freeze({
  // Bands relative to the falling body's own: the real world is band 0.
  bandsBelow:3,bandsAbove:1,
  unfoldSeconds:.9,foldSeconds:1.4,shiftSeconds:.3,
  // The core construction, without the long inherited Earthfall approach.
  core:Object.freeze({minX:-25,maxX:30,minZ:-40,maxZ:10}),
  // Turned copies stand outside each chart's footprint plus a full fall's
  // drift, so no fall from any real deck can pass through one. They are
  // scaled to fit a band of that chart's shortest loop period.
  ringScale:.62,cornerScale:.55,bandFill:.85,ringGap:1.5,
});
const GROUPS=Object.freeze({
  stone:Object.freeze(['cold-stone','cold-wall','source','earthfall-backing']),
  wood:Object.freeze(['piano-wood','wood']),
  lining:Object.freeze(['case-lining']),
  metal:Object.freeze(['worn-metal','dark-metal','metal','steel']),
});
const GROUP_MATERIAL=Object.freeze({stone:'cold-stone',wood:'piano-wood',lining:'case-lining',metal:'worn-metal'});
export const SOURCE_ESCHER_MESHES=Object.freeze(Object.keys(GROUPS).map(group=>'escher-ii-'+group));

const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,finite(v,a)));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const groupOf=material=>Object.keys(GROUPS).find(k=>GROUPS[k].includes(material))||'stone';
const faces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
function box(target,[x0,y0,z0],[x1,y1,z1]){
  const o=target.p.length/3;
  target.p.push(x0,y0,z0,x1,y0,z0,x1,y0,z1,x0,y0,z1,x0,y1,z0,x1,y1,z0,x1,y1,z1,x0,y1,z1);
  for(const[a,b,c,d]of faces)target.i.push(o+a,o+c,o+b,o+a,o+d,o+c);
}
const inCore=r=>{const c=SOURCE_ESCHER.core;return r.maxX>c.minX&&r.minX<c.maxX&&r.maxZ>c.minZ&&r.minZ<c.maxZ;};
// Chart 0's copies keep the core construction, not the long outward path
// that merely starts inside it.
const centredInCore=r=>{const c=SOURCE_ESCHER.core,x=(r.minX+r.maxX)/2,z=(r.minZ+r.maxZ)/2;return x>c.minX&&x<c.maxX&&z>c.minZ&&z<c.maxZ;};
function constructionRows(chartId=0){
  const relevant=s=>s.region==='wrong-return'&&(chartId!==0||inCore(s)&&centredInCore(s));
  const surfaces=continuationSurfaces({chartId}).filter(s=>relevant(s)&&s.kind==='rect'&&s.role!=='inherited-earthfall');
  const solids=continuationSolids({chartId}).filter(s=>relevant(s)&&s.role!=='closure');
  return{surfaces,solids};
}
const meshName=(chartId,group)=>chartId===0?'escher-ii-'+group:`escher-ii-chart-${chartId}-${group}`;
const CHARTS=Object.freeze([0,1,2,3,4]);
const chartRows=Object.fromEntries(CHARTS.map(chartId=>[chartId,constructionRows(chartId)]));
export const SOURCE_ESCHER_MESHES_BY_CHART=Object.freeze(Object.fromEntries(CHARTS.map(chartId=>{
  const {surfaces,solids}=chartRows[chartId],used=new Set([...surfaces,...solids].map(s=>groupOf(s.material)));
  return[chartId,Object.freeze(Object.keys(GROUPS).filter(group=>used.has(group)).map(group=>meshName(chartId,group)))];
})));
// World-space geometry: a 'detail' piece is never recentred, so an identity
// instance draws the construction exactly over the real one.
export function sourceContinuationEscherGeometryLibrary(){
  const library={};
  for(const chartId of CHARTS){
    const groups=Object.fromEntries(Object.keys(GROUPS).map(k=>[k,{p:[],i:[]}])),{surfaces,solids}=chartRows[chartId];
    for(const s of surfaces)box(groups[groupOf(s.material||'cold-stone')],[s.minX,s.y-finite(s.thickness,.22),s.minZ],[s.maxX,s.y,s.maxZ]);
    for(const s of solids)box(groups[groupOf(s.material||'cold-wall')],[s.minX,s.minY,s.minZ],[s.maxX,s.maxY,s.maxZ]);
    for(const [group,g] of Object.entries(groups))if(g.i.length)library[meshName(chartId,group)]={...g,material:GROUP_MATERIAL[group]};
  }
  return library;
}
const EXTENTS=Object.freeze(Object.fromEntries(CHARTS.map(chartId=>{const {surfaces,solids}=chartRows[chartId],rows=[...surfaces.map(s=>({...s,minY:s.y-finite(s.thickness,.22),maxY:s.y})),...solids];
  const min=[Math.min(...rows.map(r=>r.minX)),Math.min(...rows.map(r=>r.minY)),Math.min(...rows.map(r=>r.minZ))],
    max=[Math.max(...rows.map(r=>r.maxX)),Math.max(...rows.map(r=>r.maxY)),Math.max(...rows.map(r=>r.maxZ))];
  return[chartId,Object.freeze({min:Object.freeze(min),max:Object.freeze(max),center:Object.freeze(min.map((v,k)=>(v+max[k])/2))})];
})));
export const SOURCE_ESCHER_EXTENT=EXTENTS[0];
// The clear column of each chart: every deck a wrap fall can leave, grown by
// the farthest a walking body drifts during that chart's longest fall.
export const SOURCE_ESCHER_LAYOUT=Object.freeze(Object.fromEntries(CHARTS.map(chartId=>{
  const e=EXTENTS[chartId],domains=continuationVoidDomains.filter(d=>d.chartId===chartId);
  if(!domains.length)return[chartId,null];
  const decks=continuationSurfaces({chartId}).filter(s=>s.region==='wrong-return'&&s.kind==='rect'&&s.role!=='inherited-earthfall');
  const shortest=Math.min(...domains.map(d=>d.translationY)),longest=Math.max(...domains.map(d=>d.translationY)),
    drift=C.walkSpeed*Math.sqrt(2*(longest+1)/C.gravity),fit=SOURCE_ESCHER.bandFill*shortest;
  const footprint=Object.freeze({minX:Math.min(...decks.map(s=>s.minX))-drift,maxX:Math.max(...decks.map(s=>s.maxX))+drift,
    minZ:Math.min(...decks.map(s=>s.minZ))-drift,maxZ:Math.max(...decks.map(s=>s.maxZ))+drift});
  const half=[(e.max[0]-e.min[0])/2,(e.max[2]-e.min[2])/2],tall=e.max[1]-e.min[1];
  // North/south copies stand their z extent upright; east/west their x.
  const ns=Math.min(SOURCE_ESCHER.ringScale,fit/(2*half[1])),ew=Math.min(SOURCE_ESCHER.ringScale,fit/(2*half[0])),corner=SOURCE_ESCHER.cornerScale;
  return[chartId,Object.freeze({footprint,drift,ringScaleNS:ns,ringScaleEW:ew,cornerScale:corner,
    depthNS:tall*ns,depthEW:tall*ew,cornerHalf:Object.freeze([half[0]*corner,half[1]*corner])})];
})));

// Column-major 4x4 helpers, matching the renderer's Float32Array layout.
const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const T=(x,y,z)=>{const m=I();m[12]=x;m[13]=y;m[14]=z;return m;};
const S=s=>[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1];
const RX=a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];};
const RZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
const mul=(a,b)=>{const m=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const chain=(...ms)=>ms.reduce((a,b)=>mul(a,b));
const apply=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);

// The tile whose column the body will occupy when it reaches the exit plane.
// Horizontal motion in a void fall is constant, so this is fixed for a fall.
export function sourceEscherCrossingShift(fall,domain){
  if(!fall||!domain)return[0,0];
  const h=finite(fall.feet)+C.bodyHeight/2-domain.exitY,vy=finite(fall.vy),g=C.gravity;
  const t=h>0?(vy+Math.sqrt(Math.max(0,vy*vy+2*g*h)))/g:0;
  const tileX=Math.floor((finite(fall.x)+finite(fall.vx)*t-domain.minX)/domain.periodX),
    tileZ=Math.floor((finite(fall.z)+finite(fall.vz)*t-domain.minZ)/domain.periodZ);
  return[tileX*domain.periodX,tileZ*domain.periodZ];
}

// Presence blooms during a void fall and folds after landing. The caller may
// carry {presence,shift,at,domainId} between frames on the simulation clock;
// without it the frame is a pure function of the saved state.
export function sourceEscherPresence(state,memory=null){
  const fall=state?.fall,domain=state?.phase==='wrong-return'?continuationVoidDomain(fall?.voidLoop):null;
  const now=finite(state?.elapsed),last=memory&&Number.isFinite(memory.at)?memory:null,dt=last?clamp(now-last.at,0,.25):0;
  if(domain&&(state.chartId??0)===domain.chartId&&(fall.chartId??domain.chartId)===domain.chartId){
    const target=sourceEscherCrossingShift(fall,domain),opened=smooth(finite(fall.elapsed)/SOURCE_ESCHER.unfoldSeconds);
    const presence=Math.max(opened,last&&last.domainId===domain.id?finite(last.presence):0);
    const k=last&&last.domainId===domain.id?1-Math.exp(-dt/SOURCE_ESCHER.shiftSeconds):1,from=last&&last.domainId===domain.id?last.shift:target;
    return{presence,shift:[0,1].map(i=>finite(from[i])+(target[i]-finite(from[i]))*k),target,domainId:domain.id,at:now,falling:true};
  }
  if(!last||!(last.presence>0))return{presence:0,shift:[0,0],target:[0,0],domainId:null,at:now,falling:false};
  return{...last,presence:Math.max(0,last.presence-dt/SOURCE_ESCHER.foldSeconds),at:now,falling:false};
}

// One band of the lattice. Every band is identical, which is what makes the
// whole lattice invariant under the wrap's own translation. Around each
// upright world stand four copies turned onto their sides, their floors
// facing the column, and four inverted ones at the corners, level with it.
// Blooming turns each from the real world's own orientation into its own.
const RING=Object.freeze([
  {kind:'north',at:[0,-1],turn:a=>RX(a)},{kind:'south',at:[0,1],turn:a=>RX(-a)},
  {kind:'east',at:[1,0],turn:a=>RZ(a)},{kind:'west',at:[-1,0],turn:a=>RZ(-a)},
]);
function bandImages(band,offset,bloom,period,extent,layout){
  const [cx,cy,cz]=extent.center,unfold=1-bloom,grow=S(Math.max(1e-3,bloom)),rows=[];
  // The upright world is the actual gluing image; it only grows into place.
  if(band!==0)rows.push({kind:'upright',matrix:chain(T(...offset),T(cx,cy,cz),grow,T(-cx,-cy,-cz))});
  // Halfway down each band, in the abyss between two upright worlds.
  const mid=cy-period/2;
  // Each side stands just beyond its own edge of the clear column.
  const f=layout.footprint,gap=SOURCE_ESCHER.ringGap,beyond=(sign,lo,hi,reach)=>sign>0?hi+reach+gap:lo-reach-gap;
  for(const ring of RING){
    const northSouth=ring.at[1]!==0,s=northSouth?layout.ringScaleNS:layout.ringScaleEW,depth=northSouth?layout.depthNS:layout.depthEW;
    const x=northSouth?cx:beyond(ring.at[0],f.minX,f.maxX,depth/2),z=northSouth?beyond(ring.at[1],f.minZ,f.maxZ,depth/2):cz;
    rows.push({kind:ring.kind,matrix:chain(T(...offset),T(x,mid,z),
      ring.turn(Math.PI/2*bloom),S(Math.max(1e-3,s*bloom)),T(-cx,-cy,-cz))});
  }
  for(const [x,z]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
    const s=layout.cornerScale,at=[beyond(x,f.minX,f.maxX,layout.cornerHalf[0]),beyond(z,f.minZ,f.maxZ,layout.cornerHalf[1])];
    rows.push({kind:`corner-${x}-${z}`,matrix:chain(T(...offset),T(at[0],cy,at[1]),
      RX(Math.PI*bloom),RZ(x*z*unfold*.6),S(Math.max(1e-3,s*bloom)),T(-cx,-cy,-cz))});
  }
  return rows;
}

export function sourceContinuationEscherFrame(state,{voidViews=null,origin={x:0,y:0,z:0},memory=null}={}){
  const next=sourceEscherPresence(state,memory),domain=continuationVoidDomain(next.domainId)||voidViews?.domain||null;
  const bloom=smooth(next.presence);
  if(!domain||bloom<=1e-3)return{props:[],memory:next,diagnostics:{active:false,presence:next.presence}};
  const extent=EXTENTS[domain.chartId],meshes=SOURCE_ESCHER_MESHES_BY_CHART[domain.chartId],layout=SOURCE_ESCHER_LAYOUT[domain.chartId];
  if(!extent||!meshes||!layout)return{props:[],memory:next,diagnostics:{active:false,presence:next.presence}};
  const P=domain.translationY,V=[next.shift[0],-P,next.shift[1]],o=[finite(origin.x),finite(origin.y),finite(origin.z)];
  const anchor=T(...o),props=[];
  for(let band=-SOURCE_ESCHER.bandsAbove;band<=SOURCE_ESCHER.bandsBelow;band++){
    const offset=V.map(v=>v*band);
    for(const image of bandImages(band,offset,bloom,P,extent,layout))for(const mesh of meshes){
      const matrix=mul(anchor,image.matrix),at=apply(matrix,extent.center);
      props.push({id:`escher:${domain.id}:${band}:${image.kind}:${mesh}`,mesh:'source-continuation-'+mesh,matrix:new Float32Array(matrix),
        x:at[0],y:at[1],z:at[2],chartId:domain.chartId,region:'wrong-return',structural:true,escherImage:true,escherBand:band,escherKind:image.kind,
        // The upright image coincides with the exact native apertures there.
        excludeVoidApertures:image.kind==='upright'&&!!voidViews,
        noShadow:true,noReflection:true,cullRadius:60});
    }
  }
  return{props,memory:next,diagnostics:{active:true,presence:next.presence,domainId:domain.id,shift:[...next.shift],target:[...next.target],period:P,images:props.length}};
}
