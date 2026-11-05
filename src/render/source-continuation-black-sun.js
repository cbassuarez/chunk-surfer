import {SOURCE_CONTINUATION as C} from '../data/source-continuation.js';
import {SOURCE_TIDES} from '../game/source-continuation-tides.js';

// Over Source III the sun has turned black and is eating the moon, which has
// turned to blood: "the sun shall be turned into darkness, and the moon into
// blood" (Joel 2:31; Revelation 6:12). Seen as a dying mind's last lucid sky.
// A lightless disc behind a torn white corona; the red moon orbits close
// enough to be stripped, its body unwinding into a spiral stream of chunks
// that falls into the black limb. Its pull is the tide the body feels there.
// Units below are sun radii in a plane that faces the stack.
export const SOURCE_BLACK_SUN=Object.freeze({
  radius:20,moon:.36,orbit:1.95,orbitSeconds:260,coronaSeconds:610,breathSeconds:23,
  streamers:46,streamerReach:Object.freeze([1.12,2.5]),fragments:150,winding:2.4,
});
const TAU=Math.PI*2;
function random(seed){
  let a=seed>>>0;
  return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
function sphere(target,cx,cy,cz,r,across=20,around=12){
  const o=target.p.length/3;
  for(let v=0;v<=around;v++){const phi=v/around*Math.PI;for(let u=0;u<=across;u++){const theta=u/across*TAU;
    target.p.push(cx+r*Math.sin(phi)*Math.cos(theta),cy+r*Math.cos(phi),cz+r*Math.sin(phi)*Math.sin(theta));}}
  for(let v=0;v<around;v++)for(let u=0;u<across;u++){const a=o+v*(across+1)+u,b=a+across+1;if(v>0)target.i.push(a,b,a+1);if(v<around-1)target.i.push(a+1,b,b+1);}
}
// A flat slab in the facing plane: centre (x,y), half length along angle a.
function slab(target,x,y,a,half,width,depth=.012){
  const c=Math.cos(a),s=Math.sin(a),o=target.p.length/3,at=(l,w,d)=>[x+l*c-w*s,y+l*s+w*c,d];
  for(const d of[-depth,depth])for(const [l,w] of[[-half,-width],[half,-width],[half,width],[-half,width]])target.p.push(...at(l,w,d));
  for(const[a0,b0,c0,d0]of[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]])target.i.push(o+a0,o+c0,o+b0,o+a0,o+d0,o+c0);
}
function chunk(target,x,y,z,size,turn){
  const c=Math.cos(turn),s=Math.sin(turn),o=target.p.length/3,h=size/2;
  for(const dz of[-h,h])for(const [dx,dy] of[[-h,-h],[h,-h],[h,h],[-h,h]])target.p.push(x+dx*c-dy*s,y+dx*s+dy*c,z+dz*(.6+.4*s));
  for(const[a0,b0,c0,d0]of[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]])target.i.push(o+a0,o+c0,o+b0,o+a0,o+d0,o+c0);
}
// The stripped moon's path into the limb, from its orbit (u=0) to the disc.
export function sourceBlackSunStream(u){
  const S=SOURCE_BLACK_SUN,k=Math.min(1,Math.max(0,u)),r=S.orbit+(1.0-S.orbit)*Math.pow(k,.75),a=-k*S.winding*Math.PI;
  return[Math.cos(a)*r,Math.sin(a)*r,.05*Math.sin(k*9)];
}
let library=null;
export function sourceContinuationBlackSunGeometryLibrary(){
  if(library)return library;
  const S=SOURCE_BLACK_SUN,rand=random(0xb1ac5),disc={p:[],i:[]},corona={p:[],i:[]},moon={p:[],i:[]},stream={p:[],i:[]};
  sphere(disc,0,0,0,1,28,16);
  // A broken ring hugging the limb, and long unequal streamers off it.
  for(let k=0;k<72;k++){if(rand()<.18)continue;const a=k/72*TAU;slab(corona,Math.cos(a)*1.035,Math.sin(a)*1.035,a+Math.PI/2,TAU/72*.55,.012+rand()*.02);}
  for(let k=0;k<S.streamers;k++){
    const a=rand()*TAU,reach=S.streamerReach[0]+rand()**1.7*(S.streamerReach[1]-S.streamerReach[0]),mid=(1.02+reach)/2;
    slab(corona,Math.cos(a)*mid,Math.sin(a)*mid,a,(reach-1.02)/2,.006+rand()*.018*(2.6-reach));
  }
  sphere(moon,0,0,0,1,18,10);
  for(let k=0;k<S.fragments;k++){
    const u=Math.pow(rand(),.8),[x,y,z]=sourceBlackSunStream(u),spread=.16*(1-u)+.02,size=(.12*(1-u)**1.4+.022)*(.6+rand()*.8);
    chunk(stream,x+(rand()-.5)*spread,y+(rand()-.5)*spread,z+(rand()-.5)*spread*.5,size,rand()*TAU);
  }
  // The moon burns hot enough to outlast the sky's haze. The recording
  // prints its blood pale at this distance, which keeps it legible.
  const dark={material:'dark',base:[.004,.003,.010,1],roughness:1},blood={material:'linen',base:[.95,.06,.04,1],emissive:[1.55,.07,.04],roughness:1};
  library=Object.freeze({
    'catch-black-sun':{...disc,...dark},
    'catch-black-sun-corona':{...corona,material:'linen',base:[.97,.93,.82,1],emissive:[1.25,1.12,.86],roughness:1},
    'catch-blood-moon':{...moon,...blood},
    'catch-blood-moon-stream':{...stream,...blood},
  });
  return library;
}
const mul=(a,b)=>{const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;};
const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const crossV=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const spinZ=(a,s=1)=>{const c=Math.cos(a)*s,n=Math.sin(a)*s;return new Float32Array([c,n,0,0,-n,c,0,0,0,0,s,0,0,0,0,1]);};
const place=(x,y,z,s)=>new Float32Array([s,0,0,0,0,s,0,0,0,0,s,0,x,y,z,1]);
/** World matrices for the sun, its corona, the moon and its stream, wherever
 * they hang. The facing plane looks back at `facing`, upright to the world. */
