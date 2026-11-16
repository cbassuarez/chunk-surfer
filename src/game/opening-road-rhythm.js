// Silence belongs at authored boundaries, after the player leaves the previous
// paragraph. It never times out an answer or inserts a delay inside a mouth.
export const OPENING_ROAD_BREATHS=Object.freeze([
 {sourceId:'opening-prologue:start:line:0',id:'arrive',seconds:4.8,reason:'Road, roof and five fast wipes before reading.'},
 {sourceId:'opening-prologue:start:line:2',id:'fatigue',seconds:3.8,reason:'Let the sway and inadequate view register after the fatigue paragraph.'},
 {sourceId:'opening-prologue:start:line:4',id:'hands',seconds:4.8,reason:'Stay with the wheel and thumb before the destination is explained.'},
 {sourceId:'opening-prologue:there:line:0',id:'address',seconds:2.8,reason:'A final ordinary-road interval before the first voice.'},
 {sourceId:'opening-prologue:margin:line:1',id:'correction',seconds:4.8,reason:'Establish the returned cab and small correction before the reply.'},
 {sourceId:'opening-prologue:wipers:line:1',id:'recovery',seconds:3.8,reason:'Hear and see the resumed blades before nearly there.'},
].map(Object.freeze));
export function openingRoadBreathFor(line){return OPENING_ROAD_BREATHS.find(b=>b.sourceId===line?.sourceId)||null;}
