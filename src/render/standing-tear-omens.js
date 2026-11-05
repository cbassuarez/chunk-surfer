import {SOURCE_RIFT} from '../game/source-rift.js';
import {sourceRestHorizonFrame,sourceRestHorizonSchedule} from '../game/source-rest-horizon.js';
import {sourceBlackSunPoses,sourceContinuationBlackSunGeometryLibrary} from './source-continuation-black-sun.js';

// What Source grew from, seen from the room behind the first fault. Each piece
// that wakes opens its own omen over the courses the music is raising: the
// ensemble's Bach the same torn hole as Source II, on the same recording's
// marked mistakes; the Couperin the black sun that eats the moon over Source
// III; the student's own correction the faults. A player who finds this room
// before those places has been shown them. One who comes back through a fault
// recognises them. They are only overhead: none of them is a floor or a wall.
const ROOM=SOURCE_RIFT.room,clamp=n=>Math.max(0,Math.min(1,Number(n)||0)),smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
// The hole's frame is seat-relative: this seat is where its pivot falls overhead.
const pivot=[-19.5,7.55,-.8];
const HOLE_SEAT=Object.freeze({phase:'wrong-return',x:ROOM.hole.x-pivot[0],feet:ROOM.hole.y-pivot[1],z:ROOM.hole.z-pivot[2],yaw:Math.PI});
const FIRST_MISTAKE=sourceRestHorizonSchedule().mistakes[0]?.time??0;
function random(seed){
  let a=seed>>>0;
  return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
// Flat, sharp and fixed to the world, as the Earthfall tears are: zero thickness,
// both faces drawn by the opaque pass, never billboarded and never moved.
function tearSheets(ink){
  const T=ROOM.tears,rand=random(0x51a7+ink*977),g={p:[],i:[]};
  for(let n=0;n<T.perInk;n++){
    const x=T.minX+rand()*(T.maxX-T.minX),y=T.minY+rand()**1.3*(T.maxY-T.minY),z=T.minZ+rand()*(T.maxZ-T.minZ),
      size=2.4+rand()**1.8*11,yaw=rand()*Math.PI*2,lean=(rand()-.5)*1.6,c=Math.cos(yaw),s=Math.sin(yaw),o=g.p.length/3,
      corner=(a,b)=>[x+(a*c-b*s*Math.cos(lean))*size,y+b*Math.sin(lean)*size,z+(a*s+b*c*Math.cos(lean))*size];
    g.p.push(...corner(-.62,-.08),...corner(.5,-.3),...corner(.28,.27),...corner(-.2,.2));
    g.i.push(o,o+1,o+2,o,o+2,o+3);
  }
  return g;
}
const inkPaint=rgb=>({material:'paper',base:[...rgb,1],emissive:rgb.map(v=>v*.36),materialRole:'source-chunk-error'});
export function standingTearOmenGeometry(){
  const sun=sourceContinuationBlackSunGeometryLibrary();
  return[
    ...SOURCE_RIFT.ink.map((rgb,index)=>({id:'rift-tears-'+index,kind:'detail',...inkPaint(rgb),...tearSheets(index)})),
    {id:'omen-sun',kind:'detail',material:'dark',base:[.004,.003,.010,1],emissive:[0,0,0],p:sun['catch-black-sun'].p,i:sun['catch-black-sun'].i},
    {id:'omen-corona',kind:'detail',material:'light',base:[.97,.93,.82,1],emissive:[1.25,1.12,.86],p:sun['catch-black-sun-corona'].p,i:sun['catch-black-sun-corona'].i},
    // The same hot moon as over Source III: the print records it pale, but legible.
    {id:'omen-moon',kind:'detail',material:'light',base:sun['catch-blood-moon'].base,emissive:sun['catch-blood-moon'].emissive,p:sun['catch-blood-moon'].p,i:sun['catch-blood-moon'].i},
    {id:'omen-stream',kind:'detail',material:'light',base:sun['catch-blood-moon-stream'].base,emissive:sun['catch-blood-moon-stream'].emissive,p:sun['catch-blood-moon-stream'].p,i:sun['catch-blood-moon-stream'].i},
  ];
}
const opening=(memory,seconds)=>memory?.awake?smooth((Number(memory.awakeSeconds)||0)/seconds):0;
/** Props and the hole's lens frame for this moment of the room. Pure. */
export function standingTearOmens(memories,{elapsed=0,stillOmens=false,pulse=0}={}){
  const by=id=>memories.find(memory=>memory.id===id&&ROOM.memories[id]),props=[];
  const tears=Math.max(opening(by('solo'),ROOM.tears.openSeconds),clamp(by('solo')?.pressure));
  // Sheets never grow or drift: more of them are simply there, one ink at a time.
  SOURCE_RIFT.ink.forEach((_,index)=>{if(by('solo')?.awake&&tears>=index/SOURCE_RIFT.ink.length)props.push({id:'omen-tears-'+index,mesh:'rift-tears-'+index,memoryId:'solo',role:'omen-tears',cullRadius:260,
    matrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])});});
  const rise=opening(by('couperin'),ROOM.sun.openSeconds);
  if(rise>.01){
    const poses=sourceBlackSunPoses({centre:ROOM.sun,facing:{x:ROOM.well.x,y:1.62,z:ROOM.well.z},time:elapsed,scale:rise,reducedMotion:stillOmens});
    for(const[part,mesh]of[['sun','omen-sun'],['corona','omen-corona'],['moon','omen-moon'],['stream','omen-stream']])
      props.push({id:'omen-'+part,mesh,memoryId:'couperin',role:'omen-black-sun',cullRadius:70,matrix:poses[part]});
  }
  const open=opening(by('ensemble'),ROOM.hole.openSeconds);let horizon=null;
  if(open>.02){
    // The eyes begin closing soon after it opens: the same marked mistakes.
    const clock=Math.max(0,FIRST_MISTAKE-5)+(Number(by('ensemble').awakeSeconds)||0),frame=sourceRestHorizonFrame({time:clock,unwrappedTime:clock,progress:0,breath:clamp(pulse),reducedMotion:stillOmens,seat:HOLE_SEAT});
    if(frame.active)horizon={...frame,radius:frame.radius*ROOM.hole.size*open};
  }
  return{props,horizon};
}
