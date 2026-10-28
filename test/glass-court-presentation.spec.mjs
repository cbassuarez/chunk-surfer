import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {GLASS_COURT as C,glassCourtWorld} from '../src/data/glass-court.js';
import {GLASS_COURT_PRESENCES} from '../src/data/glass-court-presences.js';
import {glassCourtCoveredAt,glassCourtRoofHeightAt,GLASS_COURT_RAIN_GLSL} from '../src/render/glass-court-weather.js';

test('shelter follows the real gabled roof and leaves the approach and sky above it exposed',()=>{
  assert.equal(glassCourtCoveredAt(84,26,0),false,'the preceding atrium is outside this canopy');
  assert.equal(glassCourtCoveredAt(74,29,0),true);
  assert.equal(glassCourtCoveredAt(90,31,0),true);
  assert.equal(glassCourtCoveredAt(94,30,0),false,'the drying lobby has its own ceiling');
  assert.equal(glassCourtCoveredAt(145.5,16,0),false,'the earlier street study is restored');
  assert.equal(glassCourtCoveredAt(84,30,6),false,'being above the roof is not shelter');
  assert.equal(glassCourtCoveredAt(NaN,30,0),false);
  assert.equal(glassCourtRoofHeightAt(84,30),C.drawnFloor+C.ridge);
  assert.equal(glassCourtRoofHeightAt(84,28),C.drawnFloor+C.eaves);
});

test('the actual main camera adapter uses physical metres and gates shelter on loaded ordinary geometry',()=>{
  const main=fs.readFileSync('src/main.js','utf8');
  const source=main.match(/function glassCourtShelteredAtPlayer\(\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context={usingPlan:()=>true,usingSpecialSpace:()=>false,
    R3:{r3dGlassCourtReady:()=>true},FP:{logicalToPhysical:()=>({x:160,z:60,y:0})},
    px:0,py:0,CELL:.5,glassCourtCoveredAt};
  const run=()=>vm.runInNewContext(`(${source})()`,context);
  assert.equal(run(),true,'the runtime cell centre maps beneath the real roof');
  context.R3.r3dGlassCourtReady=()=>false;assert.equal(run(),false,'a missing pack supplies no invisible roof');
  context.R3.r3dGlassCourtReady=()=>true;context.usingSpecialSpace=()=>true;
  assert.equal(run(),false,'Source is not covered by a geographically coincident ordinary roof');
  context.usingSpecialSpace=()=>false;context.FP.logicalToPhysical=()=>({x:168,z:52,y:0});
  assert.equal(run(),false,'returning to the atrium leaves the greenhouse roof');
});

test('the rain producer clips world columns rather than hiding weather beyond the roof',()=>{
  const renderer=fs.readFileSync('src/render/r3d.js','utf8'),main=fs.readFileSync('src/main.js','utf8');
  assert.match(renderer,/const RAIN_GLSL = GLASS_COURT_RAIN_GLSL\+OUTSKIRTS_BUS_RAIN_GLSL\+`/);
  const rainColumn=renderer.slice(renderer.indexOf('float rainColumn('),renderer.indexOf('// WALK THE COLUMNS'));
  assert.ok(rainColumn.indexOf('glassCourtTrimRain(a,b)')>rainColumn.indexOf('vec3 b ='));
  assert.ok(rainColumn.indexOf('glassCourtTrimRain(a,b)')<rainColumn.indexOf('outskirtsBusTrimRain(a,b,a0,b0,a1,b1)'));
  assert.ok(rainColumn.indexOf('outskirtsBusTrimRain(a,b,a0,b0,a1,b1)')<rainColumn.indexOf('rayToSegment(ro, rd, a0, b0)'));
  assert.match(GLASS_COURT_RAIN_GLSL,/uGlassCourtRainShelter<\.5\)return true/,
    'other shader programs retain their existing rain unless explicitly enabled');
  assert.match(main,/glassCourtRainShelter:usingPlan\(\)&&!usingSpecialSpace\(\)&&R3\.r3dGlassCourtReady\?\.\(\)===true/);
});

test('the two existing bodies occupy the plants, remain still and have no interaction or capture owner',()=>{
  assert.equal(GLASS_COURT_PRESENCES.length,2);
  const bytes=fs.readFileSync('public/assets/conservatory-props.glb');
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  for(const f of GLASS_COURT_PRESENCES){
    assert.ok(gltf.meshes.some(m=>m.name===f.mesh),'reuse an actual packed body');
    assert.equal(f.blocks,false);assert.equal(f.interactive,false);
    assert.equal(f.colliderGroup,'glass-court');
    for(const key of ['interaction','onContact','onEnter','encounter','reward','dialogue'])assert.equal(f[key],undefined);
    const x=f.x-C.logicalOrigin.x,z=f.y-C.logicalOrigin.y;
    const bed=C.plantingBands.find(b=>x>b.x0&&x<b.x1&&z>b.z0&&z<b.z1);
    assert.ok(bed,'the body stands in a real planted band, away from the entrance gap');
    const eye=glassCourtWorld({x,y:1.67,z});
    assert.ok(eye.y>C.drawnFloor+bed.height&&eye.y<C.drawnFloor+bed.maxHeight,
      'a head can appear between leaves above the solid trough');
  }
});

test('missing greenhouse geometry cannot expose its hidden bodies in the empty pool approach',()=>{
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  const ids=new Set(GLASS_COURT_PRESENCES.map(f=>f.id));
  PROPS.setColliderGroupEnabled('glass-court',false);
  assert.equal(PROPS.renderInstances({inscriptions:false}).filter(p=>ids.has(p.id)).length,0);
  PROPS.setColliderGroupEnabled('glass-court',true);
  const visible=PROPS.renderInstances({inscriptions:false}).filter(p=>ids.has(p.id));
  assert.equal(visible.length,2);
  for(const p of visible){assert.ok(p.x>71&&p.x<92&&p.z>28&&p.z<29.1);}
  PROPS.setColliderGroupEnabled('glass-court',false);
});

test('a stale exterior greenhouse pack cannot enable the indoor partitions',()=>{
  const source=fs.readFileSync('src/render/r3d.js','utf8');
  assert.match(source,/glassCourtReady=GLASS_COURT\.meshNames\.every\(name=>names\.includes\(name\)\)/);
  assert.match(source,/if\(!glassCourtReady\)throw new Error\('Incomplete indoor greenhouse pack'\)/);
  assert.match(source,/catch\(err=>\{glassCourtReady=false;console\.warn\('Greenhouse unavailable; retaining the existing pool route'/);
});
