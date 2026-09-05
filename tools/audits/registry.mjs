// THE AUDITS, IN ONE LIST.
//
// An audit is a page that reads one part of the game out of the code and says
// what is there, what is missing, and where each piece is written. They are read
// side by side often enough that they cross-link, and the system map links to
// them from the systems they cover — so the list has to exist somewhere both can
// import.
//
// PORTS ARE ASSIGNED HERE AND NOWHERE ELSE. Two tools defaulting to the same
// port is a fifteen-minute confusion every time, so the whole range is written
// down — including the two ports this file does not own, because the collision
// this list prevents is exactly the one where an audit is given a port that the
// studio or the map already had.
//
//   4317  the narrative studio   (tools/narrative-studio/server.mjs)
//   4318  the system map         (tools/system-map/server.mjs)
//   4319+ the audits, below
//   4322  the desk               (tools/audits/all/server.mjs)

export const STUDIO_PORT = 4317;
export const SYSTEM_MAP_PORT = 4318;
// The one page that starts everything else. It is deliberately the last port in
// the range rather than the first: the audits were here before the desk was.
export const AUDITS_INDEX_PORT = 4322;

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
    // Which keys under the built audit's `global` mean SOMETHING IS WRONG and
    // which mean SOMETHING IS NOT FINISHED. The three audits grew their own
    // names for these; the desk needs one answer, so the mapping is declared
    // rather than guessed at from the shape of the object.
    health: Object.freeze({ wrong: Object.freeze(['contract', 'gates']), outstanding: Object.freeze([]) }),
  }),
  Object.freeze({
    id: 'progression',
    title: 'What the player earns',
    blurb: 'Achievements, calibration pins, the skill tree and the weapons they buy — what grants each one and what it changes.',
    npm: 'progression:audit',
    port: 4320,
    entry: 'tools/audits/progression/server.mjs',
    systems: Object.freeze(['save-progression', 'scene-orchestration']),
    health: Object.freeze({ wrong: Object.freeze(['broken']), outstanding: Object.freeze(['findings']) }),
  }),
  Object.freeze({
    id: 'puzzles',
    title: 'Every puzzle and microgame',
    blurb: 'Everything that is not a fight and not a walk: what each one asks, what counts as done, and what a player who cannot do it is offered instead.',
    npm: 'puzzles:audit',
    port: 4321,
    entry: 'tools/audits/puzzles/server.mjs',
    systems: Object.freeze(['scene-orchestration', 'narrative-runtime']),
    health: Object.freeze({ wrong: Object.freeze(['broken']), outstanding: Object.freeze(['unfinished']) }),
  }),
]);

// THE CHECKS THAT ARE NOT PAGES.
//
// The other half of the tooling: commands that run once, print, and exit. They
// were only ever reachable by knowing their npm script existed, which meant in
// practice they were run the week they were written and never again. The desk
// runs them on demand and shows what they said.
//
// `slow` is honest rather than precise — it marks the ones that build assets or
// drive the real game headless, so nobody starts one expecting a prompt back.
export const CHECKS = Object.freeze([
  Object.freeze({ id: 'apparitions', npm: 'verify:apparitions', title: 'The apparitions',
    blurb: 'Drives the real game and proves the hall apparitions stage, shadow, and never close.', slow: true }),
  Object.freeze({ id: 'tower-silence', npm: 'verify:tower-silence', title: 'Tower silence at boot',
    blurb: 'Proves no bell stem reaches the mix during boot. This has regressed twice.', slow: true }),
  Object.freeze({ id: 'recording-hallucination', npm: 'verify:recording-hallucination', title: 'Hallucinations while recording',
    blurb: 'Proves the recording hallucinations actually show while a take is rolling.', slow: true }),
  Object.freeze({ id: 'fireball', npm: 'verify:fireball', title: 'The fireball cast',
    blurb: 'Proves the cast-surface windows spawn, place, and can be clicked.', slow: true }),
  Object.freeze({ id: 'post-run', npm: 'verify:post-run', title: 'The post-run report',
    blurb: 'Proves the return report and its copy survive a finished run.', slow: true }),
  Object.freeze({ id: 'combat', npm: 'tune:combat', title: 'Combat tuning',
    blurb: 'Plays every fight on every preset headless and prints the damage table.', slow: false }),
  Object.freeze({ id: 'lens', npm: 'lens:verify', title: 'The lens bundle',
    blurb: 'Validates the diffusion lens bundle contract.', slow: false }),
  Object.freeze({ id: 'steamworks', npm: 'steamworks:verify', title: 'The Steamworks package',
    blurb: 'Validates the shipped package layout.', slow: false }),
  Object.freeze({ id: 'authoring', npm: 'studio:validate', title: 'The authored content',
    blurb: 'Regenerates the content registry and validates every authored document.', slow: false }),
]);

export const checkById = (id) => CHECKS.find((check) => check.id === id) || null;

export const auditById = (id) => AUDITS.find((audit) => audit.id === id) || null;
export const auditsForSystem = (systemId) => AUDITS.filter((audit) => audit.systems.includes(systemId));

// Every audit has a distinct id, port and npm script, and none of them collides
// with the system map. Asserted by test/audits-registry.spec.mjs.
export function auditRegistryErrors() {
  const errors = [];
  const seen = {
    id: new Set(),
    port: new Set([STUDIO_PORT, SYSTEM_MAP_PORT, AUDITS_INDEX_PORT]),
    npm: new Set(CHECKS.map((check) => check.npm)),
  };
  for (const audit of AUDITS) {
    for (const field of ['id', 'title', 'blurb', 'npm', 'entry']) {
      if (!String(audit[field] || '').trim()) errors.push(`an audit has no ${field}`);
    }
    if (seen.id.has(audit.id)) errors.push(`two audits share the id ${audit.id}`);
    if (seen.npm.has(audit.npm)) errors.push(`two audits share the npm script ${audit.npm}`);
    if (seen.port.has(audit.port)) {
      const owner = audit.port === SYSTEM_MAP_PORT ? "the system map's port"
        : audit.port === STUDIO_PORT ? "the studio's port"
          : audit.port === AUDITS_INDEX_PORT ? "the desk's port" : null;
      errors.push(owner ? `${audit.id} uses ${audit.port}, which is ${owner}` : `two audits share port ${audit.port}`);
    }
    if (!Number.isInteger(audit.port) || audit.port < 1024 || audit.port > 65535) errors.push(`${audit.id} has an unusable port`);
    if (!audit.systems?.length) errors.push(`${audit.id} says which systems it covers: none`);
    if (!audit.health?.wrong) errors.push(`${audit.id} does not say which of its findings mean something is wrong`);
    seen.id.add(audit.id); seen.port.add(audit.port); seen.npm.add(audit.npm);
  }
  const checkIds = new Set();
  for (const check of CHECKS) {
    for (const field of ['id', 'npm', 'title', 'blurb']) {
      if (!String(check[field] || '').trim()) errors.push(`a check has no ${field}`);
    }
    if (checkIds.has(check.id)) errors.push(`two checks share the id ${check.id}`);
    checkIds.add(check.id);
  }
  return errors;
}
