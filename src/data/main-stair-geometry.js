// One contract for the Conservatory's main open-well stair.
//
// The floorplan compiler consumes the logical ribbons, the collision envelope
// and the stairwell; the project-native GLB builder consumes the same radii,
// flights, landings and guards. Keeping those facts together is what prevents
// the visible tread, the height sampled under the player, and the camera's path
// around the well from drifting into three different staircases again.
//
// REVISION 4: ONE STAIR, DRAWN ONCE.
//
// Revision 3 drew the stair three times: the GLB, half-metre grid wedges at
// every tread height (solid below each tread to the floor), and 6 x 4 m grid
// rectangles for landings. They disagreed everywhere they met. Now the stair
// stands in a square stairwell on the half-metre grid. Inside it the grid is one
// column of air from the ground floor to the roof and draws nothing but the
// stairwell floor; the GLB draws every flight, landing, slab edge and guard.
// Every edge where the two renderers meet is a straight line on cell edges.

const PI=Math.PI,DEG=PI/180;

// The plan grid stores heights in eight bits over -8..24 m (floorplan.js
// H_MIN/H_MAX), so a floor is DRAWN at the nearest 32/255 m: 0 m at +31 mm,
// 4.8 m exactly, 10 m at -55 mm. Built landings are made at the drawn height so
// they meet the room floors flush; collision keeps the true floor.
export const gridDrawnHeight=(h)=>Math.round((h+8)/32*255)/255*32-8;

const freezeFlight=(flight)=>Object.freeze({
  ...flight,
  logicalFrom:Object.freeze({...flight.logicalFrom}),
  logicalTo:Object.freeze({...flight.logicalTo}),
});

export const MAIN_STAIR_GEOMETRY=Object.freeze({
  revision:4,
  center:Object.freeze({x:63,z:36}),
  widthM:2,
  innerRadiusM:.65,
  outerRadiusM:2.65,
  collisionOuterRadiusM:3,
  walkOuterRadiusM:2.65,
  goingM:.28,
  slabDepthM:.18,
  finishThicknessM:.028,
  handrailHeightM:1,
  balusterMaximumClearGapM:.106,
  // A brass strip inlaid flush along the front edge of every tread.
  nosingWidthM:.04,
  // Floor slabs at the landings match the halls: 4.55 under 4.8.
  landingSlabDepthM:.25,
  // The stair's collision square, on half-metre cell edges, at every floor.
  stairwell:Object.freeze({x0:60,x1:66,z0:33,z1:39,floor:0,ceil:13.8}),
  // This authored point is the centre of the immutable Floor 1 stair hall. The
  // hall cells themselves are not part of this module and must never be
  // rewritten by a stair rebuild.
  floor1Aim:Object.freeze({x:61.5,z:31.5}),
  flights:Object.freeze([
    freezeFlight({
      id:'ground-to-half',logicalFrom:{x:134,y:50},logicalTo:{x:134,y:56.5},
      fromH:0,toH:2.4,rises:14,theta0:0,sweep:PI,ceil:4.55,
      groupFrom:'ground',groupTo:'upper',
    }),
    freezeFlight({
      id:'half-to-upper',logicalFrom:{x:138,y:56.5},logicalTo:{x:138,y:50},
      fromH:2.4,toH:4.8,rises:14,theta0:PI,sweep:PI,ceil:7.15,
      groupFrom:'ground',groupTo:'upper',
    }),
    freezeFlight({
      id:'upper-to-half',logicalFrom:{x:134,y:65},logicalTo:{x:134,y:58},
      fromH:4.8,toH:7.4,rises:15,theta0:PI*5/9,sweep:PI,ceil:9.75,
      groupFrom:'upper',groupTo:'academic',
    }),
    freezeFlight({
      id:'half-to-academic',logicalFrom:{x:138,y:58},logicalTo:{x:138,y:65},
      fromH:7.4,toH:10,rises:15,theta0:PI*14/9,sweep:PI,ceil:13.8,
      groupFrom:'upper',groupTo:'academic',
    }),
  ]),
  // The upper landing's cells moved 0.5 m east in revision 4 so the cells you
  // arrive on from the second half-turn lie on the landing, past its arrival
  // line, instead of over its own top treads.
  landings:Object.freeze([
    Object.freeze({id:'upper-floor-landing',at:Object.freeze({x:150,y:50}),size:Object.freeze({x:6,y:4}),physicalAt:Object.freeze({x:63,z:33}),height:4.8,ceil:9.75,renderGroup:'upper'}),
    Object.freeze({id:'academic-floor-landing',at:Object.freeze({x:150,y:64}),size:Object.freeze({x:6,y:4}),physicalAt:Object.freeze({x:63.5,z:36.5}),height:10,ceil:13.8,renderGroup:'academic'}),
  ]),
});

