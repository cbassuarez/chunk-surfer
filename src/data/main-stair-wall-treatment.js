// Relief applied to existing masonry, never a replacement stairwell shell.
// The 6 x 6 m analytic stairwell is air. Its real hall walls sit at different
// planes at each storey, and the academic arrival opens beyond that square.
// Origins are bay centres at their bottom elevation, in world metres. Local
// U follows tangent and local +Z follows normal, toward the occupied room.
export const MAIN_STAIR_WALL_TREATMENT_VERSION = 2;
export const MAIN_STAIR_WALL_ORIGIN = Object.freeze([63, 0, 36]);

const site = (id, origin, normal, tangent, top, kind, maxProjection, storey) => Object.freeze({
  id,
  origin: Object.freeze(origin),
  normal: Object.freeze(normal),
  tangent: Object.freeze(tangent),
  width: 2.6,
  height: top - origin[1],
  kind,
  maxProjection,
  // The whole pack remains visible across the open well. This is not a
  // render-group switch that would make ornament vanish between flights.
  renderGroups: Object.freeze(['ground', 'upper', 'academic']),
  validation: Object.freeze({
    source: 'physicalRenderPlanFor',
    storey,
    observerSamples: 65,
    observerFloors: Object.freeze([0, 2.4, 4.8, 7.4, 10]),
    backing: 'Occupied at every sampled point in every ordinary flight and landing observer slice.',
    visibility: 'Other observer slices can occlude a bay; no bay depends on invented backing.',
    canonicalDate: null,
  }),
});

export const MAIN_STAIR_WALL_SITES = Object.freeze([
  site('ground-west-north', [59, .16, 34.5], [1, 0, 0], [0, 0, -1], 4.38, 'intact', .16, 'ground hall'),
  site('ground-west-south', [59, .16, 37.5], [1, 0, 0], [0, 0, -1], 4.38, 'overpainted', .16, 'ground hall'),
  site('ground-east-north', [68, .16, 34.5], [-1, 0, 0], [0, 0, 1], 4.38, 'intact', .16, 'ground hall'),
  site('ground-east-south', [68, .16, 37.5], [-1, 0, 0], [0, 0, 1], 4.38, 'intact', .16, 'ground hall'),
  site('ground-south-west', [61.5, .16, 40], [0, 0, -1], [-1, 0, 0], 4.38, 'overpainted', .16, 'ground hall'),
  site('ground-south-east', [64.5, .16, 40], [0, 0, -1], [-1, 0, 0], 4.38, 'sealed', .16, 'ground hall'),
  site('upper-west-north', [60, 4.94, 34.5], [1, 0, 0], [0, 0, -1], 9.55, 'intact', .12, 'upper well masonry'),
  site('upper-west-south', [60, 4.94, 37.5], [1, 0, 0], [0, 0, -1], 9.55, 'sealed', .12, 'upper well masonry'),
  site('upper-north-west', [61.5, 4.94, 33], [0, 0, 1], [1, 0, 0], 9.55, 'overpainted', .12, 'upper well masonry'),
  site('upper-north-east', [64.5, 4.94, 33], [0, 0, 1], [1, 0, 0], 9.55, 'intact', .12, 'upper well masonry'),
  // The corresponding eastern academic bay is an actual opening. It is not a
  // suitable wall, even though the late flight temporarily presents a header.
  site('academic-north-west', [61.5, 10.14, 30], [0, 0, 1], [1, 0, 0], 13.55, 'intact', .12, 'academic arrival wall'),
]);

// This is a treatment history rather than new dated institutional lore.
// Existing room history explicitly leaves the stair's date unrecorded.
export const MAIN_STAIR_WALL_HISTORY = Object.freeze({
  retained: 'Expensive ceramic plinths, carved capitals, festoons and blind aedicules retained through later institutional use.',
  overpainted: 'Later paint and repair preserve the grand outer order while burying earlier openings and severing their inner mouldings.',
  sealed: 'High-silled blind openings are narrowed, plugged and compressed inside their original surrounds; there is no usable doorway.',
  unease: 'Contradictory architectural returns and strained infill carry the horror; no figural masks, new apparition or animated wall effect.',
  uncertainty: 'No construction date, donor identity or named historical event is established.',
});
