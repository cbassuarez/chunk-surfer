import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HORIZON_APPROACH as C,horizonApproachVariantIds,spaceIdentity,spaceMultiply,spaceTranslation,spaceInverse,spaceAtMap,spaceMapOf,spaceDistance,spaceEyeUniform,apparentAngle,
  horizonOccupantConditions,horizonOccupantLeaning,chooseHorizonOccupant,horizonDaisyWord} from '../src/data/horizon-approach.js';
import {freshHorizonApproach,stepHorizonApproach,horizonApproachDistance,horizonApproachOnGround,horizonApproachNear,horizonApproachMap,pluckHorizonApproachPetal,HORIZON_APPROACH_EVENT as E,HORIZON_TOWER_BEARING} from '../src/game/horizon-approach-scene.js';
import {horizonApproachGeometry,HORIZON_APPROACH_MESHES,circleLimitTiles} from '../src/render/horizon-approach-models.js';
import {horizonApproachRenderFrame,horizonApproachObjectProps,HORIZON_ANT_MESH,HORIZON_CHURCH_MESH,HORIZON_DAISY_MESHES,HORIZON_FIGURES,HORIZON_MASONRY,HORIZON_SLAB_MESHES} from '../src/render/horizon-approach-frame.js';
import {CURVED_SPACE_GLSL,CURVED_SPACE_OFF,curvedSpaceUniforms} from '../src/render/curved-space.js';

const close=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const TAU=Math.PI*2;
const apply=(m,v)=>[0,1,2,3].map(r=>m[r*4]*v[0]+m[r*4+1]*v[1]+m[r*4+2]*v[2]+m[r*4+3]*v[3]);
const sameMatrix=(a,b,e=1e-9)=>a.every((v,k)=>close(v,b[k],e));
function walk(state,seconds,input={forward:1},dt=1/30){
  const events=[];
  for(let t=0;t<seconds;t+=dt){const r=stepHorizonApproach(state,{dt,...input});state=r.state;events.push(...r.events);}
  return{state,events};
}
// The vertex shader's own sums, on the CPU, so the two can be held to each other.
function curvedPoint(sign,R,eyeMatrix,w,base=[0,0,0]){
  const local=w.map((v,k)=>v-base[k]),lr=Math.hypot(...local),la=lr/R,br=Math.hypot(...base),ba=br/R;
  const ln=lr>1e-5?local.map(v=>v/lr):[0,0,0],bn=br>1e-5?base.map(v=>v/br):[0,0,1];
  const lc=sign>0?Math.cos(la):Math.cosh(la),ls=sign>0?Math.sin(la):Math.sinh(la),bc=sign>0?Math.cos(ba):Math.cosh(ba),bs=sign>0?Math.sin(ba):Math.sinh(ba);
  const p=ln.map(v=>v*ls),along=p[0]*bn[0]+p[1]*bn[1]+p[2]*bn[2],next=along*bc+lc*bs,nextW=sign>0?lc*bc-along*bs:lc*bc+along*bs;
  const q=[p[0]+bn[0]*(next-along),p[1]+bn[1]*(next-along),p[2]+bn[2]*(next-along),nextW];
  const v=[0,1,2,3].map(r=>eyeMatrix[r]*q[0]+eyeMatrix[4+r]*q[1]+eyeMatrix[8+r]*q[2]+eyeMatrix[12+r]*q[3]);
  const l=Math.hypot(v[0],v[1],v[2]),chi=sign>0?Math.atan2(l,v[3]):Math.asinh(l);
  return v.slice(0,3).map(c=>l>1e-6?c/l*chi*R:0);
}

