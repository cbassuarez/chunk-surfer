// Append-only preparation for the two inspected source performances.
// Sources are acquired separately; this build never downloads at runtime or build time.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const ROOT=resolve(import.meta.dirname,'..');
const SOURCE_DIR=resolve(process.argv[2]||join(ROOT,'artifacts/window-media-revisit/source-media'));
const MANIFEST_PATH=join(ROOT,'content/media/window-media.media.json');
const OUT=join(ROOT,'public/window-media');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashFile=file=>sha(readFileSync(file));
const run=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});
const specs=[
 {id:'mimosa-response',file:'mimosa-original.ogv',sha256:'097e5de6dae756418ca121e6b8b34475c8c5b37f852aeafad57649516ff5c229',start:8,duration:4,width:480,height:320,crop:{x:80,y:40,width:480,height:320},posterTime:1.5,
  sourceTitle:'Mimosa pudica leaves folding when touched 1',creator:'Brandizzi',license:'CC BY 2.5',licenseUrl:'https://creativecommons.org/licenses/by/2.5/',sourceUrl:'https://commons.wikimedia.org/wiki/File:Mimosa_pudica_leaves_folding_when_touched_1.ogv',downloadUrl:'https://upload.wikimedia.org/wikipedia/commons/b/b1/Mimosa_pudica_leaves_folding_when_touched_1.ogv',evidenceFile:'mimosa-page.html',
  delivery:'Original uploader’s Ogg Theora/Vorbis file; production is silent.',
  eventNotes:'Inspected source8–12s: hand approach, contact, leaf folding and withdrawal. Relative clip times are approximate visual staging references: approach about1s, contact1.5–2s, folded state about3s. No claim that sound causes this plant response.',
  operations:['single performed gesture excerpt','spatial crop retaining hand/leaf relationship','15fps silent transcode','no loop dissolve or synthetic interpolation']},
 {id:'performance-capture',file:'dickson-original-deposit.mov',sha256:'1165de13948beb4692bc63430e0a7a0260fe40621d40a8c86f6b538d1e123bf8',start:66,duration:12,width:480,height:360,crop:{x:68,y:0,width:480,height:360},posterTime:3,
  sourceTitle:'Dickson Experimental Sound Film',creator:'William Kennedy-Laurie Dickson / William Heise; restoration supplied by Walter Murch and Sean Cullen',license:'Public domain dedication',licenseUrl:'https://creativecommons.org/licenses/publicdomain/',sourceUrl:'https://archive.org/details/dicksonfilmtwo',downloadUrl:'https://archive.org/download/dicksonfilmtwo/DicksonFilm_High.mov',evidenceFile:'dickson-archive-metadata.json',
  delivery:'Original2006 archive-depositor MOV containing restored historical footage. This is not the unavailable LOC silent master. All sound and explanatory restoration cards removed from production excerpt.',
  eventNotes:'Inspected source66–78s is one coherent violin/horn/dance pass; excludes title cards, textual explanations and later repeated restoration pass. Horn is in left half, bow/player at center, dancers at right. No invented synchronized performance or offscreen reel transport.',
  operations:['single coherent historical performance excerpt','removed delivery side borders by crop','15fps silent transcode','no loop dissolve or synthetic interpolation']},
];

