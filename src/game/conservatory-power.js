// The conservatory's five distribution panels. This is deliberately pure:
// rendering, audio and recording all consume the same normalized state instead
// of each inventing a second idea of what "power is on" means.

import { SCENE_DOCK_NAME } from '../data/space-labels.js';

export const POWER_STATE_SCHEMA = 2;

export const POWER_CIRCUIT = Object.freeze({
  SP01: 'sp01',
  SP02: 'sp02',
  SP03: 'sp03',
  SP04: 'sp04',
  SP05: 'sp05',
});

export const POWER_CIRCUITS = Object.freeze([
  Object.freeze({
    id: POWER_CIRCUIT.SP01,
    panelId: 'acq-services-panel-plant',
    label: 'S/P-01',
    serves: 'plant room, dance wing and basement passage',
  }),
  Object.freeze({
    id: POWER_CIRCUIT.SP02,
    panelId: 'acq-services-panel-pool',
    label: 'S/P-02',
    serves: 'natatorium deck and pool service corner',
  }),
  Object.freeze({
    id: POWER_CIRCUIT.SP03,
    panelId: 'acq-services-panel-foh',
    label: 'S/P-03',
    serves: `front of house, the ${SCENE_DOCK_NAME} and the atrium`,
  }),
  Object.freeze({
    id: POWER_CIRCUIT.SP04,
    panelId: 'acq-services-panel-practice',
    label: 'S/P-04',
    serves: 'the practice landing and teaching rooms',
  }),
  Object.freeze({
    id: POWER_CIRCUIT.SP05,
    panelId: 'acq-services-panel-academic',
    label: 'S/P-05',
    serves: 'the academic loggia, gallery and classrooms',
  }),
]);

export const POWER_CIRCUIT_IDS = Object.freeze(POWER_CIRCUITS.map((entry) => entry.id));
const IDS = new Set(POWER_CIRCUITS.map((entry) => entry.id));
const uniqueCircuits = (value) => [...new Set(
  (Array.isArray(value) ? value : []).map(String).filter((id) => IDS.has(id)),
)];

export function freshPowerState() {
  return {
    schema: POWER_STATE_SCHEMA,
    live: [],
    everRestored: [],
    lastChanged: null,
  };
}

export function normalizePowerState(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const legacy = Math.max(0, Number(source.schema) || 0) < POWER_STATE_SCHEMA;
  const live = uniqueCircuits(source.live);
  // Very early development saves used `power.sp01 = true`. Accept that shape
  // so testing builds do not silently lose an already-thrown breaker.
  for (const id of IDS) if (source[id] === true && !live.includes(id)) live.push(id);
  const everRestored = uniqueCircuits(source.everRestored);
  for (const id of live) if (!everRestored.includes(id)) everRestored.push(id);
  // S/P-03 used to feed practice, academic and tower lighting as well as FOH.
  // A schema-1 save that had restored it must not reload with two previously
  // powered occupied floors silently dark. The tower is phase-owned now and is
  // intentionally not represented in switchable power state.
  if (legacy && live.includes(POWER_CIRCUIT.SP03)) {
    for (const id of [POWER_CIRCUIT.SP04, POWER_CIRCUIT.SP05]) if (!live.includes(id)) live.push(id);
  }
  if (legacy && everRestored.includes(POWER_CIRCUIT.SP03)) {
    for (const id of [POWER_CIRCUIT.SP04, POWER_CIRCUIT.SP05]) if (!everRestored.includes(id)) everRestored.push(id);
  }
  const changed = source.lastChanged && typeof source.lastChanged === 'object'
    && IDS.has(String(source.lastChanged.circuit))
    ? {
        circuit: String(source.lastChanged.circuit),
        live: !!source.lastChanged.live,
        at: Math.max(0, Number(source.lastChanged.at) || 0),
      }
    : null;
  return { schema: POWER_STATE_SCHEMA, live, everRestored, lastChanged: changed };
}

export function powerCircuitDefinition(id) {
  return POWER_CIRCUITS.find((entry) => entry.id === id) || null;
}

export function isPowerCircuitId(id) {
  return IDS.has(String(id || ''));
}

export function powerCircuitForPanel(panelId) {
  return POWER_CIRCUITS.find((entry) => entry.panelId === panelId) || null;
}

export function livePowerCircuits(value) {
  return new Set(normalizePowerState(value).live);
}

export function circuitIsLive(value, circuit) {
  return normalizePowerState(value).live.includes(circuit);
}

export function togglePowerCircuit(value, circuit, { at = Date.now() } = {}) {
  if (!IDS.has(circuit)) return { changed: false, state: normalizePowerState(value), live: false };
  const state = normalizePowerState(value);
  const nextLive = new Set(state.live);
  const live = !nextLive.has(circuit);
  if (live) nextLive.add(circuit); else nextLive.delete(circuit);
  const ever = new Set(state.everRestored);
  if (live) ever.add(circuit);
  return {
    changed: true,
    live,
    state: {
      schema: POWER_STATE_SCHEMA,
      live: [...nextLive],
      everRestored: [...ever],
      lastChanged: { circuit, live, at: Math.max(0, Number(at) || 0) },
    },
  };
}

export function setPowerCircuit(value, circuit, live, { at = Date.now() } = {}) {
  const state = normalizePowerState(value);
  if (!IDS.has(circuit)) return { changed: false, state, live: false };
  const wanted = !!live;
  if (state.live.includes(circuit) === wanted) return { changed: false, state, live: wanted };
  return togglePowerCircuit(state, circuit, { at });
}

export function allPowerCircuitsRestored(value) {
  const ever = new Set(normalizePowerState(value).everRestored);
  return POWER_CIRCUITS.every((entry) => ever.has(entry.id));
}
