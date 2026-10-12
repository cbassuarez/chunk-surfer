// Source-local metres. The bank is a finite stack of broken source courses;
// rendering and collision consume the same closed convex prisms.
const EPS = 1e-8;
const frozenPolygon = p => Object.freeze(p.map(v => Object.freeze(v)));
const bank = Object.freeze({ minX:-42, maxX:42, frontZ:-390, backZ:-406, underside:3.55, floor:4.2, top:18.35 });
const opening = frozenPolygon([[6,-390],[14,-390],[22,-396],[2,-396]]);
// The release is broad; the physical tongue is subtracted by the same collision
// test used for walking, rather than imposing an arbitrary horizontal quota.
const release = frozenPolygon([[6,-390],[14,-390],[22,-396],[25,-399.2],[.3,-399.2],[2,-396]]);
const entry = Object.freeze({minX:6,maxX:14,frontZ:-390,turnZ:-396,releaseZ:-390,properX:4});

export const SOURCE_EXPOSED_STRATA = Object.freeze({
  version:1, bank, opening, release, entry,
  frontZ:-390, floor:4.2, releaseZ:-390, crestBackZ:-398.4,
  // Lift and receiving ledge remain authored by Hanging Shore, unchanged.
  entryWalk:Object.freeze([
    Object.freeze({ id:'strata-ledge', x:4, z:-388, floor:4.2 }),
    Object.freeze({ id:'strata-mouth-line', x:10, z:-388, floor:4.2 }),
    Object.freeze({ id:'strata-mouth', x:10, z:-392, floor:4.2 }),
    Object.freeze({ id:'strata-release', x:4, z:-396, floor:4.2 }),
    Object.freeze({ id:'strata-proper', x:4, z:-399, floor:4.2 }),
  ]),
});

const leftAt = d => 6 - 2*d/3;
const rightAt = d => 14 + 4*d/3;
function chamfer(poly, amount) {
  return poly.flatMap((p,i) => {
    const before=poly[(i+poly.length-1)%poly.length], after=poly[(i+1)%poly.length];
    const toward=q=>{const t=Math.min(.18,amount/Math.hypot(q[0]-p[0],q[1]-p[1]));return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];};
    return [toward(before),toward(after)];
  });
}
const xz = (x,d) => [x,-390-d];
const rect = (x0,x1,d0,d1,cut=.4) => chamfer([xz(x0,d0),xz(x1,d0),xz(x1,d1),xz(x0,d1)],cut);
const palette = [[.29,.31,.33],[.37,.39,.41],[.23,.26,.28],[.32,.34,.36],[.43,.44,.44],[.27,.30,.32],[.36,.37,.38]];
function solid(id,polygon,bottom,top,color,kind='course',grain=1) {
  return Object.freeze({ id,kind,polygon:frozenPolygon(polygon),bottom,top,color:Object.freeze(color),grain,
    minX:Math.min(...polygon.map(p=>p[0])),maxX:Math.max(...polygon.map(p=>p[0])),
    minZ:Math.min(...polygon.map(p=>p[1])),maxZ:Math.max(...polygon.map(p=>p[1])) });
}
const solids = [solid('strata-underbelly',[[-42,-390],[42,-390],[42,-406],[-42,-406]],3.55,4.2,[.20,.23,.25],'underbelly',1.8)];
for (const side of ['west','east']) {
  const heights=side==='west'?[4.2,4.82,6.34,6.78,9.02,9.58,11.54,12.14]:[4.2,4.82,6.34,6.78,9.02,9.58,10.64,11.14];
  const depths=side==='west'?[8.4,8,7.5,7.05,6.45,5.85,5.1]:[8.4,7.85,7.3,6.7,6,5.1,4.5];
  for(let n=0;n<heights.length-1;n++) {
    const front=.06+n*.035, back=depths[n], outer=n*.2, inner=n*.10;
    const poly=side==='west'
      ? [xz(-42+outer,front),xz(leftAt(front)-inner,front),xz(leftAt(back)-inner,back),xz(-41.75+outer,back)]
      : [xz(rightAt(front)+inner,front),xz(42-outer,front),xz(41.75-outer,back),xz(rightAt(back)+inner,back)];
    solids.push(solid(`strata-${side}-course-${n}`,chamfer(poly,.48+n*.035),heights[n],heights[n+1],palette[(n+(side==='east'?2:0))%palette.length],'course',1.1+n*.16));
  }
}
// The unequal fragments sit on continuous lower courses; no roof bridges the cleft.
solids.push(
  solid('strata-west-broken-crest',rect(-40.4,-13.6,.55,3.6,.55),12.14,14.48,[.31,.34,.36],'crest',2.6),
  solid('strata-west-high-cut',rect(-37.4,-17.9,.78,2.9,.38),14.48,16.12,[.25,.28,.30],'crest',2.2),
  solid('strata-west-crown',rect(-31.2,-21.5,1.04,2.25,.28),16.12,18.35,[.38,.40,.41],'crest',3),
  solid('strata-west-cleft-crest',chamfer([xz(-12.4,.4),xz(4.8,.4),xz(2.45,3.1),xz(-11.9,3.1)],.32),12.14,15.44,[.28,.31,.33],'crest',2.5),
  solid('strata-west-cleft-chip',chamfer([xz(-8.8,.76),xz(3.1,.76),xz(1.4,2.7),xz(-8.4,2.7)],.22),15.44,16.15,[.40,.41,.42],'crest',2.8),
  solid('strata-east-broken-crest',rect(27,40,.65,2.7,.4),11.14,12.6,[.34,.37,.39],'crest',2.1),
  solid('strata-east-high-cut',rect(30.4,38.4,.88,1.9,.24),12.6,13.85,[.24,.27,.29],'crest',2.7),
  solid('strata-east-cleft-chip',chamfer([xz(16.1,.42),xz(25.8,.42),xz(25.3,3.3),xz(20.4,3.3)],.3),11.14,12.2,[.39,.41,.42],'crest',2.3),
);
// One oblique geological tongue masks the direct field sightline for three paces.
// The leftward turn remains at least five metres wide and entirely open to sky.
const tongue=[[9.15,-393.05],[17.6,-392.6],[21.6,-395.4],[16.2,-395.2]];
const tongueCentre=tongue.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]);
const tongueHeights=[4.2,6.34,6.78,9.02,9.58], tongueScales=[1,.98,.96,.91];
for(let n=0;n<4;n++) {
  const poly=tongue.map(p=>p.map((v,axis)=>tongueCentre[axis]+(v-tongueCentre[axis])*tongueScales[n]));
  solids.push(solid(`strata-cut-tongue-${n}`,poly,tongueHeights[n],tongueHeights[n+1],palette[(n+1)%palette.length],'tongue',1.5+n*.3));
}
Object.freeze(solids);

