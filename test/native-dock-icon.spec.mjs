import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('native Dock atlas, elapsed timer, cancellation and Reduce Motion release their resources',{
  skip:process.platform!=='darwin',timeout:30000,
},()=>{
  const folder=mkdtempSync(join(tmpdir(),'chunk-van-dock-test-'));
  try{
    const executable=join(folder,'van-dock-native');
    const compile=spawnSync('xcrun',['clang','-fobjc-arc','-framework','AppKit',
      'tools/chunk_surfer/tests/van-dock-native.m','-o',executable],{encoding:'utf8'});
    assert.equal(compile.status,0,compile.stderr);
    const run=spawnSync(executable,[resolve('src-tauri/macos/DockTile/DockTile.icns'),
      resolve('src-tauri/macos/DockTile/VanLaunch.png')],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stderr+'\n'+run.stdout);
    const result=JSON.parse(run.stdout);
    assert.equal(result.offscreenOnly,true);
    assert.equal(result.applicationActivated,false);
    for(const [name,value]of Object.entries(result))if(!['offscreenOnly','applicationActivated'].includes(name))assert.equal(value,true,name);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
