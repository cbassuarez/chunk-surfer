// THE DOOR THAT DOES ONE THING. Seb, 2026-11-13: one of the station's fields is
// the car door and basically nothing else: no Ophanim, no bag, no jumper, no
// wheel. Pressing the door is its one action, and then the door has nothing
// more to offer. What it does is bring the van down out of the sky, from a long
// way up, and play the crash out on him. Either it misses, and the van's own
// door is the way back to the station, or it doesn't, and it is black, and then
// the station.
//
// Pure: where the van is, where it stands once it is down, what it covers, and
// where its open door is. The scene decides when; the renderer draws it.
import {VAN_WRECK,VAN_WRECK_CRASH,VAN_WRECK_NOSE,vanWreckPoint} from './van-wreck.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const STATION_FIELD_CRASH=freeze({
  fieldId:'fourth',
  // It has been falling a long time already: it comes down at about the speed a
  // van falls, from far enough up to be a speck, and it takes eight seconds.
  height:440,speed:55,
  // Until this long before the ground it is over him, wherever he goes. After
  // that it is committed, and a step or two takes him out from under it.
  follow:1.4,
  // Nose down, the way it went off the cliff, and into the ground this far.
  pitch:-VAN_WRECK_CRASH.entryPitch,bury:.45,
  // Its side, with the door that sprang open, faces the way he came in. It
  // turns slowly on the way down and stops turning when it lands.
  yaw:Math.PI/2,spin:.35,
  // What counts as under it: its own footprint and a little more.
  margin:.35,
  // The door he pressed, if the van comes down this close to it, goes flat.
  flatten:2.6,
  // Reduce Dread keeps the van and drops the crush: it comes down this far off
  // to his side, wherever he is standing, and never on him.
  gentleOffset:4.2,
  // When it lands on him: the black comes in this fast, stays this long, and
  // the station comes back up out of it over the last figure.
  coverIn:.12,black:1.7,wake:1.8,
  // The van's own door, the near cab door that sprang open: the middle of its
  // opening in the intact body's frame, and how close is close enough.
  doorway:[-1.0,1.15,-.8],doorReach:2.2,
});
const C=STATION_FIELD_CRASH;
// The intact front, in the body's own frame. The wreck is measured from here too.
export const STATION_FIELD_CRASH_NOSE=freeze([0,.32,VAN_WRECK.front]);
// The body's box: its width, the floor to the roof, and the front to the rear doors.
const BODY=freeze({x:[-.985,.985],y:[0,2.024],z:[VAN_WRECK.front,2.7]});

// Column-major 4x4s, as the renderer takes them.
export function crashMultiply(a,b){
  const o=new Array(16).fill(0);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];o[c*4+r]=v;}
  return o;
}
const translate=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const aboutY=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];};
const aboutX=a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];};
export const crashPoint=(m,[x,y,z])=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];

// How far it has to fall, and how long that takes.
export const stationFieldCrashSeconds=()=>C.height/C.speed;
// The nose's height above the field `t` seconds after the door was pressed.
export const stationFieldCrashHeight=t=>Math.max(0,C.height-C.speed*Math.max(0,t));
// Its yaw on the way down: still turning, and settled on `yaw` at the ground.
export const stationFieldCrashYaw=(yaw,t)=>yaw+C.spin*Math.max(0,stationFieldCrashSeconds()-Math.max(0,t));

// The whole van, nose down, its nose `height` above the ground at `target`.
export function stationFieldFallingBody({target,yaw,height}){
  return crashMultiply(crashMultiply(crashMultiply(translate(target.x,height,target.z),aboutY(yaw)),aboutX(C.pitch)),translate(...STATION_FIELD_CRASH_NOSE.map(v=>-v)));
}
// The wreck, as it stands once it is down: its crushed nose in the ground.
export function stationFieldWreckBody({target,yaw}){
  return crashMultiply(crashMultiply(crashMultiply(translate(target.x,-C.bury,target.z),aboutY(yaw)),aboutX(C.pitch)),translate(...VAN_WRECK_NOSE.map(v=>-v)));
}
// What it covers on the ground, in its own heading: `across` its width and
// `along` its length as it leans, measured from where the nose went in.
export function stationFieldCrashExtent(){
  let lo=Infinity,hi=-Infinity;
  const pose=crashMultiply(aboutX(C.pitch),translate(...VAN_WRECK_NOSE.map(v=>-v)));
  for(const y of BODY.y)for(const z of BODY.z){const p=crashPoint(pose,vanWreckPoint([0,y,z]));lo=Math.min(lo,p[2]);hi=Math.max(hi,p[2]);}
  return freeze({across:[BODY.x[0],BODY.x[1]],along:[lo,hi]});
}
const EXTENT=stationFieldCrashExtent();
// Whether a point on the field is under it, with `pad` metres more all round.
export function stationFieldCrashCovers({target,yaw},x,z,pad=0){
  const dx=x-target.x,dz=z-target.z,c=Math.cos(yaw),s=Math.sin(yaw);
  const across=dx*c-dz*s,along=dx*s+dz*c;
  return across>=EXTENT.across[0]-pad&&across<=EXTENT.across[1]+pad&&along>=EXTENT.along[0]-pad&&along<=EXTENT.along[1]+pad;
}
// The middle of the open cab door, on the wreck, and how near he has to be.
export function stationFieldCrashDoor({target,yaw}){
  const[x,y,z]=crashPoint(stationFieldWreckBody({target,yaw}),vanWreckPoint(C.doorway));
  return freeze({x,z,height:y,reach:C.doorReach});
}
// Where it comes down when it may not come down on him: beside him, off to his
// right, never under his feet.
export function stationFieldGentleTarget({x,z,yaw}){
  return freeze({x:x+Math.cos(yaw)*C.gentleOffset,z:z+Math.sin(yaw)*C.gentleOffset});
}
