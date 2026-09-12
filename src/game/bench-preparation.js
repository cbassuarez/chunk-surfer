// Packing is distinct from a catalog default: a reference item is not carried
// until the player has actually put it in the case. Old, already-open cases
// retain the equipment their previous workbench supplied.
export const BENCH_PACK_GROUPS = Object.freeze(['headphones', 'microphone', 'recorder', 'flashlight']);

export function prepareWorkbenchFlags(flags = {}) {
  if (flags['van.bench.v2'] === true) return flags;
  const next = { ...flags, 'van.bench.v2': true };
  if (flags['bag.taken'] === true) {
    for (const group of BENCH_PACK_GROUPS) next[`van.packed.${group}`] = true;
  }
  return next;
}

export function packedWorkbenchGroups(flags = {}) {
  return BENCH_PACK_GROUPS.filter(group => flags[`van.packed.${group}`] === true);
}

export function workbenchPackingComplete(flags = {}) {
  return flags['van.bench.v2'] !== true || packedWorkbenchGroups(flags).length === BENCH_PACK_GROUPS.length;
}

export function packWorkbenchGroup(flags = {}, group) {
  return BENCH_PACK_GROUPS.includes(group) ? { ...flags, [`van.packed.${group}`]: true } : flags;
}
