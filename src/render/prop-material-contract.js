// Ordinary props historically squared unmapped roughness/metallic factors.
// Keep that approved appearance as an explicit import conversion. Newly
// authored materials opt into glTF's map * factor contract; no shader fallback
// is allowed to smuggle a second factor multiplication back into the model.
export function propMaterialFactors({roughness=1,metallic=1,hasOrm=false,semantics=null}={}){
  if(semantics!=null&&semantics!=='gltf')throw new Error('Invalid prop material factor semantics');
  if(!Number.isFinite(roughness)||!Number.isFinite(metallic)||roughness<0||roughness>1||metallic<0||metallic>1)
    throw new Error('Prop material factors must be finite values from zero to one');
  const legacyUnmapped=!hasOrm&&semantics!=='gltf';
  return Object.freeze({roughness:legacyUnmapped?roughness*roughness:roughness,
    metallic:legacyUnmapped?metallic*metallic:metallic,
    // Street roughness is a blend with another mapped source. Its old texture
    // term used the original factor once even when the unmapped term used it
    // twice. Retain that exact algebra rather than changing the street finish.
    streetRoughnessFactor:roughness,legacyUnmapped});
}

export function letteringFinishDescriptor(value){
  if(value==null)return null;
  if(value.version!==1||typeof value.profile!=='string'||!value.profile.trim()||value.profile.length>80||
    typeof value.localSpecular!=='boolean')throw new Error('Invalid lettering finish material contract');
  return Object.freeze({version:1,profile:value.profile,localSpecular:value.localSpecular});
}

export function propTextureWrap(sampler={}){
  const wrapS=sampler.wrapS??10497,wrapT=sampler.wrapT??10497;
  if(![33071,33648,10497].includes(wrapS)||![33071,33648,10497].includes(wrapT))
    throw new Error('Invalid glTF texture wrap mode');
  return{wrapS,wrapT};
}

export const PROP_MATERIAL_GLSL=`
// Construct an orthonormal material frame from the actual deformed world
// surface. The signed UV Jacobian is essential: normalising its numerators
// alone silently reverses both tangent directions on a mirrored UV island.
// Derivatives are evaluated before any guard, including on constant-UV meshes.
vec3 propMappedNormal(vec3 world,vec3 geometricNormal,vec2 uv,vec3 mapped){
  vec3 dx=dFdx(world),dy=dFdy(world);vec2 ux=dFdx(uv),uy=dFdy(uv);
  vec3 n=normalize(geometricNormal);
  // Pixel derivatives can be extremely small for broad material tiles. Scale
  // both derivative pairs before products: sign and relative conditioning are
  // unchanged, and intermediate squared values cannot flush to zero on Metal.
  float uvDerivativeScale=max(max(abs(ux.x),abs(ux.y)),max(abs(uy.x),abs(uy.y)));
  float positionDerivativeScale=max(max(max(abs(dx.x),abs(dx.y)),abs(dx.z)),max(max(abs(dy.x),abs(dy.y)),abs(dy.z)));
  if(uvDerivativeScale<=1e-30||positionDerivativeScale<=1e-30)return n;
  ux/=uvDerivativeScale;uy/=uvDerivativeScale;dx/=positionDerivativeScale;dy/=positionDerivativeScale;
  float determinant=ux.x*uy.y-ux.y*uy.x;
  float uvScale=length(ux)*length(uy);
  if(uvScale<=0.0||abs(determinant)<=uvScale*1e-5)return n;
  // The positive divisor is immaterial after normalisation, while its sign
  // must survive. Avoid dividing by tiny texture derivatives at distance.
  float orientation=determinant<0.0?-1.0:1.0;
  vec3 t=(dx*uy.y-dy*ux.y)*orientation;
  vec3 b=(-dx*uy.x+dy*ux.x)*orientation;
  t-=n*dot(n,t);b-=n*dot(n,b);
  float t2=dot(t,t),b2=dot(b,b),surfaceScale=max(dot(dx,dx),dot(dy,dy));
  if(t2<=surfaceScale*uvScale*1e-10||b2<=surfaceScale*uvScale*1e-10||t2<=1e-30||b2<=1e-30)return n;
  t*=inversesqrt(t2);
  vec3 orthogonalB=cross(n,t);
  float handedness=dot(orthogonalB,b);
  if(handedness*handedness<=b2*1e-10)return n;
  b=orthogonalB*(handedness<0.0?-1.0:1.0);
  vec3 result=t*mapped.x+b*mapped.y+n*mapped.z;
  float result2=dot(result,result);
  return result2>1e-20?result*inversesqrt(result2):n;
}

// Core isotropic metallic/roughness response for explicitly authored lettering
// assemblies only. Fresnel separates dielectric paint/enamel from conductor
// pigment/metal; no independent bright rim, emission or screen-space resolve.
// GGX/Smith/Schlick definitions follow Khronos' core material model:
// https://github.com/KhronosGroup/glTF-Sample-Renderer/blob/main/source/Renderer/shaders/brdf.glsl
// Existing lamp intensities are diffuse gains, so PI converts that convention
// to incident radiance. Real radius, architectural visibility and shadows are
// applied by the caller. Ambient and torch retain their established treatment.
vec3 letteringLocalReflectance(vec3 n,vec3 viewDir,vec3 lightDir,vec3 baseColor,float roughness,float metallic){
  const float PI=3.141592653589793;
  float nl=max(dot(n,lightDir),0.0),nv=max(dot(n,viewDir),0.0);
  vec3 sumDir=viewDir+lightDir;float sum2=dot(sumDir,sumDir);
  if(nl<=0.0||nv<=0.0||sum2<=1e-10)return vec3(0.0);
  vec3 h=sumDir*inversesqrt(sum2);
  float nh=max(dot(n,h),0.0),vh=clamp(dot(viewDir,h),0.0,1.0);
  float r=clamp(roughness,.08,1.0),alpha=r*r,a2=alpha*alpha;
  float denominator=(1.0-nh*nh)+a2*nh*nh;
  float distribution=a2/(PI*denominator*denominator);
  float visibility=.5/max(nl*sqrt(a2+(1.0-a2)*nv*nv)+nv*sqrt(a2+(1.0-a2)*nl*nl),1e-7);
  vec3 rho=clamp(baseColor,0.0,1.0);float grazing=pow(1.0-vh,5.0);
  float dielectricF=.04+.96*grazing;
  vec3 fresnel=mix(vec3(dielectricF),rho+(1.0-rho)*grazing,metallic);
  vec3 diffuse=(1.0-metallic)*(1.0-dielectricF)*rho/PI;
  return PI*nl*(diffuse+distribution*visibility*fresnel);
}
`;
