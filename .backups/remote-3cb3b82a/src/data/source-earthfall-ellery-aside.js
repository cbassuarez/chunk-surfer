// One borrowed memory of the real Scene Dock. These are metres, not a new
// chapter or a replacement room in the ordinary floorplan.
//
// It comes down the way a building is imploded (docs/plans/earthfall-quake.md,
// from the Radio Network House and AfE-Tower footage stepped frame by frame):
// charges show only as dust jets and reports, then nothing moves, then the
// core goes first and the walls are drawn in after it, and dust leaves every
// base and rolls across the floor until it fills the view.
import {GAIT_SPEED} from '../game/locomotion.js';
export const SOURCE_EARTHFALL_ELLERY_ASIDE=Object.freeze({
 version:4,id:'source-earthfall:ellery-aside-v4',duration:7.8,fixedStep:1/120,maxFrameDelta:.25,
 walkSpeed:GAIT_SPEED.walk,place:'interior',bodyRadius:.22,bodyHeight:1.8,eyeHeight:1.62,
 room:Object.freeze({minX:57.25,maxX:73.25,minZ:3.25,maxZ:15.25,floor:0,ceiling:5.5}),
 center:Object.freeze({x:65.25,y:0,z:9.25}),
 spawn:Object.freeze({x:65.15,z:11.65,feet:0,yaw:-.75,pitch:-.03}),
 pack:'assets/source-earthfall-ellery-aside.glb',
 dustPack:'assets/source-earthfall-dust.glb',
 // The charges fire in a ripple; the pause follows the last of them.
 chargeAt:2,chargeRipple:.035,
 // The room starts to move: the core, then its floor a beat later.
 coreAt:2.95,floorCoreAt:3.03,foldStart:2.95,
 // Walls are drawn in after the core, in the order their bases were cut:
 // the far wall first. The one behind the arrival goes well after the rest,
 // so its top passes the eye under the fade, not as a dark sweep in the haze.
 wallsAt:Object.freeze({north:3.35,west:3.5,east:3.65,south:4.5}),
 fadeStart:6.4,fadeEnd:7.2,
 resumeFallSeconds:.72,
});
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
export const asideEase=v=>{const t=clamp(v);return t*t*(3-2*t);};
export const asideSmooth=(a,b,t)=>asideEase((t-a)/(b-a));
const C=SOURCE_EARTHFALL_ELLERY_ASIDE;

// Two charges at the ridge bearings go first (the core's supports), then the
// pier bases around the room, wall by wall in the order the walls fall. Piers
// sit between bays and clear of the three door openings. `normal` points into
// the room: the way the dust jet leaves the wall.
const PIERS=[
 ['core-north',65.25,4.9,3.25,0,0,1],['core-south',65.25,4.9,15.25,0,0,-1],
 ...[71.25,67.25,63.25,59.25].map(x=>['north-'+x,x,.35,3.25,0,0,1]),
 ...[5.25,13.25].map(z=>['west-'+z,57.25,.35,z,1,0,0]),
 ...[5.25,9.25].map(z=>['east-'+z,73.25,.35,z,-1,0,0]),
 ...[71.25,68.25,61.75,59.25].map(x=>['south-'+x,x,.35,15.25,0,0,-1]),
];
export const SOURCE_ELLERY_ASIDE_CHARGES=Object.freeze(PIERS.map(([id,x,y,z,nx,ny,nz],i)=>Object.freeze({
 id,at:+(C.chargeAt+i*C.chargeRipple).toFixed(4),position:Object.freeze({x,y,z}),normal:Object.freeze([nx,ny,nz]),core:id.startsWith('core'),
})));

export const sourceElleryAsideCollapse=elapsed=>({
 core:asideSmooth(C.coreAt,C.coreAt+1.2,elapsed),
 walls:asideSmooth(C.wallsAt.north,C.fadeStart,elapsed),
 // There is no attraction core any more; the field stays for old readers.
 coreRadius:0,scale:1,
 blackout:asideSmooth(C.fadeStart,C.fadeEnd,elapsed),
});
export function sourceElleryAsidePhase(elapsed){
 const t=Number(elapsed)||0,last=SOURCE_ELLERY_ASIDE_CHARGES.at(-1).at;
 return t<C.chargeAt?'recognition':t<last+.06?'charges':t<C.coreAt?'pause':t<C.wallsAt.north?'core':t<C.fadeStart?'walls':'black';
}
// The doors stand as the room was left (the grey exterior door shut, the two
// service doors open) until the charges' pressure reaches them: the open
// leaves slam and knock back once, the shut one rattles in its frame.
export function sourceElleryAsideDoorFraction(index,elapsed){
 const t=Math.max(0,Number(elapsed)||0),initial=index===0?0:1,slamAt=C.chargeAt+.1+index*.05;
 if(t<slamAt)return initial;
 const age=t-slamAt;
 if(initial===0)return age<.18?.05*Math.sin(Math.PI*age/.18):0;
 if(age<.3)return 1-(age/.3)**2;
 return age<.55?.07*Math.sin(Math.PI*(age-.3)/.25):0;
}
// The light a door lets in follows its slam but not the rattle or the knock
// back, so from the charges on no light in the room ever rises.
export function sourceElleryAsideDoorLight(index,elapsed){
 const t=Math.max(0,Number(elapsed)||0),slamAt=C.chargeAt+.1+index*.05;
 if(t<slamAt)return sourceElleryAsideDoorFraction(index,t);
 return index===0?0:Math.max(0,1-((t-slamAt)/.3)**2);
}
export const SOURCE_ELLERY_ASIDE_PANELS=Object.freeze([
 {id:'west',kind:'masonry',axis:2,columns:6,rows:3,pivot:[57.25,0,9.25]},
 {id:'east',kind:'masonry',axis:2,columns:6,rows:3,pivot:[73.25,0,9.25]},
 {id:'north',kind:'masonry',axis:0,columns:8,rows:3,pivot:[65.25,0,3.25]},
 {id:'south',kind:'masonry',axis:0,columns:8,rows:3,pivot:[65.25,0,15.25]},
 {id:'roof-west',kind:'timber',axis:0,columns:2,rows:3,pivot:[61.25,5.5,9.25]},
 {id:'roof-east',kind:'timber',axis:0,columns:2,rows:3,pivot:[69.25,5.5,9.25]},
 {id:'floor-west',kind:'floor',axis:0,columns:2,rows:3,pivot:[61.25,0,9.25]},
 {id:'floor-east',kind:'floor',axis:0,columns:2,rows:3,pivot:[69.25,0,9.25]},
].map(p=>Object.freeze({...p,pivot:Object.freeze(p.pivot)})));
