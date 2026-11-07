import {STANDING_TEAR_LAYOUT as TEAR} from '../data/standing-tear.js';
import {STANDING_TEAR_PRESSURE as PRESSURE} from '../data/standing-tear-pressure.js';
import {seamBeatHz} from './practice-seams.js';

// THE FIRST FAULT.
//
// Every fault in Source is one wound, and it opened on the practice floor: the
// standing tear in the arrival hall, on the wing where the sounded A and the
// engraved A beat against each other. Nothing says so. Source's cut matter is
// one ink, its bad-sector runs keep the student's bar, and two faults that stand
// upright like the tear open onto the room behind it, so the player can walk
// from either Source back to where the damage began. The tear itself stays
// plain: Ellery Proper wears no fault ink, so nothing there reads as a cause.
//
// That room holds what Source grew from. Its three retained pieces are already
// the scores of Source's own surroundings: the ensemble's Bach is Source II and
// its black hole, the Couperin is Source III and its black sun, and the
// student's own correction is the faults. Waking one opens its omen overhead.
export const SOURCE_RIFT=Object.freeze({
  barSeconds:TEAR.barSeconds,beatHz:seamBeatHz(),
  // Magenta, cyan, violet, lime: the only colours a recording keeps as they are.
  ink:Object.freeze([[1,.015,.72],[.015,.82,1],[.42,.015,1],[.74,1,.015]].map(Object.freeze)),
  width:TEAR.site.width,height:TEAR.site.height,touch:.6,
  // Far enough to re-arm the sheet, close enough to stay on the satellite deck
  // at the current walk (1.4); 2.4 put the clearing body over the edge and into
  // the fall. The fault itself is what a returning body must clear, not the deck.
  clearance:1.8,
  faults:Object.freeze([
    // The dead-end arm directly under Source II's hole, where its tide leads.
    Object.freeze({id:'source-ii-under-the-hole',phase:'wrong-return',chartId:0,level:0,x:-16.5,z:-23.6,feet:8.4,yaw:0}),
    // The quiet detour beyond the bench island: the one island with no purpose.
    Object.freeze({id:'source-iii-far-satellite',phase:'catch',chartId:0,level:2,x:-148,z:-112.6,feet:-4.8,yaw:0}),
  ]),
  // The room's triptych, seen from inside the courses the music raises.
  room:Object.freeze({
    // The courses fold a still body toward their middle, never into their sweep.
    well:Object.freeze({x:PRESSURE.centre[0],z:PRESSURE.centre[1],chartId:0,soft:4,swallow:2}),
    hole:Object.freeze({x:40,y:30,z:30,size:2.4,openSeconds:6}),
    // Behind the way in, the one sky the far folds leave open: turn from the
    // Couperin and it has risen over the place you arrived.
    sun:Object.freeze({x:-14,y:54,z:-74,openSeconds:9}),
    tears:Object.freeze({minX:-72,maxX:-16,minY:15,maxY:72,minZ:-18,maxZ:96,perInk:30,openSeconds:5}),
    memories:Object.freeze({solo:'tears',ensemble:'hole',couperin:'sun'}),
  }),
});
export const sourceRiftBarsMs=bars=>bars*SOURCE_RIFT.barSeconds*1000;
const finite=(n,d=0)=>Number.isFinite(Number(n))?Number(n):d;
// A body's place against a fault's standing sheet: `along` it and `across` it.
function against(fault,state){
  const dx=finite(state?.x)-fault.x,dz=finite(state?.z)-fault.z,c=Math.cos(fault.yaw),s=Math.sin(fault.yaw);
  return{along:dx*c+dz*s,across:-dx*s+dz*c,height:finite(state?.feet)-fault.feet};
}
export function sourceRiftFaultsFor(state){
  return SOURCE_RIFT.faults.filter(fault=>fault.phase===state?.phase&&fault.chartId===(state?.chartId??0));
}
/** The fault this standing body has walked into, if any. */
export function sourceRiftFaultTouched(state){
  return sourceRiftFaultsFor(state).find(fault=>{
    const at=against(fault,state);
    return Math.abs(at.height)<.6&&Math.abs(at.across)<SOURCE_RIFT.touch&&Math.abs(at.along)<SOURCE_RIFT.width/2+.1;
  })||null;
}
/** A body returned beside a fault must walk clear before it can open again. */
export function sourceRiftFaultClear(state,id){
  const fault=SOURCE_RIFT.faults.find(item=>item.id===id);if(!fault||fault.phase!==state?.phase)return true;
  const at=against(fault,state);return Math.abs(at.height)>=.6||Math.hypot(at.along,at.across)>=SOURCE_RIFT.clearance;
}
/** Torn ink shards around an opening, in its own metres: `x` along the sheet,
 * `y` up from its foot, `z` across. Fixed like every other fault: nothing moves. */
export function sourceRiftLips({width=SOURCE_RIFT.width,height=SOURCE_RIFT.height,shards=7}={}){
  const lips=[],tall=height/shards;
  for(const side of[-1,1])for(let k=0;k<shards;k++){
    const jag=Math.sin(k*2.3+side)*.055,wide=.05+.055*Math.abs(Math.sin(k*1.7+side*.6));
    lips.push({id:`side-${side}-${k}`,ink:(k+(side>0?1:0))%SOURCE_RIFT.ink.length,x:side*(width/2+wide/2+.02+jag*.5),y:(k+.5)*tall,z:side*.012,
      sx:wide,sy:tall*(.82+.16*Math.abs(Math.cos(k*1.3))),sz:.05+.03*Math.abs(Math.sin(k*2.9))});
  }
  for(let k=0;k<4;k++)lips.push({id:`head-${k}`,ink:(k+2)%SOURCE_RIFT.ink.length,x:(k+.5)*width/4-width/2,y:height+.035+Math.sin(k*2.1)*.025,z:0,sx:width/4*.86,sy:.05+.025*Math.abs(Math.cos(k*1.9)),sz:.06});
  return lips;
}
