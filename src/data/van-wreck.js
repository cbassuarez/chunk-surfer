// The van as the sea keeps it, derived from the crash it had.
//
// One deformation, shared by the pack builder (tools/chunk_surfer/source-drive-
// study/build-van-wreck.mjs), the coastal scene and the tests, so a lamp, a door
// pivot or a buried nose computed here is the same point the mesh was bent to.
// Body frame of drive.glb: +X right (far side), +Y up, -Z is the front
// (headlamps at z -2.19), the wheels' floor at y 0.
//
// THE CRASH, IN NUMBERS (VAN_WRECK_CRASH below is computed, not typed in):
// - It leaves the road 27.8 m above the sea and meets the water at 23.16 m/s,
//   65 degrees nose down: measured off the plunge itself (door-teaser.js
//   doorDriveTeaserPoseAt either side of DOOR_DRIVE_WATER_ENTRY). Mass is the
//   game's own van, 2350 kg (vehicle-dynamics.js VEHICLE.mass).
// - 1.18 m of sea over the shingle where it lands. Quadratic drag on the
//   immersed nose (rho 1025, Cd .9, immersed area growing with penetration)
//   takes it to the bed at about 17 m/s.
// - The packed shingle gives under it and keeps a fifth of the energy; the
//   rest is crush. Crush follows Campbell's linear stiffness model,
//   E = integral over width of (A C + B C^2/2 + A^2/2B), with the van
//   coefficients Osterholt derived from NHTSA frontal barrier tests (A 64.92
//   kg/cm, B 8.39 kg/cm^2; Kodsi & Attalla, Accident Reconstruction Journal,
//   Sept/Oct 2017, table 5). Those are the older, softer vans this one is.
// - It struck near side first, so the crush profile runs 1.5:0.5 across the
//   front (C1..C6 in VAN_WRECK_CRASH.profileMm), and deepest at the leading
//   bottom edge, since it went in nose down.
//   For scale: NHTSA's 56 km/h full-width rigid-barrier tests of minivans
//   record 380-446 mm maximum static crush (2000 Mazda MPV, 2001 Dodge Caravan).
// - Sheet metal in the crush zone folds progressively. The crushed zone is
//   C / 0.72 long (stroke efficiency of progressive folding), and the folds
//   have the Wierzbicki-Abramowicz half wavelength H = 0.983 b^(2/3) t^(1/3)
//   for a 0.9 m panel span of 0.8 mm steel. Where the bend stretches a panel
//   past mild steel's fracture elongation the builder tears it open.
// - After the nose stopped it went over: rolled near side down the shelf, six
//   metres down a 46 degree face of shingle and talus to where it lies. That is
//   a rollover, and NHTSA's rollover field data (NASS-CDS maximum vertical roof
//   intrusion, the basis of the FMVSS 216 upgrade) puts van roofs at 150-400 mm
//   in rolls like it; this one takes 260 mm at the near rail. A roll racks the
//   box (a parallelogram, ~7 degrees), sprung latches leave the doors that
//   stayed on hanging open, and the stones dent the box where it struck.
//   The offset wrung the cab round, and the body buckled at the B-pillar
//   where the stiff cab meets the softer box.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const VAN_WRECK_ASSET='assets/source-drive/coastal-memory/van-wreck.glb';

