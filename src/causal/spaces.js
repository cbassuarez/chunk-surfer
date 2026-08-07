const requireFunction = (adapter, name) => {
  if (typeof adapter?.[name] !== 'function') throw new Error(`causal space ${adapter?.id || '<unknown>'} missing ${name}()`);
};

export function defineCausalSpaceAdapter(adapter = {}) {
  if (typeof adapter.id !== 'string' || !adapter.id) throw new Error('causal space requires an id');
  for (const name of ['containsFrame', 'enter', 'exit', 'canMove', 'describePosition', 'seams', 'renderContext']) {
    requireFunction(adapter, name);
  }
  return Object.freeze({
    ...adapter,
    anchorSpaceKey: typeof adapter.anchorSpaceKey === 'string' && adapter.anchorSpaceKey
      ? adapter.anchorSpaceKey
      : adapter.id,
  });
}

export function causalSpaceFor(adapters = [], frame = null, fallbackId = 'conservatory') {
  return adapters.find((adapter) => adapter.containsFrame(frame))
    || adapters.find((adapter) => adapter.id === fallbackId)
    || adapters[0]
    || null;
}

export function makeGeometryCausalSpaceAdapter({ id, geometry, onEnter = () => {}, onExit = () => {}, seams = () => [] } = {}) {
  if (!geometry) throw new Error(`causal space ${id || '<unknown>'} requires geometry`);
  return defineCausalSpaceAdapter({
    id,
    containsFrame: (frame) => String(frame?.spaceId || 'conservatory') === id,
    enter: onEnter,
    exit: onExit,
    canMove: (current, next) => geometry.canStep(current.x, current.y, next.x, next.y, { keys: new Set() }).ok,
    describePosition: (position) => {
      const physical = geometry.logicalToPhysical(position.x, position.y);
      return {
        ...position,
        floorH: physical.y,
        roomId: geometry.worldAt?.(position.x, position.y) || id,
        renderGroup: physical.renderGroup || id,
        spaceId: id,
      };
    },
    seams,
    renderContext: (position) => geometry.renderPlanFor?.(position.x, position.y) || null,
    anchorSpaceKey: id,
  });
}
