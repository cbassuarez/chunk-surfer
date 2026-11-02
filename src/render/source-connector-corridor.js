import {corridorParts,SOURCE_CONNECTOR_CORRIDOR as C} from '../data/source-connector-corridor.js';
const cube={p:[-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5,-.5,1,-.5,.5,1,-.5,.5,1,.5,-.5,1,.5],
  i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]};
export function sourceConnectorGeometryLibrary(){return{
  'connector-stock-warm':{...cube,material:'piano-wood',base:[.38,.26,.14,1],roughness:.86},
  'connector-stock-cut':{...cube,material:'cold-wall',base:[.63,.66,.61,1],roughness:1},
  'connector-stock-metal':{...cube,material:'worn-metal',base:[.27,.23,.16,1],roughness:.75},
};}
export function sourceConnectorRenderParts(state={}){
  return corridorParts(state).map(part=>({id:part.id,mesh:part.material==='piano-wood'?'connector-stock-warm':/metal/.test(part.material)?'connector-stock-metal':'connector-stock-cut',
    x:(part.minX+part.maxX)/2,y:part.minY,z:(part.minZ+part.maxZ)/2,
    sx:part.maxX-part.minX,sy:part.maxY-part.minY,sz:part.maxZ-part.minZ,
    physicalBounds:{min:[part.minX,part.minY,part.minZ],max:[part.maxX,part.maxY,part.maxZ]},
    chartId:C.chartId,region:'wrong-return',connector:true,cabinet:!!part.cabinet}));
}
