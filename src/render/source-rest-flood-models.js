// Small depth-tested air shells. Their actual radius and rise come from the
// flood frame, never from screen coordinates or the player's head direction.
export function sourceRestFloodGeometryLibrary(){
  const p=[],i=[],sides=12,rings=9;
  for(let row=0;row<rings;row++){
    const y=-Math.cos(row/(rings-1)*Math.PI),r=Math.sqrt(Math.max(0,1-y*y));
    for(let n=0;n<sides;n++){const a=n/sides*Math.PI*2;p.push(Math.cos(a)*r,y,Math.sin(a)*r);}
  }
  for(let row=0;row<rings-1;row++)for(let n=0;n<sides;n++){
    const a=row*sides+n,b=row*sides+(n+1)%sides,c=a+sides,d=b+sides;i.push(a,c,b,b,c,d);
  }
  return{'rest-flood-bubble':{p,i,material:'steel',base:[.12,.24,.26,1],emissive:[.013,.025,.028],roughness:.17}};
}
