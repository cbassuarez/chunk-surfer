// The already visible service-road strip behind The Catch's original final
// door becomes a supported passage. No new scene, destination or Contact rule.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const SOURCE_EXIT_PASSAGE=freeze({
  version:1,chartId:0,phase:'catch',doorId:'catch-final',
  door:{x:-139,y:8.4,z:-92},doorHalfWidth:.9,doorHeight:2.3,
  length:12,completionX:-127,floorEndX:-126,retainedIslandEndX:-135,halfWidth:3.25,thickness:.35,
  centre:{x:-133,z:-92,feet:8.4},
  // This is distance, not a timed commitment. Existing 2.6m/s walking takes
  // about4.6s; looking back, investigating or retreating adds optional time.
  straightWalkMetres:12,
});
const C=SOURCE_EXIT_PASSAGE,surfaces=[],solids=[];
// The retained door island already supports the first four metres. Its ground
// stays exact: the remembered counter belongs there, without a coplanar overlay.
for(const[id,from,to,material]of[
  ['stripped',4,7,'case-lining'],['service-road',7,13,'asphalt'],
])surfaces.push({id:'source-exit-floor-'+id,chartId:C.chartId,phase:C.phase,region:C.phase,kind:'rect',
  minX:C.door.x+from,maxX:C.door.x+to,minZ:C.door.z-C.halfWidth,maxZ:C.door.z+C.halfWidth,
  y:C.door.y,thickness:C.thickness,material,role:'exit-passage',level:0,exitPassage:true,section:id});
const box=(id,x0,x1,y0,y1,z0,z1,material,extra={})=>solids.push({
  id:'source-exit-'+id,chartId:C.chartId,phase:C.phase,region:C.phase,role:'furniture',
  minX:C.door.x+x0,maxX:C.door.x+x1,minY:C.door.y+y0,maxY:C.door.y+y1,
  minZ:C.door.z+z0,maxZ:C.door.z+z1,material,exitPassage:true,...extra});
for(const[index,x]of[1,4,8,12].entries()){
  const material=index===0?'piano-wood':index===1?'cold-wall':'worn-metal',section=index===0?'remembered':index===1?'stripped':'service-road';
  for(const side of[-1,1]){
    const z=side*3.65;
    box(`post-${index}-${side}`,x-.08,x+.08,0,3.3,z-.075,z+.075,material,{section});
    if(index===0){
      box(`capital-${side}`,x-.14,x+.14,2.72,2.84,z-.13,z+.13,'piano-wood',{section});
      const lo=side<0?-3.5:2.9,hi=side<0?-2.9:3.5;
      box(`counter-${side}`,.5,2.8,1.03,1.12,lo,hi,'piano-wood',{section});
      box(`counter-panel-${side}`,.58,2.72,.08,1.03,side*3.24-.035,side*3.24+.035,'piano-wood',{section});
      box(`shelf-${side}`,.6,2.7,1.61,1.68,side*3.43-.12,side*3.43+.12,'piano-wood',{section});
    }
    if(index===1){
      box(`stripped-counter-${side}`,3.6,4.8,1.03,1.12,z-.055,z+.055,'piano-wood',{section});
      box(`exposed-lath-${side}`,3.4,6.8,2.74,2.82,z-.03,z+.03,'cold-wall',{section});
    }
    if(index>=2){
      // Service conduit and truncated headers frame the old drive language.
      // No kerb or invisible side wall seals the actual floor's open edges.
      box(`service-conduit-${index}-${side}`,x-.11,x+.11,.18,1.22,z-.055,z+.055,'worn-metal',{section});
    }
  }
  box(`header-${index}`,x-.085,x+.085,3.3,3.45,-3.725,3.725,material,{section});
}
export const SOURCE_EXIT_PASSAGE_SURFACES=freeze(surfaces);
export const SOURCE_EXIT_PASSAGE_SOLIDS=freeze(solids);
export const SOURCE_EXIT_PASSAGE_ANCHORS=freeze([{id:'source-exit-service-jamb',chartId:C.chartId,phase:C.phase,
  x:C.door.x+2,z:C.door.z,feet:C.door.y,radius:1.2,earnedBy:'supported-arrival',
  restoreAt:{x:C.door.x+2,z:C.door.z,feet:C.door.y}}]);
export const sourceExitPassageProgress=point=>Number.isFinite(point?.x)?point.x-C.door.x:-Infinity;
export function sourceExitPassageContains(point,{margin=0}={}){
  return Number.isFinite(point?.x)&&Number.isFinite(point?.z)&&(point.chartId??0)===C.chartId
    &&point.x>=C.door.x-.35+margin&&point.x<=C.floorEndX-margin&&Math.abs(point.z-C.door.z)<=C.halfWidth-margin;
}
