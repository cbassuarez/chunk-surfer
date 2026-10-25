// The ordinary shelter encounter keeps the retained woman, bag and skeleton.
// It does not borrow the distorted returning-road performance or its story clock.
import {busWomanPose} from './bus-woman-performance.js';
import {busWomanInstances} from '../game/bus-woman-presentation.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
const qmix=(a,b,t)=>{const q=mix(a,dot(a,b)<0?b.map(v=>-v):b,t),n=Math.hypot(...q)||1;return q.map(v=>v/n);};
const blend=(a,b,t)=>({translation:mix(a.translation,b.translation,t),rotation:qmix(a.rotation,b.rotation,t)});
const delta=(a,b)=>({translation:b.translation.map((v,i)=>v-a.translation[i]),rotation:qm(inverse(a.rotation),b.rotation)});
let cache=null;

export function busWomanExteriorDescriptor({timeSec=0,reducedMotion=false,conversation=null}={}){
  // A slow out-and-back breath avoids a four-second pose popping to frame zero.
  const t=reducedMotion?0:Math.floor(Math.max(0,timeSec)*30)/30;
  const seconds=reducedMotion?2:2-2*Math.cos(t*Math.PI/9);
  const weight=clamp(conversation?.weight??(conversation?.active?1:0));
  const speech=reducedMotion?0:clamp(conversation?.speakingWeight??(conversation?.speaking?1:0));
  const headYaw=clamp(conversation?.headYaw,-.48,.48);
  const key=[t,weight,speech,headYaw,reducedMotion].join(':');
  if(cache?.key===key)return cache.value;
  const base=busWomanPose('wait',seconds),attention=busWomanPose('acknowledge',2.4,{acknowledgeYaw:headYaw});
  const joints={};
  for(const name of Object.keys(base.joints)){
    const posed=blend(base.joints[name],attention.joints[name],weight);
    if(name==='jaw'&&speech){
      const angle=(.009+.018*Math.max(0,Math.sin(t*9.7)*Math.sin(t*3.1)))*speech;
      posed.rotation=qm(posed.rotation,[-Math.sin(angle/2),0,0,Math.cos(angle/2)]);
    }
    joints['bus_woman_'+name]=delta(base.joints[name],posed);
  }
  for(const name of['bag','ticket'])joints['bus_woman_'+name+'_joint']=delta(base.attachments[name],blend(base.attachments[name],attention.attachments[name],weight));
  const value={clip:'bus_woman_wait',time:seconds,loop:false,joints};cache={key,value};return value;
}

export function busWomanExteriorInstances(instance,options={}){
  const character=busWomanExteriorDescriptor(options);
  return busWomanInstances(instance,{mode:'wait',seconds:character.time}).map(part=>({...part,character}));
}
