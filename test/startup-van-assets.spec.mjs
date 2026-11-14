import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {packageStartupVanAssets,STARTUP_VAN_SOURCE} from '../scripts/build-startup-van-assets.mjs';
import {STARTUP_VAN_LAYOUT as L,STARTUP_VAN_BUDGET as B} from '../tools/app-icon/startup-layout.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'startup-van-assets-'));await mkdir(join(root,'assets/brand'),{recursive:true});
  const atlas=await sharp({create:{width:L.columns*L.cell,height:L.rows*L.cell,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  const poster=await sharp({create:{width:128,height:128,channels:4,background:{r:220,g:220,b:210,alpha:0}}}).png().toBuffer();
  const video=Buffer.from('startup video fixture');
  const source={...L,atlas:{path:'assets/brand/app-only.png',sha256:hash(atlas)},poster:{path:'assets/brand/app-poster.png',sha256:hash(poster)},
    video:{path:'assets/brand/app-loop.mp4',sha256:hash(video)},
    acquisition:{provenance:{shaderExport:'PIXEL_MESH_FRAG'}},inputs:{'render-source.txt':hash(Buffer.from('render source'))}};
  await writeFile(join(root,'assets/brand/app-only.png'),atlas);await writeFile(join(root,'assets/brand/app-poster.png'),poster);
  await writeFile(join(root,source.video.path),video);
  await writeFile(join(root,'render-source.txt'),'render source');await writeFile(join(root,STARTUP_VAN_SOURCE),JSON.stringify(source));
  const native=join(root,'src-tauri/macos/DockTile');await mkdir(native,{recursive:true});await writeFile(join(native,'VanLaunch.png'),'native atlas sentinel');
  return{root,source,atlas,poster,video,save:()=>writeFile(join(root,STARTUP_VAN_SOURCE),JSON.stringify(source)),dispose:()=>rm(root,{recursive:true,force:true})};
}

test('the app-only atlas has a bounded decode footprint independent of native frame count',()=>{
  assert.deepEqual([L.frameCount,L.cell,L.columns,L.rows,L.durationSeconds],[42,128,7,6,3.4]);
  assert.ok(L.columns*L.rows*L.cell**2*4+128**2*4<B.totalDecodedBytes);
  assert.equal(B.atlasEncodedBytes,300*1024);
});

test('packaging installs only app-only names and preserves native resources',async()=>{
  const f=await fixture();try{
    const result=await packageStartupVanAssets({root:f.root});assert.equal(result.packaged,true);assert.ok(result.totalDecodedBytes<B.totalDecodedBytes);
    const metadata=JSON.parse(await readFile(join(f.root,'public/app-icon/van-startup.json'),'utf8'));
    assert.equal(metadata.frameCount,42);assert.equal(metadata.cellSize,128);assert.equal(metadata.video,'van-startup.mp4');assert.equal(metadata.poster,'van-startup-poster.png');
    assert.equal(metadata.videoSha256,hash(f.video));assert.equal(metadata.posterSha256,hash(f.poster));
    assert.deepEqual(await readFile(join(f.root,'public/app-icon',metadata.video)),f.video);
    await assert.rejects(readFile(join(f.root,'public/app-icon/van-startup.png')),{code:'ENOENT'});
    assert.equal(await readFile(join(f.root,'src-tauri/macos/DockTile/VanLaunch.png'),'utf8'),'native atlas sentinel');
  }finally{await f.dispose();}
});

test('stale renderer input and incorrect dimensions fail before touching public output',async()=>{
  for(const failure of['stale','dimensions']){
    const f=await fixture();try{
      if(failure==='stale')await writeFile(join(f.root,'render-source.txt'),'changed');
      else{const bytes=await sharp({create:{width:256,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();await writeFile(join(f.root,f.source.atlas.path),bytes);f.source.atlas.sha256=hash(bytes);await f.save();}
      await assert.rejects(packageStartupVanAssets({root:f.root}),failure==='stale'?/source changed/:/dimensions/);
      await assert.rejects(readFile(join(f.root,'public/app-icon/van-startup.json')),{code:'ENOENT'});
    }finally{await f.dispose();}
  }
});

test('missing optional artwork can leave a small poster without restoring the heavy native atlas',async()=>{
  const f=await fixture();try{
    await rm(join(f.root,STARTUP_VAN_SOURCE));
    const result=await packageStartupVanAssets({root:f.root,required:false,fallbackPoster:f.poster});assert.equal(result.packaged,false);
    assert.equal(hash(await readFile(join(f.root,'public/app-icon/van-startup-poster.png'))),hash(f.poster));
    await assert.rejects(readFile(join(f.root,'public/app-icon/van-startup.mp4')),{code:'ENOENT'});
    await assert.rejects(packageStartupVanAssets({root:f.root}));
  }finally{await f.dispose();}
});

test('oversized startup media is rejected even when its hashes match',async()=>{
  for(const key of ['atlas','video']){
    const f=await fixture();try{
      const bytes=key==='atlas'?await sharp(f.atlas).png({compressionLevel:0}).toBuffer():Buffer.alloc(B.videoEncodedBytes+1);
      assert.ok(bytes.length>B[key+'EncodedBytes']);
      await writeFile(join(f.root,f.source[key].path),bytes);f.source[key].sha256=hash(bytes);await f.save();
      await assert.rejects(packageStartupVanAssets({root:f.root}),/exceeded its startup budget/);
      await assert.rejects(readFile(join(f.root,'public/app-icon/van-startup.json')),{code:'ENOENT'});
    }finally{await f.dispose();}
  }
});
