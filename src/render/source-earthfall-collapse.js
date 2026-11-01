// The false Ellery comes down with him (docs/plans/earthfall-quake.md). It
// leaves the ground with the footing and falls at his own rate, so it stays
// beside him, tipping toward the shaft, and comes apart in order: whole, then
// cracked along its Cell Fracture seams, then in chunks, then in fragments,
// and the fragments thin into printed folio pages that settle into the catch.
// Pure functions of the time since the footing went; render-only, no collision.
import {SOURCE_EARTHFALL as C} from '../data/source-earthfall.js';
import {SOURCE_EARTHFALL_FRACTURE as FRACTURE} from '../data/generated/source-earthfall-fracture.js';

const freeze=Object.freeze;
export const EARTHFALL_COLLAPSE=freeze({
  // Seconds after footing loss at which each stage begins.
  cracked:1,chunks:2.5,fragments:4,pages:5,
  // Pages take this long to reach the catch from where their fragment was.
  settle:2.6,
  tilt:freeze({max:.2,rate:.05}),
  crackGap:.6,chunkSpread:9,fragmentSpread:5,spin:.7,
  pagesPerFragment:2,
});
const S=EARTHFALL_COLLAPSE;
export const EARTHFALL_COLLAPSE_STAGES=freeze(['standing','whole','cracked','chunks','fragments','pages']);
export function earthfallCollapseStage(age){
  if(!(age>=0))return'standing';
  return age<S.cracked?'whole':age<S.chunks?'cracked':age<S.fragments?'chunks':age<S.pages?'fragments':'pages';
}

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const hash=(i,s=0)=>{let n=Math.imul(i+71,0x45d9f3b)^Math.imul(s+13,0x27d4eb2d);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const translation=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
const scaled=(s)=>new Float32Array([s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1]);
function axisAngle([x,y,z],angle){
  const l=Math.hypot(x,y,z)||1;x/=l;y/=l;z/=l;
  const c=Math.cos(angle),s=Math.sin(angle),t=1-c;
  return new Float32Array([t*x*x+c,t*x*y+s*z,t*x*z-s*y,0, t*x*y-s*z,t*y*y+c,t*y*z+s*x,0, t*x*z+s*y,t*y*z-s*x,t*z*z+c,0, 0,0,0,1]);
}
const apply=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);

// His own fall: gravity to terminal speed, so the building keeps pace.
export function earthfallFallDrop(age){
  if(!(age>0))return 0;
  const g=C.gravity,v=C.terminalSpeed,tT=v/g;
  return Math.min(C.upperFloor-C.lowerFloor+40,age<tT?.5*g*age*age:.5*g*tT*tT+(age-tT)*v);
}

const CHUNKS=FRACTURE.pieces.filter(p=>p.level===1);
const FRAGMENTS=FRACTURE.pieces.filter(p=>p.level===2);
const CENTRE=(()=>{const c=[0,0,0];for(const p of CHUNKS)for(let k=0;k<3;k++)c[k]+=p.pivot[k]/CHUNKS.length;return c;})();
const outward=(p,from)=>{const d=p.map((v,k)=>v-from[k]+(k===1?.6:0)),l=Math.hypot(...d)||1;return d.map(v=>v/l);};
const spinAxis=i=>[hash(i,3)-.5,hash(i,4)-.5,hash(i,5)-.5];

/**
 * The building's own fall as a world transform: drop with him and tip toward
 * the shaft (+x) about the base under its centre. Anything that belonged to
 * the standing building (its foundation too) goes down through this.
 */
export function earthfallFallWorld(age,architecture){
  const drop=earthfallFallDrop(age),tilt=-Math.min(S.tilt.max,S.tilt.rate*Math.max(0,age)**2);
  const base=apply(architecture,[CENTRE[0],0,CENTRE[2]]);
  const tip=multiply(translation(base[0],base[1],base[2]),multiply(axisAngle([0,0,1],tilt),translation(-base[0],-base[1],-base[2])));
  return multiply(translation(0,-drop,0),tip);
}
export const earthfallBuildingFall=(age,architecture)=>multiply(earthfallFallWorld(age,architecture),architecture);

