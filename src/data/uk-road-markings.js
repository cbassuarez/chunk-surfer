// DfT Traffic Signs Manual chapter 5 (2018), table 2-1: diagram 1008
// centre line for an ordinary two-way road below 40mph. The fictional route
// has no surveyed speed order; this is a visual grammar, not highway approval.
export const UK_ROAD_MARKINGS=Object.freeze({
  centreDiagram:'1008',edgeDiagram:'1012.1',strokeM:.10,
  markM:2,gapM:4,periodM:6,roadTileStepM:2,roadReceiverLengthM:2.08,
  laneEdgeLateralM:2.90,
});

// Road-fixed phase survives reversal and a return to an already-seen stretch.
export function ukRoadMarkingMeshAt(distance){
  const index=Math.round((Number.isFinite(distance)?distance:0)/UK_ROAD_MARKINGS.roadTileStepM);
  return ((index%3)+3)%3===0?'drive_uk_centre_and_edges':'drive_uk_edge_markings';
}
