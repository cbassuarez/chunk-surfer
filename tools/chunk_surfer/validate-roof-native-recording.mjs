import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
const dir=resolve(process.argv[2]||'artifacts/roof-floor-design/deep-composition/revision');
const file=join(dir,'uncut-with-audio.webm');
const report=JSON.parse(await readFile(join(dir,'report.json'),'utf8'));
const run=async(cmd,args)=>new Promise(resolve=>{const child=spawn(cmd,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('exit',code=>resolve({code,stdout,stderr}));});
const probe=await run('/opt/homebrew/bin/ffprobe',['-v','error','-show_packets','-show_streams','-show_entries','packet=stream_index,pts_time,pos,size:stream=index,codec_type,codec_name,width,height,sample_rate,channels','-of','json',file]);
const parsed=JSON.parse(probe.stdout),streams=parsed.streams||[],packets=parsed.packets||[];
const timeline=streams.map(stream=>{const rows=packets.filter(p=>p.stream_index===stream.index&&p.pts_time!=null);const reversed=[],gaps=[];for(let i=1;i<rows.length;i++){const delta=Number(rows[i].pts_time)-Number(rows[i-1].pts_time);if(delta<0)reversed.push({before:rows[i-1].pts_time,after:rows[i].pts_time,pos:rows[i].pos});if(delta>1)gaps.push({before:rows[i-1].pts_time,after:rows[i].pts_time,seconds:delta});}return{...stream,packets:rows.length,firstPts:Number(rows[0]?.pts_time),lastPts:Number(rows.at(-1)?.pts_time),reversed,gapsOverOneSecond:gaps};});
let chunks=null;try{chunks=JSON.parse(await readFile(join(dir,'video-chunks.json'),'utf8'));}catch{}
const size=(await stat(file)).size;
const checks=[
  {name:'ffprobe parsed complete stream without container errors',pass:probe.code===0&&!probe.stderr.trim(),detail:probe.stderr.trim()},
  {name:'native video and real stereo audio tracks are present',pass:streams.some(s=>s.codec_type==='video'&&s.width===1120&&s.height===673)&&streams.some(s=>s.codec_type==='audio'&&s.codec_name==='opus'&&s.channels===2)},
  {name:'packet timestamps never reverse within a track',pass:timeline.every(t=>!t.reversed.length)},
  {name:'sequenced chunks account for every file byte',pass:!!chunks&&chunks.reduce((a,c)=>a+c.bytes,0)===size&&chunks.every((c,i)=>c.index===i)&&report.videoChunkOrder?.pending===0},
  {name:'recording reaches route end without trimming',pass:Math.abs(Math.max(...timeline.map(t=>t.lastPts))-(report.recordingEnd-report.recordingStart)/1000)<2},
];
let decode=null;if(process.argv.includes('--decode')){const d=await run('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-threads','1','-i',file,'-map','0:v:0','-map','0:a:0','-f','null','-']);decode={exitCode:d.code,errors:d.stderr.trim()};checks.push({name:'complete video/audio decode has no errors',pass:d.code===0&&!d.stderr.trim(),detail:d.stderr.trim()});}
const result={file,size,wallDurationSec:(report.recordingEnd-report.recordingStart)/1000,checks,timeline,chunks:chunks?.length||null,decode,pass:checks.every(c=>c.pass),limitation:'Long positive frame gaps are retained and listed; they may reflect recorded host stalls. This validates transport, not representative player smoothness or beauty.'};
await writeFile(join(dir,'recording-validation.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));process.exit(result.pass?0:1);
