// The Survey Indicator is acquired separately from the field case. Old runs
// predate the van workbench and retain the starter map they already carried.
// Temporary equipment loss stays a separate runtime fact: historic lost.map
// flags have no persisted recovery position and cannot decide availability.
export function mapAcquired(flags = {}) {
  return !!(flags?.['map.taken'] || (flags?.['bag.taken'] && !flags?.['van.preparation.v1']));
}

export function mapAvailable(flags = {}, missing = false) {
  return mapAcquired(flags) && !missing;
}
