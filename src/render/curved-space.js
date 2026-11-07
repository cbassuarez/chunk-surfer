// A space of constant curvature, for one scene. Simulation, lighting and material
// coordinates stay in authored metres; only where a vertex lands is changed, so
// this is geometry, not a lens: everything is really where it is drawn, and the
// camera looks at it along the space's own straight lines.
//
// A point is written in the 4D frame the curved space lives in: sign>0 the
// 3-sphere (w = cos), sign<0 the hyperboloid (w = cosh). `eye` carries the world
// into the eye's own frame; from there only a direction and a distance are kept.
// A prop stands rigid at its own base point, laid off from there, so a wall is
// the same wall wherever it is placed.
export const CURVED_SPACE_OFF=Object.freeze({sign:0,radius:1,eyeHeight:0,eye:Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])});
export function curvedSpaceUniforms(c=CURVED_SPACE_OFF){
  return{space:[c.sign,c.radius,c.eyeHeight,0],eye:c.eye};
}
export const CURVED_SPACE_GLSL=`
uniform vec4 uCurvedSpace; // sign, radius metres, rendered eye height
uniform mat4 uCurvedEye;
vec3 curvedSpacePoint(vec3 w,vec3 base){
  float sign_=uCurvedSpace.x,R=uCurvedSpace.y;
  if(sign_==0.0)return w;
  vec3 local=w-base;
  float lr=length(local),la=lr/R,br=length(base),ba=br/R;
  vec3 ln=lr>1e-5?local/lr:vec3(0.0),bn=br>1e-5?base/br:vec3(0.0,0.0,1.0);
  float lc=sign_>0.0?cos(la):cosh(la),ls=sign_>0.0?sin(la):sinh(la),bc=sign_>0.0?cos(ba):cosh(ba),bs=sign_>0.0?sin(ba):sinh(ba);
  vec3 p=ln*ls;
  float along=dot(p,bn),nextAlong=along*bc+lc*bs,nextW=sign_>0.0?lc*bc-along*bs:lc*bc+along*bs;
  vec4 v=uCurvedEye*vec4(p+bn*(nextAlong-along),nextW);
  float l=length(v.xyz);
  float chi=sign_>0.0?atan(l,v.w):asinh(l);
  return vec3(0.0,uCurvedSpace.z,0.0)+(l>1e-6?v.xyz/l:vec3(0.0))*chi*R;
}
`;
