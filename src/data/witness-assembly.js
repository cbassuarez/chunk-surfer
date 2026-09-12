// One authored fictional assembly for the WITNESS recorder: Canvas, GLB and
// inspection share part identities, positions and real connector endpoints.
// Coordinates are the recorder's 736 x 405 face; depth is mm-like design units
// behind the front plane. This is a visual assembly, not a circuit simulator.
export const WITNESS_DESIGN = Object.freeze({ width:736, height:405, revision:1,
  name:'WITNESS EDITION', finish:'witness', model:'field-recorder-witness',
  plateModel:'witness-faceplate', frontDepth:0, boardDepth:30,
  colors:Object.freeze({plastic:'#e9ddbf',pcb:'#193e32',pcbEdge:'#48705b',copper:'#b68751',
    cream:'#d7cbb1',oxblood:'#814a43',silver:'#bdc1b6',amber:'#be8750',ink:'#e6ddc5',frame:'#252d28'}),
});
export const WITNESS_BOARDS = Object.freeze([
  {id:'PCB-A',x:34,y:35,w:668,h:33,depth:30},
  {id:'PCB-B',x:35,y:321,w:666,h:59,depth:30},
].map(Object.freeze));
export const WITNESS_COMPONENTS = Object.freeze([
  {id:'C1',kind:'capacitor',x:63,y:52,w:18,h:18,depth:12},
  {id:'C2',kind:'capacitor',x:91,y:52,w:14,h:14,depth:15},
  {id:'C3',kind:'capacitor',x:646,y:52,w:18,h:18,depth:12},
  {id:'C4',kind:'capacitor',x:674,y:52,w:14,h:14,depth:15},
  {id:'C5',kind:'capacitor',x:62,y:346,w:22,h:22,depth:9},
  {id:'C6',kind:'capacitor',x:94,y:347,w:17,h:17,depth:13},
  {id:'C7',kind:'film',x:139,y:345,w:22,h:13,depth:18},
  {id:'C8',kind:'film',x:167,y:345,w:16,h:13,depth:18},
  {id:'C9',kind:'film',x:214,y:52,w:21,h:12,depth:18},
  {id:'C10',kind:'film',x:242,y:52,w:16,h:12,depth:18},
  {id:'U1',kind:'ic',x:315,y:52,w:48,h:17,depth:23},
  {id:'U2',kind:'ic',x:540,y:52,w:39,h:17,depth:23},
  {id:'R1',kind:'resistor',x:137,y:51,w:23,h:5,depth:24},
  {id:'R2',kind:'resistor',x:171,y:51,w:23,h:5,depth:24},
  {id:'R3',kind:'resistor',x:389,y:52,w:25,h:5,depth:24},
  {id:'R4',kind:'resistor',x:590,y:52,w:23,h:5,depth:24},
].map(Object.freeze));
export const WITNESS_CONNECTORS = Object.freeze([
  {id:'J1',x:43,y:62,pins:3}, {id:'J2',x:693,y:62,pins:3},
  {id:'J3',x:43,y:329,pins:3}, {id:'J4',x:693,y:329,pins:3},
  {id:'J5',x:446,y:52,pins:3}, {id:'J6',x:489,y:52,pins:3},
  {id:'J7',x:186,y:365,pins:3}, {id:'J8',x:399,y:365,pins:3},
].map(Object.freeze));
export const WITNESS_WIRES = Object.freeze([
  {id:'H1',from:'J1',to:'J3',color:'cream',radius:1.4,points:[[43,62],[28,67],[26,100],[25,290],[29,321],[43,329]]},
  {id:'H2',from:'J2',to:'J4',color:'oxblood',radius:1.35,points:[[693,62],[708,68],[710,108],[711,292],[708,321],[693,329]]},
  {id:'H3',from:'J5',to:'J6',color:'cream',radius:1.15,points:[[446,52],[456,42],[477,42],[489,52]]},
  {id:'H4',from:'J7',to:'J8',color:'oxblood',radius:1.25,points:[[186,365],[202,373],[273,375],[365,373],[389,371],[399,365]]},
].map(wire=>Object.freeze({...wire,points:Object.freeze(wire.points.map(Object.freeze))})));
// Routing is explicit and repeatable. Vias and endpoints belong to this board;
// no generated waveform, moving current or random fake instrument readings.
export const WITNESS_TRACES = Object.freeze([
  [[53,57],[53,63],[103,63],[109,57],[109,51],[125,51]],
  [[149,51],[155,57],[203,57],[208,52]],
  [[254,52],[265,52],[275,62],[302,62]],
  [[338,52],[353,52],[361,60],[407,60],[418,49],[446,49]],
  [[489,55],[507,55],[514,62],[557,62],[563,51],[579,51]],
  [[602,51],[612,51],[621,61],[686,61]],
  [[43,335],[48,340],[48,365],[120,365],[126,359],[126,347]],
  [[106,347],[116,347],[122,339],[180,339],[186,345],[186,365]],
  [[399,365],[414,365],[422,375],[697,375]],
].map(points=>Object.freeze(points.map(Object.freeze))));
export const WITNESS_SERVICE_STRIP = Object.freeze({x:204,y:337,w:182,h:22,depth:19});
export const WITNESS_MOUNTS = Object.freeze([[25,28],[711,28],[25,372],[711,372]].map(Object.freeze));
export const WITNESS_SWITCHES = Object.freeze([
  {id:'rec',part:'SW1',x:459.5,y:350.5},
  {id:'stop',part:'SW2',x:558.5,y:350.5},
  {id:'takes',part:'SW3',x:657.5,y:350.5},
].map(Object.freeze));

// Responsive instruments retain their authored top and bottom hardware bands.
// The LCD/VFD aperture is independent and must never reveal the world behind it.
export function witnessPoint(x,y,width=736,height=405){
  return {x:x*width/736,y:y>200?height-405+y:y};
}
export function witnessAssemblyLayout(width=736,height=405){
  const sx=width/736;
  const place=part=>({...part,...witnessPoint(part.x,part.y,width,height),
    ...(part.w?{w:part.w*sx}:{}),...(part.h?{h:part.h}:{}),
  });
  return {width,height,boards:WITNESS_BOARDS.map(place),components:WITNESS_COMPONENTS.map(place),
    connectors:WITNESS_CONNECTORS.map(place),switches:WITNESS_SWITCHES.map(place),
    wires:WITNESS_WIRES.map(wire=>({...wire,points:wire.points.map(([x,y])=>witnessPoint(x,y,width,height))})),
    traces:WITNESS_TRACES.map(points=>points.map(([x,y])=>witnessPoint(x,y,width,height))),
    mounts:WITNESS_MOUNTS.map(([x,y])=>witnessPoint(x,y,width,height)),service:place(WITNESS_SERVICE_STRIP),
  };
}