const G0=9.80665;
// Where the box struck shingle and talus on the way down: a seeded scatter on
// the near side and roof (the faces it rolled over), fewer on the far side.
function tumbleDents(){
  let seed=20261105;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const out=[];
  for(let i=0;i<18;i++){
    const face=i<8?'near':i<14?'roof':'far',z=-.6+rnd()*3.0;
    const y=face==='roof'?2.02:.55+rnd()*1.3,x=face==='roof'?-.9+rnd()*1.6:face==='near'?-.985:.985;
    // The far side keeps clear of the lettering band (y 1.36-1.87).
    if(face==='far'&&y>1.25&&y<1.95)continue;
    out.push({face,centre:[x,y,z],radius:.22+rnd()*.3,depth:.04+rnd()*.09});
  }
  return out;
}
function solveCrash(){
  const mass=2350,entrySpeed=23.16,entryPitch=1.14,waterDepth=1.18,rho=1025,cd=.9;
  const width=1.97,height=2.024,bedShare=.2,eta=.72;
  // Water: integrate m dv/dt = -1/2 rho Cd A(x) v^2 down to the bed.
  let v=entrySpeed,x=0;const dt=1e-4;
  while(x<waterDepth){const area=Math.min(width*height,width*x/Math.sin(entryPitch));v-=.5*rho*cd*area*v*v/mass*dt;x+=v*dt;}
  const bedSpeed=v,kinetic=.5*mass*v*v,crushEnergy=kinetic*(1-bedShare);
  const A=64.92*G0/.01,B=8.39*G0/1e-4,G=A*A/(2*B);
  const shape=xx=>1+.5*(-xx/(width/2));
  const energy=s=>{let e=0;const n=240;for(let i=0;i<n;i++){const xx=-width/2+(i+.5)*width/n,c=s*shape(xx);e+=(A*c+B*c*c/2+G)*width/n;}return e;};
  let lo=0,hi=3;for(let i=0;i<64;i++){const mid=(lo+hi)/2;if(energy(mid)<crushEnergy)lo=mid;else hi=mid;}
  const mean=lo,profileMm=[0,1,2,3,4,5].map(i=>Math.round(mean*shape(-width/2+i*width/5)*1000));
  const panelSpan=.9,panelThickness=.0008,foldHalfWave=.983*panelSpan**(2/3)*panelThickness**(1/3);
  return{mass,entrySpeed,entryPitch,waterDepth,bedSpeed,kinetic,bedShare,crushEnergy,stiffness:{A,B,G,source:'Osterholt van, via Kodsi & Attalla 2017 table 5'},
    width,meanCrush:mean,profileMm,strokeEfficiency:eta,foldHalfWave,foldAmplitude:.45*foldHalfWave,
    // The slap, the wring and the buckle after the nose stopped.
    roofSlap:.26,rack:.12,twist:.22,fold:.2,
    dents:tumbleDents(),
    // Mild steel body panels tear past ~30% elongation; at a crease, less.
    tearStretch:1.27};
}
export const VAN_WRECK_CRASH=freeze(solveCrash());

export const VAN_WRECK=freeze({
  revision:'van-wreck-5',
  front:-2.272,
  // The ALBION lettering is bent with the panels it is painted on (brand), so
  // it creases, racks and dents with the metal instead of riding a frame.
  meshes:{hull:'van_wreck_hull',cabDoor:'van_wreck_cab_door',rearDoor:'van_wreck_rear_door',cabDoorNear:'van_wreck_cab_door_near',rearDoorFar:'van_wreck_rear_door_far',brand:'van_wreck_brand',brandRearDoor:'van_wreck_brand_rear_door',brandRearDoorFar:'van_wreck_brand_rear_door_far'},
  brandSource:'van_brand_drive',
  twist:{axisY:1.0,angle:VAN_WRECK_CRASH.twist,from:.8,span:3.0},
  fold:{hingeY:.25,hingeZ:.05,angle:VAN_WRECK_CRASH.fold,span:.3},
  // The builder subdivides here so the folds have vertices to fold with.
  // Only the painted steel folds; trim and fittings inside keep their own mesh.
  // Two passes: every painted panel to ~20 cm so the roll, rack and dents bend
  // it and pieces are cut locally, then fold-scale in the crush zone.
  subdivide:{zBelow:-1.0,maxEdge:VAN_WRECK_CRASH.foldHalfWave*.77,material:'van body enamel / exposed painted steel',panelEdge:.2},
  // Regions are tested on the ORIGINAL body-frame centroid of each triangle.
  pieces:{
    cabDoor:{source:'drive_cabin',box:{x:[.85,1.3],y:[.4,2.0],z:[-1.55,-.05]},pivot:[1.0,1.15,-.8]},
    rearDoor:{source:'drive_vehicle_body',box:{x:[-.95,0],y:[.25,2.0],z:[2.42,2.7]},pivot:[-.5,1.15,2.5]},
    // Still hinged, sprung open: rigid panels swung about their own hinge
    // line, which itself moved with the bend (VAN_WRECK_HINGES).
    cabDoorNear:{source:'drive_cabin',box:{x:[-1.3,-.85],y:[.4,2.0],z:[-1.55,-.05]},pivot:[-1.0,1.15,-1.48],rigid:true},
    rearDoorFar:{source:'drive_vehicle_body',box:{x:[0,.95],y:[.25,2.0],z:[2.42,2.7]},pivot:[.95,1.15,2.55],rigid:true},
  },
  // Hinge angles: about body +Y, sign opening the door outward.
  hinges:{cabDoorNear:{angle:1.15},rearDoorFar:{angle:-1.35}},
  // Torn away and not found: the front bumper (its mounts sheared in the
  // crush), the body opened along the B-pillar buckle, the roof split where
  // the slap met the buckle. Edges are ragged (jag in vanWreckPieceOf).
  gone:[
    {source:'drive_vehicle_body',box:{x:[-1.3,1.3],y:[0,.64],z:[-2.4,-1.92]}},
    {source:'*',box:{x:[-1.3,1.3],y:[.42,2.2],z:[-.03,.16]}},
    {source:'*',box:{x:[-1.3,.3],y:[1.74,2.2],z:[-.32,.42]}},
  ],
  // The near-side lamp led the crush and went with it.
  smashedLampMaterial:'powered headlamp diffuser',smashedLampSide:-1,
  survivingHeadlamp:1,
  cabinMount:[0,0,-.45],
});

