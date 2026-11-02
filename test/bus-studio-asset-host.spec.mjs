import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(process.env.B3_R3_SOURCE||new URL('../src/render/r3d.js',import.meta.url),'utf8');
const start=source.indexOf('async function loadBusStudioPacks('),end=source.indexOf('\nexport function r3dBusStudioAssetsStatus',start);assert.ok(start>=0&&end>start);
function host(fail){const calls=[],h={P3:{addPropPack:async path=>{calls.push(path);if(path===fail)throw Error('missing optional file');}},assetUrl:p=>p,B3_STUDIO_PROPS_ASSET:'assets/b3-studio-props.glb',console:{warn(){}}};vm.createContext(h);vm.runInContext(source.slice(start,end),h);return{h,calls};}
test('optional dedicated packs install in stable order and never remove a base fallback on failure',async()=>{
 for(const fail of[null,'assets/bus-refinement.glb','assets/b3-studio-props.glb']){
  const t=host(fail),state={bus:false,studio:false,errors:[]};await t.h.loadBusStudioPacks(state);
  assert.deepEqual(t.calls,['assets/bus-refinement.glb','assets/b3-studio-props.glb']);
  assert.equal(state.bus,fail!=='assets/bus-refinement.glb');assert.equal(state.studio,fail!=='assets/b3-studio-props.glb');
  assert.equal(state.errors.length,fail?1:0);
 }
});