const before=JSON.parse(readFileSync(MANIFEST_PATH,'utf8'));
const owned=new Set(specs.map(s=>s.id));
const retained=before.assets.filter(a=>!owned.has(a.id));
if(retained.length<10)throw Error('Expected to preserve at least the ten original media records');
if(new Set(before.assets.map(a=>a.id)).size!==before.assets.length)throw Error('Duplicate existing media IDs');
const retainedHash=sha(JSON.stringify(retained));
const records=[],sources=[];
mkdirSync(OUT,{recursive:true});
for(const s of specs){
 const source=join(SOURCE_DIR,s.file),evidence=join(SOURCE_DIR,s.evidenceFile);
 if(hashFile(source)!==s.sha256)throw Error(`Source hash changed: ${s.id}`);
 const evidenceText=readFileSync(evidence,'utf8');
 if(s.id==='mimosa-response'&&!evidenceText.includes('https://creativecommons.org/licenses/by/2.5'))throw Error('Missing Mimosa per-file licence');
 if(s.id==='performance-capture'&&JSON.parse(evidenceText).metadata.licenseurl!=='http://creativecommons.org/licenses/publicdomain/')throw Error('Missing depositor public-domain dedication');
 const filter=`crop=${s.crop.width}:${s.crop.height}:${s.crop.x}:${s.crop.y},fps=15,format=yuv420p,setsar=1`;
 const webm=join(OUT,`${s.id}.webm`),mp4=join(OUT,`${s.id}.mp4`),poster=join(OUT,`${s.id}.png`);
 const common=['-ss',String(s.start),'-i',source,'-t',String(s.duration),'-vf',filter,'-an','-map_metadata','-1'];
 run([...common,'-c:v','libvpx-vp9','-deadline','good','-cpu-used','4','-row-mt','1','-crf','32','-b:v','0','-g','15',webm]);
 run([...common,'-c:v','libx264','-preset','slow','-crf','22','-g','15','-keyint_min','15','-sc_threshold','0','-movflags','+faststart',mp4]);
 run(['-ss',String(s.start+s.posterTime),'-i',source,'-vf',filter,'-frames:v','1','-an',poster]);
 const sourceRecord={file:s.file,sha256:s.sha256,title:s.sourceTitle,creator:s.creator,license:s.license,licenseUrl:s.licenseUrl,url:s.sourceUrl,downloadUrl:s.downloadUrl,
  evidenceFile:`artifacts/window-media-revisit/source-media/${s.evidenceFile}`,evidenceSha256:hashFile(evidence),delivery:s.delivery};
 const derivative=(file,codec)=>({path:`window-media/${s.id}.${codec==='png'?'png':codec==='vp9'?'webm':'mp4'}`,codec,sha256:hashFile(file),bytes:statSync(file).size});
 records.push({id:s.id,kind:'video',path:`window-media/${s.id}.webm`,aspectRatio:s.width/s.height,width:s.width,height:s.height,fps:15,
  trim:{startSeconds:s.start,durationSeconds:s.duration,loopDissolveSeconds:0},crop:s.crop,sensitivity:'none',source:sourceRecord,
  derivatives:{webm:derivative(webm,'vp9'),mp4:derivative(mp4,'h264'),poster:derivative(poster,'png')},modifications:s.operations,
  eventNotes:s.eventNotes,loopPolicy:'Hard source boundary; choreography must obscure or deliberately author the return to the initial state. No baked ghost/dissolved contact.'});
 sources.push({id:s.id,title:s.sourceTitle,author:s.creator,url:s.sourceUrl,licence:s.license,licenceUrl:s.licenseUrl,changes:s.operations.join('; '),delivery:s.delivery});
}
const manifest={...before,assets:[...retained,...records],extensions:{...before.extensions,'pressure-performances':{generatedBy:'scripts/build-window-media-extension.mjs',sourceDirectory:'artifacts/window-media-revisit/source-media',assetIds:specs.map(s=>s.id)}}};
if(sha(JSON.stringify(manifest.assets.filter(a=>!owned.has(a.id))))!==retainedHash)throw Error('Existing media records changed');
writeFileSync(MANIFEST_PATH,JSON.stringify(manifest,null,2)+'\n');
writeFileSync(join(ROOT,'src/data/window-media-sources.js'),`// Generated by scripts/build-window-media-extension.mjs.\n// New source credits only; existing ten media records remain in their original manifest.\nexport const WINDOW_MEDIA_EXTENSION_SOURCES=Object.freeze(${JSON.stringify(sources,null,2)}.map(Object.freeze));\n`);
writeFileSync(join(ROOT,'artifacts/window-media-revisit/extension-build-receipt.json'),JSON.stringify({schema:1,generatedBy:'scripts/build-window-media-extension.mjs',retainedAssetIds:retained.map(a=>a.id),retainedRecordsSha256:retainedHash,newAssetIds:records.map(a=>a.id),newDerivativeBytes:records.reduce((n,a)=>n+Object.values(a.derivatives).reduce((v,d)=>v+d.bytes,0),0),sourcesUnchanged:specs.every(s=>hashFile(join(SOURCE_DIR,s.file))===s.sha256),sourceManifestSha256:hashFile(MANIFEST_PATH),acceptance:'Inspected original frame sequences and exported static contact sheets. No audio delivered. Native choreography, human comprehension and runtime frame continuity require separate validation.'},null,2)+'\n');
console.log(JSON.stringify({preserved:retained.length,added:records.map(a=>a.id),sourcesUnchanged:true}));
