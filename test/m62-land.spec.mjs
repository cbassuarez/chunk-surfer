import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {M62_LAND as L,M62_TRAFFIC as T,M62_LIGHT_STRIDE,M62_MAX_LIGHTS,m62CentreX,m62HalfGap,m62RoadY,m62HeightAt,m62GroundAt,m62Vehicles,m62FarLights,m62LineClear,m62FieldHeight,buildM62LandField} from '../src/data/m62-land.js';
import {m62Scene,m62LandStrength,m62DrystoneMesh,M62_ROAD_ROCK,M62_SCENE} from '../src/game/source-drive/m62-scene.js';
import {BOUNDARY_MESH_BOUNDS} from '../src/game/source-drive/route-boundaries.js';
import {OPENING_ROAD,openingRoadAt,openingWorldAt} from '../src/game/source-drive/opening-road.js';

const field=await buildM62LandField();
const height=(x,z)=>m62FieldHeight(field,x,z);
const eyeAt=d=>{const w=openingWorldAt(d,-1.6,1.63);return[32+w.x,w.y,32+w.z];};
const r3d=readFileSync('src/render/r3d.js','utf8'),renderer=readFileSync('src/game/source-drive-renderer.js','utf8'),road=readFileSync('src/game/source-drive/opening-road.js','utf8');
const stats=JSON.parse(readFileSync('public/assets/source-drive/m62-land/m62-land.stats.json','utf8'));

test('the land never comes up through the road it was cut for',()=>{
  for(let d=OPENING_ROAD.start;d<=L.toDistance;d+=6){
    const r=openingRoadAt(d);
    for(const lateral of[-12,-6,0,6,12]){const w=openingWorldAt(d,lateral);assert.ok(height(w.x,w.z)<=(r.height||0)-.4,`d ${d} lateral ${lateral}: ${height(w.x,w.z)} under ${r.height}`);}
  }
});

test('it is Pennine country: a valley, a stepped climb to flat tops, and a long skyline',()=>{
  assert.ok(m62HeightAt(-110,L.farm.z)<m62HeightAt(0,L.farm.z),'it falls away west of the shelf');
  const up=[-600,-1200,-2400,-4000].map(x=>m62HeightAt(x,L.farm.z));
  for(let i=1;i<up.length;i++)assert.ok(up[i]>up[i-1],`climbing: ${up}`);
  // Beds and shelves: a real slope with short level steps on it.
  let flats=0,steps=0;for(let x=-1400;x>-3000;x-=20){const rise=m62HeightAt(x-20,L.farm.z)-m62HeightAt(x,L.farm.z);steps++;if(Math.abs(rise)<.4)flats++;}
  assert.ok(flats>steps*.12&&flats<steps*.9,`${flats} level of ${steps}`);
  let top=-Infinity,under=0,cells=0;for(let i=0;i<field.size**2;i++){const y=field.data[i*4];top=Math.max(top,y);cells++;if(y>L.maxHeight)under++;}
  assert.equal(under,0,'the shader stops marching at maxHeight, so nothing may stand above it');assert.ok(top>300,'and it does reach the tops');
  // Along the skyline six kilometres out, the ground changes slowly: no peaks.
  for(let a=-1;a<1;a+=.1){const here=m62HeightAt(Math.sin(a)*6000,-Math.cos(a)*6000),next=m62HeightAt(Math.sin(a+.1)*6000,-Math.cos(a+.1)*6000);assert.ok(Math.abs(next-here)<170,`${next-here} over 600 m at ${a}`);}
});

