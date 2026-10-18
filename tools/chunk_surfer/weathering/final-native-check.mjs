import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const result={at:new Date().toISOString(),kind:'gated-final-native-study-check',steps:[]};
for(const [name,file,env]of[
 ['near-sign-contract','tools/chunk_surfer/weathering/capture-study.mjs',{WEATHER_CASES:'hall-sign',WEATHER_MOTION_ONLY:'1',WEATHER_BRDF_STUDY:'1',WEATHER_BRDF_ONLY:'1',WEATHER_BRDF_INTENSITY:'.4',WEATHER_BRDF_BENCH:'1',WEATHER_REPORT:'report-contract-bench.json',WEATHER_PROPS_SNAPSHOT:'artifacts/weathering-study/source-snapshot-53209c462b2d.js'}],
 ['media-and-ui','tools/chunk_surfer/weathering/finish-check.mjs',{}]
]){try{execFileSync(process.execPath,[file],{env:{...process.env,...env},stdio:'inherit'});result.steps.push({name,completed:true});}catch(e){result.steps.push({name,completed:false,error:e.message});}}
fs.writeFileSync('artifacts/weathering-study/final-native-check.json',JSON.stringify(result,null,2)+'\n');
if(result.steps.some(s=>!s.completed))process.exitCode=1;
