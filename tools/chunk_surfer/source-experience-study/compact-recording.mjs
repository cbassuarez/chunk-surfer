// Owned evidence compaction only, after the game browser has been closed.
// Audio packets/timestamps must remain exact. Lossy video is explicitly labelled.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile,writeFile,stat,unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve,dirname,join,basename } from 'node:path';
const raw=resolve(process.argv[2]||'artifacts/source-experience-study/live-baseline/source-default-continuous.webm');
assert.ok(raw.includes('/artifacts/source-experience-study/'),'Only this study\'s owned generated movie may be compacted');
const output=raw.replace(/\.webm$/,'-compact.webm'),receipt=raw.replace(/\.webm$/,'-compact-receipt.json');assert.notEqual(raw,output);
const ffmpeg=process.env.FFMPEG||'/opt/homebrew/bin/ffmpeg',ffprobe=process.env.FFPROBE||'/opt/homebrew/bin/ffprobe';
const sha=value=>createHash('sha256').update(value).digest('hex');
const fileHash=async path=>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');};
async function run(command,args,{progress=false}={}){return new Promise((done,reject)=>{
  const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let text='',errors='',last=0;
  child.stdout.on('data',chunk=>{if(!progress){text+=chunk;return;}const line=String(chunk),time=Number(line.match(/out_time_us=(\d+)/)?.[1]||0)/1e6;if(time-last>=60){last=time;console.log(JSON.stringify({encodedSeconds:time}));}});
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-8000);});child.on('error',reject);child.on('close',code=>code?reject(new Error(`${command} exited${code}: ${errors}`)):done(text));
});}
async function probe(path){return JSON.parse(await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',path]));}
async function audioProof(path){
  const payload=await run(ffmpeg,['-v','error','-i',path,'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','pipe:1']);
  const packetText=await run(ffprobe,['-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts_time,dts_time,duration_time,size','-of','json',path]);
  const packets=JSON.parse(packetText).packets||[];
  return{encodedPacketPayload:payload.trim(),packetCount:packets.length,packetTimestampAndSizeSha256:sha(JSON.stringify(packets)),first:packets[0],last:packets.at(-1)};
}
const inspectedPath=join(dirname(raw),`${basename(raw,'.webm')}-decoded/report.json`);
const inspected=JSON.parse(await readFile(inspectedPath,'utf8'));
assert.equal(inspected.file,raw,'Raw decoder receipt refers to a different movie');
assert.ok(inspected.decoded?.length===3&&inspected.audio?.rms>0,'Raw decoded frame/audio witnesses are required before compaction');
const report={kind:'source-experience-owned-evidence-compaction',raw:{path:raw,bytes:(await stat(raw)).size,sha256:await fileHash(raw),decodedReceipt:inspectedPath},
  output:{path:output},limitations:['Video is an additional lossy VP9 derivative; not bit-exact dither evidence.','Audio remains exact encoded packet payload and timestamps.','Native PNG witnesses, complete trace and original raw hash/size remain retained.'],retiredRaw:false};
report.raw.probe=await probe(raw);report.raw.audio=await audioProof(raw);await writeFile(receipt,JSON.stringify(report,null,2));
console.log(JSON.stringify({stage:'raw-verified',bytes:report.raw.bytes,sha256:report.raw.sha256,audioPackets:report.raw.audio.packetCount}));
await run(ffmpeg,['-v','error','-y','-copyts','-i',raw,'-map','0:v:0','-map','0:a:0','-map_metadata','0','-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-threads','2','-row-mt','1','-tile-columns','2',
  '-b:v','400k','-maxrate','600k','-bufsize','1M','-crf','42','-g','120','-fps_mode','passthrough','-c:a','copy','-avoid_negative_ts','disabled','-progress','pipe:1','-nostats',output],{progress:true});
report.output.bytes=(await stat(output)).size;report.output.sha256=await fileHash(output);report.output.probe=await probe(output);report.output.audio=await audioProof(output);
const rv=report.raw.probe.streams.find(s=>s.codec_type==='video'),ov=report.output.probe.streams.find(s=>s.codec_type==='video');
assert.equal(ov.width,rv.width);assert.equal(ov.height,rv.height);assert.deepEqual(report.output.audio,report.raw.audio,'Copied audio packet payload/timestamps differ');
assert.ok(report.output.bytes>0&&report.output.bytes<report.raw.bytes,'Derivative did not reduce owned evidence size');
const end=Math.max(0,(inspected.durationSeconds||0)-.25),endFrame=raw.replace(/\.webm$/,'-compact-end.png');
await run(ffmpeg,['-v','error','-y','-ss',String(end),'-i',output,'-frames:v','1',endFrame]);report.output.decodedEndFrame=endFrame;
report.passed=true;await writeFile(receipt,JSON.stringify(report,null,2));
if(process.env.SOURCE_COMPACT_RETIRE==='1'){
  assert.equal(await fileHash(raw),report.raw.sha256,'Raw movie changed while compacting');await unlink(raw);report.retiredRaw=true;
  report.retirementReason='Explicitly authorized retirement of only this generated raw movie after decoded witnesses, raw hash and verified exact-audio compact derivative; disk pressure.';
  await writeFile(receipt,JSON.stringify(report,null,2));
}
console.log(JSON.stringify({passed:true,receipt,rawRetired:report.retiredRaw,output:output,bytes:report.output.bytes,audioExact:true}));
