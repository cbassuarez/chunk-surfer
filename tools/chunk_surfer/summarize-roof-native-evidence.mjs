import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
const root=resolve('artifacts/roof-floor-design/deep-composition');
const load=async file=>JSON.parse(await readFile(join(root,file),'utf8'));
const evidence={
  method:'Native Apple Metal Chrome, no viewport emulation,1120x673 window content; actual GPU1280x800 final VFD plus HUD canvas composited at12fps, actual WebAudio destination tapped into48kHz stereo Opus. QA keyboard/pointer events use ordinary input handlers and collision. One initial gallery fixture, no between-beat debug warps. Diagnostic placements and uniform ablations are separate and explicit.',
  candidate:'Seat interaction/heading correction plus categorical roof-glass binding/render classification correction; final frozen revision',
  runs:[],controlledMatrix:join(root,'controlled-matrix/report.json'),previousSeatOnlyMatrix:join(root,'controlled-matrix-seat-only/report.json'),attempts:join(root,'capture-attempts.json'),archiveMapping:join(root,'artifact-locations.json'),
  limits:[
    'Automated control traversal, not unfamiliar human play or a beauty judgment.',
    'Full routes followed the same22 beats but route timings and counts differ under host load; videos are uncut and not speed matched.',
    'Positive video timestamp gaps are preserved and listed per run; complete packet and decode validation is separate from smoothness.',
    'Post-route recorder-off West performance samples were not simultaneous or load controlled; no causal performance gain is claimed.',
    'Native console reported unavailable localhost diffusion calibration/WebSocket service and404s; page exceptions and shader/GL states are recorded separately.',
    'Diagnostic matrix resets VFD history and fixes only GPU time uniforms; game/audio clocks remain live. Repeated-pose tolerance is measured.',
    'Diagnostic rendering controls restore pose/look/torch on/rain/clock/identity override/diagnostic state; time and torch battery advance naturally. Roof access is enabled only in the throwaway diagnostic fixture.',
    'Categorical glass repair can be tested by raw GPU RGB/alpha hashes and on/off/on identity ablation. Raw prop PNG RGB alone has Canvas premultiply rounding when semantic alpha changes.',
    'An extensive seated city view and the school feeling worth preserving before dialogue still require unfamiliar human acceptance; no human trial is inferred from native automation.',
  ],
};
for(const name of ['baseline-verified','revision']){
  const r=await load(`${name}/report.json`),v=await load(`${name}/recording-validation.json`);
  const audio=await new Promise(resolve=>{
    let stderr='';const process=spawn('/opt/homebrew/bin/ffmpeg',['-hide_banner','-i',join(root,name,'uncut-with-audio.webm'),'-vn','-af','volumedetect','-f','null','-']);
    process.stderr.on('data',data=>stderr+=data);
    process.on('exit',code=>resolve({exitCode:code,meanDb:Number(stderr.match(/mean_volume: ([\d.-]+) dB/)?.[1]),maxDb:Number(stderr.match(/max_volume: ([\d.-]+) dB/)?.[1]),samples:Number([...stderr.matchAll(/n_samples: (\d+)/g)].at(-1)?.[1])}));
  });
  const perf=await load(`${name==='baseline-verified'?'baseline':'revision'}-roof-performance.json`);
  evidence.runs.push({name,video:join(root,name,'uncut-with-audio.webm'),report:join(root,name,'report.json'),trajectory:join(root,name,'trajectory.json'),keyboardSteps:r.steps.length,recaptureClicks:r.inputs.filter(x=>x.kind==='mouse-click-to-reacquire-look').length,beats:r.captures.length,runtimeExceptions:r.errors,pageErrors:r.browserErrors,assetStable:r.assetStable,sourcesStable:r.sourcesStable,AVValidation:v.pass,checks:v.checks.length,fullDecode:v.decode,durationSec:v.wallDurationSec,videoGaps:v.timeline.find(s=>s.codec_type==='video').gapsOverOneSecond,audioMeasurement:audio,recorderOffWestPerformance:{samples:perf.samples,median:perf.median,p95:perf.p95,p99:perf.p99,omittedInitial:perf.omittedInitial,omittedNonpositive:perf.omittedNonpositive}});
}
const matrix=await load('controlled-matrix/report.json');
evidence.controlledRepeatability=matrix.repeatability;
evidence.glassIdentityAblation=matrix.glassBindingAblation;
await writeFile(join(root,'native-evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
