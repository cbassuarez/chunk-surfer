import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import * as HEAD from '../src/game/marble-head.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { YARD_PARK_PROPS } from '../src/data/yard-park.js';
import { CANONICAL_EYE_RADIUS, GALLERY_BUST_SCALE } from '../tools/chunk_surfer/reliquary-prop-geometry.mjs';
const io=new NodeIO();
const pack=await io.read(new URL('../public/assets/conservatory-props.glb',import.meta.url).pathname);
const item=await io.read(new URL('../public/assets/items/marble-eyes.glb',import.meta.url).pathname);
const find=name=>pack.getRoot().listMeshes().find(m=>m.getName()===name);

test('eye decisions rebuild the socketed gallery head after save/reload',()=>{
  for(const phase of Object.values(HEAD.MARBLE_HEAD_PHASE)) {
    HEAD.loadMarbleHead({schema:1,phase});const saved=HEAD.saveMarbleHead();
    HEAD.resetMarbleHead();HEAD.loadMarbleHead(saved);
    assert.equal(HEAD.marbleGalleryAppearance().eyes,phase==='returned'?'seated':'empty');
    assert.equal(HEAD.marbleGalleryAppearance().mesh,phase==='returned'?'academic_bust_socketed_returned':'academic_bust_socketed');
    assert.equal(HEAD.marbleHeadState().phase,phase);
  }
  assert.equal(HEAD.normalizeMarbleHead(null).schema,2);
  HEAD.resetMarbleHead();
});

test('the unseen gallery turn is a saved, once-only receipt with detached state',()=>{
  HEAD.resetMarbleHead();assert.equal(HEAD.galleryBustTurnPending(),false);
  assert.equal(HEAD.noteGalleryBustSpoken(HEAD.GALLERY_TURN_BUST),true);
  assert.equal(HEAD.noteGalleryBustSpoken(HEAD.GALLERY_TURN_BUST),false);
  assert.equal(HEAD.galleryBustTurnPending(),true);
  const before=HEAD.saveMarbleHead();before.gallery.spoken.length=0;
  assert.equal(HEAD.galleryBustTurnPending(),true);
  assert.equal(HEAD.completeGalleryBustTurn(),true);assert.equal(HEAD.completeGalleryBustTurn(),false);
  const saved=HEAD.saveMarbleHead();HEAD.resetMarbleHead();HEAD.loadMarbleHead(saved);
  assert.equal(HEAD.marbleHeadState().gallery.turned,true);assert.equal(HEAD.galleryBustTurnPending(),false);
  const normalized=HEAD.normalizeMarbleHead({gallery:{spoken:['junk',HEAD.GALLERY_TURN_BUST,HEAD.GALLERY_TURN_BUST],turned:'false'}});
  assert.deepEqual(normalized.gallery,{spoken:[HEAD.GALLERY_TURN_BUST],turned:false});
  HEAD.resetMarbleHead();
});

test('fountain coins survive the eye prop leaving and never enter the item',()=>{
  const eyes=find('park_marble_eyes'),coins=find('park_fountain_coins');
  assert.ok(eyes&&coins);assert.ok(eyes.listPrimitives().every(p=>!p.getMaterial().getName().includes('bronze')));
  const coinPlacement=YARD_PARK_PROPS.find(p=>p.id==='yard-park-coins');
  assert.equal(coinPlacement.interactive,false);assert.equal(coinPlacement.mesh,'park_fountain_coins');
  assert.equal(CONSERVATORY_PROPS.find(p=>p.id===HEAD.MARBLE_HEAD_BUST).mesh,'academic_bust_socketed');
  // The bag deliberately stages each canonical eye for close inspection. Its
  // pose and tessellation differ from the face-up basin pair, but neither
  // version may inherit the basin's separate coins or lose an eye component.
  assert.deepEqual(eyes.listPrimitives().map(p=>p.getMaterial().getName()).sort(),
    ['reliquary eye','reliquary iris','reliquary pupil','reliquary vein']);
  const itemMeshes=item.getRoot().listMeshes();
  assert.deepEqual(itemMeshes.map(m=>m.getName()).sort(),
    ['L-stone','L-iris','L-pupil','L-vein','R-stone','R-iris','R-pupil','R-vein'].sort());
  for(const mesh of itemMeshes)assert.equal(mesh.listPrimitives()[0].getMaterial().getName(),mesh.getName().split('-')[1]==='stone'?'eye':mesh.getName().split('-')[1]);
});

// Intersect a ray parallel to -Z with each actual triangle. Empty sockets must
// reveal their recessed backs; adding the eyes must create a nearer surface.
function frontSurfaceAt(mesh,x,y,material=null) {
  let z=-Infinity;
  for(const p of mesh.listPrimitives()) {
    if(material&&p.getMaterial().getName()!==material)continue;
    const a=p.getAttribute('POSITION').getArray(),ix=p.getIndices().getArray();
    for(let i=0;i<ix.length;i+=3) {
      const ia=ix[i]*3,ib=ix[i+1]*3,ic=ix[i+2]*3;
      const ax=a[ia],ay=a[ia+1],bx=a[ib],by=a[ib+1],cx=a[ic],cy=a[ic+1];
      const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-12)continue;
      const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d;
      if(u<0||v<0||u+v>1)continue;
      z=Math.max(z,u*a[ia+2]+v*a[ib+2]+(1-u-v)*a[ic+2]);
    }
  }
  return z;
}
test('gallery sockets are physical recesses and returned eyes occupy them',()=>{
  const empty=find('academic_bust_socketed'),returned=find('academic_bust_socketed_returned');
  const bottom=3.3932714462280273;
  for(const x of[-.67,-.05]) {
    const ex=x*GALLERY_BUST_SCALE,ey=(5.71-bottom)*GALLERY_BUST_SCALE;
    const before=frontSurfaceAt(empty,ex,ey),after=frontSurfaceAt(returned,ex,ey);
    assert.ok(Number.isFinite(before)&&Number.isFinite(after));
    assert.ok(after-before>CANONICAL_EYE_RADIUS*.8,`eye fills actual socket depth: ${after-before}`);
  }
});

test('mineral irises and pupils lie in front of their physical stone carriers',()=>{
  const returned=find('academic_bust_socketed_returned'),bottom=3.3932714462280273;
  for(const x of[-.67,-.05]) {
    const ex=x*GALLERY_BUST_SCALE,ey=(5.71-bottom)*GALLERY_BUST_SCALE;
    for(const [part,dx] of [['pupil',0],['iris',CANONICAL_EYE_RADIUS*.20]]) {
      const carrier=frontSurfaceAt(returned,ex+dx,ey,'reliquary eye');
      const feature=frontSurfaceAt(returned,ex+dx,ey,`reliquary ${part}`);
      assert.ok(Number.isFinite(feature),`${part} has a real front surface`);
      assert.ok(feature>carrier+CANONICAL_EYE_RADIUS*.003,`${part} is visible rather than buried in the sphere`);
    }
  }
});
