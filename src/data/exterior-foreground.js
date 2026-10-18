// Physical-metre contract for the existing arrival garden, fountain garden and
// cathedral edge. Rectangles are half-open physical extents. cellBounds keeps
// the original inclusive one-metre glyph addresses without widening the yard.
const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};
const contains=(r,x,z)=>x>=r.x0&&x<r.x1&&z>=r.z0&&z<r.z1;

export const EXTERIOR_FOREGROUND=freeze({
  coordinateSpace:'physical-metres',
  yardOrigin:{x:50,y:200},
  arrival:{
    bounds:{x0:12,x1:26,z0:0,z1:3},
    lawns:[{x0:12,x1:18,z0:0,z1:3},{x0:20,x1:26,z0:0,z1:3}],
    path:{x0:18,x1:20,z0:0,z1:3},
  },
  garden:{
    bounds:{x0:1,x1:20,z0:22,z1:51},
    cellBounds:{x0:1,x1:19,z0:22,z1:50},
    entrance:{x:10,z:22},
    paving:{material:'wetPaving',finish:'worn civic flags',floor:0},
    paths:{
      spine:{x0:9,x1:12,z0:22,z1:51},
      cross:{x0:1,x1:20,z0:35,z1:38},
    },
    // Whole-cell refinement of the twelve-metre concept: the measured fountain
    // has outer projections beyond its nominal seven-metre catalogue width.
    // Thirteen metres protects at least two metres beside those projections.
    apron:{x0:4,x1:17,z0:30,z1:43},
    fountain:{x:10.5,z:36.5,basinRadius:3.2,modelWidth:7.71,modelHeight:5.05,actualRadius:3.855},
    benches:[
      {id:'yard-park-bench-west',x:3,z:34,yaw:Math.PI/2},
      {id:'yard-park-bench-east',x:18,z:39,yaw:-Math.PI/2},
    ],
    beds:[
      {id:'garden-bed-nw',x0:2,x1:7,z0:24,z1:29,maxHeight:.72},
      {id:'garden-bed-ne',x0:14,x1:18.5,z0:24,z1:29,maxHeight:.72},
      {id:'garden-bed-sw',x0:2,x1:7,z0:44,z1:49,maxHeight:.72},
      {id:'garden-bed-se',x0:14,x1:18.5,z0:44,z1:49,maxHeight:.72},
    ],
  },
  busStop:{
    shelter:{x:-13.8,z:16,width:1.4,length:5,height:2.63},
    bench:{x:-14.1,z:16},
    clearRoute:{x0:-13.1,x1:-11.1,z0:13.5,z1:18.5},
    footway:{x0:-14.5,x1:-11,z0:12,z1:20,floor:.12},
    transition:'existing 95mm steps at the ends; accessible grading untested',
    outerEdgeX:-14.5,
  },
  cathedral:{
    // Shifted half a metre west from the concept to keep a full two metres
    // outside the existing padded scaffold footprint. No scaffold is moved.
    greens:[
      {id:'cathedral-green-north',x0:1,x1:3,z0:58,z1:68},
      {id:'cathedral-green-south',x0:1,x1:3,z0:72,z1:83},
    ],
    throughRoute:{x0:3,x1:5,z0:57,z1:84},
  },
});

export const foregroundYardLogicalPoint=({x,z})=>({
  x:EXTERIOR_FOREGROUND.yardOrigin.x+x,
  y:EXTERIOR_FOREGROUND.yardOrigin.y+z,
});

// The basin remains the floorplan's wetTile glyph and has priority over these
// dry surfaces. Its existing octagonal raster is deliberately not replaced.
export function foregroundGardenGlyphAt(x,z){
  const g=EXTERIOR_FOREGROUND.garden;
  if(!contains(g.bounds,x,z))return null;
  return contains(g.paths.spine,x,z)||contains(g.paths.cross,x,z)||contains(g.apron,x,z)?'Y':'g';
}

export function foregroundArrivalGlyphAt(x,z){
  const a=EXTERIOR_FOREGROUND.arrival;
  if(!contains(a.bounds,x,z))return null;
  return a.lawns.some(r=>contains(r,x,z))?'g':'Y';
}

export function foregroundCathedralGlyphAt(x,z){
  return EXTERIOR_FOREGROUND.cathedral.greens.some(r=>contains(r,x,z))?'g':null;
}
