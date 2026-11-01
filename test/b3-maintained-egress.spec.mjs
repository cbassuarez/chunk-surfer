import test from 'node:test';
import assert from 'node:assert/strict';
import {ZONE} from '../src/data/floorplan/legend.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {resolveLocalLights} from '../src/data/conservatory-lights.js';

test('B3 exit fitting exists physically and remains steady with the house circuit off or on',()=>{
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
  const casing=PROPS.propsInit(FP).find(prop=>prop.id==='light-b3-exit-casing');
  assert.ok(casing,'wall-mounted exit casing survives actual floorplan placement');
  assert.equal(casing.lightMaintained,true);
  // Mirror lightAnchorPosition in main.js, including the wall snap's offsets.
  const anchorPosition=id=>{
    const prop=PROPS.propById(id);if(!prop)return null;
    const at=FP.logicalToPhysical(prop.rx,prop.ry);
    return {x:at.x*.5+(Number(prop.renderOffsetX)||0),
      y:(Number(prop.floor)||0)+(Number(prop.elevation)||0)+(Number(prop.renderOffsetY)||0),
      z:at.z*.5+(Number(prop.renderOffsetZ)||0),floorY:prop.floor,yaw:prop.yaw};
  };
  for(const settings of [{},{reducedFlash:true},{effectsMode:'off'}]){
    const dark=resolveLocalLights({group:'basement',zone:ZONE.studio},{...settings,anchorPosition,liveCircuits:new Set()});
    const live=resolveLocalLights({group:'basement',zone:ZONE.studio},{...settings,anchorPosition,liveCircuits:new Set(['sp01'])});
    const a=dark.find(light=>light.id==='b3-exit-maintained'),b=live.find(light=>light.id==='b3-exit-maintained');
    assert.ok(a&&b);assert.equal(a.circuit,null);assert.equal(a.maintained,true);assert.equal(a.intensity,b.intensity);
    assert.equal(FP.isSolid(Math.floor(a.x/.5),Math.floor(a.z/.5)),false,
      'the actual snapped emitter is in air, not hidden in its wall');
    assert.ok(!dark.some(light=>['b3-work-live','b3-control-work-live','b3-emergency'].includes(light.id)));
    assert.ok(live.some(light=>light.id==='b3-emergency'));
  }
});
