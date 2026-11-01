import{createHash}from'node:crypto';
import{readFile,readdir,writeFile}from'node:fs/promises';
const root='artifacts/hush-motion-study',dir=root+'/in-game',captures=[],excluded=[];
for(const name of(await readdir(dir)).filter(n=>/^hushMotion.*\.json$/.test(n)).sort()){
 const d=JSON.parse(await readFile(dir+'/'+name,'utf8')),base=name.slice(0,-5),lab=name.includes('-lab-');
 let reason='';
 if(lab){
  if(Math.abs(d.wallSeconds-d.seconds)>.5)reason='Interrupted or slowed wall-clock take; excluded from motion judgment.';
  if(d.qualifiedForMotionJudgment===false)reason='Capture reports interrupted or partial take.';
  if(d.sequence==='pursuit-burst-study'&&d.reason!=='complete')reason='Earlier unlocked burst draft; recording settings could change during capture.';
  if(d.sequence==='source-speed-sweep'&&d.treatment==='candidate'&&!d.fixtureSha256)reason='Superseded first traction draft; final adapter measured separately.';
  const suffix='-'+d.treatment+'-'+d.skin;
  if(!base.endsWith(suffix))reason='Filename and final settings differ; controls changed during the take.';
 }
 if(reason){excluded.push({name,reason});continue;}
 captures.push({name,kind:lab?'hush-motion-production-renderer-fixture':'hush-motion-gameplay-capture',sequence:d.sequence||'',treatment:d.treatment||'',skin:d.skin||'',seconds:d.seconds,
  video:d.files?.video||base+'.webm',poster:d.files?.still||base+'.png',trace:name,audio:d.files?.mixedWave||'',
  title:lab?d.sequence:d.stage?.id==='ordinary'?'Ordinary Presence · declared sound, pause and stall':'Source · ordinary movement and distant follower',
  qualification:lab?(d.ruleProposal?'Explicit timing-rule proposal, fixed observer; roots intentionally differ. ':'Same accepted roots, camera and skin. ')+`Silent production-renderer fixture at 1×. ${d.fixtureSha256?'Frozen fixture '+d.fixtureSha256.slice(0,12)+'.':'Earlier metadata format.'}`:
   d.stage?.id==='ordinary'?'48.49s in the actual browser game; declared sound stimulus, ordinary strafe, explicit pause and 800ms stall. Pause is part of the recording.':'Actual browser game with ordinary movement/turning; distant follower telemetry. This is not a close motion comparison.'});
}
const sourceHashes=Object.fromEntries(await Promise.all(['traction-performance.js','fixtures.json','rig/pressure-character-neck-study.glb'].map(async p=>[p,createHash('sha256').update(await readFile(root+'/'+p)).digest('hex')])));
await writeFile(root+'/index.json',JSON.stringify({sourceHashes,kind:'hush-motion-evidence-index',generatedAt:new Date().toISOString(),captures,excluded,pending:['Final locked burst pair, blocked/turn and Source motion films are being completed after unused-cache cleanup.','Live DEV candidate capture after final module freeze.','Packaged-native, animator/technical-rigger and fresh contextual player validation.']},null,2)+'\n');
console.log(JSON.stringify({captures:captures.length,excluded:excluded.length}));
