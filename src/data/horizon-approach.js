// HORIZON. He walks up to whoever is there, and that is all he has to do. What is
// wrong is the place he does it in: a closed space. Everything he walks away from
// grows, and past halfway what he walks towards shrinks before it comes to its own
// size at his feet. Every road out arrives at the same place. The route it serves
// stays as it was.
//
// Round him the sky is full of what is left: car parts, flashlights, sheet music,
// daisies, pieces of the moor. Far off they are enormous. They are all ordinary
// things, the game's own, and when he goes under one it is only that.
//
// Positions are metres in the map from the object at the origin: `r` out along a
// straight line of the space, `phi` the bearing. `frame` is where he is, as a 4x4
// of the space, and it is the only truth about it: walking is composing it.
export const HORIZON_APPROACH=Object.freeze({
  walk:3,bodyRadius:.22,eye:1.62,maxFrameDelta:.1,
  // An odd number of roads, so that none runs through his own antipode and fills the
  // sky with itself.
  space:Object.freeze({sign:1,radius:26,startMetres:74,roads:7,roadHalfWidth:1.5,hub:2.6}),
  occupants:Object.freeze(['sarah','lyle','daisy','ant']),
  station:Object.freeze({reach:3.2,standOff:.7}),
  daisy:Object.freeze({petals:21,height:.46,petalRadius:.075}),
  commit:7,
  debris:Object.freeze({count:118,clearance:5,sightline:7,seed:0x50d5a1,rate:Object.freeze([.05,.24])}),
});
const C=HORIZON_APPROACH,S=C.space,TAU=Math.PI*2;