export function sourceBlackSunPoses({centre,facing,time=0,scale=1,reducedMotion=false}={}){
  const S=SOURCE_BLACK_SUN,t=reducedMotion?0:Number(time)||0,size=S.radius*scale;
  const toward=unit([facing.x-centre.x,facing.y-centre.y,facing.z-centre.z]),right=unit(crossV([0,1,0],toward)),up=crossV(toward,right),
    basis=new Float32Array([...right.map(v=>v*size),0,...up.map(v=>v*size),0,...toward.map(v=>v*size),0,centre.x,centre.y,centre.z,1]);
  const orbit=t*TAU/S.orbitSeconds,breath=1+.035*Math.sin(t*TAU/S.breathSeconds),[mx,my,mz]=sourceBlackSunStream(0);
  return{sun:mul(basis,place(0,0,0,1)),corona:mul(basis,spinZ(-t*TAU/S.coronaSeconds,breath)),
    moon:mul(basis,mul(spinZ(orbit),place(mx,my,mz,S.moon))),stream:mul(basis,spinZ(orbit))};
}
/** Frame props for the black sun, the moon and its stream. Catch only. */
export function sourceContinuationBlackSunProps(state,{origin={x:0,y:0,z:0},time=0,reducedMotion=false}={}){
  if(state?.phase!=='catch'||(state.chartId??0)!==0)return[];
  const S=SOURCE_BLACK_SUN,sun=SOURCE_TIDES.wells.catch,stack=C.catch.center,o=[Number(origin.x)||0,Number(origin.y)||0,Number(origin.z)||0];
  const centre={x:o[0]+sun.x,y:o[1]+sun.y,z:o[2]+sun.z},poses=sourceBlackSunPoses({centre,facing:{x:o[0]+stack.x,y:o[1]-11,z:o[2]+stack.z},time,reducedMotion});
  const base={chartId:0,region:'catch',decorative:true,structural:false,blackSun:true,noShadow:true,noReflection:true,cullRadius:S.radius*2.8};
  return[['black-sun','catch-black-sun',poses.sun],['black-sun-corona','catch-black-sun-corona',poses.corona],['blood-moon','catch-blood-moon',poses.moon],['blood-moon-stream','catch-blood-moon-stream',poses.stream]]
    .map(([id,mesh,matrix])=>({...base,id:'source-continuation-'+id,mesh:'source-continuation-'+mesh,matrix,...centre}));
}
