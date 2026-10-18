import {spawnSync} from 'node:child_process';
// A single bounded worker, invoked only through the shared compute gate.
for(const file of['build-study.mjs','verify-study.mjs',...((process.argv.includes('--pilot')||process.argv.includes('--capture'))?['capture-study.mjs']:[])]){
 const result=spawnSync(process.execPath,[`tools/chunk_surfer/weathering/${file}`],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
