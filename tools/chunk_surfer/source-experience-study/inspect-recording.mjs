// Checks the saved artifact, not the live recorder's optimistic readiness.
// node .../inspect-recording.mjs artifacts/.../baseline-entry-route.webm
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname, basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const file = resolve(process.argv[2] || 'artifacts/source-experience-study/live/baseline-entry-route.webm');
const json = file.replace(/\.webm$/, '.json'), output = join(dirname(file), `${basename(file,'.webm')}-decoded`);
await mkdir(output,{recursive:true});
const ffprobe=process.env.FFPROBE||'/opt/homebrew/bin/ffprobe',ffmpeg=process.env.FFMPEG||'/opt/homebrew/bin/ffmpeg';
async function run(command,args,{pipeAudio=false}={}) {
  return new Promise((resolveRun,reject)=>{
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',samples=0,sum=0,peak=0,nonzero=0,tail=Buffer.alloc(0);
    child.stdout.on('data',chunk=>{
      if(!pipeAudio){stdout+=chunk;return;}
      const data=tail.length?Buffer.concat([tail,chunk]):chunk, n=data.length-data.length%4;
      for(let i=0;i<n;i+=4){const v=data.readFloatLE(i);sum+=v*v;peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>1e-6)nonzero++;samples++;}
      tail=data.subarray(n);
    });
    child.stderr.on('data',data=>{stderr=(stderr+data).slice(-12000);});
    child.on('error',reject);child.on('close',code=>code?reject(new Error(`${command} exited${code}: ${stderr}`)):resolveRun(pipeAudio?{samples,rms:Math.sqrt(sum/Math.max(1,samples)),peak,nonzeroFraction:nonzero/Math.max(1,samples)}:{stdout,stderr}));
  });
}
const probe=JSON.parse((await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file])).stdout);
const packets=JSON.parse((await run(ffprobe,['-v','error','-show_packets','-show_entries','packet=stream_index,pts_time,duration_time','-of','json',file])).stdout).packets||[];
const streams=probe.streams||[],video=streams.find(stream=>stream.codec_type==='video'),audio=streams.find(stream=>stream.codec_type==='audio');
const trackEnds=streams.map(stream=>({index:stream.index,type:stream.codec_type,endSeconds:packets.filter(p=>p.stream_index===stream.index).reduce((last,packet)=>Math.max(last,Number(packet.pts_time||0)+Number(packet.duration_time||0)),0)}));
const duration=Math.max(0,...trackEnds.map(track=>track.endSeconds));
let trace=null,tracePath=null;try{trace=JSON.parse(await readFile(json,'utf8'));tracePath=json;}catch{try{trace=JSON.parse(gunzipSync(await readFile(json+'.gz')).toString('utf8'));tracePath=json+'.gz';}catch{}}
const checks=[],check=(name,pass,details)=>checks.push({name,pass:!!pass,details});
check('saved container has video and audio tracks',video&&audio,{video:video?.codec_name,audio:audio?.codec_name});
check('saved trace establishes the requested native frame size',trace&&video?.width===trace.width&&video?.height===trace.height,{width:video?.width,height:video?.height,requested:trace?{width:trace.width,height:trace.height}:null});
check('nonempty movie contains timestamped packets',duration>.1&&packets.length>5,{duration,packets:packets.length});
const avGap=video&&audio?Math.abs(trackEnds.find(t=>t.index===video.index).endSeconds-trackEnds.find(t=>t.index===audio.index).endSeconds):null;
check('audio/video endpoints remain within250ms',avGap!=null&&avGap<.25,{gapSeconds:avGap,trackEnds});
const packetGaps=streams.map(stream=>{const track=packets.filter(p=>p.stream_index===stream.index);let maximum=0,over500ms=0;for(let i=1;i<track.length;i++){const gap=Number(track[i].pts_time)-Number(track[i-1].pts_time)-Number(track[i-1].duration_time||0);maximum=Math.max(maximum,gap);if(gap>.5)over500ms++;}return{index:stream.index,type:stream.codec_type,maximumGapSeconds:maximum,gapsOver500ms:over500ms};});
check('saved tracks contain no gaps longer than500ms',packetGaps.every(track=>track.gapsOver500ms===0),packetGaps);
check('complete synchronized input/state trace is saved',trace?.events?.[0]?.type==='record-start'&&trace?.events?.at(-1)?.type==='record-stop'&&trace?.samples?.length>0,{tracePath,events:trace?.events?.length||0,samples:trace?.samples?.length||0});
const decoded=[];
for(const [label,seconds]of [['start',Math.min(.1,duration/4)],['middle',duration/2],['end',Math.max(0,duration-.25)]]){
  const path=join(output,`${label}.png`);await run(ffmpeg,['-v','error','-y','-ss',String(seconds),'-i',file,'-frames:v','1',path]);
  decoded.push({label,seconds,path,bytes:(await stat(path)).size});
}
check('start/middle/end saved frames decode',decoded.length===3&&decoded.every(frame=>frame.bytes>0),decoded);
const signal=audio?await run(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-f','f32le','-ac','1','-ar','16000','pipe:1'],{pipeAudio:true}):null;
check('saved mixed program audio is nonzero',signal?.samples>0&&signal.rms>1e-6&&signal.nonzeroFraction>.001,signal);
if(trace){
  check('encoded byte count agrees with saved file',(await stat(file)).size===trace.bytes,{actual:(await stat(file)).size,claimed:trace.bytes});
  check('capture completed without encoder/compositor/chunk errors',!trace.chunkError&&!(trace.drawingErrors||[]).length&&!(trace.browserErrors||[]).length,{chunkError:trace.chunkError,drawingErrors:trace.drawingErrors,browserErrors:trace.browserErrors});
  const gaps=(trace.samples||[]).slice(1).map((sample,index)=>sample.tMs-trace.samples[index].tMs);
  check('state sampling stayed within500ms',gaps.every(gap=>gap<500),{largestGapMs:Math.max(0,...gaps),samples:trace.samples?.length});
  check('no later recorded debug mutations',trace.continuousAfterInitialFixture===true,trace.events?.filter(event=>event.type==='debug-call'));
}
const report={file,json:tracePath,checks,probe,decoded,audio:signal,durationSeconds:duration,
  limitations:['Encoded video is lossy; this does not prove bit-exact dither preservation.','Audio signal statistics establish retained sound, not perceptual quality or physical output.','Route continuity requires inspection of actual command/input/state trace and imagery.']};
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:checks.every(c=>c.pass),report:join(output,'report.json'),checks},null,2));
if(checks.some(c=>!c.pass))process.exitCode=1;
