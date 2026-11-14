// What the space needs that nothing else in the game has: ground laid out along its
// own straight lines. Everything that stands on it is the game's own: Source's
// masonry, St Brendan's, the field's daisy and ant, the apparition bodies.
import {HORIZON_APPROACH as C} from '../data/horizon-approach.js';
import {horizonTowerRoad} from '../game/horizon-approach-scene.js';
import {sourceContinuationEscherGeometryLibrary} from './source-continuation-escher.js';
import {m62HeightAt} from '../data/m62-land.js';

const TAU=Math.PI*2;
const target=()=>({p:[],i:[]});
const push=(g,...pts)=>{const o=g.p.length/3;for(const p of pts)g.p.push(...p);return o;};
const tri=(g,a,b,c)=>{const o=push(g,a,b,c);g.i.push(o,o+1,o+2);};
const quad=(g,a,b,c,d)=>{tri(g,a,b,c);tri(g,a,c,d);};
const atMap=(r,phi,y=0)=>[r*Math.sin(phi),y,r*Math.cos(phi)];

// ── THE CLOSED SPACE ────────────────────────────────────────────────────────
// Every road leaves the place he starts and arrives at the object, the way every
// meridian leaves one pole for the other. They are the same width all the way, so
// on the map they fan out and close again.
//
// The tower's road is laid on its own, so that once the tower is offered it can be
// drawn in negative: the one pale road among the dark ones, edged in dark. Until
// then it is the same as the rest.
const DARK=Object.freeze({base:[.03,.032,.045,1]}),PALE=Object.freeze({base:[.82,.86,.94,1],emissive:[.62,.66,.74]});
export const HORIZON_TOWER_ROAD=Object.freeze({
  closed:Object.freeze({plain:Object.freeze(['ha_closed_tower_road','ha_closed_tower_line']),negative:Object.freeze(['ha_closed_tower_negative','ha_closed_tower_negative_line'])}),
});
function closedGround(){
  const V=C.variants.closed,R=V.radius,end=Math.PI*R,w=V.roadHalfWidth,road=target(),line=target(),hub=target(),N=72;
  const tower=horizonTowerRoad('closed'),towerRoad=target(),towerLine=target();
  const half=(r,width)=>width/(R*Math.max(.02,Math.sin(r/R)));
  for(let k=0;k<V.roads;k++){
    const phi=k/V.roads*TAU,surface=k===tower?towerRoad:road,edge=k===tower?towerLine:line;
    for(let j=0;j<N;j++){
      const a=V.hub+(end-2*V.hub)*j/N,b=V.hub+(end-2*V.hub)*(j+1)/N,da=half(a,w),db=half(b,w),ea=half(a,.09),eb=half(b,.09);
      quad(surface,atMap(a,phi-da),atMap(a,phi+da),atMap(b,phi+db),atMap(b,phi-db));
      for(const s of[-1,1])quad(edge,atMap(a,phi+s*da,.012),atMap(a,phi+s*(da-ea),.012),atMap(b,phi+s*(db-eb),.012),atMap(b,phi+s*db,.012));
    }
  }
  // The two places they all meet.
  const rings=6,S=48,top=[0,end];
  for(const pole of top){
    const r=t=>pole===0?V.hub*t:end-V.hub*t;
    for(let q=0;q<rings;q++)for(let s=0;s<S;s++){
      const a=s/S*TAU,b=(s+1)/S*TAU,r0=r(q/rings),r1=r((q+1)/rings);
      if(pole===0&&q===0)tri(hub,atMap(0,0),atMap(r1,a),atMap(r1,b));
      else quad(hub,atMap(r0,a),atMap(r1,a),atMap(r1,b),atMap(r0,b));
    }
  }
  const[plainRoad,plainLine]=HORIZON_TOWER_ROAD.closed.plain,[negativeRoad,negativeLine]=HORIZON_TOWER_ROAD.closed.negative;
  return[
    {name:'ha_closed_road',...road,...DARK,roughness:1},
    {name:'ha_closed_hub',...hub,base:[.1,.075,.05,1],emissive:[.1,.075,.045],roughness:1},
    {name:'ha_closed_line',...line,...PALE,roughness:1},
    {name:plainRoad,...towerRoad,...DARK,roughness:1},
    {name:plainLine,...towerLine,...PALE,roughness:1},
    {name:negativeRoad,...towerRoad,...PALE,roughness:1},
    {name:negativeLine,...towerLine,...DARK,roughness:1},
  ];
}