test('a move in the space is a true move: it keeps the space, and undoes',()=>{
  for(const sign of[1,-1]){
    const R=7,T=spaceTranslation(sign,R,[.6,0,.8],5),I=spaceMultiply(T,spaceInverse(sign,T)),id=spaceIdentity();
    assert.ok(sameMatrix(I,id,1e-9),`${sign}: inverse`);
    const q=apply(T,[0,0,0,1]);
    assert.ok(close(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+(sign>0?1:-1)*q[3]*q[3],sign,1e-9),'stays on the space');
    assert.ok(close(spaceDistance(sign,R,T,id),5,1e-9),'and goes as far as it was told');
    const m=spaceMapOf(sign,R,spaceAtMap(sign,R,5,1.1));
    assert.ok(close(m.r,5,1e-9)&&close(m.phi,1.1,1e-9),'the map reads it back');
  }
});
test('the shader and the sums agree: from a frame, a point is where the space says it is',()=>{
  for(const sign of[1,-1]){
    const R=sign>0?26:3,frame=spaceAtMap(sign,R,sign>0?20:4,.7),eye=spaceEyeUniform(sign,R,frame,0);
    // Standing on it, the point under him is at his feet.
    const under=curvedPoint(sign,R,eye,[20*0+spaceMapOf(sign,R,frame).x,0,spaceMapOf(sign,R,frame).z]);
    assert.ok(Math.hypot(...under)<1e-5,`${sign}: ${under}`);
    // The object at the origin is as far away as the space says, whichever way it lies.
    const toObject=curvedPoint(sign,R,eye,[0,0,0]);
    assert.ok(close(Math.hypot(...toObject),spaceDistance(sign,R,frame,spaceIdentity()),1e-3),`${sign}: distance`);
    // And it lies straight back along the way he came.
    assert.ok(close(toObject[0]/Math.hypot(...toObject),-Math.sin(.7),1e-3)&&close(toObject[2]/Math.hypot(...toObject),-Math.cos(.7),1e-3),'bearing');
  }
  assert.match(CURVED_SPACE_GLSL,/if\(sign_==0\.0\)return w;/,'off, it is exactly the plain world');
  assert.deepEqual(curvedSpaceUniforms(CURVED_SPACE_OFF).space.slice(0,1),[0]);
  const props=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  assert.match(props,/if\(uCurvedSpace\.x!=0\.0\)gl_Position=uProj\*uView\*vec4\(curvedSpacePoint\(w\.xyz,aM3\.xyz\),w\.w\);/,'the props go through it, only while it is on');
  assert.match(props,/natatoriumMetric\.k\|\|curvedSpace\.sign/,'and old frustum planes are not trusted while it is on');
});
test('the body can test it: walking away from something makes it bigger',()=>{
  const V=C.variants.closed,R=V.radius,near=apparentAngle(1,R,1.7,V.radius*Math.PI/2),far=apparentAngle(1,R,1.7,V.startMetres);
  assert.ok(far>near*2,`past halfway it grows: ${far} against ${near}`);
  const at5=apparentAngle(1,R,1.7,5);assert.ok(close(at5,Math.atan2(1.7,5),.02),'close to, it is the size things are');
  const sizes=[10,25,40,55,70,78].map(d=>apparentAngle(1,R,1.7,d));
  assert.ok(sizes[0]>sizes[1]&&sizes[1]>sizes[2],'shrinks as he goes out');
  assert.ok(sizes[3]>sizes[2]&&sizes[4]>sizes[3]&&sizes[5]>sizes[4],'and past halfway grows the further he goes');
  const L=C.variants['circle-limit'],flat=Math.atan2(1.7,10);
  assert.ok(apparentAngle(-1,L.radius,1.7,10)<flat/3,'the other way, it falls away faster than it should');
});
test('every road in the closed space goes to the object',()=>{
  const V=C.variants.closed;
  assert.equal(V.roads%2,1,'an odd number: none runs through his own antipode, or it would fill the sky');
  for(let k=0;k<V.roads;k++){
    const phi=k/V.roads*TAU;
    let s={...freshHorizonApproach({variant:'closed',phi})};
    const{state,events}=walk(s,V.startMetres/C.walk+3);
    assert.equal(events.filter(e=>e.type===E.ARRIVED).length,1,`road ${k}`);
    assert.ok(state.arrived,`road ${k} arrives`);
  }
});
test('turned right round at the start, the only thing behind him is the place the roads all leave',()=>{
  const V=C.variants.closed;
  let s=freshHorizonApproach({variant:'closed'});s={...s,yaw:s.yaw+Math.PI};
  const{state}=walk(s,(Math.PI*V.radius-V.startMetres)/C.walk);
  const r=horizonApproachMap(state).r;
  assert.ok(r>Math.PI*V.radius-V.hub,`he has reached it: ${r}`);
  assert.equal(state.arrived,false,'and it is not where he was going');
  assert.ok(apparentAngle(1,V.radius,1.7,horizonApproachDistance(state))>apparentAngle(1,V.radius,1.7,V.startMetres),'and walking away, the object has grown');
});
test('he stays on the roads; the circle limit has an end he never reaches',()=>{
  const V=C.variants.closed,r=V.radius*Math.PI/2,off=(V.roadHalfWidth+1)/V.radius;
  assert.equal(horizonApproachOnGround('closed',spaceAtMap(1,V.radius,r,0)),true,'on a road');
  assert.equal(horizonApproachOnGround('closed',spaceAtMap(1,V.radius,r,off)),false,'off it');
  assert.equal(horizonApproachOnGround('closed',spaceAtMap(1,V.radius,1,1.3)),true,'at the place they meet');
  const{state}=walk({...freshHorizonApproach({variant:'closed'}),yaw:.7},6);
  assert.ok(horizonApproachOnGround('closed',state.frame),'he cannot walk off it');
  const L=C.variants['circle-limit'];
  assert.equal(horizonApproachOnGround('circle-limit',spaceAtMap(-1,L.radius,L.tileRings*L.radius+1,0)),false);
  assert.equal(horizonApproachOnGround('circle-limit',spaceAtMap(-1,L.radius,L.startMetres,2.2)),true);
  assert.ok(L.startMetres<L.tileRings*L.radius-1,'he starts on the tiles');
  const R=C.variants.relativity;
  assert.equal(horizonApproachOnGround('relativity',spaceAtMap(1,R.radius,20,0)),true,'on the road');
  assert.equal(horizonApproachOnGround('relativity',spaceAtMap(1,R.radius,20,.4)),false,'off the road');
});
test('the tiles are a real tiling: four to a corner, two colours, every neighbour the other colour',()=>{
  const tiles=circleLimitTiles(3);
  assert.ok(tiles.length>20);
  assert.equal(tiles[0].colour,0);
  const dist=(a,b)=>Math.acosh(Math.max(1,a.m[8]*b.m[8]-a.m[2]*b.m[2]-a.m[5]*b.m[5]));
  const across=2*Math.acosh(Math.cos(Math.PI/4)/Math.sin(Math.PI/5));
  let pairs=0;for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++)if(close(dist(tiles[i],tiles[j]),across,1e-6)){pairs++;assert.notEqual(tiles[i].colour,tiles[j].colour,`${i},${j}`);}
  assert.ok(pairs>=tiles.length-1,`${pairs} neighbours`);
});
function arrive(variant='closed',extra={}){
  const s=freshHorizonApproach({variant,...extra});
  const V=C.variants[variant];
  return{...s,frame:spaceAtMap(V.sign,V.radius,C.station.reach-.6,0),yaw:0};
}
test('walking up to it gives the truth; only a met condition opens the offer',()=>{
  for(const occupant of['sarah','lyle','ant']){
    const met=stepHorizonApproach(arrive('closed',{occupant,condition:true}),{dt:.05}),unmet=stepHorizonApproach(arrive('closed',{occupant,condition:false}),{dt:.05});
    assert.deepEqual(met.events.map(e=>e.type),[E.ARRIVED,E.OPENED],occupant);assert.equal(met.state.offerOpen,true);
    assert.deepEqual(unmet.events.map(e=>e.type),[E.ARRIVED],occupant+': the truth, with no offer');assert.equal(unmet.state.offerOpen,false);
  }
  const lyle=stepHorizonApproach(arrive('closed',{occupant:'lyle',condition:true,lyleBox:'broken'}),{dt:.05});
  assert.equal(lyle.events[0].lyleBox,'broken','Lyle knows which box');
  assert.deepEqual(stepHorizonApproach(arrive('closed',{occupant:'daisy'}),{dt:.05}).events.map(e=>e.type),[E.ARRIVED]);
});
test('standing still decides nothing, ever',()=>{
  let s=arrive('closed',{occupant:'sarah',condition:true});const events=[];
  for(let k=0;k<20000;k++){const r=stepHorizonApproach(s,{dt:.1});s=r.state;events.push(...r.events);}
  assert.equal(s.decided,null);
  assert.equal(events.filter(e=>e.type===E.ACCEPTED||e.type===E.DECLINED).length,0);
  assert.equal(events.filter(e=>e.type===E.OPENED).length,1,'the offer opens, and waits');
});
// Out from the object on the given bearing, from the middle of it.
function goingOut(state,phi){
  const V=C.variants[state.variant];
  return{...state,arrived:true,frame:spaceAtMap(V.sign,V.radius,1,phi),yaw:Math.PI-phi};
}
test('walking on declines, and it is the chapel; past it on St Brendan\'s bearing accepts, only if offered',()=>{
  for(const variant of horizonApproachVariantIds){
    const V=C.variants[variant],road=variant==='closed'?Math.round(HORIZON_TOWER_BEARING/(TAU/V.roads))*(TAU/V.roads):HORIZON_TOWER_BEARING;
    // Not offered: any way out is the chapel, even that one.
    let{state,events}=walk(goingOut(freshHorizonApproach({variant,occupant:'sarah'}),road),5);
    assert.equal(state.decided,'declined',variant);assert.equal(events.filter(e=>e.type===E.DECLINED)[0]?.exit,'chapel');
    // Offered: that way is the tower.
    ({state,events}=walk(goingOut({...freshHorizonApproach({variant,occupant:'sarah',condition:true}),offerOpen:true},road),5));
    assert.equal(state.decided,'accepted',variant);assert.equal(events.filter(e=>e.type===E.ACCEPTED)[0]?.exit,'tower');
    assert.equal(events.filter(e=>e.type===E.DECLINED).length,0);
    // Offered, the other way out is still the chapel.
    ({state}=walk(goingOut({...freshHorizonApproach({variant,occupant:'sarah',condition:true}),offerOpen:true},variant==='closed'?road+TAU/V.roads*2:Math.PI),5));
    assert.equal(state.decided,'declined',variant);
    const after=stepHorizonApproach(state,{dt:.05,forward:1}).state;assert.ok(sameMatrix(after.frame,state.frame),'and then nothing moves here');
  }
  // Walking out before he has been there at all commits nothing.
  const{state}=walk(freshHorizonApproach({variant:'circle-limit'}),.5);assert.equal(state.decided,null);
});
test('the daisy: an odd number of petals, one at a time, at the object, and the last says loves me',()=>{
  assert.equal(C.daisy.petals%2,1);assert.equal(horizonDaisyWord(C.daisy.petals),'loves me');assert.equal(horizonDaisyWord(C.daisy.petals-1),'loves me not');
  const away=freshHorizonApproach({occupant:'daisy'});assert.equal(horizonApproachNear(away),false);assert.equal(pluckHorizonApproachPetal(away),null,'not from the far side of the space');
  let s=arrive('closed',{occupant:'daisy'}),opened=0;
  for(let k=0;k<C.daisy.petals+3;k++){const r=pluckHorizonApproachPetal(s);if(!r)continue;s=r.state;opened+=r.events.filter(e=>e.type===E.OPENED).length;
    if(k<C.daisy.petals-1)assert.equal(s.offerOpen,false,'not until the last');}
  assert.equal(s.petalsPlucked,C.daisy.petals);assert.equal(s.offerOpen,true);assert.equal(opened,1);
  assert.equal(pluckHorizonApproachPetal(arrive('closed',{occupant:'lyle'})),null,'only the daisy has petals');
  const petals=n=>horizonApproachObjectProps({occupant:'daisy',petalsPlucked:n}).filter(p=>p.mesh==='ha_daisy_petal').length;
  assert.equal(petals(0),C.daisy.petals);assert.equal(petals(5),C.daisy.petals-5);assert.equal(petals(C.daisy.petals),0);
});
test('everything that stands there is the game\'s own',()=>{
  const fieldRows=readFileSync(new URL('../src/render/memory-field-models.js',import.meta.url),'utf8');
  for(const mesh of['mf_hero_disc','mf_hero_stem','mf_ant_slab_top','mf_ant_slab_side','mf_ant_slab_crack'])assert.ok(fieldRows.includes(mesh),`${mesh} is the field's`);
  const sarah=horizonApproachObjectProps({occupant:'sarah'})[0],lyle=horizonApproachObjectProps({occupant:'lyle'})[0];
  assert.equal(sarah.mesh,HORIZON_FIGURES.sarah.mesh);assert.equal(sarah.apparitionVariant,15);
  assert.equal(lyle.mesh,HORIZON_FIGURES.lyle.mesh);
  const ant=horizonApproachObjectProps({occupant:'ant'}).map(p=>p.mesh);
  assert.ok(ant.includes(HORIZON_ANT_MESH));for(const m of HORIZON_SLAB_MESHES)assert.ok(ant.includes(m));
  const daisy=horizonApproachObjectProps({occupant:'daisy'}).map(p=>p.mesh);
  for(const m of HORIZON_DAISY_MESHES)assert.ok(daisy.includes(m));
  const made=new Set(HORIZON_APPROACH_MESHES);
  for(const variant of horizonApproachVariantIds){
    const frame=horizonApproachRenderFrame(freshHorizonApproach({variant,occupant:'sarah'}));
    const meshes=new Set(frame.props.map(p=>p.mesh));
    assert.ok(meshes.has(HORIZON_CHURCH_MESH),variant+': St Brendan\'s');
    assert.ok(meshes.has(HORIZON_MASONRY.buttress),variant+': the chapel');
    // Only ground is procedural. Anything standing up is from a pack.
    for(const m of meshes)if(made.has(m))assert.match(m,/^ha_(closed_|tile_|road|hub|side|stairs_)/,m);
  }
});
test('option C: the night leans first, and if it cannot be met someone who can comes instead',()=>{
  assert.deepEqual(horizonOccupantConditions({}),{sarah:false,lyle:false,daisy:true,ant:false});
  assert.equal(horizonOccupantConditions({sarahRespected:true}).sarah,true);
  assert.equal(horizonOccupantConditions({lyleBox:'broken'}).lyle,true);assert.equal(horizonOccupantConditions({lyleBox:'whole'}).lyle,true);assert.equal(horizonOccupantConditions({lyleBox:'nonsense'}).lyle,false);
  assert.equal(horizonOccupantConditions({antWatched:true}).ant,true);
  assert.deepEqual(chooseHorizonOccupant({confession:'Sarah',sarahRespected:true}),{occupant:'sarah',leaning:'sarah',fellBack:false,condition:true,lyleBox:null});
  assert.deepEqual(chooseHorizonOccupant({confession:'lyle',lyleBox:'broken'}),{occupant:'lyle',leaning:'lyle',fellBack:false,condition:true,lyleBox:'broken'});
  const f=chooseHorizonOccupant({confession:'Sarah',sarahRespected:false,lyleBox:'whole'});
  assert.equal(f.leaning,'sarah');assert.equal(f.occupant,'lyle');assert.equal(f.fellBack,true);assert.equal(f.lyleBox,'whole');
  const d=chooseHorizonOccupant({confession:'Sarah'});assert.equal(d.occupant,'daisy');assert.equal(d.fellBack,true);
  assert.equal(chooseHorizonOccupant({sarahPage:true,benchQuestion:true,sarahRespected:true}).occupant,'sarah');
  assert.equal(chooseHorizonOccupant({coast:true,lyleBox:'whole'}).occupant,'lyle');
  assert.equal(chooseHorizonOccupant({arc:.9,antWatched:true}).occupant,'ant');
  assert.equal(chooseHorizonOccupant({arc:.9}).occupant,'daisy');
  assert.equal(chooseHorizonOccupant({arc:.9,sarahPage:true,sarahRespected:true,antWatched:true}).leaning,'ant');
  assert.equal(chooseHorizonOccupant({}).occupant,'daisy');
  assert.equal(horizonOccupantLeaning({confession:'Sarah'})[0],'sarah');
  for(const confession of[null,'Sarah','Lyle','someone else'])for(const sarahRespected of[false,true])for(const lyleBox of[null,'broken','whole'])for(const antWatched of[false,true])for(const arc of[0,.5,1]){
    const record={confession,sarahRespected,lyleBox,antWatched,arc},c=chooseHorizonOccupant(record);
    assert.ok(C.occupants.includes(c.occupant));
    assert.ok(horizonOccupantConditions(record)[c.occupant],`${JSON.stringify(record)} chose ${c.occupant}`);
  }
});
test('every mesh is real and the set is cheap',()=>{
  let tris=0;for(const row of horizonApproachGeometry()){assert.equal(row.i.length%3,0,row.name);assert.ok(row.i.length>0,row.name);tris+=row.i.length/3;}
  assert.ok(tris<60000,`${tris}`);assert.equal(new Set(HORIZON_APPROACH_MESHES).size,HORIZON_APPROACH_MESHES.length);
});
test('the copy never says the word Seb has ruled out, and Lyle is he',()=>{
  const files=['src/data/horizon-approach.js','src/game/horizon-approach-scene.js','src/render/horizon-approach-frame.js','src/render/horizon-approach-models.js','src/render/horizon-approach-renderer.js','src/render/curved-space.js'];
  for(const f of files){
    const text=readFileSync(new URL('../'+f,import.meta.url),'utf8');
    assert.doesNotMatch(text,/\bhold(s|ing|er)?\b|\bheld\b/i,f);
    assert.doesNotMatch(text,/Lyle[^.]{0,40}\b(she|her)\b/,f);
  }
});