// What is up there. Every mesh is the game's own but the pieces of moor, which are
// torn from the height field the drive's own land is made of. `scale` is a range,
// `emissive` how much it shows against the sky, `sy` a part's own stretch.
const PAPER=Object.freeze([.9,.88,.8,.22]),METAL=Object.freeze([.6,.62,.66,.14]);
export const HORIZON_DEBRIS_KINDS=Object.freeze([
  {id:'flashlight',weight:5,scale:[8,12],emissive:METAL,parts:['opening_cab_flashlight_reference_body','opening_cab_flashlight_reference_housing_graphite']},
  {id:'flashlight-throw',weight:4,scale:[8,12],emissive:METAL,parts:['opening_cab_flashlight_throw_body','opening_cab_flashlight_throw_housing_olive']},
  {id:'flashlight-flood',weight:4,scale:[8,12],emissive:METAL,parts:['opening_cab_flashlight_flood_body','opening_cab_flashlight_flood_housing_ivory']},
  {id:'steering-wheel',weight:6,scale:[4,6],emissive:METAL,parts:['opening_drive_wheel']},
  {id:'tyre',weight:7,scale:[2.4,3.6],emissive:METAL,parts:['opening_drive_tyre']},
  {id:'wiper',weight:3,scale:[5,8],emissive:METAL,parts:['opening_drive_wiper']},
  {id:'car',weight:3,scale:[1,1.3],emissive:METAL,parts:['street_pilot_car_body']},
  {id:'wheel',weight:4,scale:[2,3],emissive:METAL,parts:['street_pilot_car_wheel']},
  {id:'van-door',weight:5,scale:[1.2,1.8],parts:['mf_door_leaf','mf_door_glass','mf_door_trim','mf_door_metal']},
  {id:'hubcap',weight:5,scale:[5,8],parts:['mf_hubcap']},
  {id:'daisy',weight:14,scale:[10,17],parts:['mf_hero_petal','mf_hero_disc',{mesh:'mf_hero_stem',sy:.2}]},
  {id:'score',weight:8,scale:[5,8],emissive:PAPER,parts:['open_score']},
  {id:'loose-pages',weight:8,scale:[4,7],emissive:PAPER,parts:['loose_pages']},
  {id:'take-sheet',weight:4,scale:[7,12],emissive:PAPER,parts:['stop_listening_take_sheet']},
  {id:'programme',weight:2,scale:[7,10],emissive:PAPER,parts:['opening_cab_recital_programme']},
  {id:'music-stand',weight:3,scale:[2,3],emissive:METAL,parts:['music_stand']},
  {id:'metronome',weight:3,scale:[5,8],emissive:METAL,parts:['metronome']},
  {id:'cable',weight:3,scale:[3,5],emissive:METAL,parts:['cable_coil']},
  {id:'recorder',weight:3,scale:[9,14],emissive:METAL,parts:['opening_cab_field_recorder_body','opening_cab_field_recorder_faceplate_olive']},
  {id:'headphones',weight:3,scale:[7,10],emissive:METAL,parts:['opening_cab_headphones_reference']},
  {id:'field-case',weight:2,scale:[2,3],emissive:METAL,parts:['opening_cab_field_case']},
  {id:'jumper',weight:2,scale:[1.5,2],parts:['mf_jumper']},
  {id:'bag',weight:2,scale:[1.5,2.5],parts:['the_bag_0']},
  {id:'moor-0',weight:4,scale:[.8,1.3],clear:12,parts:['ha_moor_0','ha_moor_under_0']},
  {id:'moor-1',weight:4,scale:[.8,1.3],clear:12,parts:['ha_moor_1','ha_moor_under_1']},
  {id:'moor-2',weight:4,scale:[.8,1.3],clear:12,parts:['ha_moor_2','ha_moor_under_2']},
].map(k=>Object.freeze({...k,scale:Object.freeze(k.scale),parts:Object.freeze(k.parts.map(p=>Object.freeze(typeof p==='string'?{mesh:p}:p)))})));
export const horizonDebrisMeshes=()=>[...new Set(HORIZON_DEBRIS_KINDS.flatMap(k=>k.parts.map(p=>p.mesh)))];
const seeded=seed=>{let a=seed>>>0;return()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
let field=null;
// The same sky every time. Spread evenly through the whole of the space, above the
// ground and below it, and never low enough to walk into.
export function horizonDebrisField(){
  if(field)return field;
  const random=seeded(C.debris.seed),gauss=()=>Math.sqrt(-2*Math.log(1-random()))*Math.cos(TAU*random()),
    total=HORIZON_DEBRIS_KINDS.reduce((sum,k)=>sum+k.weight,0),rows=[];
  while(rows.length<C.debris.count){
    let pick=random()*total,kind=HORIZON_DEBRIS_KINDS[0];
    for(const k of HORIZON_DEBRIS_KINDS){pick-=k.weight;if(pick<=0){kind=k;break;}}
    const q=[gauss(),gauss(),gauss(),gauss()],n=Math.hypot(...q),[x,y,z,w]=q.map(v=>v/n),l=Math.hypot(x,y,z),chi=Math.atan2(l,w);
    if(Math.abs(Math.asin(y))*S.radius<C.debris.clearance+(kind.clear||0))continue;
    // Nothing hangs right over the road he starts on: nothing should be mistaken for
    // whoever is at the end of it.
    if(Math.abs(Math.asin(x))*S.radius<C.debris.sightline)continue;
    const axis=[gauss(),gauss(),gauss()],a=Math.hypot(...axis),[lo,hi]=C.debris.rate;
    rows.push(Object.freeze({id:rows.length,kind:kind.id,base:Object.freeze([x/l*chi*S.radius,y/l*chi*S.radius,z/l*chi*S.radius]),
      axis:Object.freeze(axis.map(v=>v/a)),phase:random()*TAU,rate:(lo+(hi-lo)*random())*(random()<.5?-1:1),scale:kind.scale[0]+(kind.scale[1]-kind.scale[0])*random()}));
  }
  field=Object.freeze(rows);return field;
}

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
export function spaceTranslation(d,distance){
  const a=distance/S.radius,c=Math.cos(a),s=Math.sin(a),m=spaceIdentity();
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)m[i*4+j]+=(c-1)*d[i]*d[j];
  for(let i=0;i<3;i++){m[i*4+3]=d[i]*s;m[12+i]=-d[i]*s;}
  m[15]=c;
  return m;
}
export const spaceInverse=m=>{
  const o=new Array(16);
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)o[r*4+c]=m[c*4+r];
  return o;
};
export const spaceAtMap=(r,phi)=>spaceTranslation([Math.sin(phi),0,Math.cos(phi)],r);
// Where a frame's origin is, on the map.
export function spaceMapOf(m){
  const x=m[3],y=m[7],z=m[11],w=m[15],l=Math.hypot(x,y,z),r=Math.atan2(l,w)*S.radius;
  return{r,phi:Math.atan2(x,z),x:l>1e-9?x/l*r:0,y:l>1e-9?y/l*r:0,z:l>1e-9?z/l*r:0};
}
// How far apart two frames' origins are, along the space's own line.
export function spaceDistance(a,b){
  const dot=a[3]*b[3]+a[7]*b[7]+a[11]*b[11]+a[15]*b[15];
  return S.radius*Math.acos(Math.max(-1,Math.min(1,dot)));
}
// How large something of `size` metres looks from `distance` metres. The whole of
// what a body can test, in one line.
export const apparentAngle=(size,distance)=>Math.atan2(size,S.radius*Math.abs(Math.sin(distance/S.radius)));
// The frame the camera renders from, as a column-major uniform.
export function spaceEyeUniform(frame,eye=C.eye){
  const m=spaceInverse(spaceMultiply(frame,spaceTranslation([0,1,0],eye))),o=new Float32Array(16);
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
