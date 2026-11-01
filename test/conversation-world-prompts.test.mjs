import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('  if(!scenes.blocksInput()){\n  const sourceFocus='),end=source.indexOf('  const playback=PB.playbackSnapshot();',start);
assert.ok(start>=0&&end>start,'production contextual HUD branch is available');
const branch=source.slice(start,end);
test('input-owned dialogue hides unavailable world action prompts while downstream HUD remains alive',()=>{
  let playback=0;const context={scenes:{blocksInput:()=>true},after:()=>playback++};
  vm.runInNewContext(`${branch}\nafter();`,context);assert.equal(playback,1);
});
test('ordinary gameplay still evaluates its contextual action targets',()=>{
  const sentinel=new Error('world focus reached');
  const context={scenes:{blocksInput:()=>false},usingSourceSpace:()=>false,usingPlan:()=>true,usingSpecialSpace:()=>false,worldInteractionFocus:()=>{throw sentinel;}};
  assert.throws(()=>vm.runInNewContext(branch,context),error=>error===sentinel);
});

test('cold-open review uses the current lodge conversation only after successful world staging',async()=>{
  const first=source.indexOf('async function godColdOpen(){'),last=source.indexOf('\nfunction godPostDoorRuntime()',first);
  assert.ok(first>=0&&last>first);const fn=source.slice(first,last),calls=[];
  const context={godWarpToHook:async id=>{calls.push(['warp',id]);return true;},ensureCtx:()=>calls.push(['audio']),
    createBoothCameraFraming:()=>({id:'camera'}),beginGuardConversation:options=>{calls.push(['conversation',options.camera.id]);return true;}};
  vm.createContext(context);vm.runInContext(fn,context);assert.equal(await context.godColdOpen(),true);
  assert.deepEqual(calls,[['warp','yard-lodge'],['audio'],['conversation','camera']]);
  calls.length=0;context.godWarpToHook=async id=>{calls.push(['warp',id]);return false;};
  assert.equal(await context.godColdOpen(),false);assert.deepEqual(calls,[['warp','yard-lodge']]);
});
