// The parked van and the close preparation view share finishes and a real
// worktop footprint. The fitting view is an overhead cutaway of that load bay;
// its enlarged layout coordinates are not extra metres inside the vehicle.
export const VAN_REAR_PALETTE = Object.freeze({
  enamel: '#414a43',
  enamelLight: '#687169',
  enamelShadow: '#29322e',
  plywood: '#65523d',
  plywoodEdge: '#9a8260',
  rubber: '#17231f',
  steel: '#343e38',
  zinc: '#899185',
  warmPractical: '#ffe0ac',
  outsideBlue: '#8eafbf',
});

export const VAN_REAR_STRUCTURE = Object.freeze({
  bodyWidth: 2.00,
  floorY: .62,
  roofY: 2.52,
  rearPlane: 2.47,
  // Retained datum for the complete 80mm worktop assembly, not solid timber.
  worktopY: 1.06,
  worktopAssemblyDepth: .080,
  worktopSkinThickness: .024,
  worktopWidth: 1.74,
  worktopDepth: 1.16,
  worktopCenterZ: 1.32,
});

export const VAN_REAR_CASE = Object.freeze({
  width: .624,
  depth: .480,
  centerZ: 1.50,
  seatWidth: .70,
  seatDepth: .64,
  seatThickness: .009,
  seatTopY: VAN_REAR_STRUCTURE.worktopY + .049,
  stopClearance: .012,
  stopHeight: .018,
  stopThickness: .022,
});

export const VAN_REAR_CARGO_LIGHT = Object.freeze({
  position: Object.freeze([0, 2.20, 2.0]),
  direction: Object.freeze([0, -.85, -.52]),
  color: Object.freeze([1, .79, .49]),
  coneOuterCos: .20,
  coneInnerCos: .68,
  radius: 3.25,
});

export const VAN_REAR_STAGE = Object.freeze({
  width: 18,
  depth: 12,
  metresPerUnit: VAN_REAR_STRUCTURE.worktopWidth / 18,
  worktopTopY: -.11,
  trayTopY: -.003,
  caseZ: (VAN_REAR_CASE.centerZ - VAN_REAR_STRUCTURE.worktopCenterZ) / (VAN_REAR_STRUCTURE.worktopWidth / 18),
  rackZ: -5.45,
  rackSeatY: 1.05,
});

// A close cutaway of the working surface, rather than a shorter cargo bay.
// The actual vehicle bulkhead remains well behind the worktop-mounted rack.
export function vanRearStageToWorld([x, y, z]) {
  const units = VAN_REAR_STAGE.metresPerUnit;
  return [x * units, VAN_REAR_STRUCTURE.worktopY + .04 + (y - VAN_REAR_STAGE.worktopTopY) * units,
    VAN_REAR_STRUCTURE.worktopCenterZ + z * units];
}

export function vanRearWorldToStage([x, y, z]) {
  const units = VAN_REAR_STAGE.metresPerUnit;
  return [x / units, VAN_REAR_STAGE.worktopTopY + (y - VAN_REAR_STRUCTURE.worktopY - .04) / units,
    (z - VAN_REAR_STRUCTURE.worktopCenterZ) / units];
}

// Passive locating stops leave the handle and upward pickup completely free.
// No strap crosses the lid and no extra release interaction is implied.
export function vanRearCaseStops() {
  const C = VAN_REAR_CASE, stops = [], y = C.seatTopY + C.stopHeight / 2;
  for (const side of [-1, 1]) for (const z of [-.12, .12]) stops.push({
    id: `case-side-stop-${side}-${z}`,
    center: [side * (C.width / 2 + C.stopClearance + C.stopThickness / 2), y, C.centerZ + z],
    size: [C.stopThickness, C.stopHeight, .11],
  });
  for (const end of [-1, 1]) for (const x of [-.22, .22]) stops.push({
    id: `case-end-stop-${end}-${x}`,
    center: [x, y, C.centerZ + end * (C.depth / 2 + C.stopClearance + C.stopThickness / 2)],
    size: [.12, C.stopHeight, C.stopThickness],
  });
  return stops;
}

export const vanRearStockMeshName = (group, optionId) => `yard_van_stock_${group}_${optionId.replaceAll('-', '_')}`;
