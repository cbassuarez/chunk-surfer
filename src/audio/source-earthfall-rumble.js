// The sound of the ground under Earthfall, made from the same record that moves
// it (data/source-earthfall-quake.js): a low-passed noise bed whose level is the
// record's envelope and whose surges are its waves, a vertical thump from the
// up component, and a grinding band that only opens in the strong motion. What
// is heard and what moves are one signal. No score, no tone, no loop.
import {SOURCE_EARTHFALL_RECORD as RECORD} from '../data/generated/source-earthfall-record.js';
import {earthfallQuakeIntensity} from '../data/source-earthfall-quake.js';

const RATE=RECORD.rate,N=RECORD.samples,DURATION=(N-1)/RATE;
const PEAK_H=Math.max(RECORD.peakAccelerationMs2.HNE,RECORD.peakAccelerationMs2.HNN),PEAK_V=RECORD.peakAccelerationMs2.HNZ;
const at=(values,t)=>{const x=t*RATE,i=Math.floor(x);if(i<0||i>=N-1)return 0;return values[i]+(values[i+1]-values[i])*(x-i);};
const onePole=(hz,rate)=>1-Math.exp(-2*Math.PI*hz/rate);

export const earthfallRumbleDuration=()=>DURATION;

/**
 * Two channels of rumble at `sampleRate`, the length of the record. Seeded,
 * so every run hears the same ground. Peak-normalised to 0.9.
 */
export function earthfallRumbleSamples(sampleRate=48000,{seed=0x2019}={}){
  const length=Math.ceil(DURATION*sampleRate),channels=[new Float32Array(length),new Float32Array(length)];
  const lowA=onePole(85,sampleRate),lowB=onePole(140,sampleRate),thumpA=onePole(55,sampleRate),bandHi=onePole(260,sampleRate),bandLo=onePole(900,sampleRate);
  let peak=0;
  for(let c=0;c<2;c++){
    let s=(seed+c*7919)>>>0;const random=()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296*2-1;};
    let brown=0,l1=0,l2=0,t1=0,h1=0,b1=0,b2=0;
    const out=channels[c];
    for(let n=0;n<length;n++){
      const t=n/sampleRate,white=random();
      brown=(brown+white*.02)*.9985;
      l1+=(brown-l1)*lowA;l2+=(l1-l2)*lowB;
      t1+=(random()-t1)*thumpA;
      h1+=(white-h1)*bandHi;b1+=((white-h1)-b1)*bandLo;b2+=(b1-b2)*bandLo;
      const envelope=earthfallQuakeIntensity(t);
      const surge=Math.min(1.4,Math.hypot(at(RECORD.acceleration.east,t),at(RECORD.acceleration.north,t))/PEAK_H);
      const jolt=Math.min(1.4,Math.abs(at(RECORD.acceleration.up,t))/PEAK_V);
      const value=l2*14*(.2*envelope+.8*envelope*surge)+t1*1.6*jolt*(.35+.65*envelope)+b2*2.2*envelope*envelope*surge;
      out[n]=value;peak=Math.max(peak,Math.abs(value));
    }
  }
  const scale=.9/(peak||1);
  for(const out of channels)for(let n=0;n<out.length;n++)out[n]*=scale;
  return channels;
}

const buffers=new WeakMap();
// One buffer per context, built on first use. Null where the context cannot
// make buffers (test fakes, closed contexts): the rest of Earthfall still plays.
export function earthfallRumbleBuffer(ctx){
  if(!ctx||typeof ctx.createBuffer!=='function')return null;
  if(!buffers.has(ctx)){
    const [left,right]=earthfallRumbleSamples(ctx.sampleRate),buffer=ctx.createBuffer(2,left.length,ctx.sampleRate);
    buffer.copyToChannel?buffer.copyToChannel(left,0):buffer.getChannelData(0).set(left);
    buffer.copyToChannel?buffer.copyToChannel(right,1):buffer.getChannelData(1).set(right);
    buffers.set(ctx,buffer);
  }
  return buffers.get(ctx);
}
