import { CELL, F, EYE } from './floorplan/legend.js';

// All three candidates are playable from this manifest. The selected candidate
// receives an overworld trigger later; the study never silently chooses one.
export const CONSERVATORY_RIFT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'bad-bar', title: 'The Bad Bar', verb: 'Perform, then withhold',
    anchorId: 'practice-piano-1', space: 'practice west 1',
    identity: 'A student whose required reference continues after his playing stops.',
    duration: 'A voluntary minute or two comparing action and reference; no wait quota.',
    trigger: Object.freeze({ propId:'practice-piano-1', action:'inspect', consent:'E',
      rift:'A bounded Source material seam beside the retained exam upright contrasts with its warm reading light. The playable trace seats you at the same piano while live and retained reference parts separate.',
      placement:'The current study starts inside this detached room. Deliberate inspection of this upright is the proposed entry for a selected option; no overworld trigger is enabled yet.' }),
    exit:'Stand from the bench with S; restore the held operator pose through a single run-scoped return receipt.',
    controls: 'Hold E to play. Release to listen. S stands and returns.',
    canon: ['faculty-reference-requirement', 'student-monitoring-notes', 'second-performance'],
    staging: 'New embodied trace of the existing student account; not a literal verified flashback.' }),
  Object.freeze({ id: 'after-company', title: 'After Everyone Left', verb: 'Leave, listen back, return',
    anchorId: 'practice-ensemble-score-a', space: 'practice ensemble room',
    identity: 'The student remained at the monitor after the ensemble left.',
    duration: 'A short rehearsal-room and corridor walk; roughly one to three minutes with listening and return.',
    trigger: Object.freeze({ propId:'practice-ensemble-score-a', action:'inspect', consent:'E',
      rift:'A bounded Source material seam marks the retained ensemble station. Walk the real practice corridor as the continuing reference sounds ahead at the copied-parts station.',
      placement:'The current study starts in the detached ensemble room. Deliberate inspection of its existing score is the proposed entry for a selected option; no overworld trigger is enabled yet.' }),
    exit:'The ordinary stair-arrival threshold returns immediately; a Stop action also remains available.',
    controls: 'WASD walks. E shuts or opens a nearby door. Walk to the stair arrival to return.',
    canon: ['student-monitoring-notes', 'incident-17'],
    staging: 'The retained ensemble room and corridor, with new spatial staging of the continuing part.' }),
  Object.freeze({ id: 'fifth-chair', title: 'The Fifth Chair', verb: 'Mark entrances; withdraw attention',
    anchorId: 'practice-stand-6', space: 'practice copied-parts room',
    identity: 'A listener marking entrances for a fifth chair becomes the retained reference.',
    duration: 'About a minute of marking and comparison; no rhythm score or minimum number of repeated listens.',
    trigger: Object.freeze({ propId:'practice-stand-6', action:'inspect', consent:'E',
      rift:'A true overhead view shows a physical paper monitoring model, retained miniature instruments, four entrance chairs and a fifth listening chair. Source text and anticipating marks occupy the paper; the model sits on its surface.',
      placement:'The current study starts over a detached desk at the copied-parts stand. Deliberate inspection of this stand is the proposed entry for a selected option; no overworld trigger is enabled yet.' }),
    exit:'Draw the monitoring mark back over the near desk edge with S; restore the exact held operator pose. Early withdrawal remains a valid retreat.',
    controls: 'WASD moves the monitoring mark. E marks an entrance. S draws it back over the desk edge to return.',
    canon: ['second-performance', 'incident-17'],
    staging: 'New overhead physical monitoring miniature, using the exact retained ensemble furniture.' }),
]);
export const CONSERVATORY_RIFT_ENTRANCES = Object.freeze([.18, .39, .61, .82]);
export const conservatoryRiftOption = id => CONSERVATORY_RIFT_OPTIONS.find(option => option.id === id) || CONSERVATORY_RIFT_OPTIONS[0];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const copy = value => JSON.parse(JSON.stringify(value));

