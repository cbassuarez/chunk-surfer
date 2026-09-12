import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFieldKitTorchLook} from '../src/render/field-kit-torch.js';
import {fieldKitEffects} from '../src/game/field-kit.js';
const base={power:.8,reach:1,coneInner:.88,coneOuter:.94,spill:.16,band:'full',health:.9,color:[1,.9,.7]};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('reference optics preserve the exact authored torch object',()=>{
  assert.equal(applyFieldKitTorchLook(base,fieldKitEffects({})),base);
});

test('throw and flood change physical beam geometry without overriding battery or perception',()=>{
  for(const flashlight of ['throw','flood']){
    const effects=fieldKitEffects({flashlight}),look=applyFieldKitTorchLook(base,effects);
    close(look.reach,base.reach*effects.flashlightReachScale);
    close(Math.acos(look.coneInner),Math.acos(base.coneInner)*effects.flashlightConeScale);
    close(Math.acos(look.coneOuter),Math.acos(base.coneOuter)*effects.flashlightConeScale);
    assert.equal(look.power,base.power);assert.equal(look.health,base.health);
    assert.equal(look.band,base.band);assert.equal(look.color,base.color);
    assert.ok(look.coneInner<look.coneOuter,'renderer smoothstep remains ordered');
  }
  const throwLook=applyFieldKitTorchLook(base,fieldKitEffects({flashlight:'throw'}));
  const floodLook=applyFieldKitTorchLook(base,fieldKitEffects({flashlight:'flood'}));
  assert.ok(throwLook.reach>base.reach&&throwLook.coneInner>base.coneInner&&throwLook.spill<base.spill);
  assert.ok(floodLook.reach<base.reach&&floodLook.coneInner<base.coneInner&&floodLook.spill>base.spill);
});

test('lens choices do not revive a flat or failed flashlight and invalid scalars stay bounded',()=>{
  for(const flashlight of ['reference','throw','flood']){
    const flat=applyFieldKitTorchLook({...base,power:0,reach:0,spill:0},fieldKitEffects({flashlight}));
    assert.equal(flat.power,0);assert.equal(flat.reach,0);assert.equal(flat.spill,0);
  }
  for(const scalar of [NaN,Infinity,-Infinity,999,-999,undefined]){
    const look=applyFieldKitTorchLook(base,{flashlightReachScale:scalar,flashlightConeScale:scalar});
    for(const key of ['reach','coneInner','coneOuter','spill'])assert.ok(Number.isFinite(look[key]));
    assert.ok(look.reach>=.75&&look.reach<=1.25);
  }
});
