import {
  STEDMAN_TRIPLES_84_METADATA,
  STEDMAN_TRIPLES_84_ROWS,
} from './stedman-triples-84.js';

export const PLACE_MS = 190;
export const SCHEDULE_AHEAD_SEC = 0.20;

export const ELLERY_BELLS = Object.freeze([
  { id:1, name:'Treble', note:'B♭4', frequency:466.16, massKg:290, radius:.38, balanceHold:.10, strikePhase:.70 },
  { id:2, name:'Second', note:'A4', frequency:440.00, massKg:370, radius:.43, balanceHold:.11, strikePhase:.70 },
  { id:3, name:'Third', note:'G4', frequency:392.00, massKg:490, radius:.49, balanceHold:.12, strikePhase:.71 },
  { id:4, name:'Fourth', note:'F4', frequency:349.23, massKg:650, radius:.55, balanceHold:.13, strikePhase:.71 },
  { id:5, name:'Fifth', note:'E♭4', frequency:311.13, massKg:870, radius:.62, balanceHold:.14, strikePhase:.72 },
  { id:6, name:'Sixth', note:'D4', frequency:293.66, massKg:1160, radius:.70, balanceHold:.15, strikePhase:.72 },
  { id:7, name:'Seventh', note:'C4', frequency:261.63, massKg:1590, radius:.79, balanceHold:.16, strikePhase:.73 },
  { id:8, name:'Tenor', note:'B♭3', frequency:233.08, massKg:2200, radius:.90, balanceHold:.18, strikePhase:.74 },
].map(Object.freeze));

export function assertPermutation(row, stage) {
  if (!Array.isArray(row) || row.length !== stage) throw new Error(`row must contain ${stage} bells`);
  const sorted = [...row].sort((a,b)=>a-b);
  for (let i=0;i<stage;i+=1) if (sorted[i] !== i+1) throw new Error(`invalid ${stage}-bell row ${row.join('')}`);
  return row;
}

const bellValue = (char) => {
  const symbols = '1234567890ETABCDFGHJKLMNPQRSUVWXYZ';
  const index = symbols.indexOf(String(char).toUpperCase());
  return index < 0 ? NaN : index + 1;
};

export function parsePlaces(notation, stage) {
  const source = String(notation || '').trim();
  if (/^[xX-]$/.test(source)) {
    if (stage % 2) throw new Error('cross notation requires an even stage');
    return new Set();
  }
  const places = [...source].map(bellValue);
  if (!places.length || places.some((place) => !Number.isInteger(place) || place < 1 || place > stage)) {
    throw new Error(`invalid place notation ${notation}`);
  }
  const fixed = new Set(places);
  // CCCBR external-place abbreviation: infer an external place wherever the
  // remaining run at that end would otherwise contain an unpaired bell.
  if (!fixed.has(1) && Math.min(...fixed) % 2 === 0) fixed.add(1);
  if (!fixed.has(stage) && (stage - Math.max(...fixed)) % 2 === 1) fixed.add(stage);
  return fixed;
}

export function applyPlaceNotation(row, notation, stage = row.length) {
  assertPermutation(row, stage);
  const fixed = parsePlaces(notation, stage);
  const next = [...row];
  for (let place=1;place<=stage;) {
    if (fixed.has(place)) { next[place-1]=row[place-1];place+=1;continue; }
    if (place===stage || fixed.has(place+1)) throw new Error(`invalid place notation at ${place}`);
    next[place-1]=row[place];next[place]=row[place-1];place+=2;
  }
  return assertPermutation(next, stage);
}

export function rounds(stage=8, count=1) {
  const row=Array.from({length:stage},(_,i)=>i+1);
  return Array.from({length:count},()=>[...row]);
}

export function plainHuntMajor({ courses=1 }={}) {
  const stage=8, notation=['x','18'];
  const out=[];let row=rounds(stage,1)[0];
  for(let course=0;course<Math.max(1,courses);course+=1){
    for(let change=0;change<16;change+=1){row=applyPlaceNotation(row,notation[change%2],stage);out.push([...row]);}
  }
  return out;
}

function validateStedmanRows() {
  if (STEDMAN_TRIPLES_84_ROWS.length !== STEDMAN_TRIPLES_84_METADATA.changes) {
    throw new Error('Stedman data must contain exactly 84 changes');
  }
  const seen=new Set();
  for(const text of STEDMAN_TRIPLES_84_ROWS){
    const row=[...text].map(Number);assertPermutation(row,7);
    if(seen.has(text))throw new Error(`false Stedman row ${text}`);seen.add(text);
  }
  if(STEDMAN_TRIPLES_84_ROWS.at(-1)!==STEDMAN_TRIPLES_84_METADATA.startRow)throw new Error('Stedman touch does not return to rounds');
}
validateStedmanRows();

export const STEDMAN_TRIPLES_84_WITH_TENOR = Object.freeze(
  STEDMAN_TRIPLES_84_ROWS.map((text)=>Object.freeze([...text].map(Number).concat(8))),
);

export const RINGING_SCORE = Object.freeze([
  Object.freeze({ id:'tenor-awakens', type:'toll', bell:8, strokes:4 }),
  Object.freeze({ id:'rounds', type:'rows', source:Object.freeze(rounds(8,8).map(Object.freeze)) }),
  Object.freeze({ id:'plain-hunt', type:'rows', source:Object.freeze(plainHuntMajor({courses:2}).map(Object.freeze)) }),
  Object.freeze({ id:'stedman', type:'rows', source:STEDMAN_TRIPLES_84_WITH_TENOR, metadata:STEDMAN_TRIPLES_84_METADATA }),
  Object.freeze({ id:'holding-course', type:'loop', source:Object.freeze(plainHuntMajor({courses:1}).map(Object.freeze)) }),
]);

// The building-wide lure never performs the Stedman touch for the player. It
// wakes the tenor, settles into rounds and Plain Hunt, then holds that course
// until somebody takes the covering tenor in the ringing room.
export const TOWER_LURE_SCORE = Object.freeze([
  Object.freeze({ id:'tenor-awakens', type:'toll', bell:8, strokes:4 }),
  Object.freeze({ id:'rounds', type:'rows', source:Object.freeze(rounds(8,8).map(Object.freeze)) }),
  Object.freeze({ id:'plain-hunt', type:'rows', source:Object.freeze(plainHuntMajor({courses:2}).map(Object.freeze)) }),
  Object.freeze({ id:'holding-course', type:'loop', source:Object.freeze(plainHuntMajor({courses:1}).map(Object.freeze)) }),
]);

export function scheduleRow(row, stroke, rowStartMs, rowIndex=0) {
  assertPermutation(row, row.length);
  const handstrokeGap=stroke==='hand'?PLACE_MS:0;
  return {
    strikes:row.map((bell,place)=>({bell,stroke,rowIndex,place,atMs:rowStartMs+place*PLACE_MS})),
    nextRowAtMs:rowStartMs+row.length*PLACE_MS+handstrokeGap,
  };
}
