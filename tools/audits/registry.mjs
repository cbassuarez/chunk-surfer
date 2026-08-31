// THE AUDITS, IN ONE LIST.
//
// An audit is a page that reads one part of the game out of the code and says
// what is there, what is missing, and where each piece is written. They are read
// side by side often enough that they cross-link, and the system map links to
// them from the systems they cover — so the list has to exist somewhere both can
// import.
//
// PORTS ARE ASSIGNED HERE AND NOWHERE ELSE. The system map already owns 4318;
// two tools defaulting to the same port is a fifteen-minute confusion every
// time, so the range is written down.

export const SYSTEM_MAP_PORT = 4318;

export const AUDITS = Object.freeze([
  Object.freeze({
    id: 'endings',
    title: 'Every ending',
    blurb: 'All nine endings: how a player reaches each one, what they need, what takes it away, and every line it says.',
    npm: 'endings:audit',
    port: 4319,
    entry: 'tools/audits/endings/server.mjs',
    // Which parts of the system map this audit is the detail view for.
    systems: Object.freeze(['narrative-runtime', 'save-progression']),
  }),
  Object.freeze({
    id: 'progression',
    title: 'What the player earns',
    blurb: 'Achievements, calibration pins, the skill tree and the weapons they buy — what grants each one and what it changes.',
    npm: 'progression:audit',
    port: 4320,
    entry: 'tools/audits/progression/server.mjs',
    systems: Object.freeze(['save-progression', 'scene-orchestration']),
  }),
]);

export const auditById = (id) => AUDITS.find((audit) => audit.id === id) || null;
export const auditsForSystem = (systemId) => AUDITS.filter((audit) => audit.systems.includes(systemId));

// Every audit has a distinct id, port and npm script, and none of them collides
// with the system map. Asserted by test/audits-registry.spec.mjs.
export function auditRegistryErrors() {
  const errors = [];
  const seen = { id: new Set(), port: new Set([SYSTEM_MAP_PORT]), npm: new Set() };
  for (const audit of AUDITS) {
    for (const field of ['id', 'title', 'blurb', 'npm', 'entry']) {
      if (!String(audit[field] || '').trim()) errors.push(`an audit has no ${field}`);
    }
    if (seen.id.has(audit.id)) errors.push(`two audits share the id ${audit.id}`);
    if (seen.npm.has(audit.npm)) errors.push(`two audits share the npm script ${audit.npm}`);
    if (seen.port.has(audit.port)) {
      errors.push(audit.port === SYSTEM_MAP_PORT
        ? `${audit.id} uses ${audit.port}, which is the system map's port`
        : `two audits share port ${audit.port}`);
    }
    if (!Number.isInteger(audit.port) || audit.port < 1024 || audit.port > 65535) errors.push(`${audit.id} has an unusable port`);
    if (!audit.systems?.length) errors.push(`${audit.id} says which systems it covers: none`);
    seen.id.add(audit.id); seen.port.add(audit.port); seen.npm.add(audit.npm);
  }
  return errors;
}