// Crush at a point of the front: the solved width profile, deeper low down.
export function vanWreckCrushAt(x,y){
  const C=VAN_WRECK_CRASH,half=C.width/2,across=1+.5*(-clamp(x,-half,half)/half),low=1.25-.5*clamp(y/2.024);
  return C.meanCrush*across*low;
}
export function vanWreckTwist(z){const T=VAN_WRECK.twist;return T.angle*smooth((T.from-z)/T.span);}
// A rigid fitting at body z turns with the cab around it: this 4x4 (column
// major, body frame) carries it there.
export function vanWreckTwistMatrix(z){const a=vanWreckTwist(z),c=Math.cos(a),s=Math.sin(a),h=VAN_WRECK.twist.axisY;return[c,s,0,0,-s,c,0,0,0,0,1,0,h*s,h-h*c,0,1];}
function foldAngle(z){const F=VAN_WRECK.fold;return F.angle*smooth((z-F.hingeZ)/F.span);}
// The rigid fold that carries everything behind the buckle (rear axle, lettering).
export function vanWreckFoldMatrix(){const F=VAN_WRECK.fold,c=Math.cos(F.angle),s=Math.sin(F.angle),hy=F.hingeY,hz=F.hingeZ;return[1,0,0,0,0,c,s,0,0,-s,c,0,0,hy-hy*c+hz*s,hz-hy*s-hz*c,1];}
// How far back the crushed zone reaches at (x,y): C / stroke efficiency.
export function vanWreckZoneEnd(x,y){return VAN_WRECK.front+vanWreckCrushAt(x,y)/VAN_WRECK_CRASH.strokeEfficiency;}

