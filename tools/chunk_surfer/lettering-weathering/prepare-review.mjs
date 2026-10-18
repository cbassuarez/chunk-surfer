import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import sharp from 'sharp';
const root='artifacts/lettering-weathering',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const meta=JSON.parse(fs.readFileSync('public/assets/conservatory-props.lettering.json')),pack=sha(fs.readFileSync('public/assets/conservatory-props.glb'));
assert.equal(meta.packSha256,pack);const reports=process.argv.slice(2);assert.ok(reports.length,'Pass final capture report filenames');
const data={kind:'installed-lettering-review',at:new Date().toISOString(),packSha256:pack,reports:[],cases:[]};
for(const name of reports){const file=path.join(root,'captures',name),r=JSON.parse(fs.readFileSync(file));assert.ok(!r.failure,r.failure);assert.deepEqual(r.errors,[]);assert.deepEqual(r.changedSources,[]);for(const c of r.cases){if(c.arm==='after')assert.equal(c.packSha256,pack,'Recapture after final installation: '+name);data.cases.push(c);}data.reports.push({file,sha256:sha(fs.readFileSync(file)),sourceHashes:r.sourceHashes});}
fs.writeFileSync(path.join(root,'captures/review-data.json'),JSON.stringify(data,null,2)+'\n');
// Straight RGB is meaningful even where atlas alpha=0: that alpha is a
// pigment mask, never material transparency. Canvas premultiplication would
// destroy bare stock RGB, so diagnostic copies explicitly remove alpha here.
fs.mkdirSync(path.join(root,'channels'),{recursive:true});const channels=[];
for(const page of meta.pages){const source=fs.readFileSync('public/assets/lettering/'+page.albedo),result=await sharp(source).removeAlpha().png().toBuffer();await fs.promises.writeFile(path.join(root,'channels',page.albedo),result);
 const a=await sharp(source).removeAlpha().raw().toBuffer(),b=await sharp(result).raw().toBuffer();assert.ok(a.equals(b));channels.push({file:page.albedo,sourceSha256:sha(source),displaySha256:sha(result),rgbBytesExact:true,transformation:'Pigment alpha removed only for diagnostic visibility; straight RGB unchanged'});}
for(const page of meta.pages)for(const kind of ['normal','orm']){const source=fs.readFileSync('public/assets/lettering/'+page[kind]);fs.writeFileSync(path.join(root,'channels',page[kind]),source);channels.push({file:page[kind],sourceSha256:sha(source),displaySha256:sha(source),bytesExact:true,transformation:'Unmodified linear material data'});}
fs.writeFileSync(path.join(root,'channels/manifest.json'),JSON.stringify({kind:'opaque-atlas-diagnostics',packSha256:pack,channels},null,2)+'\n');
console.log(JSON.stringify({reports:reports.length,cases:data.cases.length,opaqueDiagnosticPages:channels.length,packSha256:pack}));
