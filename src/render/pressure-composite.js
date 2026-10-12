// The manifestation is a skinned volume. Its geometry pass transports actual
// coverage, view depth and surface relief into acquisition; no image/card
// supplies its contour. The shared recording shader encodes this material just
// like the rest of the world, before glass and grain are applied.
export const PRESSURE_FINISH_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uSrc,uGeometry,uScene,uPropsDepth,uAcquired;
uniform vec2 uRes,uPressureRes,uNearFar;
uniform float uSceneDepthReady,uAcquiredOnly,uCaptureExposure;
out vec4 o;
float meshDepth(vec4 g){return dot(g.rg,vec2(65280.0,255.0))*uNearFar.y/65535.0;}
float propDepth(vec2 uv){float z=texture(uPropsDepth,uv).r*2.0-1.0;return 2.0*uNearFar.x*uNearFar.y/(uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x));}
float worldDepth(vec2 uv){float z=propDepth(uv);if(uSceneDepthReady>.5){float a=texture(uScene,uv).a;z=min(z,(1.0/max(.000001,a)-1.0)/.14);}return z;}
float coverage(vec2 uv,float front){vec4 g=texture(uGeometry,uv);return g.a*step(meshDepth(g),front+.022);}
void main(){
 vec2 uv=gl_FragCoord.xy/uRes,px=1.0/uPressureRes;
 vec4 src=texture(uSrc,uv),g=texture(uGeometry,uv);
 float front=worldDepth(uv),mass=coverage(uv,front);
 float nearCover=0.0,wideCover=0.0,minCover=1.0;
 for(int i=0;i<8;i++){
  float a=float(i)*.78539816339;vec2 d=vec2(cos(a),sin(a));
  float n=coverage(uv+d*px,front);nearCover=max(nearCover,n);minCover=min(minCover,n);
  wideCover=max(wideCover,coverage(uv+d*px*3.0,front));
 }
 float bits=floor(g.b*255.0+.5),relief=mod(bits,64.0)/63.0;
 float core=mod(floor(bits/64.0),2.0),glow=floor(bits/128.0);
 // Neighbour flags matter outside the volume; coverage alone never reveals
 // the entire target. Glow-only keeps the actual negative mass transparent.
 float neighbourGlow=0.0;
 for(int i=0;i<8;i++){float a=float(i)*.78539816339;vec4 n=texture(uGeometry,uv+vec2(cos(a),sin(a))*px*2.0);neighbourGlow=max(neighbourGlow,floor(floor(n.b*255.0+.5)/128.0)*n.a*step(meshDepth(n),front+.022));}
 float rim=clamp(mass-minCover,0.0,1.0),halo=max(0.0,wideCover-mass)*neighbourGlow;
 float glowLight=halo*.16+max(0.0,nearCover-mass)*neighbourGlow*.09+rim*glow*.045;
 // The old text-only scene keeps its own presentation outside the physical
 // material. Use its actual core/glow footprint, not an unconditional expanded
 // mesh mask. Strength already entered acquisition, so do not multiply it twice.
 if(uAcquiredOnly>.5){
  float support=step(.000001,mass*core+halo*.23+glowLight);
  o=vec4(mix(src.rgb,texture(uAcquired,uv).rgb,support),src.a);return;
 }
 vec3 c=src.rgb;
 // Concave geometry stays readable in an unlit corridor, with a sealed dark
 // centre and restrained cold fibres, rather than a white cartoon outline.
 vec3 fibre=vec3(.36,.48,.47)*(.022+pow(relief,1.65)*.95)+vec3(.18,.29,.29)*rim*.12;
 // This negative material supplies its own restrained relief. Convert those
 // authored values into the current sensor units once; Source's long exposure
 // must not turn its cold fibres into a solid white cutout.
 float exposure=clamp(uCaptureExposure,1.0,12.0);
 c=mix((c*.10+fibre)/exposure,c,1.0-mass*core*.985);
 c*=1.0-halo*.23;
 c+=vec3(.12,.24,.25)*glowLight/exposure;
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
 float relief=mod(bits,64.0)/63.0;
 col=mix(col,col*.10+vec3(.013,.022,.022)*relief,a);
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