test('the ground reads as it should: pasture low, peat high, water level and pale',()=>{
  assert.ok(m62GroundAt(-400,700).ground>m62GroundAt(-3400,700).ground,'in-bye brighter than moor');
  assert.ok(m62GroundAt(-400,700).walls>.5,'walled low down');assert.equal(m62GroundAt(-3400,700).walls,0,'open on top');
  const w=m62GroundAt(L.basin.x,L.basin.z);assert.equal(w.water,1);assert.equal(w.height,L.waterY);
  near(height(L.basin.x,L.basin.z),L.waterY,.5);
});
function near(a,b,tol){assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b}`);}

test('the farm sits between the carriageways, which part for it and close again',()=>{
  const F=L.farm;assert.ok(m62HalfGap(F.z)>38,'wide at the farm');
  assert.ok(m62HalfGap(F.z+520)<12&&m62HalfGap(F.z-520)<12,'ordinary again within half a kilometre');
  const east=m62CentreX(F.z)+m62HalfGap(F.z),west=m62CentreX(F.z)-m62HalfGap(F.z);
  // Its yard runs to +20 and its back wall to -4; the field walls to -26.
  assert.ok(F.x+20<east-8&&F.x-26>west+8,`farm ${F.x-26}..${F.x+20} inside ${west}..${east}`);
  near(m62HeightAt(F.x,F.z),F.y-.4,1);
  assert.ok(F.y>m62RoadY(F.z)-.5,'level with the road either side');
});

test('from the small road you can see it: nothing but air in the way over the bend',()=>{
  const F=L.farm;let seen=0,total=0;
  for(let d=-420;d<=-200;d+=10){total++;if(m62LineClear(height,[eyeAt(d)[0]-32,eyeAt(d)[1],eyeAt(d)[2]-32],F.x,F.y+7,F.z,40))seen++;}
  assert.equal(seen,total,'farm roof clear of the ground');
  // And over the wall: the eye sits above a line from the wall top to the roof.
  const eye=eyeAt(-300),dist=Math.hypot(eye[0]-32-F.x,eye[2]-32-F.z),drop=(eye[1]-(F.y+7))/dist;
  const wallTop=.97*1.25,wallAway=5;assert.ok((eye[1]-wallTop)/wallAway>drop,'the drystone doesn\'t hide it');
});

test('traffic keeps left, both ways, on its own carriageway, and moves at motorway speed',()=>{
  const now=m62Vehicles(100),later=m62Vehicles(101);
  assert.equal(now.length,T.each*2);assert.ok(now.some(v=>v.away)&&now.some(v=>!v.away));assert.ok(now.some(v=>v.lorry)&&now.some(v=>!v.lorry));
  for(const v of now){const side=Math.sign(v.x-m62CentreX(v.z));assert.equal(side,v.away?-1:1,'keeps left');near(Math.abs(v.x-m62CentreX(v.z)),m62HalfGap(v.z),T.laneOffset+.1);}
  let moved=0;for(let i=0;i<now.length;i++){const dz=later[i].z-now[i].z;if(Math.abs(dz)<T.span/2){moved++;assert.ok(Math.abs(dz)>=T.speedMin*.95&&Math.abs(dz)<=T.speedMax*1.05,`${dz} m/s`);assert.equal(Math.sign(dz),now[i].away?-1:1);}}
  assert.ok(moved>now.length*.9);
  const a=m62Vehicles(5),b=m62Vehicles(5);assert.deepEqual(a,b,'deterministic');
});

test('far lights: white coming, red going, hidden by the ground, thinned by weather',()=>{
  const eye=eyeAt(-500),all=m62FarLights({eye,time:40,height}),colours=new Set();
  assert.ok(all.count>20&&all.count<=M62_MAX_LIGHTS);assert.ok(all.vehicles>4);assert.equal(all.data.length,all.count*M62_LIGHT_STRIDE);
  for(let i=0;i<all.count;i++)colours.add(all.data[i*8+5]>.5?'white':'red');assert.deepEqual([...colours].sort(),['red','white']);
  const fog=m62FarLights({eye,time:40,fog:.8,height});assert.ok(fog.count<all.count,'fog hides the far ones');
  const blinkOn=m62FarLights({eye,time:.2,height}).count,blinkOff=m62FarLights({eye,time:1.9,height}).count;assert.notEqual(blinkOn,blinkOff,'the turbines blink together');
  // Stood below ground, nothing gets through but the tall things on the skyline.
  const buried=m62FarLights({eye:[32-3200,height(-3200,0)-30,32],time:40,height});assert.equal(buried.vehicles,0);
  assert.ok(m62LineClear(height,[0,600,0],-500,0,500),'and from high up the same ground hides nothing');
  assert.equal(m62FarLights({time:0,height}).count,0);
});

test('the scene adds the farm only in range, a lit yard, and goes before the cliff',()=>{
  assert.equal(m62LandStrength(-500),1);assert.equal(m62LandStrength(L.fromDistance),1);assert.equal(m62LandStrength(L.toDistance),0);
  assert.ok(m62LandStrength((L.fromDistance+L.toDistance)/2)>0&&m62LandStrength((L.fromDistance+L.toDistance)/2)<1);
  const close=m62Scene({distance:-300,eye:eyeAt(-300),time:30}),far=m62Scene({distance:-700,eye:eyeAt(-700),time:30}),gone=m62Scene({distance:300,eye:[32,2,-268],time:0});
  assert.ok(close.props.some(p=>p.mesh==='m62_farm')&&close.props.some(p=>p.mesh==='m62_farm_window'));assert.ok(close.lamps.some(l=>l.id==='m62-farm-yard'));
  assert.ok(close.props.filter(p=>p.mesh==='m62_carriageway').length>10);assert.equal(close.land.strength,1);
  assert.equal(far.props.some(p=>p.mesh==='m62_farm'),false,'past the prop range');assert.ok(far.land);
  assert.equal(gone.land,null);assert.equal(gone.props.length,0);assert.equal(gone.lamps.length,0);
  for(const p of close.props){assert.ok(Math.hypot(p.x-eyeAt(-300)[0],p.z-eyeAt(-300)[2])<M62_SCENE.meshMetres+60,p.id);assert.equal(p.matrix.length,16);}
  for(const name of['m62_farm','m62_farm_window','m62_sheep','m62_carriageway','m62_lorry','m62_drystone_0','m62_grit_face_0'])assert.ok(stats.meshes.includes(name),name);
  assert.ok(stats.bytes<2e6);
});

test('the road: stone for rail with the same footprint, rock on the held side, and the ridges back beside them',()=>{
  for(const i of[0,1,2])assert.deepEqual(BOUNDARY_MESH_BOUNDS[`m62_drystone_${i}`],BOUNDARY_MESH_BOUNDS.cut_guardrail,'a van hits exactly what it hit before');
  assert.ok(new Set([-600,-597,-594,-591].map(d=>m62DrystoneMesh(d,1))).size>1,'not one stone pattern over and over');
  // The far ridges the bends always had, restored alongside the M62 rock: the
  // same three silhouettes out past the verge, shadowing the held bends.
  assert.match(road,/for\(const\[at,side\]of\[\[-580,-1\],\[-370,1\],\[-165,-1\]\]\)/);
  assert.match(road,/placed\('drive_terrain_ridge'/);
  for(const[from,to]of M62_ROAD_ROCK){assert.ok(from<to&&to<=OPENING_ROAD.join);}
  assert.match(road,/openingWorldAt\(at,openingRoadAt\(at\)\.rightWidth\+2\.75\)/,'beyond the wall, on the right, where the land climbs');
});

test('it lives only in the drive\'s own pass: nothing outside a drive changes',()=>{
  const voidPass=r3d.slice(r3d.indexOf('const SOURCE_VOID_PHYSICAL_FRAG'),r3d.indexOf('export function r3dSourceVoidPhysicalShader')),rest=r3d.replace(voidPass,'');
  assert.match(voidPass,/driveLandShade\(wd,empty\)/);
  assert.equal(/uniform (sampler2D|vec4|vec3) uDriveLand/.test(rest),false,'not declared in any other shader');
  assert.equal(rest.includes('driveLandShade'),false,'nor drawn there');
  assert.match(r3d,/const driveLand=drive&&driveLandField\?drive\.land:null;/,'only with a drive frame');
  assert.match(renderer,/m62Land/);assert.match(renderer,/await buildM62LandField\(\{pause:/,'baked before the first frame, in small slices');assert.match(renderer,/clearSource\(\);R3\.r3dSetDriveLandField\?\.\(m62LandField\(\)\);/,'and handed over only by the owner of the frame');
  assert.match(renderer,/m62FarLights\(\{eye:scene\.eye/);
});
