// Executable menu treatment study. Input: finished positive world pixels, before
// front-end grading. Output: background only, before the untouched UI surface.
// Kept separate from the shipping preset until an art-direction choice is made.
export const MENU_BACKGROUND_TREATMENTS = Object.freeze([
  Object.freeze({id:'silver',name:'Silver negative',mode:1,exposure:.12,contrast:1.12,detail:.42,vignette:.54,centerDim:.12,tint:'#a4b9b5',ceiling:.46}),
  Object.freeze({id:'warm',name:'Amber positive',mode:2,exposure:.18,contrast:1.05,detail:.62,vignette:.48,centerDim:.18,tint:'#bfae86',ceiling:.60}),
  Object.freeze({id:'carbon',name:'Carbon transfer',mode:3,exposure:.28,contrast:1.12,detail:.40,vignette:.44,centerDim:.10,tint:'#afbab0',ceiling:.82}),
]);

// The inline study embeds this string verbatim, including the final integration
// pass. Coordinates are top-left UVs in source-pixel space, not CSS pixels.
export const MENU_BACKGROUND_TREATMENT_GLSL = /* glsl */ `
float menuLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 menuTap(sampler2D image,vec2 uv,vec2 offset,vec2 size){
  return texture(image,clamp(uv+offset/size,vec2(.5)/size,vec2(1.)-vec2(.5)/size)).rgb;
}
vec3 menuCross(sampler2D image,vec2 uv,vec2 size,float radius){
  return menuTap(image,uv,vec2(0.),size)*.4+
    (menuTap(image,uv,vec2(radius,0.),size)+menuTap(image,uv,vec2(-radius,0.),size)+
     menuTap(image,uv,vec2(0.,radius),size)+menuTap(image,uv,vec2(0.,-radius),size))*.15;
}
vec3 menuBackgroundTreatment(sampler2D image,vec2 uv,vec2 size,int mode,
  float exposure,float contrast,float detail,float vignette,float centerDim,vec3 tint,float ceiling){
  vec3 source=menuTap(image,uv,vec2(0.),size);
  float raw=menuLuma(source);
  // Existing title print: luminance inversion, hue retained, -0.25 stops.
  if(mode==0)return clamp(source+vec3(1.-2.*raw),0.,1.)*exp2(-.25);
  vec3 soft=menuCross(image,uv,size,1.5);
  float y=mix(menuLuma(soft),raw,detail);
  vec3 c;
  if(mode==1){
    // A dense silver-gel print: turn the luminance over, then compress the
    // paper white. Dark ink still describes the buildings and rain.
    float ink=pow(clamp(1.-y,0.,1.),contrast);
    c=mix(vec3(.018,.024,.023),tint*ceiling,ink);
  }else if(mode==2){
    // Positive night plate, multiply-toned. Preserve a little practical-light
    // colour rather than flattening windows into the same grey as the sky.
    float positive=pow(clamp(y,0.,1.),contrast);
    c=vec3(.006,.009,.008)+tint*positive*ceiling;
    c+=max(source-vec3(raw),vec3(0.))*positive*.16;
  }else{
    // Difference composite at two spatial scales: quiet broad negative fields,
    // raised architectural edges. No added outlines, grain, flicker or neon.
    float fine=menuLuma(menuCross(image,uv,size,2.));
    float broad=menuLuma(menuCross(image,uv,size,7.));
    float contour=pow(clamp(abs(fine-broad)*3.2,0.,1.),contrast);
    float hatch=abs(raw-fine)*detail*.19;
    float density=.032+(1.-broad)*.065+contour*.56+hatch;
    c=tint*density*ceiling;
  }
  // Separate integration pass: exposure, a soft shoulder, edge falloff and
  // a broad attenuation behind the case. UI is composited AFTER this function.
  c*=exp2(exposure);
  c=c/(vec3(1.)+c*.32);
  vec2 p=(uv-.5)*vec2(1.28,1.);
  float edge=smoothstep(.20,.77,length(p));
  c*=1.-vignette*edge;
  float center=1.-smoothstep(.18,.54,length((uv-.5)*vec2(1.,1.15)));
  c*=1.-centerDim*center;
  return clamp(c,0.,1.);
}
`;
