// What the player actually walks on, glyph by glyph, read from the compiled
// floor plan. The street fabric builds kerbs from this so the drawn kerb and
// the collision step cannot drift apart. A glyph o covers metres o-.25..o+.75.
import * as FP from '../../src/world/floorplan.js';
import {conservatory} from '../../src/data/floorplan/conservatory.js';
import {DISTRICT_BOUNDS,districtLogicalAt} from '../../src/data/exterior-district.js';
import {ELLERY_SQUARE,squareLogicalAt} from '../../src/data/ellery-square.js';
import {MATERIAL} from '../../src/data/floorplan/legend.js';
import {gridDrawnHeight} from '../../src/data/main-stair-geometry.js';

let compiled=false;
const cache=new Map();
function compile(){
  if(compiled)return;
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
  compiled=true;
}
const KIND={[MATERIAL.wetPaving]:'pave',[MATERIAL.wetTarmac]:'road',[MATERIAL.wetSetts]:'setts',[MATERIAL.wetGrass]:'grass'};

// Ellery Square is its own logical page; everything else outdoors here is the district's.
export function streetSurfaceAt(x,z){
  const key=`${x},${z}`;
  if(cache.has(key))return cache.get(key);
  compile();
  const B=ELLERY_SQUARE.bounds,D=DISTRICT_BOUNDS,square=x>=B.x0&&x<B.x1&&z>=B.z0&&z<B.z1;
  // Logical pages share one address space: outside its own rectangle a page's
  // addresses belong to some other floor entirely.
  const district=x>=D.x0&&x<=D.x1&&z>=D.y0&&z<=D.y1;
  let out=null;
  const p=square||district?FP.toRuntimePoint((square?squareLogicalAt:districtLogicalAt)(x,z),{center:false}):null;
  if(p&&!FP.isSolid(p.x,p.y)){
    const floor=FP.floorAt(p.x,p.y);
    out={floor,drawn:gridDrawnHeight(floor),kind:KIND[FP.materialAt(p.x,p.y)]||'other',page:square?'square':'district'};
  }
  cache.set(key,out);
  return out;
}
