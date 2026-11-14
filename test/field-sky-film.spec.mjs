import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {FIELD_SKY_FILM as F} from '../src/data/field-sky-film.js';
import {MEMORY_FIELD_VISITS,MEMORY_FIELD_VISIT as V} from '../src/data/memory-field.js';
import {freshMemoryField,memoryFieldLook,memoryFieldSkyFilm,memoryFieldTimes} from '../src/game/memory-field-scene.js';

const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');

test('every visit has a stretch, and the stretches run on from the game\'s sky to the film\'s',()=>{
  let last=0;
  for(const visit of MEMORY_FIELD_VISITS){
    const span=F.visits[visit.id];
    assert.ok(span,`${visit.id} has no sky film stretch`);
    assert.equal(span[0],last,`${visit.id} does not start where the visit before it ended`);
    assert.ok(span[1]>=span[0]&&span[1]<=3);
    last=span[1];
  }
  assert.equal(last,3,'the last visit does not reach the film\'s shapes');
});

test('a visit develops on its own clock to the end it reaches when it is let be',()=>{
  for(const visit of MEMORY_FIELD_VISITS)for(const reducedDread of[false,true]){
    const span=F.visits[visit.id],t=memoryFieldTimes(visit,{reducedDread}),end=visit.kind==='stuck'?t.min+t.quiet:t.max;
    const at=elapsed=>memoryFieldSkyFilm({elapsed},visit,{reducedDread});
    assert.equal(at(0),span[0]);
    assert.ok(Math.abs(at(end)-span[1])<1e-9);
    assert.ok(Math.abs(at(end*4)-span[1])<1e-9,'a visit fought longer runs past its stretch');
    let prev=-1;for(let e=0;e<=end;e+=end/20){const v=at(e);assert.ok(v>=prev);prev=v;}
  }
  assert.equal(memoryFieldSkyFilm({elapsed:5},{id:'nowhere'}),0);
});

test('the field\'s look carries it to the renderer, and the renderer to the sky',()=>{
  const state={...freshMemoryField(V.third),elapsed:10};
  assert.equal(memoryFieldLook(state,V.third).skyFilm,memoryFieldSkyFilm(state,V.third));
  const renderer=readFileSync(new URL('../src/render/memory-field-renderer.js',import.meta.url),'utf8');
  assert.match(renderer,/r3dSetMemorySky\?\.\(\{[^}]*film:look\.skyFilm\|\|0\}\)/);
  assert.match(r3d,/film:Number\.isFinite\(frame\.film\)/);
});

test('the film shares unit 14 and the uSourceLayer sampler, only while a field asks for it',()=>{
  const at=r3d.indexOf("gl.uniform1i(U('uSourceLayer'),14);");
  assert.ok(at>0&&r3d.indexOf('bindFieldSkyFilm(U);',at)-at<400,'the film is not bound right after the Source layer');
  const bind=r3d.slice(r3d.indexOf('function bindFieldSkyFilm('),r3d.indexOf('export function r3dFieldSkyFilmStats'));
  assert.match(bind,/const want=!!memorySky&&memorySky\.film>0;/);
  assert.match(bind,/gl\.TEXTURE14/);assert.doesNotMatch(bind,/TEXTURE1[^4]|TEXTURE[0-9]\b/,'the film takes some other unit');
  assert.match(bind,/TEXTURE_WRAP_S,gl\.REPEAT/,'a mirrored film slides apart at its seams when it drifts');
  assert.match(bind,/pixelMeshSettings\.reduceMotion\?0:1/,'reduced motion still drifts the sky');
  assert.match(r3d,/texture\(uSourceLayer,filmAt\)/);
  assert.doesNotMatch(r3d,/uniform sampler2D uMemoryFilm/,'a new sampler breaks the world shader on sixteen-sampler backends');
});

test('the plate is the built loop, small enough to ship',()=>{
  const bytes=statSync(new URL('../public/'+F.url,import.meta.url)).size;
  assert.ok(bytes>100e3&&bytes<4e6,`${bytes} bytes`);
});
