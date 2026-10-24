import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sourceDemolitionLights } from '../src/render/source-demolition.js';
const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
function fn(name){const a=source.indexOf(`function ${name}(`),b=source.indexOf('\n}\n',a);assert.ok(a>=0&&b>a);return source.slice(a,b+3);}
function fixture(){
 const stop=new Error('actual shore mesh pass reached'),calls=[];
 const a=source.indexOf('const MAX_LOCAL_LIGHTS ='),b=source.indexOf('let renderedTorchDiagnostic=',a);
 const h={lightingAcademicAtriumLight:false,camX:8,camY:3.2,camZ:-432,CELL:.5,pitch:0,pixelMeshSettings:{reduceMotion:false},fogTexture:null,fogOrigin:[0,0],FOG_TEX:1,ZONE_TINTS:[],municipalLightPower:1,LIGHT_KIND:{EMERGENCY:'emergency'},P3:{setPracticalLightFrame(){},renderPropPass(v){calls.push({count:v.localLightCount,positions:[...v.localLightPositions],colors:[...v.localLightColors],shadow:v.localShadowIndex});throw stop;}}};
 vm.createContext(h);vm.runInContext(source.slice(a,b)+'\n'+fn('r3dSetLocalLights')+'\n'+fn('drawSourceShore')+'\nglobalThis.set=r3dSetLocalLights;globalThis.draw=drawSourceShore;',h);
 return{h,calls,draw(){assert.throws(()=>h.draw(3,{worldYaw:0,torchPower:0}),e=>e===stop);return calls.at(-1);}};
}
const frame={visible:true,anchored:true,committed:false,blackness:0,released:false,origin:{x:16,y:0,z:-242}};
test('the actual first-shore prop pass receives both fixed practical lights at floor zero',()=>{
 const f=fixture(),lights=sourceDemolitionLights(frame);f.h.set(lights);let pass=f.draw();
 assert.equal(pass.count,2);assert.deepEqual(pass.positions.slice(0,8),lights.flatMap(l=>[l.x,l.y,l.z,l.radius]).map(Math.fround));
 assert.equal(pass.shadow,-1,'no extra shadow atlas or per-body lights');
 const positions=pass.positions;f.h.camX=30;f.h.camZ=-520;pass=f.draw();assert.deepEqual(pass.positions,positions,'head/body movement cannot restage the sources');
 f.h.set([]);pass=f.draw();assert.equal(pass.count,0);assert.ok(pass.positions.every(x=>x===0),'no light leaks into the later road');
});
test('consumption and leaving the omen remove its practicals; structural fade is stable at rest',()=>{
 assert.equal(sourceDemolitionLights({...frame,blackness:1}).length,0);
 assert.equal(sourceDemolitionLights({...frame,released:true}).length,0);
 assert.equal(sourceDemolitionLights({...frame,visible:false}).length,0);
 const before=sourceDemolitionLights({...frame,committed:true,elapsed:0}),after=sourceDemolitionLights({...frame,committed:true,elapsed:16});
 assert.equal(before.length,2);assert.equal(after.length,2);assert.ok(after[0].intensity<before[0].intensity);
});
test('the shore retains its real hull/depth compositor and the shared final dither',()=>{
 const draw=fn('drawSourceShore');assert.ok(draw.indexOf('P3.renderPropPass')<draw.indexOf('SHORE.sourceShoreDraw'));
 assert.ok(draw.includes('SHORE.sourceShoreComposite({target:sceneFbo,props,medium:sourceShoreState.demolitionMedium,'));
 assert.ok(draw.includes('eye:[eyeX,eyeY,eyeZ],yaw:worldYaw,pitch}'));
 assert.ok(draw.includes('presentThroughPost(runPixelMeshPass(voidState,now))'));
 const composite=readFileSync(new URL('../src/render/source-shore3d.js',import.meta.url),'utf8');
 assert.match(composite,/bool useProp=hasProp&&\(!hasHull\|\|pd<hd\+\.015\)/,'near opaque bodies win against the distant bank by actual linear depth');
 assert.doesNotMatch(fn('r3dSetLocalLights'),/sourceDemolitionPracticalLights/,'late physical-road special case was removed on relocation');
});
