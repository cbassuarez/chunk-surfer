// AUDIOCORP FL–1: one carried reflector, shared by every physical light pass.
// Relative scene units, not a claim of measured lux. See the reference ledger.
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
export const TORCH_CARRIED_OFFSET=Object.freeze({right:.12,down:.08});
export function resolveTorchFrame({eye=[0,0,0],yaw=0,pitch=0,yawOffset=0}={}){
  const cameraYaw=finite(yaw,0),lampYaw=cameraYaw+finite(yawOffset,0),lampPitch=finite(pitch,0);
  const sy=Math.sin(lampYaw),cy=Math.cos(lampYaw),sp=Math.sin(lampPitch),cp=Math.cos(lampPitch);
  return {origin:[finite(eye[0],0)+Math.cos(cameraYaw)*.12,finite(eye[1],0)-.08,finite(eye[2],0)+Math.sin(cameraYaw)*.12],
    forward:[sy*cp,sp,-cy*cp],right:[cy,0,sy],up:[-sy*sp,cp,cy*sp],yaw:lampYaw,pitch:lampPitch};
}
export function normalizeTorchOptics(torch={}){
  const coneInner=clamp(finite(torch.coneInner,.88),-.99,.9997);
  return {reach:clamp(finite(torch.reach,1),.01,4),coneInner,
    coneOuter:clamp(finite(torch.coneOuter,.94),coneInner+.0001,.9999),
    spill:clamp(finite(torch.spill,.05),0,.12),shoulder:clamp(finite(torch.shoulder,.65),0,2)};
}
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export function torchAngularSample({axis=1,azimuth=0,coneInner=.88,coneOuter=.94,spill=.05}={}){
  const p=normalizeTorchOptics({coneInner,coneOuter,spill});
  const a=clamp(finite(axis,1),-1,1),q=Math.max(0,(1-a)/Math.max(.0001,1-p.coneOuter));
  const edge=smooth(p.coneInner-.025,p.coneInner+.012,a);
  const core=edge/(1+.6*q+.2*q*q);
  const corona=.28*smooth(p.coneInner-.045,p.coneOuter-.012,a);
  const surround=p.spill*smooth(Math.min(.30,p.coneInner-.06),p.coneInner-.02,a);
  const radius=Math.sqrt(Math.max(0,(1-a)/Math.max(.0001,1-p.coneInner)));
  // Fixed low-order reflector variation; no pixel noise, clock or animated dirt.
  const irregular=1+.022*Math.sin(finite(azimuth,0)*3+.4)*smooth(.18,.85,radius)*(1-smooth(1.05,1.4,radius));
  return (core+corona+surround)*irregular;
}
export function torchFalloffSample(distanceM,reach=1){
  const d=Math.max(0,finite(distanceM,0)),r=normalizeTorchOptics({reach}).reach;
  return (.45+.55*smooth(0,1.4,d))/(1+.10*d/r+.045*d*d/(r*r));
}
export function torchReceiveSample(value,shoulder=.65){const v=Math.max(0,finite(value,0));return v/(1+normalizeTorchOptics({shoulder}).shoulder*v);}
export const TORCH_OPTICS_GLSL=`
float torchAngular(vec3 fromLamp,vec3 forward,vec3 right,vec3 up,vec2 cone,float spill){
  vec3 ray=normalize(fromLamp);float axis=clamp(dot(ray,forward),-1.0,1.0);
  float q=max(0.0,(1.0-axis)/max(.0001,1.0-cone.y));
  float core=smoothstep(cone.x-.025,cone.x+.012,axis)/(1.0+.6*q+.2*q*q);
  float corona=.28*smoothstep(cone.x-.045,cone.y-.012,axis);
  float surround=spill*smoothstep(min(.30,cone.x-.06),cone.x-.02,axis);
  float radius=sqrt(max(0.0,(1.0-axis)/max(.0001,1.0-cone.x)));
  // The third harmonic of the reflector's azimuth, evaluated without a
  // per-fragment atan/sin pair. The pole is suppressed by the radial envelope.
  vec2 transverse=vec2(dot(ray,right),dot(ray,up));
  vec2 d=transverse*inversesqrt(max(.000001,dot(transverse,transverse)));
  float trefoil=.921061*(3.0*d.y-4.0*d.y*d.y*d.y)+.389418*(4.0*d.x*d.x*d.x-3.0*d.x);
  float irregular=1.0+.022*trefoil*smoothstep(.18,.85,radius)*(1.0-smoothstep(1.05,1.4,radius));
  return (core+corona+surround)*irregular;
}
float torchFalloff(float distanceM,float reach){
  float d=max(0.0,distanceM),r=max(.01,reach);
  return (.45+.55*smoothstep(0.0,1.4,d))/(1.0+.10*d/r+.045*d*d/(r*r));
}
float torchReceive(float energy,float shoulder){float e=max(0.0,energy);return e/(1.0+max(0.0,shoulder)*e);}
`;
