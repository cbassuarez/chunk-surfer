import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocalLights,resolveLightingContext} from '../src/data/conservatory-lights.js';
import {PUB_LIGHT_ANCHORS} from '../src/data/exterior-pub-furnishings.js';
import {PUB_HOSPITALITY_LIGHTS} from '../src/data/pub-hospitality.js';
import {EXTERIOR_PUB,pubWorldFromLocal} from '../src/data/exterior-pub.js';
import {ZONE} from '../src/data/floorplan/legend.js';
const context=resolveLightingContext({group:'ground',zone:ZONE.pub});
test('visible warm practicals replace the ordinary lamps only after the isolated room decodes',()=>{
  const shared=JSON.stringify(PUB_LIGHT_ANCHORS),fallback=resolveLocalLights(context,{slots:Infinity}),warm=resolveLocalLights(context,{slots:Infinity,pubHospitalityReady:true});
  assert.equal(new Set(warm.map(l=>l.id)).size,warm.length,'replacements consume one light slot per socket');
  for(const lamp of PUB_HOSPITALITY_LIGHTS){
    const found=warm.find(l=>l.id===lamp.id),p=pubWorldFromLocal(lamp);assert.ok(found);
    assert.equal(found.x,p.x);assert.equal(found.z,p.z);assert.equal(found.y,EXTERIOR_PUB.floor+lamp.y);
    assert.equal(found.intensity,lamp.intensity);
    const original=PUB_LIGHT_ANCHORS.find(l=>l.id===lamp.id);
    if(original)assert.equal(fallback.find(l=>l.id===lamp.id).intensity,original.intensity);
    else assert.equal(fallback.some(l=>l.id===lamp.id),false,'an absent lamp never emits an invisible fallback pool');
  }
  assert.equal(JSON.stringify(PUB_LIGHT_ANCHORS),shared,'Source shared anchors retain their original contract');
});
test('the actual nearest-light budget admits face-height practicals at the snug and the bar',()=>{
  for(const[point,expected]of[[{x:29.3,z:86.3},'pub-table-lamp-0'],[{x:36.2,z:86.3},'pub-counter-lamp']]){
    const lights=resolveLocalLights(context,{origin:point,pubHospitalityReady:true});assert.ok(lights.length<=8);
    assert.ok(lights.some(l=>l.id===expected),`${expected} survives the eight-light limit`);
  }
});
