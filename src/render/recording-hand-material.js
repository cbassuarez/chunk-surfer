// Authored receiving contrast for the recording-only anatomical aliases. This
// reveals normal-dependent palm/finger planes without a white rim or a lamp.
// Original equipment and characters never opt into this private material.
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
export function recordingHandPlane(base,facing,{enabled=false}={}){
 if(!enabled)return[0,0,0];
 const gain=.16+.38*Math.pow(clamp(facing),1.6);
 return base.slice(0,3).map(n=>Math.max(0,Number(n)||0)*gain);
}
export const RECORDING_HAND_MATERIAL_GLSL=`
uniform float uRecordingFace;
vec3 recordingHandPlane(vec3 base,vec3 normal,vec3 toEye){
  float facing=clamp(dot(normal,toEye),0.0,1.0);
  return base*(.16+.38*pow(facing,1.6));
}
`;
