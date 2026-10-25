import {STANDING_TEAR_RECORDING_ENVELOPES as E} from './standing-tear-memory-envelopes.js';

// The files below are actual performances. Solo is the already authored
// student correction motif, explicitly not a recording of Bach or Couperin.
export const STANDING_TEAR_REPERTOIRE=Object.freeze([
  Object.freeze({id:'solo',kind:'procedural',title:'Retained student correction',composer:'Chunk Surfer canonical student material',performer:'Procedural bowed practice voice',instrument:'student practice',duration:1.9,phaseOffset:0,bitDepth:8,effectiveSampleRate:20000,
    source:'src/audio/student-wall.js',licence:'Project material',licenceUrl:null,attribution:null,changes:'Existing 440/444 correction motif, spatially retained.'}),
  Object.freeze({id:'couperin',kind:'recording',title:"L’Art de toucher le clavecin",composer:'François Couperin',performer:'David Joseph',instrument:'harpsichord',url:'audio/sheet-music/sheet-couperin-clavecin.mp3',duration:E.couperin.duration,phaseOffset:0,bitDepth:12,effectiveSampleRate:36000,
    source:'https://commons.wikimedia.org/wiki/File:L%27Art_de_toucher_le_Clavecin_Fran%C3%A7ois_Couperin.ogg',licence:'CC0 1.0',licenceUrl:'https://creativecommons.org/publicdomain/zero/1.0/',attribution:null,
    changes:'Existing eleven-second excerpt, mono downmix and levelling; looping, 12-bit decoded PCM quantization, separate 36 kHz sample holding, spatial filtering and 6.8-second convolution reverb in Standing Tear.'}),
  Object.freeze({id:'ensemble',kind:'recording',title:'Chaconne, BWV 1004, arranged for 12 recorders',composer:'Johann Sebastian Bach',performer:'Victor Eijkhout',instrument:'12-recorder ensemble',url:'audio/standing-tear/bach-bwv1004-chaconne-recorders.mp3',duration:E.ensemble.duration,phaseOffset:7.5,bitDepth:10,effectiveSampleRate:28000,
    source:'https://imslp.org/wiki/Violin_Partita_No.2_in_D_minor,_BWV_1004_(Bach,_Johann_Sebastian)#For_12_Recorders_(Eijkhout)',sourceFile:'https://imslp.org/wiki/Special:ImagefromIndex/359740',licence:'CC BY 4.0',licenceUrl:'https://creativecommons.org/licenses/by/4.0/',
    attribution:'J. S. Bach — Chaconne, BWV 1004, arranged and performed for 12 recorders by Victor Eijkhout (CC BY 4.0).',
    changes:'Opening 0–48 second excerpt; mono downmix, loudness levelling, 0.15 s fade-in/1 s fade-out, MP3 encoding, looping, 10-bit decoded PCM quantization, separate 28 kHz sample holding, spatial filtering and 6.8-second convolution reverb.'}),
]);
export const standingTearRepertoireById=id=>STANDING_TEAR_REPERTOIRE.find(item=>item.id===id)||null;
export function standingTearMemoryPhase(id,seconds=0){
  const piece=standingTearRepertoireById(id);if(!piece)return 0;
  return (((Number(seconds)||0)+piece.phaseOffset)%piece.duration+piece.duration)%piece.duration;
}
export function standingTearMemoryPulse(id,seconds=0){
  const piece=standingTearRepertoireById(id);if(!piece)return 0;
  const phase=standingTearMemoryPhase(id,seconds),recording=E[id];
  if(recording){const sample=phase*recording.hz,index=Math.floor(sample),f=sample-index,a=recording.values[index%recording.values.length]||0,b=recording.values[(index+1)%recording.values.length]||0;return(a+(b-a)*f)/255;}
  // The six-note reference already exists in the student material. Only this
  // procedural recollection uses its authored .26 s subdivisions.
  return Math.max(...Array.from({length:6},(_,i)=>Math.exp(-Math.abs(phase-i*.26)/.075)));
}
