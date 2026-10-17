// Shared, deterministic geometry for the reliquary and the two original eyes.
// All returned groups have metre-space positions/normals/triangle indices.
import fs from 'node:fs';
export const RELIQUARY_MATERIALS = Object.freeze({
  marble: {color: [.72,.74,.69,1], roughness: .78, metallic: 0},
  stone: {color: [.51,.52,.49,1], roughness: .91, metallic: 0},
  inlay: {color: [.35,.36,.33,1], roughness: .83, metallic: .16},
  bronze: {color: [.54,.38,.20,1], roughness: .52, metallic: .71},
  bronzeDark: {color: [.24,.27,.23,1], roughness: .74, metallic: .55},
  shutter: {color: [.63,.65,.59,1], roughness: .69, metallic: .19},
  eye: {color: [.27,.32,.29,1], roughness: .79, metallic: 0},
  iris: {color: [.22,.25,.23,1], roughness: .85, metallic: 0},
  pupil: {color: [.17,.19,.18,1], roughness: .88, metallic: 0},
  vein: {color: [.21,.24,.22,1], roughness: .83, metallic: 0},
});
// A cast impression for an open right hand. Its four individually rounded
// fingers and side thumb remain a silhouette at the game's standing camera;
// the outline is the interaction surface, not decoration on a round button.
const HAND_CONTROL = Object.freeze([
  [-.14,-.43],[.11,-.43],[.16,-.34],[.19,-.18],[.29,-.04],
  [.43,.08],[.44,.14],[.39,.18],[.34,.16],[.22,.06],
  [.20,.19],[.20,.39],[.17,.45],[.13,.46],[.10,.41],[.10,.15],
  [.06,.48],[.025,.53],[-.02,.53],[-.05,.47],[-.05,.15],
  [-.10,.44],[-.14,.48],[-.18,.44],[-.18,.37],[-.18,.13],
  [-.23,.34],[-.27,.37],[-.31,.33],[-.31,.27],[-.29,-.09],
  [-.25,-.24],[-.19,-.35],
]);
export function handBezelOutline(samples=3){
 const p=HAND_CONTROL,out=[];
 for(let i=0;i<p.length;i++)for(let j=0;j<samples;j++){
  const t=j/samples,t2=t*t,t3=t2*t;
  const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],d=p[(i+2)%p.length];
  out.push([0,1].map(k=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)));
 }
 return out;
}
// The plinth's front is planar; the hand is a cut in the masonry, not a
// surface-mounted mechanism on a sloped cabinet.
export function reliquaryFrontDepth(_y){return .85}
export function createHandBezelGeometry(center=[0,1.25,.794],detail=3){
 const points=handBezelOutline(detail),housing=reliquaryGeometry(),seal=reliquaryGeometry(),wear=reliquaryGeometry();
 const point=(p,s,z)=>{const y=center[1]+p[1]*s;return[center[0]+p[0]*s,y,reliquaryFrontDepth(y)+z]};
 const band=(g,outer,oz,inner,iz)=>{for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];g.quad(point(a,outer,oz),point(b,outer,oz),point(b,inner,iz),point(a,inner,iz));}};
 const fill=(g,scale,z)=>{const middle=[center[0],center[1],reliquaryFrontDepth(center[1])+z];for(let i=0;i<points.length;i++)g.triangle(middle,point(points[i],scale,z),point(points[(i+1)%points.length],scale,z));};
 // The stationary dark casting surrounds a moving shallow bronze impression.
 fill(housing,1.16,-.085);band(housing,1.16,-.085,1.16,.006);band(housing,1.16,.006,1.00,.014);
 band(seal,1.0,.015,.88,.008);band(seal,.88,.008,.66,-.033);band(seal,.66,-.033,.36,-.054);fill(seal,.36,-.054);
 // Wear is concentrated where a real palm and fingers would repeatedly land.
 for(const [a,b] of [
  [[-.12,-.10],[.14,-.08]], [[-.11,-.16],[.11,-.15]],
  [[-.24,.12],[-.23,.25]],[[-.12,.18],[-.12,.33]],[[.02,.19],[.02,.36]],[[.15,.18],[.15,.30]],
 ])wear.rod(point(a,1,-.052),point(b,1,-.052),.0035,6);
 return {housing,seal,wear,outline:points};
}
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n)};
const sub=(a,b)=>a.map((x,k)=>x-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function reliquaryGeometry(){
 const g={positions:[],normals:[],indices:[]};
 g.triangle=(a,b,c,ns)=>{const n=unit(cross(sub(b,a),sub(c,a))),i=g.positions.length/3;g.positions.push(...a,...b,...c);g.normals.push(...(ns?.[0]||n),...(ns?.[1]||n),...(ns?.[2]||n));g.indices.push(i,i+1,i+2)};
 g.quad=(a,b,c,d,ns)=>{g.triangle(a,b,c,ns&&[ns[0],ns[1],ns[2]]);g.triangle(a,c,d,ns&&[ns[0],ns[2],ns[3]])};
 g.box=(cx,cy,cz,sx,sy,sz,angle=0)=>{const ca=Math.cos(angle),sa=Math.sin(angle);const p=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([x,y,z])=>[cx+x*sx/2*ca-y*sy/2*sa,cy+x*sx/2*sa+y*sy/2*ca,cz+z*sz/2]);for(const f of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]])g.quad(...f.map(i=>p[i]));};
 g.lathe=(profile,center=[0,0,0],segments=48,axis='y')=>{const pt=(r,h,t)=>axis==='z'?[center[0]+r*Math.cos(t),center[1]+r*Math.sin(t),center[2]+h]:[center[0]+r*Math.cos(t),center[1]+h,center[2]+r*Math.sin(t)];for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){const t=i/segments*Math.PI*2,u=(i+1)/segments*Math.PI*2,[r,h]=profile[j],[s,k]=profile[j+1];const a=pt(r,h,t),b=pt(r,h,u),c=pt(s,k,u),d=pt(s,k,t);if(r<1e-8)g.triangle(a,c,d);else if(s<1e-8)g.triangle(a,b,c);else g.quad(a,b,c,d)}};
 g.ellipsoid=(center,radii,columns=24,rows=16)=>{const pt=(u,v)=>{const a=u*Math.PI*2,b=(v-.5)*Math.PI,local=[Math.cos(b)*Math.cos(a)*radii[0],Math.sin(b)*radii[1],Math.cos(b)*Math.sin(a)*radii[2]];return {p:local.map((x,k)=>x+center[k]),n:unit(local.map((x,k)=>x/(radii[k]*radii[k])))};};for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=pt(i/columns,j/rows),b=pt((i+1)/columns,j/rows),c=pt((i+1)/columns,(j+1)/rows),d=pt(i/columns,(j+1)/rows);if(j>0)g.triangle(a.p,c.p,b.p,[a.n,c.n,b.n]);if(j<rows-1)g.triangle(a.p,d.p,c.p,[a.n,d.n,c.n])}};
 g.torus=(center,major,minor,axis='z',segments=48,tube=8,scale=[1,1,1],start=0,end=Math.PI*2)=>{const point=(a,b)=>{const r=major+minor*Math.cos(b);const local=axis==='y'?[r*Math.cos(a),minor*Math.sin(b),r*Math.sin(a)]:axis==='x'?[minor*Math.sin(b),r*Math.cos(a),r*Math.sin(a)]:[r*Math.cos(a),r*Math.sin(a),minor*Math.sin(b)];return local.map((x,k)=>center[k]+x*scale[k])};for(let i=0;i<segments;i++)for(let j=0;j<tube;j++){const a=start+(end-start)*i/segments,b=start+(end-start)*(i+1)/segments,c=j/tube*Math.PI*2,d=(j+1)/tube*Math.PI*2;if(axis==='y')g.quad(point(a,c),point(a,d),point(b,d),point(b,c));else g.quad(point(a,c),point(b,c),point(b,d),point(a,d));}if(end-start<Math.PI*2-1e-5)for(const a of [start,end]){const middle=point(a,0).map((x,k)=>(x+point(a,Math.PI)[k])/2);for(let j=0;j<tube;j++)if((axis==='y'&&a===start)||(axis!=='y'&&a===end))g.triangle(middle,point(a,(j+1)/tube*Math.PI*2),point(a,j/tube*Math.PI*2));else g.triangle(middle,point(a,j/tube*Math.PI*2),point(a,(j+1)/tube*Math.PI*2));}};
 g.rod=(a,b,radius=.02,segments=12)=>{const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u),ring=(p,t)=>p.map((x,k)=>x+radius*(u[k]*Math.cos(t)+v[k]*Math.sin(t)));for(let i=0;i<segments;i++){const t=i/segments*Math.PI*2,s=(i+1)/segments*Math.PI*2;g.quad(ring(a,t),ring(a,s),ring(b,s),ring(b,t));g.triangle(a,ring(a,s),ring(a,t));g.triangle(b,ring(b,t),ring(b,s));}};
 g.append=(other,scale=1,offset=[0,0,0])=>{const off=g.positions.length/3;for(let i=0;i<other.positions.length;i++)g.positions.push(other.positions[i]*scale+offset[i%3]);g.normals.push(...other.normals);g.indices.push(...other.indices.map(i=>i+off));};
 return g;
}
// Mineral eye with an inset, worn iris; side-specific gouge and vein survive all scales.
export function createCanonicalEyeGeometry({center=[0,0,0],radius=.038,side='L',detail=24}={}){
 const stone=reliquaryGeometry(),iris=reliquaryGeometry(),pupil=reliquaryGeometry(),vein=reliquaryGeometry();
 // The globe is physically truncated at the iris aperture. Its closed flat
 // backing sits behind a convex mineral insert, keeping pupil geometry visible.
 const profile=[],rings=Math.round(detail*.65),end=Math.acos(.90);
 for(let i=0;i<=rings;i++){const a=Math.PI+(end-Math.PI)*i/rings;profile.push([Math.sin(a)*radius,Math.cos(a)*radius])}profile.push([0,radius*.90]);
 stone.lathe(profile,center,detail,'z');
 for(let i=0;i<stone.positions.length;i+=3){stone.positions[i+1]=center[1]+(stone.positions[i+1]-center[1])*.96;const d=stone.positions.slice(i,i+3).map((x,k)=>x-center[k]);const n=d[2]>.899*radius?[0,0,1]:unit([d[0],d[1]/(.96*.96),d[2]]);stone.normals.splice(i,3,...n)}
 // A shallow worn inlay, not a stack of concentric projecting lenses.
 iris.lathe([[0,radius*.900],[radius*.40,radius*.900],[radius*.40,radius*.906],[radius*.31,radius*.912],[0,radius*.914]],center,detail,'z');
 pupil.lathe([[0,radius*.914],[radius*.14,radius*.914],[radius*.14,radius*.919],[0,radius*.921]],center,detail,'z');
 const sign=side==='L'?-1:1;
 // Three worn, irregular iris cuts read as hand-carved marks at close range.
 // A regular radial sunburst made the recovered eyes resemble doll mechanisms.
 for(const [a,length] of [[.32,.34],[2.51,.30],[4.16,.37]]){
  const r0=radius*.31,r1=radius*length,z0=radius*.913,z1=radius*.906;
  vein.rod([center[0]+Math.cos(a)*r0,center[1]+Math.sin(a)*r0,center[2]+z0],[center[0]+Math.cos(a+.06)*r1,center[1]+Math.sin(a+.06)*r1,center[2]+z1],radius*.006,5);
 }
 const path=side==='L'?[[.58,.35,.72],[.48,.49,.72],[.42,.61,.65]]:[[-.54,-.46,.70],[-.38,-.59,.69],[-.29,-.70,.63]];
 for(let i=0;i<path.length-1;i++)vein.rod(path[i].map((x,k)=>center[k]+x*radius),path[i+1].map((x,k)=>center[k]+x*radius),radius*.018,6);
 // Chipped edge: a small dark mineral inclusion, deliberately different on each eye.
 const c=[center[0]+sign*radius*.63,center[1]+(side==='L'?.46:-.48)*radius,center[2]+radius*.64];vein.ellipsoid(c,[radius*.10,radius*.045,radius*.035],8,6);
 return {stone,iris,pupil,vein};
}
export function createReliquaryPortraitGeometry({part='head',scale=1,offset=[0,0,0]}={}){
 const data=JSON.parse(fs.readFileSync(new URL('../../artifacts/bust-reliquary-production/portrait.json',import.meta.url),'utf8'));
 const source=data[part];if(!source)throw Error(`Unknown reliquary portrait part ${part}`);const out=reliquaryGeometry();out.append(source,scale,offset);return out;
}
