// What the torch catches of an apparition close up. All three states keep
// their own treatment; in variant 11 (lit by something other than the
// emergency beat, which with the torch on is the usual case) a few of the
// existing scintillating specks glint as wet flesh where the beam lands on an
// open wound. Coverage and discard are untouched, so the figure is still the
// residual charge; the glint is an overlay on it, and each glint lasts as long
// as the speck it lands on.
//
// The wounds are anchored in the mesh's own coordinates, so they move with
// the figure and never swim. The emergency crowd never comes nearer than
// 2.2m and in practice backs off to about 3m (measured in the hall), so the
// glint is well along by then: FULL is set inside that, START well outside it.
export const APPARITION_GORE = Object.freeze({ startM: 4.6, fullM: 2.7 });

export const APPARITION_GORE_FIELD_GLSL = `
const float GORE_START_M=${APPARITION_GORE.startM.toFixed(2)},GORE_FULL_M=${APPARITION_GORE.fullM.toFixed(2)};
float goreHash(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float goreNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(goreHash(i),goreHash(i+vec3(1,0,0)),f.x),mix(goreHash(i+vec3(0,1,0)),goreHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(goreHash(i+vec3(0,0,1)),goreHash(i+vec3(1,0,1)),f.x),mix(goreHash(i+vec3(0,1,1)),goreHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// Above zero is an open wound; larger is deeper. About a third of the body
// at full closeness, in ~40cm patches with ragged edges.
float goreDepth(vec3 local,float near){
  float creep=(1.0-uReducedMotion)*.035*sin(uTimeSec*.45+local.y*3.0);
  float field=.62*goreNoise(local*2.6)+.26*goreNoise(local*5.3+7.1)+.12*goreNoise(local*15.0+3.7);
  return mix(.12,.46,near)+creep-field;
}
float goreNear(vec3 world){return 1.0-smoothstep(GORE_FULL_M,GORE_START_M,length(uEye-world));}`;

// Flesh colour for this speck, and its weight (0 or 1). Zero off the beam,
// off a wound, and for most specks even on one.
export const APPARITION_GLINT_GLSL = `
vec4 apparitionGlint(vec3 local,vec3 world,vec3 normal,float near,vec2 cell){
  vec3 eyeDir=normalize(uEye-world);
  vec3 n=dot(normal,eyeDir)<0.0?-normal:normal;
  vec3 toL=uTorchOrigin-world;float dl=length(toL);vec3 l=toL/max(dl,1e-4);
  float beam=torchAngular(world-uTorchOrigin,uForward,uTorchRight,uTorchUp,uTorchCone,uTorchSpill)*uLight;
  float fall=torchFalloff(dl,uTorchReach);
  float lit=near*smoothstep(.015,.22,beam*fall);
  float depth=goreDepth(local,near);
  // A second draw on the speck's own scintillation cell picks the glints.
  float pick=fract(sin(dot(cell,vec2(39.3468,11.1351)))*24634.6345);
  float weight=step(pick,.45*smoothstep(-.02,.03,depth)*lit);
  vec3 albedo;float wet;
  if(depth<0.0){albedo=vec3(.80,.74,.64);wet=.45;}                       // the lifted lip
  else if(depth<.05){albedo=vec3(.50,.40,.20);wet=.6;}                   // fat
  else{albedo=mix(vec3(.12,.02,.025),vec3(.42,.10,.075),goreNoise(local*20.0));wet=1.0;}   // wet muscle
  float lamp=torchReceive(max(dot(n,l),0.0)*fall*3.0*beam,uTorchShoulder);
  float spec=pow(max(dot(n,normalize(l+eyeDir)),0.0),24.0)*wet*beam*fall*2.5;
  spec=spec/(1.0+uTorchShoulder*spec);
  return vec4(albedo*(uAmbientColor*uAmbientIntensity*1.5+uTorchColor*lamp)*1.4+uTorchColor*spec,weight);
}`;
