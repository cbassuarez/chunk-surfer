// Source's opaque recording inks. These finishes change neither the acquired
// marks nor depth/collision; the authored glyph coverage keeps code silver.
export const SOURCE_FINISH=Object.freeze({none:0,bsod:1,silicon:2,bismuth:3});
export const SOURCE_CHUNK_ERROR_BYTE=249;
export const SOURCE_CHUNK_ERROR_TAG=SOURCE_CHUNK_ERROR_BYTE/255;
export function normalizeSourceFinish(value='bsod'){
  return Object.hasOwn(SOURCE_FINISH,value)?SOURCE_FINISH[value]:[0,1,2,3].includes(value)?value:1;
}
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const fract=n=>n-Math.floor(n);
export function sourcePrismaticInk({finish='silicon',world=[0,0,0],facing=1,pigment=0,light=true}={}){
  const mode=normalizeSourceFinish(finish),p=Array.from({length:3},(_,i)=>Number.isFinite(world?.[i])?world[i]:0),f=clamp(facing);
  const phase=mode===3
    ?(Math.floor((Math.abs(p[0])+Math.abs(p[2]))*3)+Math.floor(p[1]*5)+Math.floor(f*6))/18
    :p[0]*.028+p[1]*.018+p[2]*.035+(1-f)*1.6;
  const spectrum=[0,4,2].map(offset=>.015+.965*clamp(Math.abs(fract(phase+offset/6)*6-3)-1));
  if(!light)return spectrum.map(n=>n*.16);
  const sheen=mode===2?Math.pow(1-f,12)*.36:0;
  return spectrum.map((n,i)=>{const stock=n+(1-n)*sheen,silver=[.96,.985,1][i];return stock+(silver-stock)*clamp(pigment);});
}
export function sourceMaterialRecordedInk(original,{finish='none',pigmentKind=0,pigment=0,world=[0,0,0],facing=1,capturedLight=0,light=true}={}){
  if(normalizeSourceFinish(finish)<2||pigmentKind<1.5)return[...original];
  const ink=sourcePrismaticInk({finish,world,facing,pigment,light}),amount=clamp(capturedLight);
  return original.map((n,i)=>n+(ink[i]-n)*amount);
}
export function sourceFaultRecordedInk(original,rgb,{enabled=false,tag=0,capturedLight=0,light=true}={}){
  if(!enabled||Math.abs(Math.round(tag*255)-SOURCE_CHUNK_ERROR_BYTE)>.5)return[...original];
  const channels=Array.from({length:3},(_,i)=>Math.max(0,Number.isFinite(rgb?.[i])?rgb[i]:0));
  const peak=Math.max(.000001,...channels),amount=clamp(capturedLight);
  const ink=light?channels.map(n=>.005+.975*n/peak):[.001,.001,.003];
  return original.map((n,i)=>n+(ink[i]-n)*amount);
}
export const SOURCE_CHUNK_ERROR_GLSL=`
const float SOURCE_CHUNK_ERROR_TAG=249.0/255.0;
float sourceChunkErrorTag(float value){return 1.0-step(.5/255.0,abs(value-SOURCE_CHUNK_ERROR_TAG));}
`;
export const SOURCE_MATERIAL_FINISH_GLSL=SOURCE_CHUNK_ERROR_GLSL+`
vec3 sourcePrismaticInk(float finish,vec3 world,float facing,float pigment,float lightEndpoint){
  float f=clamp(facing,0.0,1.0);
  float phase=finish>2.5
    ?(floor((abs(world.x)+abs(world.z))*3.0)+floor(world.y*5.0)+floor(f*6.0))/18.0
    :dot(world,vec3(.028,.018,.035))+(1.0-f)*1.6;
  vec3 spectrum=.015+.965*clamp(abs(fract(vec3(phase)+vec3(0.0,4.0,2.0)/6.0)*6.0-3.0)-1.0,0.0,1.0);
  if(lightEndpoint<.5)return spectrum*.16;
  float sheen=finish<2.5?pow(1.0-f,12.0)*.36:0.0;
  return mix(mix(spectrum,vec3(1.0),sheen),vec3(.96,.985,1.0),clamp(pigment,0.0,1.0));
}
vec3 sourceMaterialRecordedInk(vec3 original,float finish,float kind,float pigment,vec3 world,float facing,float capturedLight,float lightEndpoint){
  float amount=step(1.5,finish)*step(1.5,kind)*clamp(capturedLight,0.0,1.0);
  return mix(original,sourcePrismaticInk(finish,world,facing,pigment,lightEndpoint),amount);
}
vec3 sourceFaultRecordedInk(vec3 original,vec3 raw,float finish,float tag,float capturedLight,float lightEndpoint){
  float amount=step(.5,finish)*sourceChunkErrorTag(tag)*clamp(capturedLight,0.0,1.0);
  vec3 fault=.005+.975*max(raw,vec3(0.0))/max(.000001,max(raw.r,max(raw.g,raw.b)));
  return mix(original,mix(vec3(.001,.001,.003),fault,step(.5,lightEndpoint)),amount);
}
`;
