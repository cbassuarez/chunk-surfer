import test from 'node:test';
import assert from 'node:assert/strict';
import SOURCE_ATLAS from '../content/chunk-surf/source-atlas.json' with { type:'json' };
import {sourcePrintRows,sourcePrintLayout,sourcePrintUV,SOURCE_PRINT_SURFACE,physicalPrintPixels} from '../src/render/physical-source-print.js';
import {towerPersonalGeometry,TOWER_RECORDER_PRINT} from '../src/render/tower-personal-meshes.js';
import {printedSurfaceDescriptor} from '../src/render/printed-surface.js';

test('incidental Source material keeps exact existing corpus fragments and row placement',()=>{
  const exact=Object.values(SOURCE_ATLAS.sectors).flatMap(s=>s.sourceLines||[]).map(l=>l.text).filter(t=>t.trim().length>12);
  const divide=sourcePrintRows('divide'),reception=sourcePrintRows('reception');
  assert.equal(divide.length,26);assert.equal(reception.length,33);
  for(const rows of [divide,reception])for(const row of rows)assert.ok(exact.includes(row.text),'material invented or rewrote a source fragment');
  assert.deepEqual(divide.map(r=>r.text),exact.slice(0,26));
  assert.deepEqual(reception.map(r=>r.text),exact.slice(0,33));
  assert.equal(divide[1].x,17);assert.equal(divide[1].y,23);assert.equal(divide[1].text,exact[1]);
  assert.ok(reception.every(r=>r.y+r.height<=510&&r.rule<512),'reception rows leave the actual texture');
  assert.throws(()=>sourcePrintRows('new-copy'),/Unknown Source print profile/);
  assert.deepEqual(printedSurfaceDescriptor(SOURCE_PRINT_SURFACE),SOURCE_PRINT_SURFACE);
});

test('Source material lays out whole exact lines uniformly inside every tile row',()=>{
  const ctx={font:'',measureText(value){const px=Number.parseFloat(this.font);return{width:value.length*px*.6,
    actualBoundingBoxLeft:0,actualBoundingBoxRight:value.length*px*.6,actualBoundingBoxAscent:px*.7,actualBoundingBoxDescent:px*.2};}};
  for(const profile of ['divide','reception'])for(const row of sourcePrintLayout(ctx,profile)){
    assert.equal(row.fit.text,row.text);assert.ok(row.fit.fits);
    assert.ok(row.drawX+row.fit.width<=508.0001);assert.ok(row.baseline+row.fit.descent<=510.0001);
  }
});

test('every vertical source face has forward reader-right and upright UVs',()=>{
  for(const [normal,right] of [[[0,0,1],[1,0,0]],[[0,0,-1],[-1,0,0]],[[1,0,0],[0,0,-1]],[[-1,0,0],[0,0,1]]]){
    const uv=sourcePrintUV([2,3,4],normal,2);
    const next=sourcePrintUV([2+right[0],3,4+right[2]],normal,2);
    const up=sourcePrintUV([2,4,4],normal,2);
    assert.equal(next[0]-uv[0],.5,'world print is reflected from the visible side');
    assert.equal(up[1]-uv[1],-.5,'raw-upload source print is upside down');
  }
});

test('the tower recorder legend is one physical opaque face with a reader-correct map',()=>{
  assert.equal(TOWER_RECORDER_PRINT.copy,'DA1000');
  assert.deepEqual(printedSurfaceDescriptor(TOWER_RECORDER_PRINT.printedSurface),TOWER_RECORDER_PRINT.printedSurface);
  const body=towerPersonalGeometry().find(p=>p.name==='tower_personal_recorder');
  const face=body.groups.find(g=>g.material==='recorder-print');
  assert.equal(face.indices.length,6,'legend regressed into rods or detached glyph meshes');
  assert.ok(face.normals.every((n,i)=>Math.abs(n-(i%3===2?-1:0))<1e-9));
  const left=[];for(let i=0;i<face.positions.length/3;i++)left.push({x:face.positions[i*3],u:face.uvs[i*2],y:face.positions[i*3+1],v:face.uvs[i*2+1]});
  assert.ok(left.filter(v=>v.u===0).every(v=>v.x>-.026),'first glyph is on the reader left');
  assert.ok(left.filter(v=>v.v===0).every(v=>Math.abs(v.y-.126)<1e-9),'top of print maps to top of fascia');
});

test('physical print refuses to cache fallback text before pinned font readiness',()=>{
  assert.throws(()=>physicalPrintPixels({width:1,height:1,ground:'#fff',draw(){}}),/fonts must load/);
});
