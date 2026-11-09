import {corridorParts,SOURCE_CONNECTOR_CORRIDOR as C} from '../data/source-connector-corridor.js';
const cube={p:[-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5,-.5,1,-.5,.5,1,-.5,.5,1,.5,-.5,1,.5],
  i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]};
// Actual open glass construction at the same unit bounds as the stock cube.
// Its base, tapered bowl, inner wall and rim remain silhouettes under dither;
// a brighter rectangle standing in for a glass would lose the Lyric reference.
function glass(){
  const p=[],i=[],rings=[],steps=12,
    profile=[[0,0],[.32,0],[.35,.07],[.46,.75],[.5,1],[.44,1],[.40,.75],[.29,.12],[0,.12]];
  for(const[r,y]of profile){
    if(r===0){const at=p.length/3;p.push(0,y,0);rings.push(Array(steps).fill(at));}
    else{const ring=[];for(let k=0;k<steps;k++){const a=k/steps*Math.PI*2;ring.push(p.length/3);p.push(Math.cos(a)*r,y,Math.sin(a)*r);}rings.push(ring);}
  }
  const tri=(a,b,c)=>{if(a!==b&&b!==c&&a!==c)i.push(a,b,c);};
  for(let ring=1;ring<rings.length;ring++)for(let k=0;k<steps;k++){
    const n=(k+1)%steps,a=rings[ring-1][k],b=rings[ring-1][n],c=rings[ring][n],d=rings[ring][k];
    tri(a,d,c);tri(a,c,b);
  }
  return{p,i,material:'glass',base:[.62,.69,.65,1],roughness:.25};
}
const glassStock=glass();
export function sourceConnectorGeometryLibrary(){return{
  'connector-stock-warm':{...cube,material:'piano-wood',base:[.38,.26,.14,1],roughness:.86},
  'connector-stock-cut':{...cube,material:'cold-wall',base:[.63,.66,.61,1],roughness:1},
  'connector-stock-metal':{...cube,material:'worn-metal',base:[.27,.23,.16,1],roughness:.75},
  'connector-glass':glassStock,
};}
export function sourceConnectorRenderParts(state={}){
  return corridorParts(state).map(part=>({id:part.id,mesh:part.visualMesh||(part.material==='piano-wood'?'connector-stock-warm':/metal/.test(part.material)?'connector-stock-metal':'connector-stock-cut'),
    x:(part.minX+part.maxX)/2,y:part.minY,z:(part.minZ+part.maxZ)/2,
    sx:part.maxX-part.minX,sy:part.maxY-part.minY,sz:part.maxZ-part.minZ,
    physicalBounds:{min:[part.minX,part.minY,part.minZ],max:[part.maxX,part.maxY,part.maxZ]},
    chartId:C.chartId,region:'wrong-return',connector:true,cabinet:!!part.cabinet}));
}
