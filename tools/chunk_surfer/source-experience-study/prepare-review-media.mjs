// Add seek metadata to review copies without changing encoded frames or audio.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const base = 'artifacts/source-experience-study/prototypes/native';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ffmpeg = '/opt/homebrew/bin/ffmpeg', ffprobe = '/opt/homebrew/bin/ffprobe';
const packets = path => JSON.parse(execFileSync(ffprobe, ['-v','error','-show_data_hash','sha256','-show_packets',
  '-show_entries','packet=stream_index,pts,dts,size,flags,data_hash','-of','json',path], {maxBuffer:16*1024*1024})).packets;
const byStream = values => [...new Set(values.map(p=>p.stream_index))].sort().map(index=>values.filter(p=>p.stream_index===index));
const files = [];
for (const experiment of ['guidance','bust']) for (const condition of ['before','after']) {
  const original = `${base}/${experiment}/${condition}/encounter.webm`;
  const review = `${base}/${experiment}/${condition}/encounter-review.webm`;
  execFileSync(ffmpeg, ['-v','error','-y','-copyts','-i',original,'-map','0','-c','copy','-avoid_negative_ts','disabled',review]);
  const a = byStream(packets(original)), b = byStream(packets(review));
  assert.deepEqual(b,a,`Encoded payloads or packet timestamps differ: ${review}`);
  const format = JSON.parse(execFileSync(ffprobe, ['-v','error','-show_entries','format=duration','-of','json',review])).format;
  assert.ok(Number(format.duration)>0, 'Review container must declare a finite duration');
  files.push({experiment,condition,original,review,originalSha256:sha(await readFile(original)),reviewSha256:sha(await readFile(review)),
    durationSeconds:Number(format.duration),packets:a.reduce((n,track)=>n+track.length,0),
    timestampedEncodedPacketSha256:sha(JSON.stringify(a)),perStreamPayloadAndPtsDtsIdentical:true});
}
const receipt = {kind:'source-experience-seekable-review-media',at:new Date().toISOString(),files,
  method:'FFmpeg stream copy with original timestamps; original capture files remain unchanged.',
  verification:'Every encoded packet payload hash, PTS, DTS, size and flags match in per-stream order.',
  limitations:['Container interleaving, inferred packet-duration metadata and seek indexes may differ.',
    'No frames are interpolated, no audio is changed, and all recorded frame holds remain.',
    'This adds seeking metadata only; it does not resolve failed motion/sampling acceptance.']};
await writeFile('artifacts/source-experience-study/support/review-media.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({passed:true,files:files.length,receipt:'artifacts/source-experience-study/support/review-media.json'}));
