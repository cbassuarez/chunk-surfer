import test from'node:test';
import assert from'node:assert/strict';
import{ELLERY_HYBRID_LIGHTS}from'../src/render/ellery-hybrid-lighting.js';
import{elleryPublicFrontGeometry,ELLERY_PUBLIC_MATERIALS}from'../tools/chunk_surfer/ellery-public-front-geometry.mjs';

test('each dynamic light sits at its real exposed diffuser and all three diffuser materials emit',()=>{
 const mesh=elleryPublicFrontGeometry().find(m=>m.name==='ellery_public_front');assert.ok(mesh);
 const sockets=[
  ['entrance','hybrid-canopy-entrance-diffuser','hybrid canopy entrance diffuser',-1],
  ['window','hybrid-canopy-window-diffuser','hybrid canopy window diffuser',-1],
  ['relief','hybrid-canopy-relief-diffuser','hybrid canopy relief diffuser',1],
 ];
 for(const[suffix,id,material,sign]of sockets){
  const light=ELLERY_HYBRID_LIGHTS.find(l=>l.id===`ellery-hybrid-canopy-${suffix}`),part=mesh.parts.find(p=>p.id===id);
  assert.ok(light,`missing light ${suffix}`);assert.ok(part,`missing visible housing ${id}`);
  assert.equal(ELLERY_PUBLIC_MATERIALS[part.material].name,material);
  assert.ok(ELLERY_PUBLIC_MATERIALS[part.material].emissive.some(x=>x>0),'real diffuser must emit');
  assert.ok(Math.abs(light.x-part.center[0])<1e-6);assert.ok(Math.abs(light.z-part.center[2])<1e-6);
  const dy=light.y-part.center[1];assert.ok(sign*dy>.004&&sign*dy<.04,'source must be just outside the diffuser face');
  assert.equal(Math.sign(light.direction[1]),sign,'beam must leave the visible face');
 }
});
