// Source-preserving offline audition. FFmpeg approximates the runtime Web Audio
// two-pole speaker filters; it is not a synchronized capture of the game bus.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { RADIO_CONTACT_EGG as cue } from '../../src/audio/radio-contact-audio.js';
const source=resolve('public',cue.path),out=resolve('artifacts/radio-contact/audio');mkdirSync(out,{recursive:true});
const run=args=>{const r=spawnSync('ffmpeg',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stderr;};
const basic=['-hide_banner','-y','-ss',String(cue.offset),'-i',source,'-t',String(cue.seconds)];
run([...basic,'-c:a','pcm_s24le',`${out}/selected-original.wav`]);
const filters=`pan=mono|c0=0.5*c0+0.5*c1,highpass=f=${cue.highpassHz}:p=2,lowpass=f=${cue.lowpassHz}:p=2,volume=${cue.gain},afade=t=in:d=${cue.attack},afade=t=out:st=${cue.seconds-cue.release}:d=${cue.release}`;
run([...basic,'-af',filters,'-ar','48000','-c:a','pcm_s24le',`${out}/receiver-audition.wav`]);
const measure=run(['-hide_banner','-i',`${out}/receiver-audition.wav`,'-af','loudnorm=print_format=json','-f','null','-']);
const match=measure.match(/\{\s*"input_i"[\s\S]*?\}/);
writeFileSync(`${out}/provenance.json`,JSON.stringify({source,sha256:createHash('sha256').update(readFileSync(source)).digest('hex'),cue,
  sourceStatus:'Retained authored MP3 mix; raw master and raw physical control recordings absent.',
  method:'FFmpeg mono speaker-filter audition; original file untouched. Biquad implementation approximates Web Audio; actual game capture is separate.',
  filters,measurements:match?JSON.parse(match[0]):null,listeningAcceptance:'Pending independent listening; excerpt selection was envelope-led.',playerValidation:'Pending participants.'},null,2)+'\n');
console.log(out);
