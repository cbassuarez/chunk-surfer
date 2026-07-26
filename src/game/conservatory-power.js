// The conservatory's three distribution panels. This is deliberately pure:
// rendering, audio and recording all consume the same normalized state instead
// of each inventing a second idea of what "power is on" means.

export const POWER_STATE_SCHEMA = 1;

export const POWER_CIRCUIT = Object.freeze({
  SP01: 'sp01',
  SP02: 'sp02',
  SP03: 'sp03',
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
    serves: 'front of house, hall lounge and academic landing',
  }),
]);

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
  const live = uniqueCircuits(source.live);
  // Very early development saves used `power.sp01 = true`. Accept that shape
  // so testing builds do not silently lose an already-thrown breaker.
  for (const id of IDS) if (source[id] === true && !live.includes(id)) live.push(id);
  const everRestored = uniqueCircuits(source.everRestored);
  for (const id of live) if (!everRestored.includes(id)) everRestored.push(id);
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

export function allPowerCircuitsRestored(value) {
  const ever = new Set(normalizePowerState(value).everRestored);
  return POWER_CIRCUITS.every((entry) => ever.has(entry.id));
}
