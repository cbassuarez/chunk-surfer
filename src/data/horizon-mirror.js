// HORIZON, THE MIRROR. docs/plans/horizon-mirror.md.
//
// Local metres. He arrives at the origin facing -Z. The chapel road runs on
// straight ahead; a little way along it, off to the left and turned to meet him,
// stands a mirror whose frame is coming away in a spiral. Behind the glass is the
// same place reflected, with one thing added: St Brendan's, which stands nowhere
// on this side. Whoever is in the mirror is one of four, and never quite clear.
export const HORIZON_MIRROR=Object.freeze({
  walk:4.2,bodyRadius:.22,eye:1.62,maxFrameDelta:.1,
  spawn:Object.freeze({x:0,z:0}),
  road:Object.freeze({halfWidth:1.6,from:8,to:-160}),
  // `normal` is the way the glass faces, toward the road and the way he came.
  mirror:Object.freeze({x:-3.6,z:-17,normal:Object.freeze([.42,.91]),width:2.6,height:5.2,bottom:.2,frame:.3,depth:.18}),
  // How far past the mirror, along the road, counts as walking on.
  passed:14,
  chapel:Object.freeze({x:0,z:-150,scale:1.25}),
  floorRadius:230,
  // The occupant stands this far behind the glass; the nested mirrors recede
  // behind it, each smaller; St Brendan's is far back and off to one side.
  occupantDepth:2.4,
  nest:Object.freeze({levels:3,first:6,gap:4.2,scale:.56}),
  church:Object.freeze({depth:58,lateral:-14,yaw:.35}),
  // The captured view is taken from here: in front of the glass at eye height.
  capture:Object.freeze({distance:3.2}),
  daisy:Object.freeze({petals:21,height:2.4,headRadius:.42,petalLength:.62}),
  occupants:Object.freeze(['sarah','lyle','daisy','ant']),
});
const C=HORIZON_MIRROR;
const unit2=([x,z])=>{const l=Math.hypot(x,z)||1;return[x/l,z/l];};
// The glass's own frame: `n` out of the glass, `t` along it to his right as he
// faces it, origin at the foot of its centre line.
export function horizonMirrorBasis(){
  const[nx,nz]=unit2(C.mirror.normal);
  return{n:[nx,0,nz],t:[nz,0,-nx],o:[C.mirror.x,0,C.mirror.z]};
}
// A point in the glass's frame: `along` the glass, `up`, `out` (negative is
// behind the glass).
export function horizonMirrorPoint(along,up,out){
  const{n,t,o}=horizonMirrorBasis();
  return[o[0]+t[0]*along+n[0]*out,up,o[2]+t[2]*along+n[2]*out];
}
// The world behind the glass is this side reflected across its plane.
export function horizonMirrorReflect([x,y,z]){
  const{n,o}=horizonMirrorBasis(),d=(x-o[0])*n[0]+(z-o[2])*n[2];
  return[x-2*d*n[0],y,z-2*d*n[2]];
}
// The reflection as a column-major matrix, to multiply an instance's matrix by.
export function horizonMirrorReflectionMatrix(){
  const{n,o}=horizonMirrorBasis(),d=o[0]*n[0]+o[2]*n[2],nx=n[0],nz=n[2];
  return new Float32Array([1-2*nx*nx,0,-2*nx*nz,0, 0,1,0,0, -2*nx*nz,0,1-2*nz*nz,0, 2*d*nx,0,2*d*nz,1]);
}
// Where he is relative to the glass: `out` in front of it (positive), `along` it.
export function horizonMirrorLocal(x,z){
  const{n,t,o}=horizonMirrorBasis(),dx=x-o[0],dz=z-o[2];
  return{out:dx*n[0]+dz*n[2],along:dx*t[0]+dz*t[2]};
}
// The four corners of the glass and what the tower door needs to draw it.
export function horizonMirrorWindow(){
  const{n}=horizonMirrorBasis(),w=C.mirror.width/2,b=C.mirror.bottom,h=b+C.mirror.height;
  return{corners:[horizonMirrorPoint(-w,b,0),horizonMirrorPoint(w,b,0),horizonMirrorPoint(w,h,0),horizonMirrorPoint(-w,h,0)],
    origin:horizonMirrorPoint(0,0,0),forward:[-n[0],-n[2]],width:C.mirror.width};
}
// The capture's eye and its yaw (looking into the glass).
export function horizonMirrorCaptureEye(){
  const{n}=horizonMirrorBasis();
  return{eye:horizonMirrorPoint(0,C.eye,C.capture.distance),yaw:Math.atan2(-n[0],n[2])};
}
