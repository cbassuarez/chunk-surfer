import {ELLERY_BELLS} from './bell-tower.js';

// Reuse the chapel's complete recorded handstrokes, including their natural
// inharmonic decay. No local modal synthesis or runtime pitch shifting.
export const SOURCE_REST_BELL_SAMPLES=Object.freeze([2,4,5,6].map(id=>{
  const bell=ELLERY_BELLS.find(row=>row.id===id),sample=String(id).padStart(2,'0');
  return Object.freeze({sample,note:bell.note,frequency:bell.frequency,
    audioUrl:`assets/audio/bell-tower/bell-${sample}-hand-01.wav`,audioSeconds:12});
}));
const sampleById=new Map(SOURCE_REST_BELL_SAMPLES.map(row=>[row.sample,row]));
export const sourceRestBellSample=sample=>sampleById.get(String(sample))||null;

// Fixed mouths, selected against each world's actual performance. II's A/D
// belong to the Chaconne's D minor/major, with Eb as an outside neighbour.
// III's complete Couperin has several keys; its prepared electronic score is
// one semitone below written pitch. A/F/Eb move between belonging and friction
// across that programme rather than tracking or transposing individual notes.
export const SOURCE_REST_BELL_PALETTES=Object.freeze({
  'wrong-return':Object.freeze(['02','05','06']),
  catch:Object.freeze(['02','04','05']),
});
