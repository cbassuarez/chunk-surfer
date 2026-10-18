// Controlled study only. Khronos core metallic/roughness BRDF formulation:
// https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Renderer/main/source/Renderer/shaders/brdf.glsl
// Existing game lamp strengths use a diffuse-gain convention, converted by PI
// at the call site. Radius falloff remains the actual game's authored model.
vec3 studyLocalBRDF(vec3 normal,vec3 viewDir,vec3 lightDir,vec3 baseColor,float perceptualRoughness,float metallic){
 const float PI=3.141592653589793;
 float nl=clamp(dot(normal,lightDir),0.0,1.0),nv=clamp(dot(normal,viewDir),0.0,1.0);
 if(nl<=0.0||nv<=0.0)return vec3(0.0);
 vec3 sumDir=viewDir+lightDir;float sumSq=dot(sumDir,sumDir);if(sumSq<=1e-10)return vec3(0.0);
 vec3 halfDir=sumDir*inversesqrt(sumSq);float nh=clamp(dot(normal,halfDir),0.0,1.0),vh=clamp(dot(viewDir,halfDir),0.0,1.0);
 float r=clamp(perceptualRoughness,.08,1.0),alpha=r*r,a2=alpha*alpha;
 float denom=(1.0-nh*nh)+a2*nh*nh,distribution=a2/(PI*denom*denom);
 float visibility=.5/max(nl*sqrt(a2+(1.0-a2)*nv*nv)+nv*sqrt(a2+(1.0-a2)*nl*nl),1e-7);
 vec3 rho=clamp(baseColor,0.0,1.0);float m=clamp(metallic,0.0,1.0),grazing=pow(1.0-vh,5.0),dielectricF=.04+.96*grazing;
 vec3 metalF=rho+(1.0-rho)*grazing,fresnel=mix(vec3(dielectricF),metalF,m),diffuse=(1.0-m)*(1.0-dielectricF)*rho/PI;
 return nl*(diffuse+distribution*visibility*fresnel);
}
