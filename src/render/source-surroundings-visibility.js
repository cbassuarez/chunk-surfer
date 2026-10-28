// A material-only sight aperture. Ordinary props have side0 and are never
// clipped; no depth wall, collision surface or route boundary is introduced.
export const DEFAULT_SOURCE_SURROUNDINGS_GATE=Object.freeze({x:-18,y:8.39,z:-12,width:2.2,height:2.86,normalX:1,normalZ:0});
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function normalizeSourceSurroundingsGate(value=null){
  const source=value&&typeof value==='object'?value:{},base=DEFAULT_SOURCE_SURROUNDINGS_GATE;
  let normalX=finite(source.normalX,base.normalX),normalZ=finite(source.normalZ,base.normalZ),length=Math.hypot(normalX,normalZ);
  if(length<1e-6){normalX=1;normalZ=0;length=1;}
  return{x:finite(source.x,base.x),y:finite(source.y,base.y),z:finite(source.z,base.z),
    width:Math.max(.001,finite(source.width,base.width)),height:Math.max(.001,finite(source.height,base.height)),normalX:normalX/length,normalZ:normalZ/length};
}
const coordinate=(point,axis,index)=>Array.isArray(point)||ArrayBuffer.isView(point)?Number(point[index]):Number(point?.[axis]);
export function sourceSurroundingsVisible(side,eye,point,gate=DEFAULT_SOURCE_SURROUNDINGS_GATE){
  if(side!==1&&side!==2)return true;
  const e=['x','y','z'].map((axis,index)=>coordinate(eye,axis,index)),p=['x','y','z'].map((axis,index)=>coordinate(point,axis,index));
  if(![...e,...p].every(Number.isFinite))return false;
  const g=normalizeSourceSurroundingsGate(gate),eyeSide=(e[0]-g.x)*g.normalX+(e[2]-g.z)*g.normalZ;
  if(eyeSide*(side===1?1:-1)>=0)return true;
  const ray=p.map((value,index)=>value-e[index]),denominator=ray[0]*g.normalX+ray[2]*g.normalZ;
  if(Math.abs(denominator)<1e-6)return false;
  const t=-eyeSide/denominator;if(t<0||t>1)return false;
  const x=e[0]+ray[0]*t-g.x,y=e[1]+ray[1]*t,z=e[2]+ray[2]*t-g.z,along=-g.normalZ*x+g.normalX*z;
  return Math.abs(along)<=g.width/2+1e-5&&y>=g.y-1e-5&&y<=g.y+g.height+1e-5;
}
// gate=(x,y,z,width), gateFrame=(height,normalX,normalZ), all physical metres.
// Main and reflected prop passes bind these afresh. Shadows use another
// program and never inherit this fragment-only uniform state.
export const SOURCE_SURROUNDINGS_VISIBILITY_GLSL=`
bool sourceSurroundingsVisible(int side,vec3 eye,vec3 point,vec4 gate,vec3 gateFrame){
  if(side!=1&&side!=2)return true;
  vec2 normal=gateFrame.yz;
  float eyeSide=dot(eye.xz-gate.xz,normal);
  if(eyeSide*(side==1?1.0:-1.0)>=0.0)return true;
  vec3 ray=point-eye;
  float denominator=dot(ray.xz,normal);
  if(abs(denominator)<0.000001)return false;
  float t=-eyeSide/denominator;
  if(t<0.0||t>1.0)return false;
  vec3 crossing=eye+ray*t;
  float along=dot(crossing.xz-gate.xz,vec2(-normal.y,normal.x));
  return abs(along)<=gate.w*0.5+0.00001&&crossing.y>=gate.y-0.00001&&crossing.y<=gate.y+gateFrame.x+0.00001;
}
`;
