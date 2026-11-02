// A world material, not a skin texture. The fixed oblique plane is measured in
// authored metres. It has no actor origin, UV, camera bearing or animation time.
// Moving/deforming HUSH only changes which part of this field its volume masks.
export const HUSH_COSMOS=Object.freeze({
  revision:'world-fixed-cosmos-1',
  plane:Object.freeze([[1,0,.41421356237],[0,1,.27182818285]].map(Object.freeze)),
  starPeriodM:.22,supernovaPeriodM:1.9,
  darkInk:Object.freeze([.006,.001,.021]),
  violetInk:Object.freeze([.30,.055,.72]),
  stellarInk:Object.freeze([.96,.76,1]),
});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const fract=x=>x-Math.floor(x);
function hash(cell,seed=0){
  let h=(Math.imul(cell[0]|0,0x8da6b343)^Math.imul(cell[1]|0,0xd8163841)^(seed>>>0))>>>0;
  h=Math.imul(h^(h>>>16),0x7feb352d)>>>0;
  h=Math.imul(h^(h>>>15),0x846ca68b)>>>0;
  return ((h^(h>>>16))&0xffffff)/16777215;
}
function noise(p,seed){
  const c=p.map(Math.floor),f=p.map(fract).map(x=>x*x*(3-2*x));
  return mix(mix(hash(c,seed),hash([c[0]+1,c[1]],seed),f[0]),
    mix(hash([c[0],c[1]+1],seed),hash([c[0]+1,c[1]+1],seed),f[0]),f[1]);
}
export function hushCosmosCoordinates(world){
  if(!Array.isArray(world)&&!ArrayBuffer.isView(world))throw TypeError('Cosmos requires an authored world point.');
  if(world.length<3||!Array.from(world).slice(0,3).every(Number.isFinite))throw TypeError('Cosmos world point must be finite.');
  return [world[0]+world[2]*HUSH_COSMOS.plane[0][2],world[1]+world[2]*HUSH_COSMOS.plane[1][2]];
}
export function hushCosmosField(world){
  const uv=hushCosmosCoordinates(world),cloud=noise(uv.map(x=>x*.63),31)*.57
    +noise(uv.map((x,i)=>x*1.43+[7.1,-3.8][i]),73)*.29
    +noise(uv.map((x,i)=>x*3.17+[-4.2,9.3][i]),191)*.14;
  const veil=smooth(.24,.76,cloud),s=uv.map(x=>x/HUSH_COSMOS.starPeriodM),sc=s.map(Math.floor),sf=s.map(fract),
    centre=[.22+.56*hash(sc,101),.22+.56*hash(sc,307)],dx=sf[0]-centre[0],dy=sf[1]-centre[1],r2=dx*dx+dy*dy,
    star=hash(sc,997)>.42?Math.exp(-r2/.0075)*(.52+.48*hash(sc,1201)):0,
    starMist=hash(sc,997)>.42?Math.exp(-r2/.035)*.027:0,
    q=uv.map(x=>x/HUSH_COSMOS.supernovaPeriodM),qc=q.map(Math.floor),qf=q.map(fract),
    bx=qf[0]-(.24+.52*hash(qc,2003)),by=qf[1]-(.24+.52*hash(qc,2017)),br2=bx*bx+by*by,
    burstCore=Math.exp(-br2/.00016),burstHalo=Math.exp(-br2/.009)*.17,
    spokes=Math.exp(-Math.min(Math.abs(bx),Math.abs(by))*150)*Math.exp(-br2/.024)*.29,
    ring=Math.exp(-Math.pow(Math.sqrt(br2)-.072,2)/.000045)*.085,
    burst=clamp(burstCore+spokes),hot=clamp(Math.max(star,burst)*1.1),
    purple=.018+veil*.16+starMist+burstHalo+ring;
  const color=[.003+purple*.33,.0005+purple*.065,.009+purple];
  for(let i=0;i<3;i++)color[i]=clamp(color[i]+star*[.72,.50,1][i]+burst*[1,.70,.96][i]);
  return {color,heat:hot,veil,star,burst};
}

// The acquisition pass chooses a mark. These inks only colour that decision;
// repeated glass/POST preservation is idempotent, and never adds another mark.
export function hushCosmosRecordedInk(recorded,heat=0){
  const mark=Math.max(...recorded)>.08?1:0,h=clamp(heat);
  return HUSH_COSMOS.darkInk.map((v,i)=>mix(v,mix(HUSH_COSMOS.violetInk[i],HUSH_COSMOS.stellarInk[i],h),mark));
}
export function hushCosmosSignalMaterial(signal){
  const s=clamp(signal),heat=smooth(.28,.85,s),low=[.42,.095,1],high=[.96,.76,1];
  return {color:low.map((v,i)=>mix(v,high[i],heat)*s),heat};
}

