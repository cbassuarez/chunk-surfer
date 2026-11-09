import {SOURCE_EXIT_PASSAGE_SURFACES,SOURCE_EXIT_PASSAGE_SOLIDS} from '../data/source-exit-passage.js';
const cube={p:[-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5,-.5,1,-.5,.5,1,-.5,.5,1,.5,-.5,1,.5],
  i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]};
export function sourceExitPassageGeometryLibrary(){return{
  'exit-stock-warm':{...cube,material:'piano-wood',base:[.38,.26,.14,1],roughness:.86},
  'exit-stock-cut':{...cube,material:'cold-wall',base:[.63,.66,.61,1],roughness:1},
  'exit-stock-metal':{...cube,material:'worn-metal',base:[.27,.23,.16,1],roughness:.75},
  'exit-service-road':{...cube,material:'asphalt',base:[.12,.13,.14,1],roughness:.96},
};}
export function sourceExitPassageRenderParts(){
  const rows=[...SOURCE_EXIT_PASSAGE_SURFACES.map(s=>({...s,minY:s.y-s.thickness,maxY:s.y,physicalKind:'surface'})),
    ...SOURCE_EXIT_PASSAGE_SOLIDS.map(s=>({...s,physicalKind:'solid'}))];
  return rows.map(part=>({id:part.id,mesh:part.material==='asphalt'?'exit-service-road':part.material==='piano-wood'?'exit-stock-warm':/metal/.test(part.material)?'exit-stock-metal':'exit-stock-cut',
    x:(part.minX+part.maxX)/2,y:part.minY,z:(part.minZ+part.maxZ)/2,
    sx:part.maxX-part.minX,sy:part.maxY-part.minY,sz:part.maxZ-part.minZ,
    physicalBounds:{min:[part.minX,part.minY,part.minZ],max:[part.maxX,part.maxY,part.maxZ]},
    chartId:0,region:'catch',exitPassage:true,physicalKind:part.physicalKind,section:part.section,level:0}));
}
