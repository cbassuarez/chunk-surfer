import {decodePrintedSurface,PRINTED_SURFACE_SOURCE_ROUTE_FAMILY} from './printed-surface.js';

// These are the eight authored supports in the approved Source II view.
// Native/portal/void instances retain their mesh material; height is not identity.
export const SOURCE_SILVER_WALKWAY_SURFACES=Object.freeze([
  'wrong-entry','wrong-entry-throat','wrong-ground-cross','wrong-ground-west',
  'wrong-ground-east','wrong-ground-north','wrong-ground-branch','wrong-east-stair-foot',
]);
const routeIds=new Set(SOURCE_SILVER_WALKWAY_SURFACES);
export const SOURCE_SILVER_WALKWAY_PRINT_SURFACE=Object.freeze({version:1,
  coverage:'baseColorAlpha',polarity:'light-on-dark',process:'source-silver-fracture',
  emission:'none',family:PRINTED_SURFACE_SOURCE_ROUTE_FAMILY});
export function sourceSilverWalkwaySurface(piece){
  const row=piece?.descriptor||piece;
  return piece?.kind==='surface'&&piece.region==='wrong-return'
    &&(row?.chartId??0)===0&&routeIds.has(row?.id);
}

// Source III's own silver: the same stock as the eight II supports, under its
// own descriptor. The catch's walkable route — the stage floors, the wrong
// spokes, pockets and return arcs, the refuge pads and the satellite ways —
// keeps the silver look without borrowing the II name. The route family stays
// shared so the one walkway shader binds both; the process name is what a
// code reader sees, and it says catch.
export const SOURCE_SILVER_CATCH_ROLES=Object.freeze(['transfer','catch','refuge','return-arm','wrong-catch','wrong-catch-neck','wrong-catch-return','island-causeway','island']);
const catchRoles=new Set(SOURCE_SILVER_CATCH_ROLES);
export const SOURCE_SILVER_CATCH_PRINT_SURFACE=Object.freeze({version:1,
  coverage:'baseColorAlpha',polarity:'light-on-dark',process:'source-silver-catch',
  emission:'none',family:PRINTED_SURFACE_SOURCE_ROUTE_FAMILY});
export function sourceSilverCatchSurface(piece){
  const row=piece?.descriptor||piece;
  return piece?.kind==='surface'&&piece.region==='catch'
    &&(row?.chartId??0)===0&&catchRoles.has(row?.role);
}
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(n)?n:0));
const fract=n=>n-Math.floor(n);
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const silver=[.96,.985,1];
export function sourceSyntaxHueSaturation(rgb,{linear=false}={}){
  const c=Array.from({length:3},(_,i)=>{
    const v=clamp(rgb?.[i]);return linear?(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055):v;
  });
  const hi=Math.max(...c),lo=Math.min(...c),delta=hi-lo;
  if(delta<.000001)return[0,0];
  const hue=hi===c[0]?(c[1]-c[2])/delta:hi===c[1]?(c[2]-c[0])/delta+2:(c[0]-c[1])/delta+4;
  return[fract(hue/6+1),delta/Math.max(hi,.000001)];
}
export function sourceSyntaxRecordedColor(hs=[0,0]){
  const hue=fract(Number.isFinite(hs?.[0])?hs[0]:0),saturation=clamp(hs?.[1]);
  return[0,4,2].map((offset,i)=>{
    const channel=.98*clamp(Math.abs(fract(hue+offset/6)*6-3)-1);
    return silver[i]+(channel-silver[i])*saturation;
  });
}
export function sourceSilverWalkwayInk({world=[0,0,0],pigment=0,syntaxHS=[0,0],light=true}={}){
  if(!light)return[.005,.009,.018];
  const x=(Number.isFinite(world?.[0])?world[0]:0)*.39,z=(Number.isFinite(world?.[2])?world[2]:0)*.31;
  const hash=fract(Math.sin(Math.floor(x)*127.1+Math.floor(z)*311.7)*43758.5453);
  const seam=(1-smooth(.025,.065,Math.min(fract(x),fract(z))))*(hash>=.38?.8:0);
  const code=sourceSyntaxRecordedColor(syntaxHS),amount=clamp(pigment);
  return[.58,.70,.82].map((v,i)=>{
    const stock=v+([.55,.018,.89][i]-v)*seam;return stock+(code[i]-stock)*amount;
  });
}
export function sourceWalkwayRecordedInk(original,{finish='none',tag=0,world=[0,0,0],
  syntaxHS=[0,0],capturedLight=0,light=true,occluded=false}={}){
  const surface=decodePrintedSurface(tag);
  if(occluded||!(finish==='silicon'||finish===2||finish==='bismuth'||finish===3)||surface.family!==PRINTED_SURFACE_SOURCE_ROUTE_FAMILY)return[...original];
  const ink=sourceSilverWalkwayInk({world,pigment:surface.coverage,syntaxHS,light}),amount=clamp(capturedLight);
  return original.map((v,i)=>v+(ink[i]-v)*amount);
}

// Albedo sampling is linear because the physical print uses SRGB8_ALPHA8.
// Store display-space HS in the existing mark GB channels before illumination.
export const SOURCE_WALKWAY_MARK_GLSL=`
vec2 sourceSyntaxHueSaturation(vec3 linearRgb){
  vec3 v=clamp(linearRgb,0.0,1.0);
  v=mix(v*12.92,1.055*pow(v,vec3(1.0/2.4))-.055,step(vec3(.0031308),v));
  float hi=max(v.r,max(v.g,v.b)),lo=min(v.r,min(v.g,v.b)),delta=hi-lo;
  if(delta<.000001)return vec2(0.0);
  float h=hi==v.r?(v.g-v.b)/delta:hi==v.g?(v.b-v.r)/delta+2.0:(v.r-v.g)/delta+4.0;
  return vec2(fract(h/6.0+1.0),delta/max(hi,.000001));
}
`;
export const SOURCE_WALKWAY_FINISH_GLSL=`
vec3 sourceSyntaxRecordedColor(vec2 hs){
  vec3 hue=.98*clamp(abs(fract(vec3(hs.x)+vec3(0.0,4.0,2.0)/6.0)*6.0-3.0)-1.0,0.0,1.0);
  return mix(vec3(.96,.985,1.0),hue,clamp(hs.y,0.0,1.0));
}
vec3 sourceWalkwayRecordedInk(vec3 original,float finish,vec4 material,vec3 world,float capturedLight,float lightEndpoint){
  float amount=step(1.5,finish)
    *printedSurfaceSourceRoute(material.a)*clamp(capturedLight,0.0,1.0);
  vec3 ink=vec3(.005,.009,.018);
  if(lightEndpoint>.5){
    vec2 cells=world.xz*vec2(.39,.31);
    float cellHash=fract(sin(dot(floor(cells),vec2(127.1,311.7)))*43758.5453);
    float seam=(1.0-smoothstep(.025,.065,min(fract(cells.x),fract(cells.y))))*step(.38,cellHash)*.8;
    vec3 stock=mix(vec3(.58,.70,.82),vec3(.55,.018,.89),seam);
    ink=mix(stock,sourceSyntaxRecordedColor(material.gb),printedSurfaceCoverage(material.a));
  }
  return mix(original,ink,amount);
}
`;
