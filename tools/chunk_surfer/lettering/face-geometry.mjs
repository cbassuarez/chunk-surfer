// A print is an opaque physical face, with reader-right and reader-up explicit.
// Top-left UVs match the independently authored RGB/coverage atlas convention.
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
// One metre-space construction for the banner tied at the park railing. The
// four corners retain their authored datums; gravity moves the free spans down
// and the unsupported cloth bows toward the reader. Every attached layer uses
// this surface, rather than approximating its curvature with another sine.
export const RAILING_BANNER_CLOTH=Object.freeze({version:1,shape:'railing-banner',segmentsX:96,segmentsY:24,
  topSagM:.035,bottomSagM:.015,bowM:.060,foldsM:[.013,.006],hemWidthM:.018,
  clothThicknessM:.0012,hemReturnDepthM:.0014,tapeThicknessM:.0005});
export function railingBannerSurface({u,v,center,readerRight,up,widthM,heightM,offsetM=0}){
  const spec=RAILING_BANNER_CLOTH,n=unit(cross(readerRight,up)),s=Math.max(0,Math.sin(Math.PI*u)),ds=Math.PI*Math.cos(Math.PI*u);
  const top=spec.topSagM*s**1.45,bottom=spec.bottomSagM*s**1.30;
  const dTop=spec.topSagM*1.45*s**.45*ds,dBottom=spec.bottomSagM*1.30*s**.30*ds;
  const sag=(1-v)*top+v*bottom,sagU=(1-v)*dTop+v*dBottom,sagV=bottom-top;
  const sv=Math.sin(Math.PI*v),cv=Math.PI*Math.cos(Math.PI*v),bowWeight=.35+.65*sv;
  let z=spec.bowM*s*bowWeight,zu=spec.bowM*ds*bowWeight,zv=spec.bowM*s*.65*cv;
  for(const [amplitude,frequency,bias,phase]of[[spec.foldsM[0],3.25,.42,.7],[spec.foldsM[1],6.7,-.7,1.4]]){
    const angle=2*Math.PI*(u*frequency+v*bias)+phase,w=.30+.70*sv,sa=Math.sin(angle),ca=Math.cos(angle);
    z+=amplitude*s*w*sa;
    zu+=amplitude*w*(ds*sa+s*ca*2*Math.PI*frequency);
    zv+=amplitude*s*(.70*cv*sa+w*ca*2*Math.PI*bias);
  }
  const local=[(u-.5)*widthM,(.5-v)*heightM-sag,z];
  const du=readerRight.map((q,k)=>q*widthM-up[k]*sagU+n[k]*zu);
  const dv=up.map((q,k)=>-q*(heightM+sagV)+n[k]*zv);
  const normal=unit(cross(dv,du));
  const position=center.map((q,k)=>q+readerRight[k]*local[0]+up[k]*local[1]+n[k]*local[2]+normal[k]*offsetM);
  return{position,normal,du,dv,local,sagM:sag,depthM:z};
}

export function railingBannerHemLift(u,v,widthM,heightM){
  const d=Math.min(u*widthM,(1-u)*widthM,v*heightM,(1-v)*heightM),w=RAILING_BANNER_CLOTH.hemWidthM;
  return d>=0&&d<w?.00015+.0005*Math.sin(Math.PI*d/w):0;
}

// A finite patch of that same cloth, optionally with a physical return or tape
// offset. Window coordinates remain original material UVs; no glyph scales or
// atlas coverage change when the banner takes its weight.
export function railingBannerPatch({center,readerRight,up,widthM,heightM,uvRect=[0,0,1,1],
  materialWindow=[0,0,1,1],segmentsX,segmentsY,offset=()=>0,reverse=false,physicalUv=false}={}){
  const positions=[],normals=[],uvs=[],indices=[],nx=segmentsX??RAILING_BANNER_CLOTH.segmentsX,ny=segmentsY??RAILING_BANNER_CLOTH.segmentsY;
  const point=(u,v)=>railingBannerSurface({u,v,center,readerRight,up,widthM,heightM,offsetM:offset(u,v)}).position;
  const derivative=(u,v,axis)=>{
    const e=1e-5,lo=axis===0?Math.max(0,u-e):Math.max(0,v-e),hi=axis===0?Math.min(1,u+e):Math.min(1,v+e);
    const a=axis===0?point(lo,v):point(u,lo),b=axis===0?point(hi,v):point(u,hi);return b.map((q,k)=>(q-a[k])/(hi-lo));
  };
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const a=i/nx,b=j/ny,u=materialWindow[0]+a*(materialWindow[2]-materialWindow[0]),v=materialWindow[1]+b*(materialWindow[3]-materialWindow[1]);
    const p=point(u,v),normal=unit(cross(derivative(u,v,1),derivative(u,v,0)));
    positions.push(...p);normals.push(...normal.map(q=>reverse?-q:q));
    uvs.push(...(physicalUv?[(u-.5)*widthM/.25,(.5-v)*heightM]:[uvRect[0]+u*(uvRect[2]-uvRect[0]),uvRect[1]+v*(uvRect[3]-uvRect[1])]));
  }
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
    indices.push(...(reverse?[a,b,c,b,d,c]:[a,c,b,b,c,d]));
  }
  return{positions,normals,uvs,indices,normal:unit(cross(readerRight,up)),grid:[nx,ny],materialWindow};
}
export function printedFaceGeometry({center,readerRight,up,widthM,heightM,uvRect=[0,0,1,1],shape='rectangle',drapeM=0}){
 if(shape==='railing-banner')return railingBannerPatch({center,readerRight,up,widthM,heightM,uvRect});
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
