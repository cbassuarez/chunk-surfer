// What the space needs that nothing else in the game has: ground laid out along its
// own straight lines, and pieces torn from the moor the drive crosses. Everything
// else that is there is the game's own: Source's masonry, St Brendan's, the field's
// daisy and ant, the cab's flashlights, the apparition bodies.
import {HORIZON_APPROACH as C} from '../data/horizon-approach.js';
import {m62HeightAt} from '../data/m62-land.js';

const TAU=Math.PI*2;
const target=()=>({p:[],i:[]});
const push=(g,...pts)=>{const o=g.p.length/3;for(const p of pts)g.p.push(...p);return o;};
const tri=(g,a,b,c)=>{const o=push(g,a,b,c);g.i.push(o,o+1,o+2);};
const quad=(g,a,b,c,d)=>{tri(g,a,b,c);tri(g,a,c,d);};
const atMap=(r,phi,y=0)=>[r*Math.sin(phi),y,r*Math.cos(phi)];

// Every road leaves the place he starts and arrives at the object, the way every
// meridian leaves one pole for the other. They are the same width all the way, so
// on the map they fan out and close again.
function ground(){
  const V=C.space,R=V.radius,end=Math.PI*R,w=V.roadHalfWidth,road=target(),line=target(),hub=target(),N=72;
  const half=(r,width)=>width/(R*Math.max(.02,Math.sin(r/R)));
  for(let k=0;k<V.roads;k++){
    const phi=k/V.roads*TAU;
    for(let j=0;j<N;j++){
      const a=V.hub+(end-2*V.hub)*j/N,b=V.hub+(end-2*V.hub)*(j+1)/N,da=half(a,w),db=half(b,w),ea=half(a,.09),eb=half(b,.09);
      quad(road,atMap(a,phi-da),atMap(a,phi+da),atMap(b,phi+db),atMap(b,phi-db));
      for(const s of[-1,1])quad(line,atMap(a,phi+s*da,.012),atMap(a,phi+s*(da-ea),.012),atMap(b,phi+s*(db-eb),.012),atMap(b,phi+s*db,.012));
    }
  }
  // The two places they all meet.
  const rings=6,S=48;
  for(const pole of[0,end]){
    const r=t=>pole===0?V.hub*t:end-V.hub*t;
    for(let q=0;q<rings;q++)for(let s=0;s<S;s++){
      const a=s/S*TAU,b=(s+1)/S*TAU,r0=r(q/rings),r1=r((q+1)/rings);
      if(pole===0&&q===0)tri(hub,atMap(0,0),atMap(r1,a),atMap(r1,b));
      else quad(hub,atMap(r0,a),atMap(r1,a),atMap(r1,b),atMap(r0,b));
    }
  }
  return[
    {name:'ha_road',...road,base:[.03,.032,.045,1],roughness:1},
    {name:'ha_hub',...hub,base:[.1,.075,.05,1],emissive:[.1,.075,.045],roughness:1},
    {name:'ha_road_line',...line,base:[.82,.86,.94,1],emissive:[.62,.66,.74],roughness:1},
  ];
}
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
  library=Object.freeze([...ground(),...moorPieces(),daisyPetal()]);
  return library;
}
export const HORIZON_APPROACH_MESHES=Object.freeze(horizonApproachGeometry().map(row=>row.name));