const S=MAIN_STAIR_GEOMETRY,C=S.center,RI=S.innerRadiusM,RO=S.outerRadiusM,W=S.stairwell;
export const stairPoint=(deg,r)=>[C.x+Math.sin(deg*DEG)*r,C.z-Math.cos(deg*DEG)*r];
const arc=(r,from,to,n)=>Array.from({length:n+1},(_,i)=>stairPoint(from+(to-from)*i/n,r));
// Where a radial line from the centre leaves the stairwell square.
function toStairwellEdge(deg){
  const s=Math.sin(deg*DEG),c=-Math.cos(deg*DEG);let best=Infinity;
  for(const [v,axis] of[[W.x0,0],[W.x1,0],[W.z0,1],[W.z1,1]]){
    const d=axis===0?s:c,o=axis===0?C.x:C.z;if(Math.abs(d)<1e-12)continue;
    const t=(v-o)/d;if(t<=0)continue;
    const p=[C.x+s*t,C.z+c*t];
    if(p[0]>=W.x0-1e-9&&p[0]<=W.x1+1e-9&&p[1]>=W.z0-1e-9&&p[1]<=W.z1+1e-9)best=Math.min(best,t);
  }
  return stairPoint(deg,best);
}
const flightDeg=(f)=>({start:f.theta0/DEG,end:(f.theta0+f.sweep)/DEG,tread:f.sweep/f.rises/DEG});

// Move an outline's vertices off the flight faces it stands against: a radial
// line moves `distance` toward its `side`, an arc moves outward. Every edge is
// tested against the vertex as authored, so a corner on two faces moves off
// both. The builder keeps a millimetre between slab and run so each stays a
// closed solid; where you may stand keeps a body's width back from any step.
export const BODY_MARGIN_M=.1;
const polar=([x,z])=>{let a=Math.atan2(x-C.x,-(z-C.z))/DEG;if(a<0)a+=360;return{r:Math.hypot(x-C.x,z-C.z),a};};
const sameBearing=(a,b)=>{const d=Math.abs(a-b)%360;return Math.min(d,360-d)<1e-6;};
const withinBearings=(a,from,to)=>{const d=((a-from)%360+360)%360,span=((to-from)%360+360)%360;return d<=span+1e-6||d>=360-1e-6;};
export function offsetFromFlights(outline,edges,distance){
  return outline.map(([x,z])=>{
    const at=polar([x,z]);let {r,a}=at,moved=false;
    for(const edge of edges){
      if(edge.line!=null&&sameBearing(at.a,edge.line)&&at.r>=RI-1e-6){a+=edge.side*distance/at.r/DEG;moved=true;}
      if(edge.arc!=null&&Math.abs(at.r-edge.arc)<1e-6&&withinBearings(at.a,edge.from,edge.to)){r+=distance;moved=true;}
    }
    return moved?stairPoint(a,r):[x,z];
  });
}

