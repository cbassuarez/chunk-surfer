// Fixed current production JS/content and owned drive assets, without copying
// unrelated large building packs or mutating the player's saved game.
import {readFile,writeFile,readdir,mkdir,copyFile,access,constants} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const base=process.env.SOURCE_DRIVE_FREEZE_DIR||'artifacts/source-drive-study/continuity/frozen',snapshot=join(base,'sources');
try{await access(snapshot);throw Error('Snapshot exists; choose a fresh SOURCE_DRIVE_FREEZE_DIR.');}catch(e){if(e.code!=='ENOENT')throw e;}
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else if(e.isFile())out.push(p);}return out;}
const paths=['index.html',...await files('src'),...await files('content'),...await files('public/assets/source-drive')].sort();
const sha=b=>createHash('sha256').update(b).digest('hex'),identity=()=>Promise.all(paths.map(async path=>{const b=await readFile(path);return{path,bytes:b.length,sha256:sha(b)};}));
const before=await identity();await mkdir(snapshot,{recursive:true});
for(const row of before){const target=join(snapshot,row.path);await mkdir(dirname(target),{recursive:true});await copyFile(row.path,target,constants.COPYFILE_FICLONE);if(sha(await readFile(target))!==row.sha256)throw Error('Source changed during copy: '+row.path);}
const after=await identity();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Live sources changed during fixed copy. Preserve this incomplete snapshot and use a fresh directory.');
const manifest={kind:'source-drive-continuity-fixed-production-sources',createdAt:new Date().toISOString(),snapshot:resolve(snapshot),files:before.length,bytes:before.reduce((n,r)=>n+r.bytes,0),sourceStableDuringCopy:true,entries:before,limits:['Other existing building assets remain live.','No ordinary startup, packaged WebView, full-chapter or human acceptance claim.']};
await writeFile(join(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({snapshot,files:manifest.files,bytes:manifest.bytes,stable:true}));
