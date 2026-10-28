import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {PAPER_PIGMENT_PATH,PAPER_PIGMENT_SURFACE} from '../src/data/paper-pigment.js';
import {printedSurfaceDescriptor} from '../src/render/printed-surface.js';

const sha=b=>createHash('sha256').update(b).digest('hex');

test('world paper pigment preserves decoded RGB and exact catalog tile semantics',async()=>{
  const report=JSON.parse(readFileSync(PAPER_PIGMENT_PATH.replace(/\.png$/,'.json')));
  const catalog=JSON.parse(readFileSync('assets/paper/catalog.json'));
  const rgb=await sharp('assets/paper/world-atlas.webp').removeAlpha().raw().toBuffer();
  const pigment=await sharp(PAPER_PIGMENT_PATH).removeAlpha().raw().toBuffer();
  assert.ok(rgb.equals(pigment),'adding print coverage changed the original world-paper RGB bytes');
  assert.equal(report.rgbByteExact,true);assert.equal(report.decodedRgbSha256,sha(rgb));
  assert.equal(report.pngSha256,sha(readFileSync(PAPER_PIGMENT_PATH)));
  assert.equal(report.count,catalog.atlas.count,'pigment report must cover the authoritative catalog, including new pages');assert.deepEqual(report.tile,[128,181]);
  assert.equal(report.columns,catalog.atlas.columns);assert.equal(report.rows,catalog.atlas.rows);
  assert.equal(report.sourcePages.length,catalog.atlas.count);
  for(const p of report.sourcePages){const expected=catalog.documents[p.id].pages[p.pageIndex];
    assert.equal(p.index,expected.atlasIndex);assert.equal(p.vectorHash,expected.vectorHash);
    assert.equal(p.semanticHash,catalog.documents[p.id].semanticHash);assert.equal(p.svgSha256,sha(readFileSync(p.svg)));
  }
  const alpha=await sharp(PAPER_PIGMENT_PATH).extractChannel(3).raw().toBuffer();
  assert.ok(alpha.some(v=>v===0),'bare stock became ink');assert.ok(alpha.some(v=>v>127),'authored print has no coverage');
  assert.deepEqual(printedSurfaceDescriptor(PAPER_PIGMENT_SURFACE),PAPER_PIGMENT_SURFACE);
});

test('authored process masks exclude stock, handling and reproduction speckle without luma guessing',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'paper-pigment-test-'));
  try{
    const file=path.join(dir,'processes.svg');writeFileSync(file,`<svg viewBox="0 0 100 100">
      <g id="paper-stock"><rect width="100" height="100" fill="#000"/></g>
      <g id="process-content" data-process="offset-1c"><rect x="40" y="40" width="20" height="20" fill="#fff"/></g>
      <g id="process-handling" data-process="handling"><rect x="65" y="5" width="20" height="20" fill="#000"/></g>
      <g id="reproduction-defects" data-process="offset-1c"><rect x="70" y="70" width="10" height="10" fill="#000"/></g>
      <g data-process="unclassified-authored-paint"><rect x="30" y="70" width="10" height="10" fill="#fff"/></g>
    </svg>`);
    const python=process.env.PAPER_PYTHON||(existsSync('.paper-venv/bin/python')?'.paper-venv/bin/python':'python3');
    const code="import sys;from pathlib import Path;sys.path.insert(0,'scripts/paper');from rasterize_svg import render_pigment;m=render_pigment(Path(sys.argv[1]),100,100);assert m.getpixel((20,20))==0;assert m.getpixel((50,50))==255;assert m.getpixel((75,15))==0;assert m.getpixel((75,75))==0;assert m.getpixel((35,75))==255";
    const result=spawnSync(python,['-c',code,file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
