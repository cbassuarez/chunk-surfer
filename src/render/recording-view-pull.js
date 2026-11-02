// The room's acquired image yields at the anatomical grip points. This changes
// neither the physical camera nor collision. Colour, depth and material tags
// are sampled at the same displaced location BEFORE final acquisition.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
export const RECORDING_VIEW_PULL=Object.freeze({
  maximumDisplacement:.058,minimumWorldDepth:.65,fullWorldDepth:.85,
  lowerLimit:.43,centralHalfWidth:.20,radiusX:.18,radiusY:.16,
  extraTargets:0,extraDraws:0,cameraMotion:false,
});
const emptySide=()=>({anchor:[0,0],pull:[0,0],strength:0});
export function normalizeRecordingViewPull(value){
  const side=row=>{
    const anchor=Array.from(row?.anchor||[]),pull=Array.from(row?.pull||[]);
    if(anchor.length!==2||pull.length!==2||![...anchor,...pull].every(Number.isFinite)
      ||anchor[0]<0||anchor[0]>1||anchor[1]<0||anchor[1]>RECORDING_VIEW_PULL.lowerLimit)return emptySide();
    const length=Math.hypot(...pull);if(length<.0001)return emptySide();
    return{anchor,pull:pull.map(n=>n/length),strength:clamp(row.strength)};
  };
  const enabled=value?.active===true&&Number(value.strength)>0,
    left=enabled?side(value.left):emptySide(),right=enabled?side(value.right):emptySide();
  return{active:enabled&&(left.strength>0||right.strength>0),strength:enabled?clamp(value.strength):0,
    phase:String(value?.phase||'absent'),seized:enabled&&value.seized===true,left,right};
}
function field(uv,side){
  if(side.strength<=0)return{shift:[0,0],gap:0};
  const dx=(uv[0]-side.anchor[0])/RECORDING_VIEW_PULL.radiusX,
    dy=(uv[1]-side.anchor[1])/RECORDING_VIEW_PULL.radiusY,
    local=Math.exp(-2.6*(dx*dx+dy*dy)),
    // A fixed central aperture and lower field retain ordinary inspection,
    // footing and instrument access. There is no global lens or head shake.
    aperture=smooth(.13,.23,Math.abs(uv[0]-.5))+(1-smooth(.12,.26,uv[1])),
    mask=local*(1-smooth(.30,.43,uv[1]))*Math.min(1,aperture)*side.strength,
    amount=RECORDING_VIEW_PULL.maximumDisplacement*mask,
    along=dx*side.pull[0]+dy*side.pull[1],across=dx*(-side.pull[1])+dy*side.pull[0],
    crease=Math.exp(-110*(along+.13)*(along+.13)-7*across*across);
  return{shift:side.pull.map(n=>n*amount),gap:crease*mask*.64};
}
// CPU diagnostic reference. depthAt returns actual view metres and is used for
// destination AND source exclusion, so a finger never gets pulled as a wall.
export function recordingViewPullSample(uv,value,{depthAt=()=>5}={}){
  const v=normalizeRecordingViewPull(value),original=[...uv];
  if(!v.active)return{uv:original,gap:0,amount:0};
  const near=smooth(.65,.85,depthAt(original));if(near<=0)return{uv:original,gap:0,amount:0};
  const a=field(original,v.left),b=field(original,v.right),gain=v.strength*near,
    candidate=original.map((n,k)=>clamp(n-(a.shift[k]+b.shift[k])*gain,.001,.999)),
    source=smooth(.65,.85,depthAt(candidate)),at=original.map((n,k)=>n+(candidate[k]-n)*source);
  return{uv:at,gap:clamp((a.gap+b.gap)*gain*source,0,.72),amount:Math.hypot(at[0]-uv[0],at[1]-uv[1])};
}

// Uniform anchors/directions use top-left UV, matching the actual hand helper.
// All conversion to WebGL's bottom-left image happens in this one function.
export const RECORDING_VIEW_PULL_GLSL=`
uniform vec4 uRecordingGripLeft;
uniform vec4 uRecordingGripRight;
uniform vec4 uRecordingPullDirections;
uniform float uRecordingViewPull;
float recordingWorldGate(vec2 uv){
  float packed=texture(uDepth,clamp(uv,vec2(.001),vec2(.999))).a;
  float metres=max(0.0,(1.0/max(packed,.000001)-1.0)/.14);
  return smoothstep(.65,.85,metres);
}
vec3 recordingGripField(vec2 uv,vec4 grip,vec2 direction){
  if(grip.z<=0.0)return vec3(0.0);
  vec2 relative=(uv-grip.xy)/vec2(.18,.16);
  float local=exp(-2.6*dot(relative,relative));
  float aperture=smoothstep(.13,.23,abs(uv.x-.5))+(1.0-smoothstep(.12,.26,uv.y));
  float mask=local*(1.0-smoothstep(.30,.43,uv.y))*min(1.0,aperture)*grip.z;
  float along=dot(relative,direction),across=dot(relative,vec2(-direction.y,direction.x));
  float crease=exp(-110.0*(along+.13)*(along+.13)-7.0*across*across);
  return vec3(direction*(.058*mask),crease*mask*.64);
}
vec3 recordingPulledImage(vec2 originalUv){
  if(uRecordingViewPull<=0.0)return vec3(originalUv,0.0);
  float near=recordingWorldGate(originalUv);if(near<=0.0)return vec3(originalUv,0.0);
  vec2 top=vec2(originalUv.x,1.0-originalUv.y);
  vec3 a=recordingGripField(top,uRecordingGripLeft,uRecordingPullDirections.xy);
  vec3 b=recordingGripField(top,uRecordingGripRight,uRecordingPullDirections.zw);
  float gain=uRecordingViewPull*near;
  vec2 candidate=clamp(top-(a.xy+b.xy)*gain,vec2(.001),vec2(.999));
  candidate=vec2(candidate.x,1.0-candidate.y);
  float source=recordingWorldGate(candidate);
  return vec3(mix(originalUv,candidate,source),clamp((a.z+b.z)*gain*source,0.0,.72));
}
`;