// Keep this small CPU mirror and production GLSL together. Integer hash inputs
// are fixed world cells; every stochastic detail is spatial, never temporal.
export const HUSH_COSMOS_GLSL=`
precision highp int;
uint hushCosmosHashBits(ivec2 cell,uint seed){
 uint h=uint(cell.x)*0x8da6b343u^uint(cell.y)*0xd8163841u^seed;
 h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;return h^(h>>16u);
}
float hushCosmosHash(ivec2 c,uint seed){return float(hushCosmosHashBits(c,seed)&0xffffffu)/16777215.0;}
float hushCosmosNoise(vec2 p,uint seed){
 ivec2 c=ivec2(floor(p));vec2 f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hushCosmosHash(c,seed),hushCosmosHash(c+ivec2(1,0),seed),f.x),mix(hushCosmosHash(c+ivec2(0,1),seed),hushCosmosHash(c+ivec2(1,1),seed),f.x),f.y);
}
vec4 hushCosmosField(vec3 world){
 vec2 uv=vec2(world.x+world.z*.41421356237,world.y+world.z*.27182818285);
 float cloud=hushCosmosNoise(uv*.63,31u)*.57+hushCosmosNoise(uv*1.43+vec2(7.1,-3.8),73u)*.29+hushCosmosNoise(uv*3.17+vec2(-4.2,9.3),191u)*.14;
 float veil=smoothstep(.24,.76,cloud);vec2 s=uv/.22;ivec2 sc=ivec2(floor(s));
 vec2 d=fract(s)-(vec2(.22)+.56*vec2(hushCosmosHash(sc,101u),hushCosmosHash(sc,307u)));
 float r2=dot(d,d),exists=step(.42,hushCosmosHash(sc,997u));
 float star=exists*exp(-r2/.0075)*(.52+.48*hushCosmosHash(sc,1201u)),starMist=exists*exp(-r2/.035)*.027;
 vec2 q=uv/1.9;ivec2 qc=ivec2(floor(q));vec2 b=fract(q)-(vec2(.24)+.52*vec2(hushCosmosHash(qc,2003u),hushCosmosHash(qc,2017u)));
 float br2=dot(b,b),burstCore=exp(-br2/.00016),burstHalo=exp(-br2/.009)*.17;
 float spokes=exp(-min(abs(b.x),abs(b.y))*150.0)*exp(-br2/.024)*.29;
 float ring=exp(-pow(sqrt(br2)-.072,2.0)/.000045)*.085;
 float burst=clamp(burstCore+spokes,0.0,1.0),heat=clamp(max(star,burst)*1.1,0.0,1.0),purple=.018+veil*.16+starMist+burstHalo+ring;
 vec3 color=vec3(.003,.0005,.009)+vec3(.33,.065,1.0)*purple+star*vec3(.72,.50,1.0)+burst*vec3(1.0,.70,.96);
 return vec4(clamp(color,0.0,1.0),heat);
}
`;
export const HUSH_COSMOS_INK_GLSL=`
vec4 hushCosmosSignalMaterial(float signal){
 float s=clamp(signal,0.0,1.0),heat=smoothstep(.28,.85,s);
 return vec4(mix(vec3(.42,.095,1.0),vec3(.96,.76,1.0),heat)*s,heat);
}
vec3 hushCosmosRecordedInk(vec3 recorded,float heat){
 float mark=step(.08,max(recorded.r,max(recorded.g,recorded.b)));
 vec3 light=mix(vec3(.30,.055,.72),vec3(.96,.76,1.0),clamp(heat,0.0,1.0));
 return mix(vec3(.006,.001,.021),light,mark);
}
`;

// The secondary Three.js desktop surface must use the same world field after
// morph and skin evaluation. This hook changes material only, never pose/root.
export function installHushCosmosMaterial(material){
  if(!material||typeof material!=='object')throw TypeError('A Hush material is required.');
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);
    if(!shader.vertexShader.includes('#include <project_vertex>')||!shader.fragmentShader.includes('#include <color_fragment>'))
      throw Error('The Hush material no longer has the measured skin/projection hooks.');
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHushCosmosWorld;')
      .replace('#include <project_vertex>',`#include <project_vertex>
vec4 hushWorld=vec4(transformed,1.0);
#ifdef USE_BATCHING
hushWorld=batchingMatrix*hushWorld;
#endif
#ifdef USE_INSTANCING
hushWorld=instanceMatrix*hushWorld;
#endif
vHushCosmosWorld=(modelMatrix*hushWorld).xyz;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vHushCosmosWorld;\n${HUSH_COSMOS_GLSL}`)
      .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=hushCosmosField(vHushCosmosWorld).rgb;');
  };
  material.customProgramCacheKey=()=>HUSH_COSMOS.revision;
  material.userData={...material.userData,hushCosmos:{revision:HUSH_COSMOS.revision,space:'authored-world-metres',clock:false}};
  material.toneMapped=false;material.fog=false;material.needsUpdate=true;
  return material;
}
