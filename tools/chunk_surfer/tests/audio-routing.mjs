import fs from 'node:fs';
import path from 'node:path';
import { renderSamSamples } from '../../../public/labs/chunk-surfer/src/audio/sam-voice.js';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const main=read('public/labs/chunk-surfer/src/main.js');
const story=read('public/labs/chunk-surfer/src/audio/story-audio.js');
const mic=read('public/labs/chunk-surfer/src/game/mic.js');
let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

ck('dialog, SFX, and music category buses converge before the limiter',
  ['dialogGain.connect(master)','sfxGain.connect(master)','musicGain.connect(master)','master.connect(limiter)'].every((s)=>main.includes(s)));
ck('direct equipment cues also enter the same final limiter',main.includes('sfxDirectGain.connect(limiter)'));
ck('the limiter feeds the transparent final-output monitor',main.includes('outGain.connect(outputMonitor || actx.destination)'));
ck('story audio receives explicit dialog, SFX, and music destinations',
  main.includes('dialog: dialogGain')&&main.includes('sfx: sfxGain')&&main.includes('music: musicGain'));
ck('typing uses the dialog bus',story.includes("gain.connect(outBus('dialog'))"));
ck('radio communications use the voiced speech path',main.includes('SPEECH.sayAll(lines)')&&main.includes('destination:dialogGain || master'));
ck('room tone, fear, playback, and cues have live category destinations',
  main.includes('RT.roomToneInit(actx, sfxGain)')&&main.includes('FEAR.fearAudioInit(actx, sfxGain)')&&main.includes('bus:sfxGain || master')&&main.includes('CUES.cuesInit(actx, sfxDirectGain)'));
ck('room mic waits for explicit consent and remains analyser-only',
  main.includes("getSave().settings?.mic==='on'")&&main.includes("saveCommit({settings:{...st,mic:'on'}})")&&mic.includes('src.connect(analyser)')&&!mic.includes('analyser.connect('));
ck('every visible machine monitor includes the live room-mic auxiliary RMS',
  main.includes('MONITOR.monitorSetAuxInput(()=>MIC.micActive()?MIC.micLevel():0)'));
ck('game playback is echo-cancelled out of the physical mic',mic.includes('echoCancellation: true'));
ck('recorder transport has a narrow non-spoil guard',main.includes('MIC.micIgnoreSpoilFor(1400)')&&main.includes('if(!MIC.micMaySpoil()) return'));

const rendered=await renderSamSamples('RADIO CHECK ELLERY', {speaker:'radio'});
let energy=0;for(const sample of rendered.samples)energy+=sample*sample;
ck('SAM or its deterministic local fallback produces audible samples',rendered.samples.length>100&&energy/rendered.samples.length>1e-6,`${rendered.provider} ${rendered.samples.length}`);

if(!pass){console.error('\n❌ AUDIO ROUTING FAILURES');process.exit(1);}
console.log('\n✅ AUDIO ROUTING PASSED');