// THE BUILT LANDINGS, as plan polygons in physical metres.
//
// Upper, 4.8 m: a quarter landing in the north-east corner, from the second
// half-turn's arrival line (0°) round to the third half-turn's start (100°),
// out to the stairwell's north and east edges, and down the east edge to z 37.5
// where the hall's walkable band already ends. The third half-turn's first
// tread is at landing height, so you may stand on it: the WALKABLE outline runs
// to its first riser; the SLAB stops at the flight, which builds that tread.
//
// Academic, 10 m: a half landing across the south, over the third half-turn,
// from the fourth half-turn's arrival (100°) clockwise to its start line (280°).
export function mainStairBuiltLandings(){
  const [f1,f2,f3,f4]=S.flights.map(flightDeg);
  const bandZ=37.5,bandDeg=180-Math.acos((bandZ-C.z)/RO)/DEG,f3Riser=f3.start+f3.tread,f4Arrive=f4.end-360;
  const upper=(edgeDeg)=>[[C.x,W.z0],[W.x1,W.z0],[W.x1,bandZ],...arc(RO,bandDeg,edgeDeg,10),stairPoint(edgeDeg,RI),...arc(RI,edgeDeg,0,24),[C.x,C.z-RO]];
  const academic=[toStairwellEdge(f4Arrive),[W.x1,W.z1],[W.x0,W.z1],toStairwellEdge(f4.start),stairPoint(f4.start,RI),...arc(RI,f4.start,f4Arrive,36),stairPoint(f4Arrive,RI)];
  void f1;void f2;
  // Faces of the runs each outline stands against.
  const upperSlabEdges=[{line:0,side:1},{line:f3.start,side:-1},{arc:RO,from:f3.start,to:bandDeg}];
  const upperWalkEdges=[{line:0,side:1},{line:f3Riser,side:-1},{arc:RO,from:f3Riser,to:bandDeg}];
  const academicEdges=[{line:f4Arrive,side:1}];
  return[
    {id:'upper-floor-landing',height:4.8,drawnHeight:gridDrawnHeight(4.8),
      walkable:offsetFromFlights(upper(f3Riser),upperWalkEdges,BODY_MARGIN_M),slab:upper(f3.start),flightEdges:upperSlabEdges},
    {id:'academic-floor-landing',height:10,drawnHeight:gridDrawnHeight(10),
      walkable:offsetFromFlights(academic,academicEdges,BODY_MARGIN_M),slab:academic,flightEdges:academicEdges},
  ];
}

// Guards along every floor edge that meets the stairwell's void, at the drawn
// floor height. The inner handrail carries on round the well across both
// landings and is part of the rails, not listed here.
export function mainStairGuards(){
  const f4=flightDeg(S.flights[3]),f4Arrive=f4.end-360,up=gridDrawnHeight(4.8),top=gridDrawnHeight(10);
  return[
    {id:'upper-east',height:up,path:[[W.x1,37.5],[W.x1,W.z1],[W.x0,W.z1]]},
    {id:'upper-arrival',height:up,path:[[C.x,W.z0],[C.x,C.z-RO]]},
    {id:'academic',height:top,path:[stairPoint(f4.start,RI),toStairwellEdge(f4.start),[W.x0,W.z0],[W.x1,W.z0],toStairwellEdge(f4Arrive)]},
  ];
}

export function mainStairStairwell(){
  return{...W,walkable:mainStairBuiltLandings().map((l)=>({height:l.height,polygon:l.walkable.map((p)=>[...p])}))};
}

export function mainStairFloorplanFlights(){
  const stair=MAIN_STAIR_GEOMETRY;
  return stair.flights.map((flight)=>({
    id:flight.id,
    from:{...flight.logicalFrom},to:{...flight.logicalTo},
    fromH:flight.fromH,toH:flight.toH,width:stair.widthM,rises:flight.rises,
    going:stair.goingM,ceil:flight.ceil,renderMode:'hero-mesh',navigationMode:'analytic-helix',
    groupFrom:flight.groupFrom,groupTo:flight.groupTo,
    arc:{
      center:{...stair.center},rInner:stair.innerRadiusM,rOuter:stair.collisionOuterRadiusM,
      rWalk:stair.walkOuterRadiusM,theta0:flight.theta0,sweep:flight.sweep,
    },
  }));
}

export function mainStairFloorplanLandings(){
  return MAIN_STAIR_GEOMETRY.landings.map((landing)=>({
    ...landing,at:{...landing.at},size:{...landing.size},physicalAt:{...landing.physicalAt},
  }));
}
