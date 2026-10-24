import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {MAIN_STAIR_WALL_PROPS,MAIN_STAIR_WALL_MESHES,MAIN_STAIR_WALL_PACK} from '../src/data/main-stair-wall-dressing.js';
import {MAIN_STAIR_WALL_ORIGIN} from '../src/data/main-stair-wall-treatment.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);

test('wall ornament uses the exact hero stair origin and remains attached across all three storeys',()=>{
  const props=PROPS.renderInstances(),stair=props.find(p=>p.id==='main-open-well-stair'),skin=props.find(p=>p.id===MAIN_STAIR_WALL_PROPS[0].id);
  assert.ok(stair&&skin);assert.equal(skin.mesh,'main_stair_wall_treatment');
  const translation=p=>[p.x,p.y,p.z];
  assert.deepEqual(translation(skin),MAIN_STAIR_WALL_ORIGIN);assert.deepEqual(translation(skin),translation(stair));
  for(const group of ['ground','upper','academic'])assert.ok(PROPS.renderInstances({group}).some(p=>p.id===skin.id),group);
});
test('the optional wall skin introduces no interactions, blockers, progress flags or additional light sources',()=>{
  const authored=MAIN_STAIR_WALL_PROPS[0],prop=PROPS.propById(authored.id);
  assert.equal(authored.interactive,false);assert.equal(authored.blocks,false);assert.equal(MAIN_STAIR_WALL_MESHES[prop.mesh].blocks,false);
  for(const key of ['inspect','dialogue','light','emergencyLight','pickup','onEnter','trigger'])assert.equal(authored[key],undefined,key);
  assert.ok(!PROPS.structuralColliders().some(c=>c.id===authored.id));
});
test('the ordinary renderer loads the separate skin after the authoritative stair, retaining masonry on a missing optional asset',()=>{
  const renderer=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  assert.equal(MAIN_STAIR_WALL_PACK,'assets/conservatory-stair-walls.glb');
  const stair=renderer.indexOf("P3.addPropPack(assetUrl('assets/conservatory-main-stair.glb'))"),skin=renderer.indexOf('P3.addPropPack(assetUrl(MAIN_STAIR_WALL_PACK))');
  assert.ok(stair>=0&&skin>stair);assert.match(renderer.slice(skin,skin+250),/\.catch\(err=>console\.warn\('stair wall ornament unavailable; retaining existing masonry'/);
});
