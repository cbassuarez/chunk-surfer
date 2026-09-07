// The field case's four momentary screen selectors. One source of geometry
// for rendering and pointer picking; changing screens never latches a key.
export const BAG_TABS_HEIGHT = 4.8;
export const BAG_TAB_CAP_HEIGHT = 2.5;

export const BAG_TAB_MATERIALS = Object.freeze({
  kit: Object.freeze({ label: 'INVENTORY', color: 'amber' }),
  map: Object.freeze({ label: 'MAP', color: 'blue' }),
  sheets: Object.freeze({ label: 'SHEETS', color: 'red' }),
  skills: Object.freeze({ label: 'SKILLS', color: 'green' }),
});

export function bagTabRegions(model, layout) {
  const strip = layout?.tabs;
  if (!strip || !(strip.w > 0)) return [];
  const sections = (model?.sections || []).filter(section => BAG_TAB_MATERIALS[section.id]);
  if (!sections.length) return [];
  const gap = strip.w >= 68 ? 1.5 : .65;
  const width = Math.min(19, Math.max(0, (strip.w - gap * (sections.length - 1)) / sections.length));
  const total = width * sections.length + gap * (sections.length - 1);
  const x = strip.x + (strip.w - total) / 2;
  return sections.map((section, index) => {
    const material = BAG_TAB_MATERIALS[section.id];
    const left = x + index * (width + gap);
    return {
      id: `bag:tab:${section.id}`,
      controlId: `bag:tab:${section.id}`,
      sectionId: section.id,
      label: material.label,
      color: material.color,
      countLabel: String(section.countLabel ?? ''),
      x: left, y: strip.y, w: width, h: BAG_TAB_CAP_HEIGHT,
      readout: { x: left + .2, y: strip.y + 2.65, w: Math.max(0, width - .4), h: 1 },
    };
  });
}

export function bagTabButtonState(tab, activeSection) {
  const active = tab.sectionId === activeSection;
  return {
    legend: tab.label,
    color: tab.color,
    controlId: tab.controlId,
    lit: active,
    selected: active,
    latched: false,
    enabled: true,
  };
}
