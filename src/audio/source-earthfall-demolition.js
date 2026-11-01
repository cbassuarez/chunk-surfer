// The charges and the dust of the false Ellery's implosion (the Earthfall
// aside). The material bank has no report and no roar, so both are made here.
//
// A charge is heard as a report: a few milliseconds of broadband crack, a low
// body that drops in pitch, and the masonry room's short tail. A few reports
// are built ahead of time, because synthesis on the frame the charges fire
// would drop that frame; the ripple is then only scheduling: each charge one
// source, placed by its bearing, late by its distance, dulled with range.
// The roar is brown noise with slow surges; the scene's filter closes it down
// as the dust thickens.
const TAU=Math.PI*2;
function noise(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296*2-1;};}

export const EARTHFALL_DEMOLITION_SOUND=Object.freeze({
 speedOfSound:343,crackSeconds:.004,bodySeconds:.09,tailSeconds:.32,
 bodyHz:Object.freeze({from:80,to:45,seconds:.03}),tailGain:.25,peak:.9,
 reports:3,roarSeconds:5,roarPeak:.8,
});
const S=EARTHFALL_DEMOLITION_SOUND;

/** One report, mono, peaking at S.peak. */
export function earthfallReportSamples(sampleRate,{seed=1}={}){
 const n=Math.ceil(sampleRate*S.tailSeconds*4),out=new Float32Array(n),rand=noise(seed);
 let phase=0,last=0,low=0,peak=0;
 for(let k=0;k<n;k++){
  const t=k/sampleRate,w=rand();
  // The crack: a short burst, its lows thinned by a first difference.
  const crack=(w*.4+(w-last)*.6)*Math.exp(-t/S.crackSeconds);last=w;
  const hz=S.bodyHz.to+(S.bodyHz.from-S.bodyHz.to)*Math.exp(-t/S.bodyHz.seconds);phase+=TAU*hz/sampleRate;
  low+=.15*(rand()-low);
  out[k]=crack+Math.sin(phase)*Math.exp(-t/S.bodySeconds)*.9+low*Math.exp(-t/S.tailSeconds)*S.tailGain;
  peak=Math.max(peak,Math.abs(out[k]));
 }
 const g=S.peak/(peak||1);for(let k=0;k<n;k++)out[k]*=g;
 return out;
}

/**
 * Where each report of a ripple lands for this listener: charges are
 * [{offset, position:{x,y,z}, core}], listener is {x,y,z,yaw}. Returns
 * [{at, gain, pan, cutoff}], at in seconds from the first charge.
 */
export function earthfallChargePlan(charges,listener={}){
 return charges.map(c=>{
  const dx=c.position.x-(listener.x||0),dy=c.position.y-(listener.y||0),dz=c.position.z-(listener.z||0),d=Math.hypot(dx,dy,dz);
  const bearing=Math.atan2(dx,-dz)-(listener.yaw||0);
  return{at:c.offset+d/S.speedOfSound,gain:(1+d/22)**-.88*(c.core?.8:1),pan:Math.max(-.9,Math.min(.9,Math.sin(bearing)*Math.min(1,Math.hypot(dx,dz)/2)*.9)),cutoff:12000/(1+d/5)};
 });
}

export function earthfallRoarSamples(sampleRate,{seed=7}={}){
 const n=Math.ceil(sampleRate*S.roarSeconds),out=new Float32Array(n),rand=noise(seed);
 const surges=[.43,.71,1.07].map((hz,i)=>({hz,phase:i*2.1}));let brown=0,peak=0;
 for(let k=0;k<n;k++){
  const t=k/sampleRate;brown=brown*.997+rand()*.06;
  const surge=.6+.4*surges.reduce((s,u)=>s+Math.sin(TAU*u.hz*t+u.phase),0)/surges.length;
  out[k]=brown*surge;peak=Math.max(peak,Math.abs(out[k]));
 }
 const g=S.roarPeak/(peak||1);for(let k=0;k<n;k++)out[k]*=g;
 return out;
}

const roars=new WeakMap();
export function earthfallRoarBuffer(ctx){
 if(!ctx?.createBuffer)return null;
 if(!roars.has(ctx)){const data=earthfallRoarSamples(ctx.sampleRate),b=ctx.createBuffer(1,data.length,ctx.sampleRate);b.getChannelData(0).set(data);roars.set(ctx,b);}
 return roars.get(ctx);
}
const reports=new WeakMap();
export function earthfallReportBuffers(ctx){
 if(!ctx?.createBuffer)return null;
 if(!reports.has(ctx))reports.set(ctx,Array.from({length:S.reports},(_,i)=>{const data=earthfallReportSamples(ctx.sampleRate,{seed:i*3+1}),b=ctx.createBuffer(1,data.length,ctx.sampleRate);b.getChannelData(0).set(data);return b;}));
 return reports.get(ctx);
}
