// Source lettering is a separate, depth-tested image after the world's print.
// Its meshes, UVs and strings remain authored world geometry, never billboards.
import {normalizeSourceRestFaculties,sourceRestFacultyVisibility,SOURCE_REST_FACULTIES_GLSL} from './source-rest-faculties.js';
import {SOURCE_MESH_PORTAL_CLIP_GLSL} from './source-mesh-portals.js';
import {SOURCE_SURROUNDINGS_VISIBILITY_GLSL} from './source-surroundings-visibility.js';
import {SOURCE_SURROUNDINGS_PRESSURE_GLSL} from './source-surroundings-pressure.js';

export const SOURCE_CODE_LIFT_METRES=.02;
export const SOURCE_CODE_PROCESSES=Object.freeze(['source-fragments','source-blueprint-fragments','source-silver-fracture','primordial Source clauses']);
const processes=new Set(SOURCE_CODE_PROCESSES),clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
export function sourceCodeMaterialEligible(primitive={}){
  const print=primitive.printedSurface;
  return !!print&&print.coverage==='baseColorAlpha'&&print.sampling!=='area'
    &&processes.has(print.process)&&!Array.isArray(primitive.materialColor)
    &&primitive.colorClass!=='page'&&primitive.portrait!==true;
}
const noSkins=Object.freeze([]),frontSkin=Object.freeze([SOURCE_CODE_LIFT_METRES]),
  faultSkins=Object.freeze([SOURCE_CODE_LIFT_METRES,-SOURCE_CODE_LIFT_METRES]);
// Flat fault sheets have two fixed world-space ink skins. Their authored
// normals and geometry never turn toward the viewer or change with the clock.
export function sourceCodePhysicalLifts(primitive={}){
  if(!sourceCodeMaterialEligible(primitive))return noSkins;
  return primitive.materialRole==='source-chunk-error'?faultSkins:frontSkin;
}
export function sourceCodeTextEligible(instance={}){
  return !Array.isArray(instance.materialColor)&&instance.colorClass!=='page'
    &&String(instance.text||instance.source?.text||'').trim().length>0;
}
export function sourceCodeStock(primitive={}, {linear=true}={}){
  const stock=primitive.sourceCodeStock||
    (primitive.printedSurface?.polarity==='light-on-dark'?[0,0,170/255]:[214/255,217/255,208/255]);
  return Array.from({length:3},(_,index)=>{
    const value=clamp(stock[index]);return linear?(value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4)):value;
  });
}
export function sourceCodeVisibility(faculties=null,uv=[.5,.5],depth=1){
  return sourceRestFacultyVisibility(uv,depth,normalizeSourceRestFaculties(faculties));
}
export function sourceCodeDepthVisible(glyphViewDepth,packedSceneDepth,{pressureDepth=Infinity,pressureCoverage=0}={}){
  if(!(glyphViewDepth>0&&Number.isFinite(glyphViewDepth)))return false;
  const scene=clamp(packedSceneDepth),packed=1/(1+glyphViewDepth*.14);
  const worldOccluder=scene>0&&scene<.999999;
  return (!worldOccluder||packed+Math.max(.00006,scene*.00075)>=scene)
    &&!(pressureCoverage>.018&&glyphViewDepth>pressureDepth+.022);
}
export function sourceCodeTargetSize(target={},canvas={}){
  return {width:Math.max(1,Math.floor(Number(target.width)||Number(canvas.width)||1)),
    height:Math.max(1,Math.floor(Number(target.height)||Number(canvas.height)||1))};
}

