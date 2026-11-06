// The 06:00 horn: a vehicle's horn shorting out under water. Nothing recorded; a
// deterministic project-authored synthesis, so the same bytes come back every build.
//
// A dual-tone electric horn, the two notes a little under a major third apart, runs
// through a waterlogged diaphragm. Its battery is dying, so the pitch sags and the
// note sputters out. Water takes the top off, the flooded cab rings under it, the
// sound comes back off hard surfaces, and when it stops the last air goes up.
//
//   node tools/chunk_surfer/build-submerged-horn.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const OUT=fileURLToPath(new URL('../../public/audio/first-strike/submerged-car-horn.wav',import.meta.url));
export const SUBMERGED_HORN=Object.freeze({rate:22050,seconds:5.8,hornSeconds:3.95,notes:Object.freeze([392,494]),sag:.13,seed:0x06000601,peak:.71});

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
function random(seed){let a=seed>>>0;return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
// A biquad whose coefficients can move while it runs.
function biquad(){let x1=0,x2=0,y1=0,y2=0,b0=1,b1=0,b2=0,a1=0,a2=0;return{
  lowpass(f,q,rate){const w=2*Math.PI*f/rate,c=Math.cos(w),al=Math.sin(w)/(2*q),n=1+al;b0=(1-c)/2/n;b1=(1-c)/n;b2=b0;a1=-2*c/n;a2=(1-al)/n;},
  bandpass(f,q,rate){const w=2*Math.PI*f/rate,c=Math.cos(w),al=Math.sin(w)/(2*q),n=1+al;b0=al/n;b1=0;b2=-al/n;a1=-2*c/n;a2=(1-al)/n;},
  run(x){const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;}};}

export function renderSubmergedHorn(spec=SUBMERGED_HORN){
  const {rate,seconds,hornSeconds:H,notes,sag,seed,peak}=spec,total=Math.round(rate*seconds),rand=random(seed),out=new Float64Array(total);
  // The battery goes in fits: short dropouts, closer together toward the end.
  const dropouts=[];for(let t=2.05;t<H-.12;t+=.2+rand()*.42*(1-(t-2)/(H-2)))dropouts.push([t,.035+rand()*.11+.05*smooth(2,H,t)]);
  const gate=t=>{let g=smooth(0,.09,t)*(1-smooth(H-.05,H+.16,t));for(const[a,d]of dropouts)g*=1-smooth(a-.012,a+.006,t)*(1-smooth(a+d-.006,a+d+.014,t));return g;};
  const lp=[biquad(),biquad()],cab=biquad(),hull=biquad();
  const phase=[0,0],sub=[0];let rumble=0;
  for(let n=0;n<total;n++){
    const t=n/rate,dying=smooth(.25,H,t),falling=Math.pow(dying,1.4);
    const wobble=1+.012*Math.sin(2*Math.PI*.62*t+.7)+.0042*Math.sin(2*Math.PI*5.3*t)*(.4+dying),pitch=(1-sag*falling)*wobble;
    let horn=0;
    notes.forEach((f,i)=>{
      phase[i]+=2*Math.PI*f*pitch/rate;
      let tone=0;for(let k=1;k<=10;k++)tone+=Math.sin(k*phase[i]+k*i*.31)/Math.pow(k,.9);
      horn+=tone*(i?.78:1);
    });
    sub[0]+=2*Math.PI*notes[0]*.5*pitch/rate;
    const flutter=1-(.1+.12*dying)*(.5+.5*Math.sin(2*Math.PI*4.7*t+1.1));
    let voice=Math.tanh(horn*.55)*gate(t)*(1-.36*falling)*flutter+Math.sin(sub[0])*.1*gate(t);
    // Water closes down on it as it dies.
    if(n%24===0){const cut=860-400*dying+60*Math.sin(2*Math.PI*.71*t);lp[0].lowpass(cut,.82,rate);lp[1].lowpass(cut*1.2,.7,rate);
      cab.bandpass(168+9*Math.sin(2*Math.PI*.33*t),1.5,rate);hull.bandpass(432-70*dying+26*Math.sin(2*Math.PI*.47*t+2),3.2,rate);}
    const wet=lp[1].run(lp[0].run(voice));
    rumble=rumble*.9968+(rand()*2-1)*.0032;
    out[n]=wet*.95+cab.run(voice)*.2+hull.run(voice)*.52+rumble*2.1*smooth(0,.5,t)*(1-smooth(seconds-1.1,seconds-.1,t));
  }
  // Sound comes back quickly off hard things in water, close and dense.
  const taps=[[.021,.5],[.034,.4],[.055,.33],[.089,.26],[.144,.2]],longest=Math.ceil(.144*rate)+2,line=new Float64Array(longest),damp=biquad();damp.lowpass(720,.7,rate);let at=0;
  for(let n=0;n<total;n++){
    let back=0;for(const[d,g]of taps)back+=line[(at-Math.round(d*rate)+longest)%longest]*g;
    back=damp.run(back);line[at]=out[n]+back*.56;at=(at+1)%longest;out[n]=out[n]*.74+back*.72;
  }
  // Bubbles sit nearer than the horn: a few while it runs, then the last air going up.
  const bubble=(start,f0,rise,tau,amp)=>{for(let n=Math.round(start*rate),end=Math.min(total,n+Math.round(tau*7*rate)),p=0,i=0;n<end;n++,i++){const t=i/rate;p+=2*Math.PI*f0*(1+rise*t/(tau*7))/rate;out[n]+=Math.sin(p)*amp*Math.exp(-t/tau)*smooth(0,.002,t);}};
  for(let t=.4;t<H;t+=.1+rand()*.32)bubble(t,190+rand()*420,.4+rand()*.5,.018+rand()*.03,.07+rand()*.08);
  for(let i=0;i<30;i++){const t=H+.03+Math.pow(rand(),1.5)*1.45;bubble(t,170+rand()*560,.5+rand()*.8,.02+rand()*.05,(.05+rand()*.11)*(1-.5*(t-H)/1.5));}
  let top=0;for(const v of out)top=Math.max(top,Math.abs(v));
  const samples=new Int16Array(total);
  for(let n=0;n<total;n++){const fade=smooth(0,.008,n/rate)*(1-smooth(seconds-.6,seconds,n/rate));samples[n]=Math.round(clamp(out[n]/top*peak*fade,-1,1)*32767);}
  return samples;
}
export function submergedHornWav(samples=renderSubmergedHorn(),rate=SUBMERGED_HORN.rate){
  const size=samples.length*2,out=Buffer.alloc(44+size);
  out.write('RIFF',0);out.writeUInt32LE(36+size,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(size,40);
  for(let i=0;i<samples.length;i++)out.writeInt16LE(samples[i],44+i*2);
  return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const wav=submergedHornWav();fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,wav);
  const creditsPath=path.join(path.dirname(OUT),'credits.json'),credits=JSON.parse(fs.readFileSync(creditsPath,'utf8'));
  credits.submergedCarHorn={file:path.basename(OUT),origin:'Project-authored deterministic synthesis; nothing recorded.',tool:'tools/chunk_surfer/build-submerged-horn.mjs',license:'Project source',bytes:wav.length,sha256:crypto.createHash('sha256').update(wav).digest('hex')};
  fs.writeFileSync(creditsPath,JSON.stringify(credits,null,2)+'\n');
  console.log(JSON.stringify({file:path.relative(process.cwd(),OUT),bytes:wav.length,seconds:SUBMERGED_HORN.seconds}));
}
