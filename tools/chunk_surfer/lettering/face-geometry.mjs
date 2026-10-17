// A print is an opaque physical face, with reader-right and reader-up explicit.
// Top-left UVs match the independently authored RGB/coverage atlas convention.
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
export function printedFaceGeometry({center,readerRight,up,widthM,heightM,uvRect=[0,0,1,1],shape='rectangle',drapeM=0}){
 const n=unit(cross(readerRight,up)),positions=[],normals=[],uvs=[],indices=[];
 const vertex=(u,v)=>{
  const x=(u-.5)*widthM,y=(.5-v)*heightM,z=-drapeM*Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
  const du=-drapeM*Math.PI*Math.cos(Math.PI*u)*Math.sin(Math.PI*v),dv=-drapeM*Math.PI*Math.sin(Math.PI*u)*Math.cos(Math.PI*v);
  positions.push(...center.map((c,k)=>c+readerRight[k]*x+up[k]*y+n[k]*z));
  normals.push(...unit(n.map((c,k)=>c-readerRight[k]*du/widthM+up[k]*dv/heightM)));
  uvs.push(uvRect[0]+u*(uvRect[2]-uvRect[0]),uvRect[1]+v*(uvRect[3]-uvRect[1]));
 };
 if(shape==='circle'){
  vertex(.5,.5);const segments=48;
  for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;vertex(.5+.5*Math.cos(a),.5-.5*Math.sin(a));}
  for(let i=0;i<segments;i++)indices.push(0,i+1,i+2);
 }else{
  const nx=drapeM?20:1,ny=drapeM?6:1;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)vertex(i/nx,j/ny);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
 }
 return{positions,normals,uvs,indices,normal:n};
}