// A chunk's matrix in the building's own space at an age.
function chunkLocal(piece,index,age){
  const gap=age<S.chunks?S.crackGap*smooth((age-S.cracked)/(S.chunks-S.cracked))
    :S.crackGap+S.chunkSpread*((age-S.chunks)/(S.fragments-S.chunks))**2;
  const d=outward(piece.pivot,CENTRE),p=piece.pivot.map((v,k)=>v+d[k]*gap);
  const turn=age<S.chunks?0:S.spin*(.4+hash(index,2))*(age-S.chunks);
  return multiply(translation(...p),axisAngle(spinAxis(index),turn));
}

/**
 * Props for the falling building at `age` seconds after footing loss, placed
 * in the world through `architecture` (its standing placement). Returns
 * { stage, building, pieces:[{id,mesh,matrix,scale,kind}], pages:[...] }.
 * Before the cracked stage the caller keeps drawing the intact building with
 * `building` as its matrix.
 */
export function earthfallCollapseFrame(age,architecture,{player=null}={}){
  const stage=earthfallCollapseStage(age);
  if(stage==='standing')return{stage,world:null,building:architecture,pieces:[],pages:[]};
  const world=earthfallFallWorld(age,architecture),building=multiply(world,architecture),pieces=[],pages=[];
  if(stage==='whole')return{stage,world,building,pieces,pages};
  const chunkAt=new Map();
  CHUNKS.forEach((piece,index)=>{
    const local=chunkLocal(piece,index,Math.min(age,S.fragments));chunkAt.set(piece.id,{local,index});
    if(age<S.fragments)pieces.push({id:piece.id,mesh:piece.mesh,matrix:multiply(building,local),kind:'chunk'});
  });
  if(age>=S.fragments){
    const fade=age<S.pages?1:1-smooth((age-S.pages)/.4);
    FRAGMENTS.forEach((piece,index)=>{
      const parent=chunkAt.get(piece.parent),chunk=CHUNKS[parent.index];
      const rel=piece.pivot.map((v,k)=>v-chunk.pivot[k]),d=outward(piece.pivot,chunk.pivot);
      const spread=S.fragmentSpread*((Math.min(age,S.pages+.4)-S.fragments)/(S.pages-S.fragments))**2;
      const turn=S.spin*1.6*(.4+hash(index,9))*(age-S.fragments);
      const local=multiply(parent.local,multiply(translation(rel[0]+d[0]*spread,rel[1]+d[1]*spread,rel[2]+d[2]*spread),axisAngle(spinAxis(index+500),turn)));
      const world=multiply(building,local);
      if(fade>.001)pieces.push({id:piece.id,mesh:piece.mesh,matrix:fade<1?multiply(world,scaled(fade)):world,kind:'fragment'});
      if(age>=S.pages)for(let k=0;k<S.pagesPerFragment;k++)pages.push(earthfallPage(index*S.pagesPerFragment+k,apply(world,[0,0,0]),age,player));
    });
  }
  return{stage,world,building,pieces,pages};
}

// One printed page: leaves its fragment, flutters, drifts into the shaft and
// lies down on the catch around where he landed.
function earthfallPage(i,from,age,player){
  const u=smooth((age-S.pages)/S.settle),grow=smooth((age-S.pages)/.4);
  const c=C.catch,centreX=player?clamp(player.x,c.minX+4,c.maxX-4):0,centreZ=player?clamp(player.z,c.minZ+6,c.maxZ-6):-20;
  const r=2+hash(i,21)*9,a=hash(i,22)*Math.PI*2;
  const to=[clamp(centreX+Math.cos(a)*r,c.minX+.6,c.maxX-.6),C.lowerFloor+.012+hash(i,23)*.03,clamp(centreZ+Math.sin(a)*r,c.minZ+.6,c.maxZ-.6)];
  const flutter=(1-u)*(1-u);
  const p=from.map((v,k)=>v+(to[k]-v)*u+(k===1?0:Math.sin(age*(2+hash(i,24)*2)+i)*1.4*flutter));
  const m=multiply(translation(...p),multiply(axisAngle([0,1,0],hash(i,25)*6.28+age*.6*flutter),
    multiply(axisAngle([1,0,0],Math.sin(age*3.1+i)*.9*flutter),axisAngle([0,0,1],Math.cos(age*2.3+i)*.7*flutter))));
  return{id:'page-'+i,matrix:multiply(m,scaled(Math.max(.001,grow))),settled:u>=1};
}
export const earthfallCollapseMeshes=()=>FRACTURE.pieces.map(p=>p.mesh);
