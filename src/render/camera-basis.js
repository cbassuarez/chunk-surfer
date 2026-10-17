// Pitch is an angle in radians in every world pass. Treating it as a slope
// makes the sector depth and raster prop depth describe different pixels.
export function cameraBasis(yaw=0,pitch=0){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  return{
    forward:[sy*cp,sp,-cy*cp],
    right:[cy,0,sy],
    up:[-sy*sp,cp,cy*sp],
  };
}

export const DOWNWARD_LOOK_LIMIT=-Math.PI/2+.02;

export const CAMERA_FORWARD_GLSL=`
vec3 cameraForward(float yaw,float pitch){
  float cp=cos(pitch);
  return vec3(sin(yaw)*cp,sin(pitch),-cos(yaw)*cp);
}
`;
