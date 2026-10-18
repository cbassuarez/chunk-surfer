import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDING_WINDOWS, BUILDING_WINDOW_LEVELS } from '../src/data/building-windows.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { F, PLAN_SCALE } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';

const options={width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]};
const windowLevelIds=new Set(BUILDING_WINDOW_LEVELS.map(level=>level.id));
const baseLevels=conservatory.levels.filter(level=>!windowLevelIds.has(level.id));
const cells=window=>{
  const out=[];
  for(let y=window.logical.y0*PLAN_SCALE;y<window.logical.y1*PLAN_SCALE;y++)
    for(let x=window.logical.x0*PLAN_SCALE;x<window.logical.x1*PLAN_SCALE;x++)out.push({x,y});
  return out;
};
let baselineChecked=false,augmented=false;
function withWindows() {
  if(!augmented){
    FP.compile([...baseLevels,...BUILDING_WINDOW_LEVELS],options);augmented=true;
  }
}

test('four finite approved apertures cut actual old wall cells and retain their stated physical intervals',()=>{
  assert.equal(BUILDING_WINDOWS.length,4);
  assert.equal(new Set(BUILDING_WINDOWS.map(w=>w.id)).size,4);
  FP.compile(baseLevels,options);
  for(const w of BUILDING_WINDOWS) {
    assert.ok(w.head>w.sill&&w.sill>w.roomFloor);
    assert.equal(w.logical.x1-w.logical.x0===1||w.logical.y1-w.logical.y0===1,true,'one-metre wall thickness');
    for(const c of cells(w))assert.ok(FP.isSolid(c.x,c.y),`${w.id} replaces an existing wall, not occupied room air`);
    assert.ok(!FP.isSolid(w.roomObserver.x*2,w.roomObserver.y*2),`${w.id} observer is in the adjoining real room`);
  }
  assert.ok(BUILDING_WINDOWS.find(w=>w.id==='W4-pool-south').head<4.8,'pool head stays below the chapel deck');
  baselineChecked=true;augmented=false;
});

test('air intervals remain in native physical room slices with no sky flag and no physical overlap',()=>{
  assert.ok(baselineChecked,'baseline walls were checked before the cuts');withWindows();
  assert.deepEqual(FP.physicalSpanData().overlaps,[]);
  for(const w of BUILDING_WINDOWS) {
    const slice=FP.physicalRenderPlanFor(w.roomObserver.x*2,w.roomObserver.y*2);
    for(const c of cells(w)) {
      assert.equal(FP.isSolid(c.x,c.y),false,`${w.id} logical cut is air`);
      assert.ok(Math.abs(FP.floorAt(c.x,c.y)-w.sill)<1e-5);
      assert.ok(Math.abs(FP.ceilAt(c.x,c.y)-w.head)<1e-5);
      assert.equal(FP.hasFlag(c.x,c.y,F.SKY),false,'the enclosed window itself is not weather');
      const p=FP.logicalToPhysical(c.x,c.y),i=(Math.round(p.z)-slice.originY)*slice.w+Math.round(p.x)-slice.originX;
      assert.equal(p.spaceId,w.space);assert.equal(p.renderGroup,w.group);
      assert.equal(slice.solid[i],0,`${w.id} survives the room's actual render slice`);
      assert.ok(Math.abs(slice.floor[i]-w.sill)<1e-5,`${w.id} native sill is retained`);
      assert.ok(Math.abs(slice.ceil[i]-w.head)<1e-5,`${w.id} native head is retained`);
      assert.equal(slice.flags[i]&F.SKY,0);
    }
  }
});

test('collision-only aperture air never permits body crossing at any lane or sill height',()=>{
  withWindows();
  for(const w of BUILDING_WINDOWS)for(const c of cells(w)) {
    const nx=w.inwardNormal.x,ny=w.inwardNormal.z;
    const inside={x:c.x+nx,y:c.y+ny};
    assert.deepEqual(FP.canStep(inside.x,inside.y,c.x,c.y,{keys:new Set(['master'])}),{ok:false,why:'wall'},
      `${w.id} is a view, not a shortcut`);
  }
});
