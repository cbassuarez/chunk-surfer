// Freeze only final production frames into a blind protocol. No answer key is
// copied to the reader artifact; the original capture index is identified by SHA.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const directory=path.resolve('artifacts/lettering-production'),indexFile=path.join(directory,'solid-paint/review-evidence/report.json');
const bytes=fs.readFileSync(indexFile),index=JSON.parse(bytes),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
assert.ok(index.sourceHashesAfter,'Wait for the completed capture-index identity gate');
assert.deepEqual(index.sourceHashesAfter,index.sourceHashes,'Capture sources changed while final frames were taken');
// The review's prose/status may be updated after acceptance. Pixel-producing
// code and pack identities must still match the frozen image capture.
for(const [file,hash]of Object.entries(index.sourceHashes))if(!file.endsWith('/review.html'))assert.equal(sha(fs.readFileSync(file)),hash,`Final capture source changed: ${file}`);
const forbidden=new Set(['copy','expectedCopy','expected','expectedTranscription','answer','answers','text','lines','glyphs']);
const sanitize=value=>Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!forbidden.has(key)).map(([key,item])=>[key,sanitize(item)])):value;
const trials=['dock','vigil'].map((id,i)=>{
 const item=index.cases.find(item=>item.kind==='encounter'&&item.id===id);assert.ok(item,`Missing captured encounter ${id}`);
 const frame=item.frames.find(frame=>frame.evidence.mode===3);assert.ok(frame,`Missing pigment-resolve final frame ${id}`);
 assert.equal(item.distance,3);assert.equal(frame.evidence.asset,'production');assert.equal(frame.evidence.mode,3);
 assert.equal(frame.evidence.stage,'final');assert.equal(frame.evidence.light,'torch');assert.equal(frame.evidence.glError,0);
 assert.equal(frame.evidence.acquisition.sceneWidth,960);assert.equal(frame.evidence.acquisition.sceneHeight,600);
 assert.equal(frame.evidence.acquisition.shaderReady,true);assert.equal(frame.evidence.acquisition.lastGlError,0);
 assert.equal(frame.evidence.settings.memory,false);assert.equal(frame.evidence.settings.reduceMotion,true);
 const image=fs.readFileSync(path.join(directory,'solid-paint/review-evidence',frame.file));
 assert.equal(image.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(image.readUInt32BE(16),960);assert.equal(image.readUInt32BE(20),600);
 return{id:`view-${i+1}`,image:`./solid-paint/review-evidence/${frame.file}`,imageSha256:sha(image),
  sourceCapture:{captureIndexSha256:sha(bytes),captureIndexDate:index.date,frameSha256:sha(JSON.stringify(frame)),
   sourceHashes:index.sourceHashes,frame:sanitize(frame)}};
});
const manifest={schemaVersion:2,protocol:'solid-pigment-mode3-native-v2',createdAt:new Date().toISOString(),nativeWidth:960,nativeHeight:600,exposureMs:3000,
 captureIndexSha256:sha(bytes),trials};
const file=path.join(directory,'reading-trials.json');
if(fs.existsSync(file)){const previous=fs.readFileSync(file),archive=path.join(directory,'reading-trials-archive');fs.mkdirSync(archive,{recursive:true});const target=path.join(archive,`reading-trials-${sha(previous)}.json`);if(!fs.existsSync(target))fs.writeFileSync(target,previous);}
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({file,trials:trials.map(({id,image,imageSha256})=>({id,image,imageSha256})),sourceCapture:sha(bytes)}));
