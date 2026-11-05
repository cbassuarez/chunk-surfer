import {sourceAmbientFaultGeometry} from './source-ambient-fault-geometry.js';

// The wound is densest here and in Earthfall, but its distribution is not a
// regular grid. Most sheets stand around and above the routes, not across the
// resting-place sightlines, doors or the walkable surface. The outward charts
// carry smaller distinct pockets. These are scenery, not opening rifts.
export const SOURCE_CONTINUATION_FAULT_REGIONS=Object.freeze([
  {id:'ii',phase:'wrong-return',chartId:0,sites:[
    {id:'ii-west',x:-27,y:9,z:-19,count:72,spreadX:13,spreadY:24,spreadZ:42,seed:81,size:6},
    {id:'ii-east',x:34,y:12,z:-19,count:60,spreadX:15,spreadY:27,spreadZ:40,seed:82,size:6},
    {id:'ii-north',x:3,y:15,z:-49,count:48,spreadX:46,spreadY:22,spreadZ:13,seed:83,size:7},
    {id:'ii-abyss',x:2,y:-11,z:-20,count:28,spreadX:52,spreadY:15,spreadZ:37,seed:84,size:6},
  ]},
  {id:'ii-outward-1',phase:'wrong-return',chartId:1,sites:[{id:'outward-1',x:-91,y:24,z:-24,count:38,spreadX:40,spreadY:16,spreadZ:32,seed:91,size:5}]},
  {id:'ii-outward-2',phase:'wrong-return',chartId:2,sites:[{id:'outward-2',x:-137,y:16,z:-47,count:26,spreadX:28,spreadY:15,spreadZ:38,seed:92,size:5}]},
  {id:'ii-outward-3',phase:'wrong-return',chartId:3,sites:[{id:'outward-3',x:-164,y:8,z:-58,count:34,spreadX:32,spreadY:16,spreadZ:34,seed:93,size:5}]},
  {id:'ii-outward-4',phase:'wrong-return',chartId:4,sites:[{id:'outward-4',x:-162,y:16,z:-83,count:22,spreadX:32,spreadY:17,spreadZ:25,seed:94,size:5}]},
  {id:'iii',phase:'catch',chartId:0,sites:[
    {id:'iii-west',x:-215,y:0,z:-93,count:64,spreadX:24,spreadY:34,spreadZ:68,seed:101,size:7},
    {id:'iii-east',x:-129,y:5,z:-94,count:42,spreadX:20,spreadY:35,spreadZ:64,seed:102,size:7},
    {id:'iii-north',x:-174,y:12,z:-139,count:76,spreadX:70,spreadY:28,spreadZ:22,seed:103,size:7},
    {id:'iii-south',x:-172,y:-2,z:-45,count:34,spreadX:65,spreadY:30,spreadZ:19,seed:104,size:6},
  ]},
]);
const library=SOURCE_CONTINUATION_FAULT_REGIONS.flatMap(region=>
  sourceAmbientFaultGeometry({sites:region.sites,palettePrefix:`source-continuation-ambient-${region.id}`})
    .map(piece=>({...piece,phase:region.phase,chartId:region.chartId})));
export const sourceContinuationAmbientFaultGeometry=()=>library;