/** Resolve current compiled poses, never reinterpret authored metres as world metres. */
export function resolveConservatoryRiftSites(floorplan, suppliedProps = []) {
  const props = Array.isArray(suppliedProps) ? suppliedProps : suppliedProps?.allProps?.() || [];
  if (typeof floorplan?.logicalToPhysical !== 'function') throw new TypeError('The rift needs the compiled conservatory');
  function point(logicalMetresX, logicalMetresY) {
    const at = floorplan.logicalToPhysical(logicalMetresX / CELL, logicalMetresY / CELL);
    if (!at || at.renderGroup !== 'upper' || at.spaceId !== 'practice') throw Error('The retained practice room is unavailable');
    return { x: at.x * CELL, z: at.z * CELL, feet: at.y, group: at.renderGroup, spaceId: at.spaceId };
  }
  function anchor(id) {
    const prop = props.find(value => value.id === id);
    if (!prop) throw Error(`The rift anchor is unavailable: ${id}`);
    // Render instances already own their final physical contact pose.
    if (Number.isFinite(prop.z)) {
      const support=floorplan.logicalAtPhysical?.(prop.x/CELL,prop.z/CELL,{group:'upper',floor:4.8});
      return { id, x: prop.x, z: prop.z, feet: finite(support?.floor,4.8), yaw: finite(prop.yaw) };
    }
    const at = floorplan.logicalToPhysical(prop.rx ?? prop.x / CELL, prop.ry ?? prop.y / CELL);
    return { id, x: at.x * CELL + finite(prop.renderOffsetX), z: at.z * CELL + finite(prop.renderOffsetZ),
      feet: finite(prop.floor, at.y), yaw: finite(prop.yaw) };
  }
  // Detach the exact physical raster once. Closed ordinary leaves are replaced
  // by local memory leaves; masonry/headroom remain the real building's.
  const cells = new Map();
  for (const [key, spans] of floorplan.physicalSpanData?.().cells || []) {
    const span = spans.find(value => value.renderGroup === 'upper' && value.spaceId === 'practice');
    if (span) cells.set(key, { floor: span.floor, ceil: span.ceil, flags: span.flags });
  }
  const doors = (floorplan.doorState?.() || []).filter(door => /^practice-(?:west|east)-[1-4]$/.test(door.id) || door.id === 'practice-side').map(door => {
    const at = floorplan.logicalToPhysical(door.cx, door.cy);
    return { id: door.id, x: at.x * CELL, z: at.z * CELL, feet: at.y,
      yaw: finite(door.yaw), width: finite(door.aperture?.width, 1),
      widthAxis: door.widthAxis || 'y', mesh: door.mesh, frameMesh: door.frameMesh,
      swing: door.swing, activeLeaves: [...(door.activeLeaves || [0])], initialOpen: true };
  });
  const blockers = props.filter(prop => prop.blocks && (prop.renderGroup === 'upper' || prop.renderGroups?.includes('upper'))).map(prop => {
    const at = anchor(prop.id);
    return { ...at, w: finite(prop.w, .5) * finite(prop.scale, 1), d: finite(prop.d, .5) * finite(prop.scale, 1) };
  });
  const walkable = (x, z, state = {}) => {
    for (const [dx, dz] of [[0, 0], [-.18, -.18], [-.18, .18], [.18, -.18], [.18, .18]]) {
      const cell = cells.get(`${Math.floor((x + dx) / CELL)},${Math.floor((z + dz) / CELL)}`);
      if (!cell || cell.flags & (F.SOLID | F.BRICKED) || cell.ceil - cell.floor < 1.8) return false;
    }
    for (const door of doors) {
      if (state.doorOpen?.[door.id] !== false) continue;
      // These actual practice singles are all in walls running north/south.
      if (Math.abs(x - door.x) < .24 && Math.abs(z - door.z) < door.width / 2 + .18) return false;
    }
    for (const prop of blockers) {
      const dx = x - prop.x, dz = z - prop.z, c = Math.cos(prop.yaw), s = Math.sin(prop.yaw);
      if (Math.abs(dx * c + dz * s) < prop.w / 2 + .16 && Math.abs(-dx * s + dz * c) < prop.d / 2 + .16) return false;
    }
    return true;
  };
  const a = anchor('practice-piano-1'), b = anchor('practice-ensemble-score-a'), c = anchor('practice-stand-6'), copiedPart=anchor('practice-score-parts');
  const seated = point(53.65, 58.9), walking = point(68.55, 79.75), arrival = point(61.25, 54), paper = point(71.4, 73.1);
  const floor = seated.feet;
  const common = { doors, canOccupy: walkable, cells, renderGroup: 'upper', spaceId: 'practice' };
  return {
    'bad-bar': { ...common, id: 'bad-bar', anchor: a, spawn: { ...seated, yaw: -Math.PI / 2, pitch: -.25 },
      camera: { eye: [seated.x, floor + 1.22, seated.z], yaw: -Math.PI / 2, pitch: -.25 },
      liveSource: { x: a.x, z: a.z, y: floor + 1 }, referenceSource: { x: a.x + .5, z: a.z + 1.6, y: floor + 1.1 } },
    'after-company': { ...common, id: 'after-company', anchor: b, spawn: { ...walking, yaw: 1.1, pitch: 0 },
      camera: { eye: [walking.x, floor + EYE, walking.z], yaw: 1.1, pitch: 0 }, arrival, paper,
      paperView: {x:copiedPart.x,y:floor+1.20,z:copiedPart.z},
      liveSource: { x: b.x, z: b.z, y: floor + 1 }, referenceSource: { x: paper.x, z: paper.z, y: floor + 1.1 },
      authoredRoute: [[68.55,79.75],[65.5,80.5],[63.5,80.5],[61.25,80.5],[61.25,73.5],[64,73.5],[71.4,73.1],[64,73.5],[61.25,73.5],[61.25,54]].map(([x,y]) => point(x,y)) },
    'fifth-chair': { ...common, id: 'fifth-chair', anchor: c, spawn: { ...c, yaw: 0, pitch: -Math.PI / 2 },
      camera: { eye: [c.x + .15, floor + 1.326, c.z - .15], yaw: 0, pitch: -Math.PI / 2 },
      board: { x: c.x + .15, z: c.z - .15, y: floor + .726, width: 1.1, depth: .65 },
      liveSource: { x: c.x - .35, z: c.z, y: floor + .726 }, referenceSource: { x: c.x + .35, z: c.z, y: floor + .726 } },
  };
}

// New diegetic dressing, deliberately separated from established source facts.
export const CONSERVATORY_RIFT_LABEL = Object.freeze({ text: 'CHUNK SURFER', role: 'institution',
  provenance: 'Transfer label over the student name; student-monitoring-notes / transfer registry', isBirthName: false });
export const conservatoryRiftManifest = () => copy(CONSERVATORY_RIFT_OPTIONS);
