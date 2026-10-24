import test from 'node:test';
import assert from 'node:assert/strict';
import { r3dPhysicalAcquisitionExposure } from '../src/render/r3d.js';

const crossing = reveal => r3dPhysicalAcquisitionExposure({ lightingExposure:1, physicalWeight:1-reveal });

test('the linear physical street yields its calibration continuously to an occupied crossing',()=>{
  for(const [reveal,expected]of [[0,3],[.02,2.96],[.5,2],[1,1]])assert.ok(Math.abs(crossing(reveal)-expected)<1e-12);
  assert.ok(Math.abs(crossing(.019999)-crossing(.020001))<.00001,'the first drawn crossing frame suddenly drops the parent street exposure');
  let previous=crossing(0);
  for(let i=1;i<=100;i++){
    const current=crossing(i/100);
    assert.ok(current<=previous&&previous-current<.021,'partial reveals introduce an exposure plateau or jump');
    previous=current;
  }
});

test('an explicit review exposure remains authoritative even below the physical calibration',()=>{
  for(const override of [1,2.25,4.5,12])for(const physicalWeight of [0,.5,1])assert.equal(
    r3dPhysicalAcquisitionExposure({lightingExposure:8,physicalWeight,override}),override);
});

test('ordinary, home, horizon and unravelling callers keep their authored acquisition',()=>{
  assert.equal(r3dPhysicalAcquisitionExposure(),1);
  for(const lightingExposure of [1,2.5,3,8,12])assert.equal(
    r3dPhysicalAcquisitionExposure({lightingExposure,physicalWeight:0}),lightingExposure);
  assert.equal(crossing(1),1,'a fully occupied home still receives the street calibration');
});

test('authored bright acquisition survives the Source floor and malformed weights cannot overexpose it',()=>{
  for(const physicalWeight of [-10,0,.5,1,10])assert.equal(
    r3dPhysicalAcquisitionExposure({lightingExposure:8,physicalWeight}),8);
  assert.equal(r3dPhysicalAcquisitionExposure({lightingExposure:1,physicalWeight:-10}),1);
  assert.equal(r3dPhysicalAcquisitionExposure({lightingExposure:1,physicalWeight:10}),3);
});

test('a calibrated physical camera can retain its highlight headroom without lowering the ordinary street floor',()=>{
  assert.equal(r3dPhysicalAcquisitionExposure({lightingExposure:2.4,physicalWeight:1,minimumExposure:1}),2.4);
  assert.equal(r3dPhysicalAcquisitionExposure({lightingExposure:2.4,physicalWeight:1}),3);
  assert.equal(r3dPhysicalAcquisitionExposure({lightingExposure:2.4,physicalWeight:1,minimumExposure:1,override:4.5}),4.5);
});
