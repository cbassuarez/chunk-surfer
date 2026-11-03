// HUSH is a moving mask over one still, two-dimensional image. The image is
// fixed to the viewport, not to the actor, world, camera pose, UVs or a clock.
// Broken silver orbital bands and sharp spectral fault cuts join the Source
// horizon and fault vocabulary without putting any geometry outside the body.
export const HUSH_COSMOS=Object.freeze({
  revision:'screen-fixed-torn-horizon-1',
  darkInk:Object.freeze([.006,.001,.021]),
  violetInk:Object.freeze([.30,.055,.72]),
  stellarInk:Object.freeze([.96,.76,1]),
});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const line=(d,width)=>1-smooth(width,width*1.8,Math.abs(d));

// Coordinates are measured in screen heights, centred on the viewport. This
// keeps proportions stable across render scales and device-pixel ratios.
export function hushCosmosCoordinates(pixel,viewport){
  if((!Array.isArray(pixel)&&!ArrayBuffer.isView(pixel))||(!Array.isArray(viewport)&&!ArrayBuffer.isView(viewport))||
      pixel.length<2||viewport.length<2||![...pixel].slice(0,2).every(Number.isFinite)||![...viewport].slice(0,2).every(Number.isFinite)||viewport[0]<=0||viewport[1]<=0)
    throw TypeError('HUSH requires finite viewport pixels and positive dimensions.');
  return [(pixel[0]-viewport[0]*.5)/viewport[1],(pixel[1]-viewport[1]*.5)/viewport[1]];
}
export function hushCosmosField(pixel,viewport){
  const [x,y]=hushCosmosCoordinates(pixel,viewport),rx=.89*x+.46*y,ry=-.46*x+.89*y;
  const r=Math.hypot((rx+.13)*.83,(ry-.025)*1.45);
  const torn=(rx>-.36&&ry<.25?1:0)*(rx+ry>-.34?1:0);
  const band=(smooth(.20,.205,r)-smooth(.235,.24,r))*torn;
  const rim=line(r-.325,.004)*(rx<.26&&ry>-.25?1:0);
  const silver=Math.max(band*.82,rim*.76);
  const cyan=line(y-.43*x+.025,.0025)*(x<.27&&x>-.3?1:0);
  const violet=line(y+.78*x-.12,.0028)*(x>.02&&y<.25?1:0);
  const magenta=line(y-.51*x+.17,.0022)*(x>-.23&&x<.31?1:0);
  const color=[.006+silver*.77+cyan*.02+violet*.28+magenta*.75,
    .004+silver*.79+cyan*.73+violet*.035+magenta*.025,
    .012+silver*.82+cyan*.82+violet*.76+magenta*.51].map(v=>clamp(v));
  return{color,heat:Math.max(silver,cyan,violet,magenta),band,rim,cyan,violet,magenta};
}

// Keep the acquisition mark authoritative. POST can retain the same endpoints
// without turning a negative, glow or grading pass into a second exposure.
export function hushCosmosRecordedInk(recorded,_heat=0,pixel=[.5,.5],viewport=[1,1]){
  const mark=Math.max(...recorded)>.08?1:0,field=hushCosmosField(pixel,viewport).color;
  return HUSH_COSMOS.darkInk.map((v,i)=>mix(v,mix(.19,1,field[i]),mark));
}
export function hushCosmosSignalMaterial(signal){
  const s=clamp(signal),heat=smooth(.28,.85,s),low=[.42,.095,1],high=[.96,.76,1];
  return {color:low.map((v,i)=>mix(v,high[i],heat)*s),heat};
}

// This exact field is shared by the main pressure pass, recorder and the
// secondary desktop material. It depends only on fragment and viewport.
export const HUSH_COSMOS_GLSL=`
float hushLine(float d,float w){return 1.0-smoothstep(w,w*1.8,abs(d));}
vec4 hushCosmosField(vec2 pixel,vec2 viewport){
 vec2 p=(pixel-.5*viewport)/max(1.0,viewport.y);
 vec2 q=vec2(.89*p.x+.46*p.y,-.46*p.x+.89*p.y);
 float r=length(vec2((q.x+.13)*.83,(q.y-.025)*1.45));
 float torn=step(-.36,q.x)*(1.0-step(.25,q.y))*step(-.34,q.x+q.y);
 float band=(smoothstep(.20,.205,r)-smoothstep(.235,.24,r))*torn;
 float rim=hushLine(r-.325,.004)*(1.0-step(.26,q.x))*step(-.25,q.y);
 float silver=max(band*.82,rim*.76);
 float cyan=hushLine(p.y-.43*p.x+.025,.0025)*(1.0-step(.27,p.x))*step(-.3,p.x);
 float violet=hushLine(p.y+.78*p.x-.12,.0028)*step(.02,p.x)*(1.0-step(.25,p.y));
 float magenta=hushLine(p.y-.51*p.x+.17,.0022)*step(-.23,p.x)*(1.0-step(.31,p.x));
 vec3 color=vec3(.006,.004,.012)+silver*vec3(.77,.79,.82)+cyan*vec3(.02,.73,.82)+violet*vec3(.28,.035,.76)+magenta*vec3(.75,.025,.51);
 return vec4(clamp(color,0.0,1.0),max(max(silver,cyan),max(violet,magenta)));
}
`;
export const HUSH_COSMOS_INK_GLSL=`
${HUSH_COSMOS_GLSL}
vec4 hushCosmosSignalMaterial(float signal){
 float s=clamp(signal,0.0,1.0),heat=smoothstep(.28,.85,s);
 return vec4(mix(vec3(.42,.095,1.0),vec3(.96,.76,1.0),heat)*s,heat);
}
vec3 hushCosmosRecordedInk(vec3 recorded,float heat){
 float mark=step(.08,max(recorded.r,max(recorded.g,recorded.b)));
 vec3 field=hushCosmosField(gl_FragCoord.xy,uRes).rgb;
 // A chosen light mark always stays light enough to survive another POST pass.
 vec3 ink=mix(vec3(.19,.19,.19),vec3(1.0),field);
 return mix(vec3(.006,.001,.021),ink,mark);
}
`;

// The Three desktop view uses the same mask and viewport-space pigment. It
// provides the real drawing-buffer dimensions via this shared uniform object.
export function installHushCosmosMaterial(material){
  if(!material||typeof material!=='object')throw TypeError('A Hush material is required.');
  const previous=material.onBeforeCompile,viewport={value:{x:1,y:1}};
  material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);
    if(!shader.fragmentShader.includes('#include <color_fragment>'))throw Error('The Hush material no longer has the measured colour hook.');
    shader.uniforms.uHushViewport=viewport;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nuniform vec2 uHushViewport;\n${HUSH_COSMOS_GLSL}`)
      // The desktop acquisition identifies HUSH by its violet signal rather
      // than a separate identity buffer. Keep this tag through recording;
      // the final ink pass recovers the actual silver and spectral colours at
      // this same screen coordinate. Neutral human and hull pixels stay distinct.
      .replace('#include <color_fragment>',`#include <color_fragment>
vec3 hushField=hushCosmosField(gl_FragCoord.xy,uHushViewport).rgb;
diffuseColor.rgb=vec3(.85,.08,1.0)*max(hushField.r,max(hushField.g,hushField.b));`);
  };
  material.customProgramCacheKey=()=>HUSH_COSMOS.revision;
  material.userData={...material.userData,hushCosmos:{revision:HUSH_COSMOS.revision,space:'screen-viewport',clock:false,viewport}};
  material.toneMapped=false;material.fog=false;material.needsUpdate=true;
  return material;
}
