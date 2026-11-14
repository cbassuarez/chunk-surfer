import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const repo=process.cwd(),target=path.resolve(process.argv[2]||'artifacts/route-completion-and-hush/frozen-game');
await fs.mkdir(target,{recursive:true});
for(const directory of ['src','content','assets','LEGAL'])await fs.cp(path.join(repo,directory),path.join(target,directory),{recursive:true,dereference:true});
for(const file of await fs.readdir(repo))if(file.endsWith('.html')||file.endsWith('.css')||['package.json','vite.config.js'].includes(file))await fs.copyFile(path.join(repo,file),path.join(target,file));
await fs.mkdir(path.join(target,'tools/chunk_surfer'),{recursive:true});
for(const file of ['lens-dev-control.mjs','verify-chapel-tower-complete.mjs','verify-chapel-route-continuation.mjs','verify-tower-route-continuation.mjs','route-verification-film.mjs'])await fs.copyFile(path.join(repo,'tools/chunk_surfer',file),path.join(target,'tools/chunk_surfer',file));
for(const directory of ['node_modules','public'])await fs.symlink(path.join(repo,directory),path.join(target,directory),'dir').catch(error=>{if(error.code!=='EEXIST')throw error;});
const hashes={};
async function walk(directory){for(const entry of await fs.readdir(path.join(target,directory),{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile())hashes[file]=createHash('sha256').update(await fs.readFile(path.join(target,file))).digest('hex');}}
await walk('src');await walk('content');await walk('tools');
await fs.writeFile(path.join(target,'snapshot.json'),JSON.stringify({createdAt:new Date().toISOString(),source:repo,target,method:'Exact copied game source/content/paper and QA scripts; no code or shader substitutions. Existing public assets and dependencies are shared read-only and critical asset hashes are checked by the runner.',hashes},null,2));
console.log(JSON.stringify({target,files:Object.keys(hashes).length,runner:path.join(target,'tools/chunk_surfer/verify-chapel-tower-complete.mjs')}));