// ── THE CIRCLE LIMIT ────────────────────────────────────────────────────────
// Pentagons, four to a corner, which is too many for a flat floor: the ground has
// to be a space with more room in it than a plane. Worked on the hyperboloid and
// written out on the map, so the tiles stay the same size wherever he stands.
const hMul=(a,b)=>{const o=[0,0,0,0,0,0,0,0,0];for(let r=0;r<3;r++)for(let c=0;c<3;c++)for(let k=0;k<3;k++)o[r*3+c]+=a[r*3+k]*b[k*3+c];return o;};
const hApply=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const hRot=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,-s,0,s,c,0,0,0,1];};
const hBoost=d=>{const c=Math.cosh(d),s=Math.sinh(d);return[c,0,s,0,1,0,s,0,c];};
// The geodesic between two points of the hyperboloid, `t` of the way along.
const hLerp=(a,b,t)=>{const v=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],n=Math.sqrt(Math.max(1e-9,v[2]*v[2]-v[0]*v[0]-v[1]*v[1]));return[v[0]/n,v[1]/n,v[2]/n];};
const toMap=(v,R,y=0)=>{const l=Math.hypot(v[0],v[1]),r=R*Math.asinh(l);return l<1e-9?[0,y,0]:[v[0]/l*r,y,v[1]/l*r];};
const INRADIUS=Math.acosh(Math.cos(Math.PI/4)/Math.sin(Math.PI/5)),CIRCUMRADIUS=Math.acosh(1/(Math.tan(Math.PI/5)*Math.tan(Math.PI/4)));
export function circleLimitTiles(limit=C.variants['circle-limit'].tileRings){
  const seen=new Map(),queue=[{m:[1,0,0,0,1,0,0,0,1],colour:0}];
  const key=m=>`${Math.round(m[2]*40)}:${Math.round(m[5]*40)}`;
  seen.set(key(queue[0].m),queue[0]);
  while(queue.length){
    const t=queue.shift();
    for(let k=0;k<5;k++){
      const m=hMul(hMul(t.m,hRot(k/5*TAU)),hMul(hBoost(INRADIUS*2),hRot(Math.PI)));
      if(Math.acosh(Math.max(1,m[8]))>limit||seen.has(key(m)))continue;
      const next={m,colour:1-t.colour};seen.set(key(m),next);queue.push(next);
    }
  }
  return[...seen.values()];
}
function circleLimitGround(){
  const R=C.variants['circle-limit'].radius,light=target(),dark=target(),line=target(),tiles=circleLimitTiles();
  const corner=k=>{const a=(k+.5)/5*TAU,s=Math.sinh(CIRCUMRADIUS),c=Math.cosh(CIRCUMRADIUS);return[s*Math.cos(a),s*Math.sin(a),c];},centre=[0,0,1];
  for(const tile of tiles){
    const g=tile.colour?light:dark,P=v=>hApply(tile.m,v),d=Math.acosh(Math.max(1,tile.m[8])),n=d<2.6?4:d<4.4?2:1;
    for(let k=0;k<5;k++){
      const A=corner(k),B=corner(k+1);
      for(let j=0;j<n;j++){
        const a=hLerp(A,B,j/n),b=hLerp(A,B,(j+1)/n);
        // Three rings in from the edge, so the tile bends with the space.
        const ring=(v,t)=>toMap(P(hLerp(centre,v,t)),R);
        tri(g,ring(a,.34),ring(b,.34),toMap(P(centre),R));
        quad(g,ring(a,.68),ring(b,.68),ring(b,.34),ring(a,.34));
        quad(g,ring(a,1),ring(b,1),ring(b,.68),ring(a,.68));
        const lift=(v,t)=>toMap(P(hLerp(centre,v,t)),R,.012);
        quad(line,lift(a,1),lift(b,1),lift(b,.96),lift(a,.96));
      }
    }
  }
  return[
    {name:'ha_tile_dark',...dark,base:[.03,.032,.045,1],roughness:1},
    {name:'ha_tile_light',...light,base:[.62,.47,.3,1],emissive:[.1,.075,.045],roughness:1},
    {name:'ha_tile_line',...line,base:[.82,.86,.94,1],emissive:[.62,.66,.74],roughness:1},
  ];
}

