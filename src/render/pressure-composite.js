// The manifestation is a skinned volume. Its geometry pass transports actual
// coverage and view depth into acquisition; no image/card supplies its contour.
// The body is an unlit black absence. Its neutral white radiance lives outside
// the visible triangles, then enters the same recording as the rest of the
// world. Surface-relief bits remain transport data, never light on the body.
// Endpoint identity only: acquisition still chooses every glow mark. Sharing
// this operation keeps glass, exposure and phosphor from tinting that material.
export const PRESSURE_INK_GLSL = `
vec3 pressureRecordedInk(vec3 recorded,vec2 identity){
 float white=max(recorded.r,max(recorded.g,recorded.b));
 white=mix(white,1.0,step(.5,white));
 return mix(recorded,vec3(white),step(.5,identity.g))*(1.0-step(.5,identity.r));
}
`;

export const PRESSURE_FINISH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc,uGeometry,uScene,uPropsDepth,uAcquired;
uniform vec2 uRes,uPressureRes,uNearFar;
uniform float uSceneDepthReady,uAcquiredOnly,uCaptureExposure;
layout(location=0)out vec4 o;
layout(location=1)out vec4 oIdentity;
float meshDepth(vec4 g){return dot(g.rg,vec2(65280.0,255.0))*uNearFar.y/65535.0;}
float propDepth(vec2 uv){float z=texture(uPropsDepth,uv).r*2.0-1.0;return 2.0*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x));}
float worldDepth(vec2 uv){float z=propDepth(uv);if(uSceneDepthReady>.5){float a=texture(uScene,uv).a;z=min(z,(1.0/max(.000001,a)-1.0)/.14);}return z;}
float coverage(vec2 uv,float front){vec4 g=texture(uGeometry,uv);return g.a*step(meshDepth(g),front+.022);}
float glowCoverage(vec2 uv,float front){
 vec4 g=texture(uGeometry,uv);
 float glow=floor(floor(g.b*255.0+.5)/128.0);
 if(g.a<=.018||glow<.5)return 0.0;
 // Both the emitting triangle and receiving pixel must be unobstructed.
 // A body hidden behind a wall cannot cast a halo around that wall's edge.
 return g.a*glow*step(meshDepth(g),min(front,worldDepth(uv))+.022);
}
void main(){
 vec2 uv=gl_FragCoord.xy/uRes,px=1.0/uPressureRes;
 vec4 src=texture(uSrc,uv),g=texture(uGeometry,uv);
 float front=worldDepth(uv),mass=coverage(uv,front);
 float bits=floor(g.b*255.0+.5),core=mod(floor(bits/64.0),2.0);
 float coreMask=step(.018,mass)*core;
 float nearGlow=0.0,midGlow=0.0,wideGlow=0.0,farGlow=0.0;
 for(int i=0;i<8;i++){
  float a=float(i)*.78539816339;vec2 d=vec2(cos(a),sin(a));
  nearGlow=max(nearGlow,glowCoverage(uv+d*px*1.5,front));
  midGlow=max(midGlow,glowCoverage(uv+d*px*4.0,front));
  wideGlow=max(wideGlow,glowCoverage(uv+d*px*9.0,front));
  farGlow=max(farGlow,glowCoverage(uv+d*px*15.0,front));
 }
 // Each band is supported by an actual visible glow-enabled triangle. The
 // external radiance is bright at the edge and falls away over finite radii.
 // It never paints the body interior, including in the glow-only diagnostic.
 float exterior=1.0-step(.018,mass);
 float glowLight=(nearGlow*.88+midGlow*.38+wideGlow*.12+farGlow*.025)*exterior;
 // Carry the already depth-clipped finite material support with the scene.
 // Acquisition and POST can retain black/white endpoints without resampling
 // the radial glow neighbourhood or repainting a smooth halo after recording.
 oIdentity=vec4(coreMask,step(.000001,glowLight),0.0,1.0);
 // The old text-only scene keeps its own presentation outside the physical
 // material. Use its actual core/glow footprint, not an unconditional expanded
 // mesh mask. Strength already entered acquisition, so do not multiply it twice.
 if(uAcquiredOnly>.5){
  float support=step(.000001,coreMask+glowLight);
  o=vec4(mix(src.rgb,texture(uAcquired,uv).rgb,support),src.a);return;
 }
 vec3 c=src.rgb;
 // Convert authored white radiance to the current sensor units once. Source's
 // long exposure must not change the material or introduce a coloured fringe.
 float exposure=clamp(uCaptureExposure,1.0,12.0);
 c+=vec3(glowLight*1.45/exposure);
 // Seal the complete covered core after the glow. No scene transmission,
 // normal-map relief, edge light or exposure can lift it into a grey body.
 c*=1.0-coreMask;
 // Acquisition pins its pattern to the actual covered mesh surface. Preserve
 // the world's depth everywhere else, including the transparent glow support.
 float depth=mass*core>.018?1.0/(1.0+min(front,meshDepth(g))*.14):src.a;
 o=vec4(clamp(c,0.0,1.0),depth);
}`;

// Also used before acquisition by the physical march: real depth is available
// to scene captures, fog and the lens, before its material is recorded.
export const PRESSURE_SCENE_GLSL = `
void compositePressureVolume(inout vec3 col,inout float zView){
 vec4 g=texture(uHushBodyTex,gl_FragCoord.xy/uRes);
 float d=dot(g.rg,vec2(65280.0,255.0))*90.0/65535.0;
 float bits=floor(g.b*255.0+.5),core=mod(floor(bits/64.0),2.0);
 float a=g.a*step(d,zView+.022)*core;
 col*=1.0-step(.018,a);
 if(a>.018)zView=min(zView,d);
}
`;

// Source's white sea and x-ray change the world, not the manifestation's
// negative material. Preserve its already grained/glassed colour in POST.
export const PRESSURE_IDENTITY_GLSL = `
uniform sampler2D uPressureGeometry,uPressureScene,uPressurePropsDepth;
uniform vec2 uPressureNearFar;
uniform float uPressureReady,uPressureSceneDepthReady;
float pressureIdentityMask(vec2 uv){
 if(uPressureReady<.5)return 0.0;
 vec4 g=texture(uPressureGeometry,uv);
 float core=mod(floor(floor(g.b*255.0+.5)/64.0),2.0);
 float d=dot(g.rg,vec2(65280.0,255.0))*uPressureNearFar.y/65535.0;
 float z=texture(uPressurePropsDepth,uv).r*2.0-1.0;
 float front=2.0*uPressureNearFar.x*uPressureNearFar.y/(uPressureNearFar.y+uPressureNearFar.x-z*(uPressureNearFar.y-uPressureNearFar.x));
 if(uPressureSceneDepthReady>.5){float a=texture(uPressureScene,uv).a;front=min(front,(1.0/max(.000001,a)-1.0)/.14);}
 return g.a*core*step(d,front+.022);
}
`;
