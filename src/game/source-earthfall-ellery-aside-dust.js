// The demolition's dust, as real billows (assets/source-earthfall-dust.glb):
// thin jets out of each charged pier, a low surge out of every wall base that
// rolls across the floor, and a column boiling up out of the core. The walls
// are the picture until they are down, so the dust stays low and small, then
// thickens all at once in the last second. Dust may grow, stretch and thin;
// construction never does. Pure functions of the aside's time, so a reload
// puts every billow back where it was.
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C,SOURCE_ELLERY_ASIDE_CHARGES as CHARGES,asideSmooth} from '../data/source-earthfall-ellery-aside.js';

export const SOURCE_ELLERY_ASIDE_DUST=Object.freeze({
 variants:3,mesh:i=>'earthfall_dust_billow_'+i,puffMesh:'earthfall_dust_puff',
 // A jet reaches this far out of its pier, fast, then disperses.
 jet:Object.freeze({reach:1.7,reachSeconds:.12,puffs:3,thinAt:.5,goneAt:1.6}),
 // The surge leaves a wall base as its base crushes, a little before the
 // lean shows, and decelerates across the floor like a gravity current.
 surge:Object.freeze({lead:.3,reach:7.2,seconds:6,spacing:2}),
 core:Object.freeze({after:1,billows:5}),
 // The final thickening, in metres added to every billow.
 thicken:Object.freeze({from:C.fadeStart-1.1,to:C.fadeStart+.4,surge:.7,core:1}),
 // Whiteout goes in before the halftone, so dust the eye is inside prints in
 // the game's own dots. It is full before the eye reaches a billow, so the
 // inside of one is a faint pale tone. Billows are never dropped: a dropped
 // one wobbles back across the line and blinks.
 haze:Object.freeze({room:.1,eye:.62,reach:2.3,ramp:1}),
});
const D=SOURCE_ELLERY_ASIDE_DUST;
const hash=(i,s=0)=>{let n=Math.imul(i+71,0x45d9f3b)^Math.imul(s+13,0x27d4eb2d);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
const ease=v=>1-Math.exp(-Math.max(0,v));
function placed(x,y,z,yaw,sx,sy,sz){const c=Math.cos(yaw),s=Math.sin(yaw);return[c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1];}

// Where each wall's surge leaves from, and which way is into the room.
const WALLS=[
 {host:'north',from:x=>[x,0,C.room.minZ],inward:[0,0,1],along:[C.room.minX,C.room.maxX]},
 {host:'east',from:z=>[C.room.maxX,0,z],inward:[-1,0,0],along:[C.room.minZ,C.room.maxZ]},
 {host:'south',from:x=>[x,0,C.room.maxZ],inward:[0,0,-1],along:[C.room.minX,C.room.maxX]},
 {host:'west',from:z=>[C.room.minX,0,z],inward:[1,0,0],along:[C.room.minZ,C.room.maxZ]},
];

/**
 * Every billow at `elapsed`: { puffs:[{id,mesh,matrix,center,radius,kind}],
 * cover, haze }. cover (0..1) is how far `eye` is into the dust, and haze is
 * the Source whiteout that carries it.
 */
export function sourceElleryAsideDust(elapsed,eye=null){
 const t=Number(elapsed)||0,puffs=[];let index=0;
 const thicken=asideSmooth(D.thicken.from,D.thicken.to,t);
 const add=(id,kind,center,radius,yaw=0,stretch=[1,1,1],mesh=D.mesh(index++%D.variants))=>{
  puffs.push({id,kind,mesh,center,radius,yaw,stretch,matrix:placed(center[0],center[1],center[2],yaw,radius*stretch[0],radius*stretch[1],radius*stretch[2])});
 };
 for(const c of CHARGES){
  const age=t-c.at;if(age<0||age>=D.jet.goneAt)continue;
  const p=c.position,n=c.normal,reach=D.jet.reach*ease(age/D.jet.reachSeconds),yaw=Math.atan2(n[2],n[0]),thin=1-asideSmooth(D.jet.thinAt,D.jet.goneAt,age);
  for(let k=0;k<D.jet.puffs;k++){
   const s=reach*(k+1)/D.jet.puffs,r=(.1+.32*ease(age/.18))*(1+.4*k)*thin,fall=c.core?.35*age:-.04*age;
   add(`jet:${c.id}:${k}`,'jet',[p.x+n[0]*s,Math.max(r*.4,p.y-fall),p.z+n[2]*s],r,yaw,[1.2+1*Math.max(0,1-age/.4),1,1],D.puffMesh);
  }
 }
 for(const wall of WALLS){
  const t0=C.wallsAt[wall.host]-D.surge.lead,age=t-t0;if(age<0)continue;
  const[a,b]=wall.along,count=Math.round((b-a)/D.surge.spacing);
  for(let j=0;j<count;j++){
   const u=a+D.surge.spacing*(j+.5),seed=hash(j,wall.host.length*7),front=D.surge.reach*ease(age/D.surge.seconds)*(.86+.28*seed),base=wall.from(u);
   const wobble=Math.sin(t*1.7+j*2.1)*.12,yaw=t*.25*(seed-.5)+j;
   const roll=.25+.85*ease(age/1.5)+D.thicken.surge*thicken,rise=age**.8;
   add(`surge:${wall.host}:${j}:roll`,'surge',[base[0]+wall.inward[0]*front+wobble*wall.inward[2],roll*.5,base[2]+wall.inward[2]*front+wobble*wall.inward[0]],roll,yaw,[1.25,1,1.25]);
   // A bank, not a row of clouds: each layer sits in the one below it,
   // scattered along the wall, and the seed gives the top its uneven skyline.
   const lower=wall.from(u+(hash(j,31)-.5)*1.7),upper=wall.from(u+(hash(j,37)-.5)*2.4);
   add(`surge:${wall.host}:${j}:heap`,'surge',[lower[0]+wall.inward[0]*front*.75,roll*(.9+.3*seed)+.3*rise,lower[2]+wall.inward[2]*front*.75],roll*(.85+.3*hash(j,41)),yaw+1.3);
   add(`surge:${wall.host}:${j}:crown`,'surge',[upper[0]+wall.inward[0]*front*.55,roll*(1.3+.6*seed)+.5*rise,upper[2]+wall.inward[2]*front*.55],roll*(.55+.35*hash(j,43)),yaw+2.1);
  }
 }
 {
  const age=t-C.coreAt-D.core.after;
  if(age>=0)for(let k=0;k<D.core.billows;k++){
   const a=k/D.core.billows*Math.PI*2+.4,spread=1.2+1.4*hash(k,5);
   // Inside the hole the core left (the central bays, 8 m by 4 m).
   add(`core:${k}`,'core',[C.center.x+Math.cos(a)*spread*1.5,-1.6+1.6*ease(age/1.2)+.35*age,C.center.z+Math.sin(a)*Math.min(1.2,spread*.5)],.3+.75*ease(age/1.2)+D.thicken.core*thicken,t*.2+k);
  }
 }
 let cover=0;
 if(eye)for(const p of puffs){
  // Distance in the billow's own stretched frame: 1 is its surface.
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw),x=eye[0]-p.center[0],y=eye[1]-p.center[1],z=eye[2]-p.center[2];
  const d=Math.hypot((c*x-s*z)/p.stretch[0],y/p.stretch[1],(s*x+c*z)/p.stretch[2])/p.radius;
  cover=Math.max(cover,Math.min(1,Math.max(0,(D.haze.reach-d)/D.haze.ramp)));
 }
 const haze=D.haze.room*asideSmooth(C.wallsAt.north,C.fadeStart,t)+D.haze.eye*cover;
 return{puffs,cover,haze};
}
