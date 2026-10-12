// Resolve first, then surrender the current world. No nearest-zone search:
// component, render group and physical/logical floor must all agree.
export function resolveGodHook(hook, floorplan, props) {
  if (!floorplan.isLoaded() || !hook?.at || !Number.isFinite(hook.at.x) || !Number.isFinite(hook.at.y)) return null;
  const point = floorplan.toRuntimePoint(hook.at);
  const physical = floorplan.logicalToPhysical(point.x, point.y);
  const floor = floorplan.floorAt(point.x, point.y);
  const renderedFloor = floorplan.renderedFloorAt(point.x, point.y, physical?.x, physical?.z);
  return !floorplan.isSolid(point.x, point.y) && props.propCanOccupy(point.x, point.y)
    && floorplan.zoneAt(point.x, point.y) === hook.zone
    && physical?.renderGroup === hook.group && physical?.spaceId === hook.component
    && (!hook.layer || physical?.layer === hook.layer)
    && [floor, physical?.y, renderedFloor].every(value => Number.isFinite(value) && Math.abs(value - hook.floor) < .12)
    ? point : null;
}

export function godLocationValue(hook, ready = true) {
  if (!hook) return 'INVALID DESTINATION';
  const height = `${hook.floor > 0 ? '+' : ''}${hook.floor}m`;
  return `${ready ? '[WARP]' : '[START + WARP]'} ${hook.layer || hook.component} / ${height}`;
}

// Single-flight even if a second God menu is opened while a building is loading.
// A live destination is resolved before commit; failures never call teardown.
export function createGodWarpController({ getHook, ready, ensureReady, resolve, commit, blocked = () => '', notify = () => {} }) {
  let pending = false;
  return {
    pending: () => pending,
    async warp(id) {
      if (pending) { notify('WARP ALREADY IN PROGRESS'); return false; }
      const hook = typeof id === 'string' ? getHook(id) : null;
      if (!hook) { notify(`UNKNOWN DESTINATION: ${id}`); return false; }
      const reason = blocked();
      if (reason) { notify(reason); return false; }
      pending = true;
      try {
        // Cold start is preparation AND the requested action, never either/or.
        if (!ready() && !(await ensureReady())) { notify('TEST RUN COULD NOT BE PREPARED'); return false; }
        if (!ready()) { notify('BUILDING IS NOT READY'); return false; }
        const blockedNow = blocked();
        if (blockedNow) { notify(blockedNow); return false; }
        const point = resolve(hook);
        if (!point) { notify(`INVALID AUTHORED DESTINATION: ${id}`); return false; }
        return commit(hook, point, id) !== false;
      } catch (error) {
        notify(`WARP FAILED: ${error?.message || error}`);
        return false;
      } finally { pending = false; }
    },
  };
}