export const SOURCE_CODE_SCREEN_GLSL=`
uniform sampler2D uGlyph,uDepth,uSrc,uPressureGeometry;
uniform vec2 uOutputSize,uPressureNearFar;
uniform float uPressureReady,uGlyphLinear;
uniform vec3 uEye;
uniform mat4 uView;
${SOURCE_REST_FACULTIES_GLSL}
vec3 sourceCodeDisplay(vec3 value){
  vec3 v=clamp(value,0.0,1.0);
  return mix(v,mix(v*12.92,1.055*pow(v,vec3(1.0/2.4))-.055,step(vec3(.0031308),v)),uGlyphLinear);
}
float sourceCodeWorldVisibility(vec3 world){
  vec2 uv=gl_FragCoord.xy/uOutputSize;
  float metres=-(uView*vec4(world,1.0)).z;
  float scene=texture(uDepth,uv).a,packed=1.0/(1.0+max(0.0,metres)*.14);
  // Both empty-field sentinels have no world surface to occlude a raised edge.
  if(metres<=0.0||(scene>0.0&&scene<.999999&&packed+max(.00006,scene*.00075)<scene))return 0.0;
  if(uPressureReady>.5){
    vec4 g=texture(uPressureGeometry,uv);
    float core=mod(floor(floor(g.b*255.0+.5)/64.0),2.0);
    float depth=dot(g.rg,vec2(65280.0,255.0))*uPressureNearFar.y/65535.0;
    if(g.a*core>.018&&metres>depth+.022)return 0.0;
  }
  return sourceRestFacultyVisibility(uv,metres)*sourceRestFacultyDetail(uv,metres);
}
// These four values come from a finite, saved event on the carrier. There is
// no free-running shader clock: paused play holds the same executed clause.
float sourceExecutionStrength(vec3 color,vec2 uv,vec4 execution){
  float gain=clamp(execution.y,0.0,1.0);if(gain<.001)return 0.0;
  float coordinate=fract(uv.x+uv.y*.31),tail=clamp(execution.z,.025,.5);
  float cursor=1.0-smoothstep(tail*.35,tail,abs(coordinate-clamp(execution.x,0.0,1.0)));
  // Atlas cards are already individual clauses; they retain a readable
  // whole-clause emphasis while a printed surface carries a travelling head.
  cursor=mix(max(.32,cursor),cursor,uGlyphLinear);
  cursor=mix(cursor,.58,step(.5,execution.w));
  float call=1.0-smoothstep(.055,.23,length(color-vec3(1.0,.933333,.541176)));
  float operation=1.0-smoothstep(.055,.23,length(color-vec3(1.0,.607843,.815686)));
  return clamp(gain*cursor*(.28+.58*max(call,operation)),0.0,.86);
}
vec4 sourceCodeInk(vec2 uv,float opacity,vec3 world,vec4 execution){
  vec4 glyph=texture(uGlyph,uv);
  vec2 dx=dFdx(uv)*.70,dy=dFdy(uv)*.70;
  float around=max(max(texture(uGlyph,uv+dx).a,texture(uGlyph,uv-dx).a),
    max(texture(uGlyph,uv+dy).a,texture(uGlyph,uv-dy).a));
  float core=clamp(glyph.a*opacity,0.0,1.0),rim=clamp((around-glyph.a)*opacity*.78,0.0,.78);
  vec3 color=sourceCodeDisplay(glyph.rgb);
  float emphasis=sourceExecutionStrength(color,uv,execution),glow=0.0;
  if(execution.y>.001){
    float spread=max(max(texture(uGlyph,uv+dx*2.8).a,texture(uGlyph,uv-dx*2.8).a),
      max(texture(uGlyph,uv+dy*2.8).a,texture(uGlyph,uv-dy*2.8).a));
    glow=max(0.0,spread*opacity-max(core,rim))*emphasis*.45;
  }
  float visible=sourceCodeWorldVisibility(world),ink=max(core,rim),alpha=clamp(ink+glow,0.0,1.0)*visible;
  color=mix(color,vec3(1.0,.99,1.0),emphasis);
  float loss=uSourceRestFacultyState.x*clamp(uSourceRestFaculties.y+uSourceRestFaculties.z,0.0,1.0);
  color=mix(color,vec3(dot(color,vec3(.2126,.7152,.0722))),loss);
  color=mix(vec3(.002,.004,.012),color,max(core,glow)/max(.00001,ink+glow));
  return vec4(color*alpha,alpha);
}
vec4 sourceCodeInk(vec2 uv,float opacity,vec3 world){return sourceCodeInk(uv,opacity,world,vec4(0.0));}
`;

