// DfT Traffic Signs Manual chapter 5 (2018). The fictional route has no
// surveyed speed order; the van is capped at 36 mph, so it is marked as a road
// of 40 mph or less. This is a visual grammar, not highway approval.
//
//  centre   diagram 1008, table 2-1: 2 m line, 4 m gap; studs (if used) 12 m.
//  warning  diagram 1004, table 2-3: 4 m line, 2 m gap; studs 6 m; at least
//           seven marks on each approach at 40 mph. On the way into bends and
//           between hazards.
//  double   diagram 1013.1, section 3: two continuous 100 mm lines where
//           overtaking visibility is restricted; a single row of white studs
//           between them at 3 to 4.5 m.
//  edge     diagram 1012.1, table 2-5: 100 mm on a road with no hard strip.
//
// Seb, 2026-11-06 (Northern drives audit): the line used to be 1008 the whole
// way, straight through the blind S-bends, with studs every 18.3 m that landed
// on paint 38% of the time. Studs now follow the line they sit in.
export const UK_ROAD_MARKINGS=Object.freeze({
  centreDiagram:'1008',warningDiagram:'1004',doubleDiagram:'1013.1',edgeDiagram:'1012.1',strokeM:.10,
  markM:2,gapM:4,periodM:6,roadTileStepM:2,roadReceiverLengthM:2.08,
  laneEdgeLateralM:2.90,
  warning:Object.freeze({markM:4,gapM:2,periodM:6,studM:6,minimumMarks:7}),
  double:Object.freeze({lineM:.10,gapM:.10,studM:4}),
  studs:Object.freeze({centre:12,warning:6,double:4}),
});

// Where the line changes, in road distance (one continuous address: the opening
// approach below -32 m, the Source route above it). Derived from the bend radii
// (test/uk-road-markings.spec.mjs re-measures them): the opening road's S-chain
// of 95-132 m bends gets double white lines, its gentler 140-150 m bends get
// warning lines, and each approach carries at least seven warning marks. The
// Source switchbacks (173-433 m) are unmarked by design (route-treatment.js)
// and stay that way.
export const UK_ROAD_LINE_CHANGES=Object.freeze([
  Object.freeze({from:-640,to:-598,kind:'warning',why:'approach to the S-chain'}),
  Object.freeze({from:-598,to:-384,kind:'double',why:'three bends of 95-132 m radius, no overtaking sight'}),
  Object.freeze({from:-384,to:-344,kind:'warning',why:'the short break between two double-line sections'}),
  Object.freeze({from:-344,to:-288,kind:'double',why:'a 95 m bend'}),
  Object.freeze({from:-288,to:-32,kind:'warning',why:'four 140-152 m bends in 250 m'}),
  Object.freeze({from:120,to:172,kind:'warning',why:'approach to the switchbacks'}),
  Object.freeze({from:434,to:480,kind:'double',why:'63-124 m bends dropping to the bridge, straight out of the unmarked switchbacks'}),
  Object.freeze({from:480,to:522,kind:'warning',why:'the last bend before the overpass'}),
]);

/** 'centre', 'warning' or 'double' at a road distance. */
export function ukRoadLineAt(distance){
  const d=Number.isFinite(distance)?distance:0;
  for(const row of UK_ROAD_LINE_CHANGES)if(d>=row.from&&d<row.to)return row.kind;
  return 'centre';
}

// Road-fixed phase survives reversal and a return to an already-seen stretch.
// Tiles are 2 m: the centre line marks one tile in three, the warning line two.
export function ukRoadMarkingMeshAt(distance){
  const step=UK_ROAD_MARKINGS.roadTileStepM,index=Math.round((Number.isFinite(distance)?distance:0)/step),phase=((index%3)+3)%3,kind=ukRoadLineAt(index*step);
  if(kind==='double')return 'drive_uk_double_white';
  if(kind==='warning')return phase!==2?'drive_uk_centre_and_edges':'drive_uk_edge_markings';
  return phase===0?'drive_uk_centre_and_edges':'drive_uk_edge_markings';
}

// Stud positions sit in the gaps: the centre line's 2 m mark covers 6k-1..6k+1,
// so its studs go at 12k+3; the warning line's 4 m mark covers 6k-1..6k+3, so
// its studs go at 6k+4. Between double white lines, every 4 m.
const STUD_PHASE=Object.freeze({centre:3,warning:4,double:0});
/** Stud distances in [from, to], skipping any distance `marked` refuses. */
export function ukRoadStudsBetween(from,to,marked=()=>true){
  const out=[];if(!(to>=from))return out;
  for(const kind of['centre','warning','double']){
    const every=UK_ROAD_MARKINGS.studs[kind],phase=STUD_PHASE[kind];
    // The tile under a stud decides its line, so a stud never lands on the next line's paint.
    for(let d=Math.ceil((from-phase)/every)*every+phase;d<=to;d+=every){const tile=Math.round(d/UK_ROAD_MARKINGS.roadTileStepM)*UK_ROAD_MARKINGS.roadTileStepM;if(ukRoadLineAt(d)===kind&&ukRoadLineAt(tile)===kind&&marked(d))out.push(d);}
  }
  return out.sort((a,b)=>a-b);
}
