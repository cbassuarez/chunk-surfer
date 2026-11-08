// HORIZON. He walks up to whoever is there, and that is all he has to do. What is
// wrong is the place he does it in: the space itself is curved, so the plain things
// a body knows about distance stop being true. The route it serves stays as it was.
//
//   closed       A closed space. Everything he walks away from grows, and past
//                halfway what he walks towards shrinks before it comes to its own
//                size at his feet. Every road out arrives at the same place.
//   circle-limit The other way. Each pace out there is more ground than the last:
//                tiles without end inside a horizon he never gets nearer, too much
//                room to walk round anything. After Escher's Circle Limit.
//   relativity   A straight flat road, and round it Source II's own house of stairs
//                hung at right angles, each with its own idea of down.
//
// Positions are metres in the map from the object at the origin: `r` out along a
// straight line of the space, `phi` the bearing. `frame` is where he is, as a 4x4
// of the space, and it is the only truth about it: walking is composing it.
export const HORIZON_APPROACH=Object.freeze({
  walk:3,bodyRadius:.22,eye:1.62,maxFrameDelta:.1,
  variants:Object.freeze({
    closed:Object.freeze({sign:1,radius:26,startMetres:74,roads:7,roadHalfWidth:1.5,hub:2.6}),
    'circle-limit':Object.freeze({sign:-1,radius:3,startMetres:15,tileRings:6.2}),
    // Flat, to the width of a hair: the curvature is too slight to matter, and all
    // the impossibility is in what hangs round the road.
    relativity:Object.freeze({sign:1,radius:2000,startMetres:42,roadHalfWidth:1.5,hub:3.4,roadEnd:60,cell:62,scale:.82}),
  }),
  defaultVariant:'closed',
  // Where each thing stands, as a bearing and a share of the way round the space.
  occupants:Object.freeze(['sarah','lyle','daisy','ant']),
  station:Object.freeze({reach:3.2}),
  daisy:Object.freeze({petals:21,height:.46,petalRadius:.075}),
  commit:7,
});
const C=HORIZON_APPROACH;
export const horizonApproachVariantIds=Object.freeze(Object.keys(C.variants));
export const horizonApproachVariantId=id=>Object.hasOwn(C.variants,id)?id:C.defaultVariant;

// ── THE SPACE ───────────────────────────────────────────────────────────────
// Column vectors, row-major arrays of 16. x,y,z are the tangent directions at the
// frame's own origin, w the fourth. Only these few moves are ever needed.
export const spaceIdentity=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
export function spaceMultiply(a,b){
  const o=new Array(16).fill(0);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)for(let k=0;k<4;k++)o[r*4+c]+=a[r*4+k]*b[k*4+c];
  return o;
}
// `distance` metres along the unit tangent `d`.
export function spaceTranslation(sign,radius,d,distance){
  const a=distance/radius,c=sign>0?Math.cos(a):Math.cosh(a),s=sign>0?Math.sin(a):Math.sinh(a),m=spaceIdentity(),[x,y,z]=d;
  const D=[x,y,z];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)m[i*4+j]+=(c-1)*D[i]*D[j];
  for(let i=0;i<3;i++){m[i*4+3]=D[i]*s;m[12+i]=(sign>0?-1:1)*D[i]*s;}
  m[15]=c;
  return m;
}
export const spaceInverse=(sign,m)=>{
  const o=new Array(16);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){const flip=sign<0&&(r===3)!==(c===3)?-1:1;o[r*4+c]=flip*m[c*4+r];}
  return o;
};
export function spaceAtMap(sign,radius,r,phi){
  return spaceTranslation(sign,radius,[Math.sin(phi),0,Math.cos(phi)],r);
}
// Where a frame's origin is, on the map.
export function spaceMapOf(sign,radius,m){
  const x=m[3],y=m[7],z=m[11],w=m[15],l=Math.hypot(x,y,z),chi=sign>0?Math.atan2(l,w):Math.asinh(l),r=chi*radius;
  return{r,phi:Math.atan2(x,z),x:l>1e-9?x/l*r:0,y:l>1e-9?y/l*r:0,z:l>1e-9?z/l*r:0};
}
// How far apart two frames' origins are, along the space's own line.
export function spaceDistance(sign,radius,a,b){
  const dot=a[3]*b[3]+a[7]*b[7]+a[11]*b[11]+(sign>0?1:-1)*a[15]*b[15];
  return radius*(sign>0?Math.acos(Math.max(-1,Math.min(1,dot))):Math.acosh(Math.max(1,-dot)));
}
// How large something of `size` metres looks from `distance` metres. The whole of
// what a body can test, in one line.
export function apparentAngle(sign,radius,size,distance){
  const a=distance/radius,s=sign>0?Math.sin(a):Math.sinh(a);
  return Math.atan2(size,radius*Math.abs(s));
}
// The frame the camera renders from, as a column-major uniform.
export function spaceEyeUniform(sign,radius,frame,eye=C.eye){
  const m=spaceInverse(sign,spaceMultiply(frame,spaceTranslation(sign,radius,[0,1,0],eye))),o=new Float32Array(16);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)o[c*4+r]=m[r*4+c];
  return o;
}

// ── WHO IS THERE ────────────────────────────────────────────────────────────
// `record` is what the night has already written down; stage 2 reads it from the
// save. The night leans somewhere first; if whoever it leans to could not make the
// offer, someone who can comes instead. The daisy needs nothing brought to it, so
// there is always someone. The truth is given either way.
const LATE_ARC=.55;
export function horizonOccupantConditions(record={}){
  return{
    sarah:record.sarahRespected===true,
    lyle:record.lyleBox==='broken'||record.lyleBox==='whole',
    daisy:true,
    ant:record.antWatched===true,
  };
}
export function horizonOccupantLeaning(record={}){
  const named=String(record.confession||'').trim().toLowerCase(),arc=Math.max(0,Math.min(1,Number(record.arc)||0)),late=Math.max(0,(arc-LATE_ARC)/(1-LATE_ARC)),score={
    sarah:(named==='sarah'?3:0)+(record.sarahPage?1:0)+(record.benchQuestion?1:0),
    lyle:(named==='lyle'?3:0)+(record.coast?1:0)+(record.lyleBox?1:0),
    // Late on, the small things lean in. The ant first if he stopped for it.
    ant:late*3+(record.antWatched?.5:0),
    daisy:late*3+.1,
  },tie=['sarah','lyle','ant','daisy'];
  return C.occupants.slice().sort((a,b)=>score[b]-score[a]||tie.indexOf(a)-tie.indexOf(b));
}
export function chooseHorizonOccupant(record={}){
  const met=horizonOccupantConditions(record),order=horizonOccupantLeaning(record),leaning=order[0],
    occupant=met[leaning]?leaning:order.find(id=>id!=='daisy'&&met[id])||'daisy';
  return{occupant,leaning,fellBack:occupant!==leaning,condition:occupant==='daisy'?false:met[occupant],lyleBox:occupant==='lyle'?record.lyleBox:null};
}
// Counting from "loves me", an odd number of petals ends on "loves me".
export const horizonDaisyWord=plucked=>plucked%2===1?'loves me':'loves me not';
