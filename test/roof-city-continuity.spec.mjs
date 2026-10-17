import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ZONE} from '../src/data/floorplan/legend.js';
import {DISTRICT_STREETS,DISTRICT_COURTS} from '../src/data/exterior-district.js';
import {allAuthoredLights,lightRigFor,resolveLocalLights} from '../src/data/conservatory-lights.js';
import {DISTRICT_SCENERY_ROADS,buildDistrictSceneryRoads} from '../tools/chunk_surfer/district-scenery-roads.mjs';

const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
const roof=renderer.slice(renderer.indexOf('  if(uRoofView > 0.5){'),renderer.indexOf("  // Six o'clock municipal dawn:"));
const assignment=(name)=>{
  const match=roof.match(new RegExp(`float ${name} = ([^;]+);`));
  assert.ok(match,`${name} must be calculated in the live roof shader`);
  return `let ${name} = ${match[1]};`;
};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];

test('roof city rings use ray distance and eye height instead of fixed angular roofs',()=>{
  const evaluate=new Function('observer','horizontal','eyeHeight','roofRaySlope','dot','sqrt','max',
    [assignment('along'),assignment('nearDistance'),assignment('farDistance'),
      assignment('nearHeight'),assignment('farHeight'),
      'return {nearDistance,farDistance,nearHeight,farHeight};'].join('\n'));
  for(const observer of[[0,0],[12,-14],[-14,11]])for(const bearing of[-2.5,-1.5,0,2.8]){
    const horizontal=[Math.cos(bearing),Math.sin(bearing)];
    const sample=evaluate(observer,horizontal,18.1,-.04,dot,Math.sqrt,Math.max);
    for(const [key,radius] of[['nearDistance',225],['farDistance',620]]){
      const endpoint=observer.map((v,i)=>v+horizontal[i]*sample[key]);
      assert.ok(Math.abs(Math.hypot(...endpoint)-radius)<1e-8,'walking keeps the city fixed in world space');
    }
    assert.ok(sample.nearHeight<18.1,'a downward gaze samples lower actual storeys');
    const climbed=evaluate(observer,horizontal,24.1,-.04,dot,Math.sqrt,Math.max);
    assert.ok(Math.abs(climbed.nearHeight-sample.nearHeight-6)<1e-8,
      'climbing six metres changes the sampled storey by six metres');
  }
  const terrace=new Function('hash01','nearParcel','nearUnit',`const abs=Math.abs;${assignment('terraceHeight')} return terraceHeight;`);
  const farRoof=new Function('hash01','farParcel',`${assignment('farRoofHeight')} return farRoofHeight;`);
  for(const value of[0,.5,1]){
    const height=terrace(()=>value,0,.5);
    assert.ok(height>=9&&height<=15.6,'near terraces continue the existing district scale');
    assert.ok(farRoof(()=>value,0)<=26,'ordinary distant roofs are not accidental skyscrapers');
  }
  assert.match(roof,/col = roofWeather;/,'roof replaces the street-level skyline while preserving shared weather');
  assert.match(roof,/farHeight \/ 3\.1/,'occupied windows follow world storeys');
  assert.match(roof,/nearHeight \/ 3\.0/);
});

test('real exterior fittings continue to illuminate their surfaces from the roof without duplicate ground lights',()=>{
  const authored=allAuthoredLights();
  const district=authored.filter(light=>light.id.startsWith('district-'));
  assert.ok(district.length>=13);
  for(const light of district){
    assert.ok(lightRigFor('ground').includes(light));
    assert.ok(lightRigFor('academicRoof').includes(light),'both views use the same authored fitting');
    assert.ok(light.zones.includes(ZONE.academicRoof));
  }
  const resolved=resolveLocalLights({group:'academicRoof',zone:ZONE.academicRoof},{slots:Infinity});
  for(const light of district)assert.equal(resolved.filter(value=>value.id===light.id).length,1);
  for(const group of['ground','academicRoof']){
    const rig=lightRigFor(group);
    assert.equal(new Set(rig.map(light=>light.id)).size,rig.length);
  }
  assert.equal(resolveLocalLights({group:'academicRoof',zone:ZONE.academicRoof},{origin:{x:88,z:8}}).length,8);
  const context={group:'academicRoof',zone:ZONE.academicRoof};
  assert.ok(resolveLocalLights(context).some(light=>light.id==='roof-north-lower-security'),
    'an inspection without an observer must retain the roof service fitting');
  for(const origin of[{x:93.75,z:1.5},{x:78.5,z:-5},{x:89,z:-3},{x:85,z:15}]){
    const near=resolveLocalLights(context,{origin});
    assert.ok(near.some(light=>light.id==='roof-north-lower-security'),
      'foot, turn, bridge and roof must retain the nearby actual facade fitting');
    const distance=light=>(light.x-origin.x)**2+(light.z-origin.z)**2;
    const farthest=Math.max(...near.map(distance));
    const rejected=resolved.filter(light=>!near.some(selected=>selected.id===light.id));
    assert.ok(rejected.every(light=>distance(light)>=farthest),
      'live selection still chooses the nearest eight, rather than pinning a distant roof light');
  }
  assert.ok(!resolveLocalLights({group:'academic',zone:ZONE.academic},{slots:Infinity})
    .some(light=>light.id.startsWith('district-')),'indoor academic rooms keep their own lighting');
});

test('outer scenery roads occupy the authored row gaps and preserve the north-west park',()=>{
  const materials=[],boxes=[],quads=[],meshes=[];
  buildDistrictSceneryRoads({mesh:(name)=>{meshes.push(name);return name;},materials,
    addBox:(_mesh,center,size,material)=>boxes.push({center,size,material}),
    addQuad:(_mesh,...points)=>quads.push(points.slice(0,4))});
  assert.deepEqual(meshes,['district_outer_streets']);
  assert.equal(boxes.length,DISTRICT_SCENERY_ROADS.length*3);
  assert.ok(materials.every(material=>!material.emissiveFactor),'the new roads never emit light');
  for(const {center,size} of boxes){
    assert.ok([...center,...size].every(Number.isFinite));
    assert.ok(center[1]+size[1]/2<=.051,'scenery remains at actual grade');
    const [x,,z]=[center[0]-7,center[1],center[2]-7];
    const overlap=x+size[0]/2>-73&&x-size[0]/2<-35&&z+size[2]/2>-70&&z-size[2]/2<-36;
    assert.equal(overlap,false,'roads and pavements cannot cut through the municipal park');
    for(const route of[...DISTRICT_STREETS,...DISTRICT_COURTS]){
      const crosses=x+size[0]/2>route.x0&&x-size[0]/2<route.x1
        &&z+size[2]/2>route.y0&&z-size[2]/2<route.y1;
      assert.equal(crosses,false,`scenery must not overwrite the playable ${route.id}`);
    }
  }
  for(const [a,b,c] of quads){
    const normalY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    assert.ok(normalY>0,'wet patches must face the high camera, not the ground');
  }
});