export const SOURCE_CODE_PHYSICAL_FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vSourceSurroundingsRestWorld,vSourceSurroundingsLocal;
in vec2 vUv;
in float vRestHorizonGone;
flat in vec4 vEmissive;
uniform float uBaseAlpha;
// The shared pressure-shape helpers retain their host's reduced-motion gate,
// even though the glyph fragment itself owns no animation clock.
uniform float uReducedMotion;
uniform int uSourceSurroundingsSide;
uniform vec4 uSourceSurroundingsGate,uExteriorClipPlane,uExteriorPortalA;
uniform vec3 uSourceSurroundingsGateFrame,uExteriorPortalB;
${SOURCE_MESH_PORTAL_CLIP_GLSL}
${SOURCE_SURROUNDINGS_VISIBILITY_GLSL}
${SOURCE_SURROUNDINGS_PRESSURE_GLSL}
${SOURCE_CODE_SCREEN_GLSL}
out vec4 o;
void main(){
  if(vRestHorizonGone>.5)discard;
  clipMeshPortal(vWorld);
  if(!sourceSurroundingsVisible(uSourceSurroundingsSide,sourceSurroundingsWorldPoint(uEye),sourceSurroundingsWorldPoint(vWorld),uSourceSurroundingsGate,uSourceSurroundingsGateFrame))discard;
  if(length(uExteriorClipPlane.xyz)>.5){
    if(dot(vec4(vWorld,1.0),uExteriorClipPlane)<-.001)discard;
    if(uExteriorPortalB.z>.5){
      vec3 ray=vWorld-uEye;float denominator=uExteriorPortalA.x>.5?ray.x:ray.z;
      if(abs(denominator)<.00001)discard;
      float t=(uExteriorPortalA.y-(uExteriorPortalA.x>.5?uEye.x:uEye.z))/denominator;
      vec3 crossing=uEye+ray*t;float along=uExteriorPortalA.x>.5?crossing.z:crossing.x;
      if(t<=0.0||t>=1.001||along<uExteriorPortalA.z||along>uExteriorPortalA.w||crossing.y<uExteriorPortalB.x||crossing.y>uExteriorPortalB.y)discard;
    }
  }
  o=sourceCodeInk(vUv,uBaseAlpha,vWorld,vEmissive);if(o.a<.003)discard;
}
`;
export const SOURCE_CODE_TEXT_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColor;
in vec3 vWorld;
flat in float vSyntax;
${SOURCE_CODE_SCREEN_GLSL}
out vec4 o;
void main(){o=sourceCodeInk(vUv,vColor.a,vWorld,vec4(vColor.rgb,vSyntax));if(o.a<.003)discard;}
`;
export const SOURCE_CODE_COMPOSITE_VERT=`#version 300 es
precision highp float;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}
`;
export const SOURCE_CODE_COMPOSITE_FRAG=`#version 300 es
precision highp float;
uniform sampler2D uGlyphLayer,uSceneDepth;
uniform vec2 uOutputSize;
out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy/uOutputSize,pixel=1.0/uOutputSize;
  vec4 core=texture(uGlyphLayer,uv),halo=vec4(0.0);
  float front=texture(uSceneDepth,uv).a;
  for(int i=0;i<8;i++){
    vec2 direction=i==0?vec2(1,0):i==1?vec2(-1,0):i==2?vec2(0,1):i==3?vec2(0,-1):i==4?vec2(1,1):i==5?vec2(-1,1):i==6?vec2(1,-1):vec2(-1,-1);
    vec2 at=clamp(uv+direction*pixel*1.4,vec2(0.0),vec2(1.0));
    float neighbour=texture(uSceneDepth,at).a;
    float agree=1.0-step(max(.00015,front*.002),abs(front-neighbour));
    halo+=texture(uGlyphLayer,at)*agree;
  }
  halo*=.065/8.0*(1.0-core.a);
  o=vec4(core.rgb+halo.rgb,clamp(core.a+halo.a,0.0,1.0));
}
`;
