// Conservative world-space sphere tests. A volume crossing any view boundary
// stays submitted; only a volume wholly outside one plane can be rejected.
export function viewFrustum(view, projection) {
  const m=new Float64Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++)
    m[c*4+r]=projection[r]*view[c*4]+projection[4+r]*view[c*4+1]
      +projection[8+r]*view[c*4+2]+projection[12+r]*view[c*4+3];
  const planes=[];
  for(const [axis,sign] of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){
    const p=[m[3]+sign*m[axis],m[7]+sign*m[4+axis],m[11]+sign*m[8+axis],m[15]+sign*m[12+axis]];
    const length=Math.hypot(p[0],p[1],p[2]);
    if(length>0)planes.push(p.map(v=>v/length));
  }
  return planes;
}

export function sphereInView(planes, centre, radius) {
  if(!Number.isFinite(radius)||radius<0||!centre?.every(Number.isFinite))return true;
  return planes.every(p=>p[0]*centre[0]+p[1]*centre[1]+p[2]*centre[2]+p[3]>=-radius);
}

export function quadInView(planes, corners) {
  if(!Array.isArray(corners)||corners.length!==4)return false;
  return planes.every(p=>corners.some(c=>p[0]*c[0]+p[1]*c[1]+p[2]*c[2]+p[3]>=0));
}
