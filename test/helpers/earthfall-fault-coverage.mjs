// Independent ray/triangle sampling of the authored surfaces. Counting sheets
// alone misses edge-on slivers that still leave a mostly empty falling view.
export function faultViewCoverage(layout,{eye,yaw,pitch,columns=13,rows=9,tanHalfFov=.95,aspect=1.6,stage='fall'}={}){
  const triangles=layout.filter(sheet=>stage==='all'||sheet.stage===stage).flatMap(sheet=>{
    const out=[];
    for(let i=0;i<sheet.indices.length;i+=3){
      const [a,b,c]=sheet.indices.slice(i,i+3).map(index=>sheet.vertices[index]);
      out.push({a,u:b.map((v,k)=>v-a[k]),v:c.map((v,k)=>v-a[k])});
    }
    return out;
  });
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch),
    forward=[sy*cp,sp,-cy*cp],right=[cy,0,sy],up=[-sy*sp,cp,cy*sp];
  let hits=0;
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const x=((column+.5)/columns*2-1)*tanHalfFov,y=((row+.5)/rows*2-1)*tanHalfFov/aspect,
      d=forward.map((v,k)=>v+right[k]*x+up[k]*y);
    for(const {a,u,v}of triangles){
      const h=[d[1]*v[2]-d[2]*v[1],d[2]*v[0]-d[0]*v[2],d[0]*v[1]-d[1]*v[0]],det=u[0]*h[0]+u[1]*h[1]+u[2]*h[2];
      if(Math.abs(det)<1e-9)continue;
      const s=eye.map((n,k)=>n-a[k]),b=(s[0]*h[0]+s[1]*h[1]+s[2]*h[2])/det;
      if(b<0||b>1)continue;
      const q=[s[1]*u[2]-s[2]*u[1],s[2]*u[0]-s[0]*u[2],s[0]*u[1]-s[1]*u[0]],c=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])/det;
      if(c<0||b+c>1)continue;
      const t=(v[0]*q[0]+v[1]*q[1]+v[2]*q[2])/det;
      if(t>.1&&t<260){hits++;break;}
    }
  }
  return hits/(columns*rows);
}
