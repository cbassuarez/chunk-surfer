// Lightweight cell-space hit testing for canvas/VFD scenes.
//
// Scenes rebuild these from their render coordinates every frame so the visual
// row and clickable row cannot drift apart. This module is deliberately
// input-only: it does not draw hit-test borders. Selection/hover visuals belong
// to the individual menu skins.

function finiteNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function createHitRegions() {
  let regions = [];
  let hoveredId = null;

  function reset() {
    regions = [];
  }

  function add(region) {
    if (!region) return null;

    const normalized = {
      id: String(region.id || ''),
      kind: region.kind || 'button',
      x: finiteNumber(region.x, 0),
      y: finiteNumber(region.y, 0),
      w: Math.max(0, finiteNumber(region.w, 0)),
      h: Math.max(0, finiteNumber(region.h, 1)),
      disabled: !!region.disabled,
      selected: !!region.selected,
      danger: !!region.danger,
      label: region.label || '',
      data: region.data || null,
      onHover: region.onHover,
      onPress: region.onPress,
      onRelease: region.onRelease,
      onClick: region.onClick,
    };

    regions.push(normalized);
    return normalized;
  }

  function hit(cellX, cellY, filter = () => true) {
    const x = Number(cellX);
    const y = Number(cellY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (!filter(r)) continue;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    return null;
  }

  function handle(event, {
    hover = true,
    press = true,
    click = true,
    filter = () => true,
  } = {}) {
    const r = hit(event?.cellX, event?.cellY, filter);
    if (event?.type === 'pointermove') hoveredId = r?.id || null;

    if (!r) return { handled: true, hit: null };
    if (r.disabled) return { handled: true, hit: r };

    if (event.type === 'pointermove' && hover) r.onHover?.(r, event);
    if (event.type === 'pointerdown' && press) {
      hoveredId = r.id;
      r.onPress?.(r, event);
      if (click) r.onClick?.(r, event);
    }
    if (event.type === 'pointerup') r.onRelease?.(r, event);

    return { handled: true, hit: r };
  }

  function isHovered(regionOrId) {
    const id = typeof regionOrId === 'string' ? regionOrId : regionOrId?.id;
    return !!id && hoveredId === id;
  }

  function list() {
    return regions.slice();
  }

  function view() {
    return regions.map(({ id, kind, x, y, w, h, disabled, selected, danger, label }) => (
      { id, kind, x, y, w, h, disabled, selected, danger, label }
    ));
  }

  return { reset, add, hit, handle, list, view, isHovered, hoveredId: () => hoveredId };
}

export function hitRegionDebugEnabled() {
  return false;
}

// Compatibility no-ops for older scene code. Hit-test boxes are intentionally
// no longer rendered.
export function drawHitRegionFrame() {}
export function drawHitRegions() {}
