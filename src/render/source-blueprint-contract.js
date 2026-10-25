// Source's cyanotype study is a material direction, not a blue screen grade.
// Physical supports keep their actual depths, shading and pigment coverage.
// The original study's hue-inference proxy is deliberately not reproduced.
export const SOURCE_BLUEPRINT=Object.freeze({
  version:1,
  reference:'artifacts/source-palette-study/variants/cyanotype-middle.jpg',
  stock:'#16334a',ink:Object.freeze(['#b1cdd6','#7da8b9']),
  registration:'#426f89',
  airLow:Object.freeze([.0045,.013,.022]),airHigh:Object.freeze([.0018,.0055,.011]),
  contour:Object.freeze([.32,.50,.58]),
  // Display inks, calibrated AFTER the existing full recording decision.
  // The physical navy albedo was otherwise quantised into the tube's almost
  // black green shadow ink. These never become material emission or alter bits.
  recordedDark:Object.freeze([.026,.075,.125]),
  recordedLight:Object.freeze([.70,.86,.93]),
  metresPerTile:8,minorRegistrationM:1,majorRegistrationM:4,
  stockFactor:Object.freeze([1,1,1,1]),
});
export const SOURCE_BLUEPRINT_PRINT_SURFACE=Object.freeze({version:1,coverage:'baseColorAlpha',
  polarity:'light-on-dark',process:'source-blueprint-fragments',emission:'none'});

// A development A/B switch, read before the resident map is first installed.
// It neither requires nor starts the optional material generator.
export function sourceBlueprintEnabled(search=globalThis.location?.search||''){
  return new URLSearchParams(search).get('sourceBlueprint')!=='0';
}

export function sourceBlueprintRegistrationMarks(){
  return Array.from({length:7},(_,i)=>({metres:i+1,major:(i+1)%4===0,
    coverage:(i+1)%4===0?.22:.10,widthM:(i+1)%4===0?.025:.0125}));
}

const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(n)?n:lo));
const smooth=(lo,hi,n)=>{const x=clamp((n-lo)/(hi-lo));return x*x*(3-2*x);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function sourceBlueprintDepthContour(center,neighbours){
  if(!Number.isFinite(center)||center<0||!Array.isArray(neighbours))return 0;
  const gap=Math.max(0,...neighbours.filter(Number.isFinite).map(n=>n-center));
  const tolerance=Math.max(.08,center*.018);
  return smooth(tolerance,tolerance*3,gap);
}

export function sourceBlueprintRecordedInk(original,{enabled=false,pigmentKind=0,packedDepth=1,packedFar=0,capturedLight=0,light=false}={}){
  const atmosphere=1-smooth(packedFar+.00005,packedFar+.0006,packedDepth);
  const role=Math.max(pigmentKind>=1.5?1:0,atmosphere);
  return mix(original,light?SOURCE_BLUEPRINT.recordedLight:SOURCE_BLUEPRINT.recordedDark,
    (enabled?1:0)*role*clamp(capturedLight));
}
// CPU reference for the small acquisition hook, used to test semantic limits.
// RGB is the already shaded actual material; no channel classifies its role.
export function sourceBlueprintResolve({rgb=[0,0,0],alpha=1,metres=0,contour=0,horizon=.5,enabled=true}={}){
  if(!enabled)return [...rgb];
  const a=clamp(alpha),d=Math.max(0,Number(metres)||0),air=mix(SOURCE_BLUEPRINT.airLow,SOURCE_BLUEPRINT.airHigh,clamp(horizon));
  let col=rgb.map((v,i)=>clamp(v)+air[i]*(1-a));
  const luma=rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  // Exact zero is the renderer's retained absence, including black cores. It
  // must not acquire a blue surface or pale rim merely because it has depth.
  const present=a>=.001&&Math.max(...rgb)>=.000001?1:0;
  const haze=smooth(24,180,d)*.18*present;col=mix(col,air,haze);
  const ink=clamp(contour)*present*(1-smooth(35,140,d))*(1-smooth(.08,.38,luma))*.035;
  return col.map((v,i)=>clamp(v+SOURCE_BLUEPRINT.contour[i]*ink));
}

const v3=value=>`vec3(${value.map(v=>Number(v).toFixed(5)).join(',')})`;
export const SOURCE_BLUEPRINT_RECORDING_GLSL=`
vec3 sourceBlueprintRecordedInk(vec3 original,vec2 context,float pigmentKind,float packedDepth,float capturedLight,float lightEndpoint){
  // Explicit Source print or the actual far-depth atmosphere. Ordinary wood,
  // cases, steel and nearby threats retain their original recording inks.
  float atmosphere=1.0-smoothstep(context.y+.00005,context.y+.0006,packedDepth);
  float role=max(step(1.5,pigmentKind),atmosphere);
  float amount=clamp(context.x,0.0,1.0)*role*clamp(capturedLight,0.0,1.0);
  vec3 ink=mix(${v3(SOURCE_BLUEPRINT.recordedDark)},${v3(SOURCE_BLUEPRINT.recordedLight)},step(.5,lightEndpoint));
  return mix(original,ink,amount);
}
`;
export const SOURCE_BLUEPRINT_ACQUISITION_GLSL=`
float sourceBlueprintDepthContour(float centre,vec4 neighbours){
  // Only the nearer fragment receives a contour; empty space cannot grow a
  // false support, and an occluded surface never gets outlined through a wall.
  float gap=max(0.0,max(max(neighbours.x,neighbours.y),max(neighbours.z,neighbours.w))-centre);
  float tolerance=max(.08,centre*.018);
  return smoothstep(tolerance,tolerance*3.0,gap);
}
vec3 sourceBlueprintResolve(vec3 shaded,float alpha,float metres,float contour,float horizon){
  float a=clamp(alpha,0.0,1.0),present=step(.001,a)*step(.000001,max(shaded.r,max(shaded.g,shaded.b)));
  vec3 air=mix(${v3(SOURCE_BLUEPRINT.airLow)},${v3(SOURCE_BLUEPRINT.airHigh)},clamp(horizon,0.0,1.0));
  vec3 col=clamp(shaded,0.0,1.0)+air*(1.0-a);
  col=mix(col,air,smoothstep(24.0,180.0,metres)*.18*present);
  float luma=dot(shaded,vec3(.2126,.7152,.0722));
  float ink=clamp(contour,0.0,1.0)*present*(1.0-smoothstep(35.0,140.0,metres))*(1.0-smoothstep(.08,.38,luma))*.035;
  return clamp(col+${v3(SOURCE_BLUEPRINT.contour)}*ink,0.0,1.0);
}
`;