// ── THE ROAD THROUGH THE HOUSE OF STAIRS ─────────────────────────────────────
// Straight on, and one way off to the side that is only there once it is offered,
// and is laid in negative, pale edged in dark, as the closed space's tower road is.
// What hangs round it is the same construction Source II falls through.
function relativityGround(){
  const V=C.variants.relativity,w=V.roadHalfWidth,E=V.roadEnd,road=target(),line=target(),side=target(),sideLine=target(),N=24;
  for(let k=0;k<N;k++){
    const a=-E+2*E*k/N,b=-E+2*E*(k+1)/N;
    quad(road,[-w,0,a],[w,0,a],[w,0,b],[-w,0,b]);
    for(const s of[-1,1])quad(line,[s*w,.012,a],[s*(w-.1),.012,a],[s*(w-.1),.012,b],[s*w,.012,b]);
    if(k>=N/2){quad(side,[a,0,-w],[a,0,w],[b,0,w],[b,0,-w]);for(const s of[-1,1])quad(sideLine,[a,.012,s*w],[a,.012,s*(w-.1)],[b,.012,s*(w-.1)],[b,.012,s*w]);}
  }
  const hub=target(),S=32;
  for(let s=0;s<S;s++){const a=s/S*TAU,b=(s+1)/S*TAU;tri(hub,atMap(0,0,.006),atMap(V.hub,a,.006),atMap(V.hub,b,.006));}
  const lib=sourceContinuationEscherGeometryLibrary(),rows=[];
  for(const[key,g]of Object.entries(lib)){
    if(!key.startsWith('escher-ii-')||key.startsWith('escher-ii-chart-'))continue;
    rows.push({name:'ha_stairs_'+key.slice('escher-ii-'.length),p:g.p,i:g.i,base:[.62,.47,.3,1],emissive:[.1,.075,.045],roughness:1});
  }
  return[
    {name:'ha_road',...road,base:[.03,.032,.045,1],roughness:1},
    {name:'ha_road_line',...line,base:[.82,.86,.94,1],emissive:[.62,.66,.74],roughness:1},
    {name:'ha_side',...side,...PALE,roughness:1},
    {name:'ha_side_line',...sideLine,...DARK,roughness:1},
    {name:'ha_hub',...hub,base:[.3,.23,.15,1],emissive:[.1,.075,.045],roughness:1},
    ...rows,
  ];
}
export const horizonStairsMeshes=()=>horizonApproachGeometry().filter(row=>row.name.startsWith('ha_stairs_')).map(row=>row.name);

// ── PIECES OF THE MOOR, IN THE CLOSED SPACE'S SKY ───────────────────────────
// A piece of the moor, torn out: the top is the drive's own land at this spot, cut
// to a ragged edge, with the peat it came away with hanging under it.
const MOOR=Object.freeze([[1500,-800],[-2600,700],[2400,1800]]);
function moorPieces(){
  const rows=[],R=9,span=380,rings=12,S=36,f=2*R/span;
  MOOR.forEach(([x0,z0],k)=>{
    const top=target(),under=target(),h0=m62HeightAt(x0,z0);
    const rim=t=>R*(.74+.14*Math.sin(t*3+k*2.1)+.08*Math.sin(t*7+k)+.04*Math.sin(t*13+k*3));
    const surface=(t,q)=>{const r=rim(t)*q,x=Math.cos(t)*r,z=Math.sin(t)*r;return[x,(m62HeightAt(x0+x/f,z0+z/f)-h0)*f*1.6,z];};
    const below=(t,q)=>{const p=surface(t,1),d=(1-q*q)*(2.6+.9*Math.sin(t*5+k));return[p[0]*q,p[1]*q-d-.1,p[2]*q];};
    for(let i=0;i<rings;i++)for(let s=0;s<S;s++){
      const a=s/S*TAU,b=(s+1)/S*TAU,q0=i/rings,q1=(i+1)/rings;
      if(i===0)tri(top,surface(a,0),surface(a,q1),surface(b,q1));
      else quad(top,surface(a,q0),surface(a,q1),surface(b,q1),surface(b,q0));
    }
    for(let i=0;i<6;i++)for(let s=0;s<S;s++){
      const a=s/S*TAU,b=(s+1)/S*TAU,q0=1-i/6,q1=1-(i+1)/6;
      quad(under,below(a,q0),below(a,q1),below(b,q1),below(b,q0));
    }
    rows.push({name:`ha_moor_${k}`,...top,base:[.15,.14,.07,1],emissive:[.028,.032,.012],roughness:1},
      {name:`ha_moor_under_${k}`,...under,base:[.1,.08,.055,1],emissive:[.035,.027,.018],roughness:1});
  });
  return rows;
}

// One of the field's daisy petals on its own, the same shape as the ones
// `mf_hero_petal` is made of, so that a petal can be taken away by not drawing it.
// In the head's plane, pointing up from its disc.
function daisyPetal(){
  const g=target(),r=C.daisy.petalRadius,w=TAU/14*.46,at=(t,d,lift=0)=>[Math.sin(t)*d,Math.cos(t)*d,lift];
  const len=r,droop=-r*.05;
  quad(g,at(-w*.55,r*.26),at(w*.55,r*.26),at(w*.62,len*.82,droop),at(-w*.62,len*.82,droop));
  tri(g,at(-w*.62,len*.82,droop),at(w*.62,len*.82,droop),at(0,len,droop*1.2));
  return{name:'ha_daisy_petal',...g,base:[.98,.98,.94,1],emissive:[.5,.5,.46],roughness:1};
}

let library=null;
export function horizonApproachGeometry(){
  if(library)return library;
  library=Object.freeze([...closedGround(),...circleLimitGround(),...relativityGround(),...moorPieces(),daisyPetal()]);
  return library;
}
export const HORIZON_APPROACH_MESHES=Object.freeze(horizonApproachGeometry().map(row=>row.name));
