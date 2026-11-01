// Bounds are accumulated from the exact POSITION arrays uploaded to GL. If a
// primitive is malformed, admit its whole mesh instead of risking a hole.
export function includePositionBounds(bounds,positions){
  if(!positions||positions.length===0||positions.length%3)return null;
  const min=bounds?[...bounds.min]:[Infinity,Infinity,Infinity];
  const max=bounds?[...bounds.max]:[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<positions.length;i+=3)for(let axis=0;axis<3;axis++){
    const value=positions[i+axis];if(!Number.isFinite(value))return null;
    min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);
  }
  return {min,max};
}

// Transform the box against each world-space frustum plane. This support
// function retains anything intersecting a plane, including sheared meshes;
// an unknown box, transform or plane means draw, never hide geometry.
export function propBoundsInView(bounds,m,planes,padding=.05){
  if(!bounds||!m||m.length!==16||!planes||!planes.length)return true;
  const {min,max}=bounds;
  if(!min||!max||min.length!==3||max.length!==3||
    m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)return true;
  for(let i=0;i<16;i++)if(!Number.isFinite(m[i]))return true;
  for(let i=0;i<3;i++)if(!Number.isFinite(min[i])||!Number.isFinite(max[i])||min[i]>max[i])return true;
  for(const p of planes)if(!p||p.length!==4||!p.every(Number.isFinite))return true;
  const cx=(min[0]+max[0])/2,cy=(min[1]+max[1])/2,cz=(min[2]+max[2])/2;
  const ex=(max[0]-min[0])/2,ey=(max[1]-min[1])/2,ez=(max[2]-min[2])/2;
  const x=m[0]*cx+m[4]*cy+m[8]*cz+m[12],y=m[1]*cx+m[5]*cy+m[9]*cz+m[13],z=m[2]*cx+m[6]*cy+m[10]*cz+m[14];
  for(const p of planes){
    const [a,b,c,d]=p;
    const reach=ex*Math.abs(a*m[0]+b*m[1]+c*m[2])
      +ey*Math.abs(a*m[4]+b*m[5]+c*m[6])+ez*Math.abs(a*m[8]+b*m[9]+c*m[10]);
    if(a*x+b*y+c*z+d+reach < -padding)return false;
  }
  return true;
}