function area(poly) { return poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2; }
function inside(poly,x,z) {
  let sign=0;
  for(let n=0;n<poly.length;n++) {
    const a=poly[n],b=poly[(n+1)%poly.length],cross=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);
    if(Math.abs(cross)<EPS)continue;
    if(sign && Math.sign(cross)!==sign)return false;
    sign=Math.sign(cross);
  }
  return true;
}
function circleHits(poly,x,z,radius) {
  if(inside(poly,x,z))return true;
  for(let n=0;n<poly.length;n++) {
    const a=poly[n],b=poly[(n+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    if((x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2<=radius*radius+EPS)return true;
  }
  return false;
}
function pieceFor(s,ox=0,oz=0) {
  const n=s.polygon.length,p=[],i=[];
  for(const y of [s.bottom,s.top])for(const point of s.polygon)p.push(point[0]+ox,y,point[1]+oz);
  for(let a=1;a<n-1;a++)i.push(0,a,a+1,n,n+a+1,n+a);
  for(let a=0;a<n;a++){const b=(a+1)%n;i.push(a,n+a,n+b,a,n+b,b);}
  if(area(s.polygon)<0)for(let a=0;a<i.length;a+=3)[i[a+1],i[a+2]]=[i[a+2],i[a+1]];
  return Object.freeze({id:s.id,kind:s.kind,p:Object.freeze(p),i:Object.freeze(i),color:s.color,grain:s.grain,
    minX:s.minX+ox,maxX:s.maxX+ox,minZ:s.minZ+oz,maxZ:s.maxZ+oz,minY:s.bottom,maxY:s.top});
}
const geometryCache=new Map();
export function sourceStrataGeometry(translationMetres={x:0,z:0}) {
  const ox=Number(translationMetres.x||0),oz=Number(translationMetres.z||0),key=`${ox},${oz}`;
  if(!geometryCache.has(key))geometryCache.set(key,Object.freeze(solids.map(s=>pieceFor(s,ox,oz))));
  return geometryCache.get(key);
}
export function sourceStrataSolids() { return solids; }
export function sourceStrataCollisionAt(x,z,{feet=4.2,height=1.8,radius=.22}={}) {
  if(![x,z,feet,height,radius].every(Number.isFinite))return {id:'strata-invalid-body',kind:'invalid'};
  for(const s of solids) {
    if(s.top<=feet+.035 || s.bottom>=feet+height-.025)continue;
    if(x<s.minX-radius||x>s.maxX+radius||z<s.minZ-radius||z>s.maxZ+radius)continue;
    if(circleHits(s.polygon,x,z,radius))return {id:s.id,kind:s.kind,bottom:s.bottom,top:s.top};
  }
  return null;
}
export function sourceStrataEntryAt(x,z) {
  return inside(release,x,z) && !sourceStrataCollisionAt(x,z) && sourceStrataNorthClearAt(x,z);
}
// Facing-independent handoff follows the actual first open field sightline.
// Intersect a vertical footprint section instead of triangle-testing every frame.
export function sourceStrataNorthClearAt(x,z,eye=5.85) {
  for(const s of solids) {
    if(s.bottom>=eye-EPS||s.top<=eye+EPS||x<s.minX-EPS||x>s.maxX+EPS||s.minZ>=z-EPS)continue;
    for(let n=0;n<s.polygon.length;n++) {
      const a=s.polygon[n],b=s.polygon[(n+1)%s.polygon.length];
      if(x<Math.min(a[0],b[0])-EPS||x>Math.max(a[0],b[0])+EPS)continue;
      const dx=b[0]-a[0];
      if(Math.abs(dx)<EPS) {
        if(Math.min(a[1],b[1])<z-EPS)return false;
      } else {
        const at=a[1]+(b[1]-a[1])*(x-a[0])/dx;
        if(at<z-EPS)return false;
      }
    }
  }
  return true;
}
export function sourceStrataBounds(originCells={x:0,y:0}) {
  const ox=Number(originCells.x||0)*.5,oz=Number(originCells.y||0)*.5;
  const polygon=p=>p.map(([x,z])=>[x+ox,z+oz]);
  return {
    originMetres:{x:ox,z:oz},
    bank:{...bank,minX:bank.minX+ox,maxX:bank.maxX+ox,frontZ:bank.frontZ+oz,backZ:bank.backZ+oz},
    opening:polygon(opening),release:polygon(release),
    entry:{...entry,minX:entry.minX+ox,maxX:entry.maxX+ox,frontZ:entry.frontZ+oz,turnZ:entry.turnZ+oz,releaseZ:entry.releaseZ+oz,properX:entry.properX+ox},
    solids:solids.map(s=>({...s,polygon:polygon(s.polygon),minX:s.minX+ox,maxX:s.maxX+ox,minZ:s.minZ+oz,maxZ:s.maxZ+oz})),
    pieces:sourceStrataGeometry({x:ox,z:oz}),
  };
}

// Ray tests use the authored triangles, including chamfers, rather than box hulls.
export function sourceStrataRaycast(origin,direction,maxDistance=Infinity) {
  const length=Math.hypot(...direction);if(!length)return null;
  const d=direction.map(v=>v/length);let result=null;
  const sub=(a,b)=>a.map((v,n)=>v-b[n]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
  for(const piece of sourceStrataGeometry())for(let n=0;n<piece.i.length;n+=3) {
    const [a,b,c]=piece.i.slice(n,n+3).map(index=>piece.p.slice(index*3,index*3+3));
    const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);
    if(Math.abs(det)<EPS)continue;
    const inv=1/det,s=sub(origin,a),u=inv*dot(s,h);if(u<-EPS||u>1+EPS)continue;
    const q=cross(s,e1),v=inv*dot(d,q);if(v<-EPS||u+v>1+EPS)continue;
    const distance=inv*dot(e2,q);
    if(distance<1e-6||distance>maxDistance||result&&distance>=result.distance)continue;
    const normal=cross(e1,e2),normalLength=Math.hypot(...normal);
    result={id:piece.id,kind:piece.kind,distance,point:origin.map((v,i)=>v+d[i]*distance),normal:normal.map(v=>v/normalLength)};
  }
  return result;
}
