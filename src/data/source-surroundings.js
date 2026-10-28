// Remote construction only. These objects never enter support/collision data.
// The real II/III threshold divides the two fixed worlds at x=-18.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const SOURCE_SURROUNDINGS=freeze({
  version:1,farClip:300,thresholdX:-18,fallMinimumX:35,centreMaximumX:-100,
  cycleSeconds:96,releaseLocal:64,entrySeconds:8,entryDistance:600,loadSeconds:1.4,impactTailSeconds:1.5,reducedMotionTime:28,
  waveSpeed:36,waveWidth:14,waveMaximumRadius:300,centreWaveSpeed:48,centreWaveRadius:72,
  fallAssembly:{id:'fall-pressure-mechanism',anchor:{x:160,y:95,z:-55},scale:35},
  routeEnvelope:{minX:-56,maxX:28,minY:-23,maxY:116.62,minZ:-38,maxZ:100},
  music:{fall:{pieceId:'ensemble',position:{x:160,y:59.3,z:-55}},centre:{pieceId:'couperin',position:{x:-140.2315,y:40.7182,z:-82.7473}}},
  maximumBodies:5,maximumEmitters:2,maximumImpactors:0,maximumArcs:9,
});
// Full dimensions of centred templates. Intact remote pathways take up their
// pressure-loaded position before an arriving wave frees their stock. Both
// ends of each repeat are beyond the far clip; no projectile supplies a force.
export const SOURCE_SURROUNDINGS_FALL_BODIES=freeze([
  {id:'fall-body-0',archetype:'arcade',position:{x:112,y:82,z:-164},rotation:{x:.06,y:-.12,z:.10},size:{x:110,y:40,z:18},spin:{x:.021,y:.016,z:-.024}},
  {id:'fall-body-1',archetype:'stair',position:{x:172,y:18,z:-114},rotation:{x:-.12,y:.12,z:-.16},size:{x:88,y:44,z:24},spin:{x:-.017,y:.023,z:.019}},
  {id:'fall-body-2',archetype:'soundboard',position:{x:238,y:140,z:-92},rotation:{x:.12,y:-.15,z:.04},size:{x:96,y:38,z:18},spin:{x:.024,y:-.014,z:.018}},
  {id:'fall-body-3',archetype:'arcade',position:{x:146,y:58,z:-208},rotation:{x:-.08,y:.10,z:.13},size:{x:100,y:36,z:20},spin:{x:.013,y:.019,z:-.020}},
  {id:'fall-body-4',archetype:'stair',position:{x:218,y:-54,z:-150},rotation:{x:.10,y:.12,z:-.10},size:{x:104,y:42,z:22},spin:{x:-.023,y:.012,z:.017}},
]);
// Broken institutional arcades, not complete annuli. Their centres and axes
// disagree. Arc geometry lies in local XY, with depth along local Z; Euler
// rotations apply X, then Y, then Z (column-vector Rz*Ry*Rx).
export const SOURCE_SURROUNDINGS_CENTRE_ARCS=freeze([
  {id:'centre-inner-0',position:{x:-142,y:35,z:-12},rotation:{x:.025,y:Math.PI/2-.025,z:.025},radius:60,startAngle:.08,endAngle:1.10,width:6,depth:10,opening:11},
  {id:'centre-inner-1',position:{x:-146,y:39,z:-6},rotation:{x:-.035,y:Math.PI/2+.035,z:-.025},radius:60,startAngle:2.02,endAngle:3.11,width:6,depth:10,opening:15},
  {id:'centre-inner-2',position:{x:-139,y:30,z:-19},rotation:{x:.03,y:Math.PI/2-.04,z:.035},radius:60,startAngle:4.18,endAngle:5.29,width:6,depth:10,opening:12},
  {id:'centre-middle-0',position:{x:-151,y:40,z:-19},rotation:{x:.04,y:Math.PI/2+.045,z:.04},radius:72,startAngle:.72,endAngle:1.83,width:8,depth:12,opening:17},
  {id:'centre-middle-1',position:{x:-155,y:31,z:-5},rotation:{x:-.045,y:Math.PI/2-.035,z:-.04},radius:72,startAngle:2.73,endAngle:3.78,width:8,depth:12,opening:13},
  {id:'centre-middle-2',position:{x:-148,y:45,z:-10},rotation:{x:.035,y:Math.PI/2+.04,z:.03},radius:72,startAngle:4.80,endAngle:5.92,width:8,depth:12,opening:18},
  {id:'centre-outer-0',position:{x:-166,y:38,z:-9},rotation:{x:-.045,y:Math.PI/2-.045,z:-.035},radius:85,startAngle:.18,endAngle:1.11,width:9,depth:14,opening:18},
  {id:'centre-outer-1',position:{x:-172,y:28,z:-18},rotation:{x:.045,y:Math.PI/2+.04,z:.035},radius:85,startAngle:2.19,endAngle:3.43,width:9,depth:14,opening:21},
  {id:'centre-outer-2',position:{x:-163,y:44,z:-4},rotation:{x:-.04,y:Math.PI/2-.035,z:-.04},radius:85,startAngle:4.26,endAngle:5.34,width:9,depth:14,opening:16},
]);