export function vanWreckPoint(p){
  let[x,y,z]=p;
  const W=VAN_WRECK,K=VAN_WRECK_CRASH,z0=W.front;
  // 1. The crush. Material from the front back to the zone end is folded into
  // what remains of that length once the front has moved back by C.
  const c=vanWreckCrushAt(x,y),zoneEnd=z0+c/K.strokeEfficiency;
  if(z<zoneEnd){
    const along=clamp((z-z0)/(zoneEnd-z0)),folded=1-along;
    z=z0+c+(z-z0)*(zoneEnd-z0-c)/(zoneEnd-z0);
    // Progressive folds: lobes at the folding half wavelength, popping out of
    // the sides and tenting the bonnet up, strongest where most was folded.
    const H=K.foldHalfWave,lobe=Math.abs(Math.sin(Math.PI*(p[2]-z0)/H)),a=K.foldAmplitude*(.35+.65*folded)*lobe;
    if(Math.abs(x)>.78)x+=Math.sign(x)*a*smooth((Math.abs(x)-.78)/.15);
    if(y>.85)y+=a*1.3*smooth((y-.85)/.3);
    // The leading bottom edge was driven back hardest and folds under.
    y-=.18*folded*folded*smooth((.7-y)/.5);
  }
  // 2. The roll: the near roof rail crushed down and in along the box, the
  // whole box racked over toward it, and dented where it struck the stones.
  if(y>1.4){const near=smooth((-x+.25)/1.1),along=Math.exp(-(((z-.9)/1.9)**2)),up=smooth((y-1.4)/.55);y-=K.roofSlap*near*along*up;x+=.09*near*along*up;}
  {const box=smooth((p[2]+.1)/.5);x-=K.rack*(y-.25)*box;}
  for(const d of K.dents){const dx=p[0]-d.centre[0],dy=p[1]-d.centre[1],dz=p[2]-d.centre[2],r=Math.hypot(d.face==='roof'?dx:dy,dz,d.face==='roof'?dy*3:dx*3);if(r>=d.radius)continue;const k=d.depth*(1-(r/d.radius)**2)**2;if(d.face==='roof')y-=k*smooth((.9-Math.abs(p[0]))/.15);else if(d.face==='near')x+=k;else x-=k;}
  // 3. The buckle behind the cab.
  {const a=foldAngle(p[2]),c2=Math.cos(a),s=Math.sin(a),F=W.fold,dy=y-F.hingeY,dz=z-F.hingeZ;[y,z]=[F.hingeY+dy*c2-dz*s,F.hingeZ+dy*s+dz*c2];}
  // 4. The wring from the offset.
  {const a=vanWreckTwist(p[2]),c2=Math.cos(a),s=Math.sin(a),h=W.twist.axisY,dy=y-h;[x,y]=[x*c2-dy*s,h+x*s+dy*c2];}
  return[x,y,z];
}
const jag=(c,k)=>.09*Math.sin(c[(k+1)%3]*7.3+c[(k+2)%3]*5.1)+.05*Math.sin(c[(k+1)%3]*17.9-c[(k+2)%3]*11.3);
export function vanWreckPieceOf(source,centroid){
  for(const g of VAN_WRECK.gone){
    if(g.source!=='*'&&g.source!==source)continue;
    if(['x','y','z'].every((axis,i)=>centroid[i]>=g.box[axis][0]+jag(centroid,i)&&centroid[i]<=g.box[axis][1]-jag(centroid,i)))return 'gone';
  }
  for(const[key,piece]of Object.entries(VAN_WRECK.pieces)){
    if(piece.source!==source)continue;
    if(['x','y','z'].every((axis,i)=>centroid[i]>=piece.box[axis][0]&&centroid[i]<=piece.box[axis][1]))return key;
  }
  return 'hull';
}
// A sprung door: rigid, swung about body +Y through its own hinge point, and
// carried to where the bend put that hinge. Column-major 4x4 in the body frame.
export function vanWreckHingedMatrix(key){
  const piece=VAN_WRECK.pieces[key],hinge=VAN_WRECK.hinges[key];if(!piece||!hinge)return null;
  const h=piece.pivot,to=vanWreckPoint(h),a=hinge.angle,c=Math.cos(a),s=Math.sin(a);
  // R about Y, then from the hinge's original spot to its bent one.
  return[c,0,-s,0,0,1,0,0,s,0,c,0,to[0]-(c*h[0]+s*h[2]),to[1]-h[1],to[2]-(-s*h[0]+c*h[2]),1];
}
// The one working headlamp, where the crush left it.
export function vanWreckHeadlamp(headlamps){const p=headlamps?.[VAN_WRECK.survivingHeadlamp];return Array.isArray(p)?vanWreckPoint(p):null;}
// Where the nose bottom ends up: the point the wreck is bedded on.
export const VAN_WRECK_NOSE=freeze(vanWreckPoint([0,.32,VAN_WRECK.front]));
