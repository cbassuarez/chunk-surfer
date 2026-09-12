// A physical shelf with a contextual fitting strip, not an equipment dashboard.
import { uiDraw, uiCellMetrics } from './ui.js';
import { drawPrintedText } from './keycap.js';
import { drawLampButton } from './presentation.js';
import { drawHardwareScrew } from './hardware-faceplate.js';
import { drawRecorderInstrument } from './recorder-instrument.js';
import { fitLines } from './fit-text.js';
import { FIELD_KIT_OPTIONS, normalizeFieldKit, fieldKitEffects, fieldKitOptionAvailability } from '../game/field-kit.js';
import { vanWorkbenchModelIds, vanWorkbenchSelectedObject } from './van-workbench-stage.js';
import { vanKitModel } from '../data/van-kit-models.js';

export const VAN_WORKBENCH_GROUPS = Object.freeze([
  { id: 'headphones', label: 'HEADPHONES', color: 'amber' },
  { id: 'microphone', label: 'MICROPHONE', color: 'blue' },
  { id: 'recorder', label: 'AMP', color: 'red' },
  { id: 'faceplate', label: 'FACEPLATE', color: 'white', cosmetic: true },
  { id: 'buttons', label: 'BUTTONS', color: 'green', cosmetic: true },
  { id: 'vfd', label: 'PHOSPHOR', color: 'blue', cosmetic: true },
  { id: 'flashlight', label: 'FLASHLIGHT', color: 'amber' },
  { id: 'flashlightHousing', label: 'SHELL', color: 'green', cosmetic: true },
]);
export const VAN_PACKING_GROUPS = Object.freeze(['headphones', 'microphone', 'recorder', 'flashlight']);
export function vanWorkbenchOptionStatus(state, group, id) {
  return fieldKitOptionAvailability(state?.fieldKit, group, id, state?.cosmeticMeta);
}
export function vanWorkbenchOptions(group, state = null) {
  const options = FIELD_KIT_OPTIONS[group] || FIELD_KIT_OPTIONS.cosmetics[group] || [];
  return state ? options.filter(option => vanWorkbenchOptionStatus(state, group, option.id).visible) : options;
}
export function vanWorkbenchSelection(kit, group) { return kit[group] || kit.cosmetics?.[group]; }
export function vanWorkbenchReady(state = {}) { return vanWorkbenchRemaining(state).length === 0; }
export function vanWorkbenchRemaining(state = {}) {
  return [!state.bagTaken && 'take the field case', !state.mapTaken && 'take the survey indicator',
    !state.difficultyConfirmed && 'choose your shift',
    ...(state.requirePacking ? VAN_PACKING_GROUPS.filter(group => !state.packedGroups?.includes(group))
      .map(group => `pack ${group === 'recorder' ? 'an amp' : group === 'microphone' ? 'a microphone' : group === 'flashlight' ? 'a flashlight' : 'headphones'}`) : [])].filter(Boolean);
}
export function vanWorkbenchEffectRows(kit) {
  const effects = fieldKitEffects(kit);
  if (Object.values(effects).every(value => value === 1)) return ['REFERENCE SIGNAL PATH / NO MODIFIERS'];
  const delta = value => { const n = Math.round((value - 1) * 100); return `${n > 0 ? '+' : ''}${n}%`; };
  return [`MONITOR ${delta(effects.monitorGainScale)} / OUTSIDE ${delta(effects.surroundingGainScale)}`,
    `NOISE ${delta(effects.recordingNoiseScale)} / TAKE TIME ${delta(effects.takeDurationScale)}`,
    `OVERLOAD ${delta(effects.spoilToleranceScale)} / AMP CELL ${delta(effects.torchDrainScale)}`,
    `BEAM ${delta(effects.flashlightReachScale)} / LIGHT CELL ${delta(effects.flashlightDrainScale)}`];
}
const region = (id, kind, rect, extra = {}) => ({ ...rect, id, kind, ...extra });
export function vanWorkbenchLayout(size = {}, state = {}, selectedGroup = 'headphones', targets = {}) {
  const cols = Math.max(40, Number(size.cols) || 150), rows = Math.max(16, Number(size.rows) || 38);
  const compact = cols < 110 || rows < 28, margin = compact ? .65 : 1.3;
  const outer = { x: margin, y: .55, w: cols - margin * 2, h: rows - 1.1 };
  const footerY = rows - 2.5, filmY = footerY - 2.45;
  const stage = { x: outer.x, y: 2.1, w: outer.w * .675, h: filmY - 2.5 };
  const fittings = { x: stage.x + stage.w + .65, y: 2.1, w: outer.w - stage.w - .65, h: filmY - 2.5 };
  const selectedObject = vanWorkbenchSelectedObject(selectedGroup), showRecorder = selectedObject === 'recorder';
  const options = vanWorkbenchOptions(selectedGroup, state);
  const optionH = compact ? 1.02 : 1.42, optionGap = compact ? .19 : .28;
  // Four finish plates must leave room to explain a locked WITNESS preview.
  // Only the exceptionally short fallback frame needs a two-column bank.
  const variantColumns = options.length > 3 && rows < 20 ? 2 : 1;
  const optionRows = Math.ceil(options.length / variantColumns);
  const bankH = optionRows * optionH + Math.max(0, optionRows - 1) * optionGap;
  const previewBudget = options.length > 3 ? Math.max(1.1, fittings.h - 1.5 - .8 - bankH - .45 - 1.75 - 1.1) : Infinity;
  const preview = { x: fittings.x + .65, y: fittings.y + 1.5, w: fittings.w - 1.3,
    h: Math.min(fittings.h * .39, compact ? 3 : 9.2, previewBudget) };
  const metrics = uiCellMetrics(), aspect = 736 / 405;
  const previewH = Math.min(preview.h, preview.w * metrics.cellW / (aspect * metrics.cellH));
  const recorder = { x: preview.x + (preview.w - previewH * aspect * metrics.cellH / metrics.cellW) / 2,
    y: preview.y, w: previewH * aspect * metrics.cellH / metrics.cellW, h: previewH };
  const optionY = preview.y + preview.h + .8;
  const variantGapX = .45, variantW = (fittings.w - 1.6 - variantGapX * (variantColumns - 1)) / variantColumns;
  const variants = options.map((option, index) => {
    const availability = vanWorkbenchOptionStatus(state, selectedGroup, option.id), witness = selectedGroup === 'faceplate' && option.id === 'witness';
    return { ...option, availability,
      x: fittings.x + .8 + (index % variantColumns) * (variantW + variantGapX),
      y: optionY + Math.floor(index / variantColumns) * (optionH + optionGap), w: variantW, h: optionH,
      kind: 'kit', group: selectedGroup, optionId: option.id, id: `van:kit:${selectedGroup}:${option.id}`,
      controlId: `van:kit:${selectedGroup}:${option.id}`,
      // A locked edition is a focusable inspection, not a disabled mystery.
      enabled: witness ? availability.visible : !!state.bagTaken,
      fittable: !!state.bagTaken && availability.available,
      locked: !availability.available,
      displayLabel: witness && !availability.owned ? `WITNESS · ${availability.count}/${availability.required}` : option.label };
  });
  const descriptionY = optionY + bankH + .45;
  const description = { x: fittings.x + .9, y: descriptionY, w: fittings.w - 1.8,
    h: Math.max(.65, fittings.y + fittings.h - descriptionY - 1.1) };
  const groupGap = compact ? .3 : .55, groupW = (outer.w - 1.8 - groupGap * (VAN_WORKBENCH_GROUPS.length - 1)) / VAN_WORKBENCH_GROUPS.length;
  const groups = VAN_WORKBENCH_GROUPS.map((group, index) => ({ ...group,
    x: outer.x + .9 + index * (groupW + groupGap), y: filmY + .25, w: groupW, h: 1.45,
    kind: 'group', controlId: `van:group:${group.id}`, id: `van:group:${group.id}`, group: group.id }));
  const labelY = stage.y + stage.h - 1.05;
  const caseRect = { x: stage.x + .8, y: labelY, w: stage.w * .43, h: .9 };
  const mapRect = { x: stage.x + stage.w * .51, y: labelY, w: stage.w * .31, h: .9 };
  const difficulty = targets.difficulty || { x: stage.x + stage.w * .75, y: stage.y + .8, w: stage.w * .19, h: stage.h * .19 };
  const close = region('van:close', 'close', { x: outer.x + 1, y: footerY + .15, w: compact ? 9 : 12, h: 1.5 }, { controlId: 'van:close', enabled: true });
  const continueRegion = region('van:continue', 'continue', { x: outer.x + outer.w - (compact ? 22.5 : 28), y: footerY + .15,
    w: compact ? 21.5 : 27, h: 1.5 }, { controlId: 'van:continue', enabled: vanWorkbenchReady(state) });
  const ids = vanWorkbenchModelIds(normalizeFieldKit(state.fieldKit));
  const catalogTargets = Object.entries(targets).filter(([, target]) => target?.kind === 'variant' && target.w > 0 && target.h > 0);
  const physicalVariants = catalogTargets.flatMap(([key, target]) => {
    const availability = vanWorkbenchOptionStatus(state, target.group, target.optionId);
    if (!availability.visible) return [];
    const witness = target.group === 'faceplate' && target.optionId === 'witness';
    return [region(`van:object:${key}`, 'kit', target, { group: target.group, optionId: target.optionId,
      item: target.modelId, packed: !!target.packed, object: true,
      enabled: witness ? availability.visible : !!state.bagTaken, locked: !availability.available,
      fittable: !!state.bagTaken && availability.available })];
  });
  const objectRegions = ['headphones', 'microphone', 'recorder', 'flashlight'].flatMap(slot => targets[slot]?.w > 0 && targets[slot]?.kind !== 'inspect' &&
    !catalogTargets.some(([, target]) => target.group === slot) ? [
    region(`van:object:${slot}`, 'group', targets[slot], { group: slot, item: ids[slot], enabled: true })] : []);
  const inspectW = compact ? 5 : 6.2;
  const inspectMap = region('van:inspect:map', 'inspect', { x: stage.x + stage.w - inspectW - .5,
    y: labelY, w: inspectW, h: .9 }, { item: 'map', enabled: true });
  const inspectRecorder = region('van:inspect:recorder', 'inspect', { x: fittings.x + .9, y: fittings.y + fittings.h - .82,
    w: fittings.w - 1.8, h: .75 }, { item: 'recorder', enabled: !!state.bagTaken });
  const selectedInspect = selectedObject !== 'recorder' ? region(`van:inspect:${ids[selectedObject]}`, 'inspect', inspectRecorder,
    { item: ids[selectedObject], enabled: true }) : null;
  if (!showRecorder) Object.assign(inspectRecorder, { x: stage.x + .8, y: labelY - 1.05, w: stage.w * .30, h: .8 });
  const witness = vanWorkbenchOptionStatus(state, 'faceplate', 'witness');
  const witnessFitted = state.fieldKit?.cosmetics?.faceplate === 'witness';
  const witnessInspect = witness.owned && !witnessFitted && targets.witness?.w > 0 && targets.witness?.h > 0
    && !catalogTargets.some(([, target]) => target.group === 'faceplate' && target.optionId === 'witness')
    ? region('van:inspect:witness', 'inspect-witness', targets.witness, { item: 'witness', enabled: true, object: true }) : null;
  const spanner = region('van:spanner', state.spannerTaken ? 'inspect' : 'spanner',
    targets.spanner || { x: stage.x + stage.w * .55, y: labelY - 1.05, w: stage.w * .3, h: .8 },
    { item: 'plant-spanner', enabled: true, object: !!targets.spanner });
  const regions = [
    ...(targets.case ? [region('van:object:case', 'case', targets.case, { enabled: !state.bagTaken })] : []), ...objectRegions,
    ...(targets.map ? [region('van:object:map', 'map', targets.map, { enabled: !state.mapTaken })] : []),
    ...(targets.recorder?.kind === 'inspect' ? [region('van:object:recorder', 'inspect', targets.recorder,
      { item: 'recorder', enabled: true, object: true })] : []),
    ...['radio', 'light'].flatMap(slot => targets[slot]?.w > 0 && !(slot === 'light' && catalogTargets.some(([, target]) => target.group === 'flashlight'))
      ? [region(`van:object:${slot}`, 'inspect', targets[slot], { item: slot, enabled: true, object: true })] : []),
    ...physicalVariants, spanner,
    region('van:case', 'case', caseRect, { enabled: !state.bagTaken }), region('van:map', 'map', mapRect, { enabled: !state.mapTaken }),
    region('van:difficulty', 'difficulty', difficulty, { enabled: true }), ...groups, ...variants, inspectMap, inspectRecorder,
    ...(selectedInspect ? [selectedInspect] : []),
    region('van:inspect:field-case', 'inspect', { x: caseRect.x + caseRect.w - 4.2, y: caseRect.y - 1.05, w: 4.2, h: .8 }, { item: 'field-case', enabled: true }),
    ...(witnessInspect ? [witnessInspect] : []), close, continueRegion,
  ];
  const promptW = Math.min(62, cols - 6), promptH = compact ? 7.6 : 8.4;
  const spannerPrompt = state.spannerPrompt ? { x: (cols - promptW) / 2, y: (rows - promptH) / 2, w: promptW, h: promptH } : null;
  const spannerChoices = spannerPrompt ? ['yes', 'no'].map((answer, index) => region(`van:spanner:${answer}`, 'spanner-choice',
    { x: spannerPrompt.x + 2 + index * (promptW / 2 - .5), y: spannerPrompt.y + promptH - 2.3,
      w: promptW / 2 - 3.5, h: 1.45 }, { answer: answer === 'yes', controlId: `van:spanner:${answer}`, enabled: true })) : [];
  return { size: { cols, rows }, outer, stage, compact, caseRect, mapRect, difficulty, fittings, preview, recorder,
    showRecorder, selectedObject, groups, variants, variantColumns, witness, witnessFitted, witnessInspect,
    description, filmY, footerY, continueRegion, close, spanner, spannerPrompt, spannerChoices,
    regions: spannerPrompt ? spannerChoices : regions };
}
const plateText = (x, y, value, w, options = {}) => drawPrintedText(x, y, value,
  { w, h: .72, ink: '#d6d0b9', ...options });
function drawBacking(layout) {
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    ctx.fillStyle = '#111b1b'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const x = layout.fittings.x * cellW * dpr, y = layout.fittings.y * cellH * dpr;
    const w = layout.fittings.w * cellW * dpr, h = layout.fittings.h * cellH * dpr;
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, '#4a5148'); gradient.addColorStop(.35, '#343e37'); gradient.addColorStop(1, '#202b28');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(x, y, w, h, 5 * dpr); ctx.fill();
    ctx.strokeStyle = '#aeb5a055'; ctx.lineWidth = dpr; ctx.stroke();
    for (const [sx, sy] of [[x + 7 * dpr, y + 7 * dpr], [x + w - 7 * dpr, y + 7 * dpr],
      [x + 7 * dpr, y + h - 7 * dpr], [x + w - 7 * dpr, y + h - 7 * dpr]]) drawHardwareScrew(ctx, sx, sy, 2.6 * dpr, { dpr, seed: `${sx}:${sy}` });
    const fy = layout.filmY * cellH * dpr; ctx.fillStyle = '#354038';
    ctx.fillRect(layout.outer.x * cellW * dpr, fy, layout.outer.w * cellW * dpr, 2 * cellH * dpr);
    ctx.strokeStyle = '#86928366'; ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(ctx.canvas.width, fy); ctx.stroke();
  });
}
function tag(rect, text, color, focus) {
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const x = rect.x * cellW * dpr, y = rect.y * cellH * dpr, w = rect.w * cellW * dpr, h = rect.h * cellH * dpr;
    ctx.fillStyle = focus ? '#363d32eb' : '#151e1ade'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = focus ? '#d2bd87' : '#a9b09855'; ctx.lineWidth = .7 * dpr; ctx.strokeRect(x, y, w, h);
  });
  plateText(rect.x + .35, rect.y + .09, text, rect.w - .7, { h: Math.min(.68, rect.h - .1), ink: color });
}
export function drawVanWorkbench(view = {}, size = {}, stageRenderer = null) {
  const state = { ...view.state, fieldKit: normalizeFieldKit(view.state?.fieldKit) };
  const group = VAN_WORKBENCH_GROUPS.find(entry => entry.id === view.selectedGroup) || VAN_WORKBENCH_GROUPS[0];
  let layout = vanWorkbenchLayout(size, state, group.id); const kit = state.fieldKit;
  const witnessFocused = ['van:kit:faceplate:witness', 'van:inspect:witness', 'van:object:witness',
    'van:object:variant:faceplate:witness'].includes(view.focusId);
  drawBacking(layout); stageRenderer?.draw(layout.stage, { state, selected: layout.selectedObject, selectedGroup: group.id,
    focusId: view.focusId, witnessFocused, now: view.now || 0 });
  layout = vanWorkbenchLayout(size, state, group.id, stageRenderer?.targets() || {});
  const { outer, fittings, description } = layout;
  plateText(outer.x + 1, .85, 'AUDIOCORP  /  NIGHT PREPARATION', outer.w * .55, { h: .85, ink: '#e0d7bb' });
  plateText(outer.x + outer.w * .58, .89, 'TAKE CASE · PACK EQUIPMENT · SIGN OUT', outer.w * .4, { h: .64, alpha: .75, align: 'right' });
  const status = stageRenderer?.snapshot();
  if (!status?.ready) plateText(layout.stage.x + 2, layout.stage.y + 1,
    status?.error || 'LOADING PHYSICAL EQUIPMENT…', layout.stage.w - 4, { ink: '#e3c997', h: .68 });
  const packedCount = VAN_PACKING_GROUPS.filter(groupId => state.packedGroups?.includes(groupId)).length;
  tag(layout.caseRect, state.bagTaken ? state.requirePacking ? `CASE OPEN · ${packedCount}/4 PACKED` : 'FIELD CASE · TAKEN' : 'TAKE FIELD CASE', state.bagTaken ? '#bed0a9' : '#f3da9b', view.focusId === 'van:case');
  tag(layout.mapRect, state.mapTaken ? 'MAP · TAKEN' : 'TAKE MAP', state.mapTaken ? '#bed0a9' : '#f3da9b', view.focusId === 'van:map');
  if (!layout.spanner.object) tag(layout.spanner, state.spannerTaken ? 'SPANNER · PACKED' : 'SPANNER · OPTIONAL', '#c2cebb', view.focusId === 'van:spanner');
  if (!status?.ready || view.focusId === 'van:difficulty') tag({ ...layout.difficulty, y: layout.difficulty.y + layout.difficulty.h - .8, h: .8 },
    'CHOOSE SHIFT', '#f1dfa6', view.focusId === 'van:difficulty');
  plateText(fittings.x + .9, fittings.y + .5, group.label, fittings.w - 1.8, { h: .88, ink: '#e5ddc4' });
  const previewWitness = layout.witness.visible && witnessFocused && layout.showRecorder;
  const option = vanWorkbenchOptions(group.id).find(entry => entry.id === (previewWitness ? 'witness' : vanWorkbenchSelection(kit, group.id)));
  if (layout.showRecorder) {
    const cosmetics = kit.cosmetics;
    drawRecorderInstrument({ rect: layout.recorder, mode: 'monitor', counter: '00:00', progress: 0,
      meter: { db: -96 }, source: 'WORKBENCH', label: 'FIELD RECORDER', note: 'SETUP / NO TAKE',
      finish: previewWitness ? 'witness' : cosmetics.faceplate, witnessEndings: layout.witness.endingIds,
      buttonSet: cosmetics.buttons, phosphor: cosmetics.vfd,
      buttons: { keys: [{ id: 'rec', label: 'REC' }, { id: 'stop', label: 'STOP' }, { id: 'takes', label: 'TAKES' }] } });
  } else stageRenderer?.drawDetail(layout.preview, layout.selectedObject);
  const modelName = vanKitModel(vanWorkbenchModelIds(kit)[layout.selectedObject])?.name || 'FIELD RECORDER';
  plateText(fittings.x + .9, layout.preview.y + layout.preview.h + .12,
    previewWitness ? (layout.witnessFitted ? 'WITNESS / FITTED' : layout.witness.owned ? 'WITNESS / INSPECT THEN FIT' : 'WITNESS / LOCKED PREVIEW')
      : state.bagTaken ? modelName : 'TAKE THE CASE TO FIT', fittings.w - 1.8, { h: .58, ink: '#b4c6b6' });
  for (const control of layout.variants) drawLampButton(control.x, control.y, control.w, control.h,
    { legend: control.displayLabel, color: control.optionId === 'witness' ? 'blue' : group.color, enabled: control.enabled, controlId: control.id,
      lit: vanWorkbenchSelection(kit, group.id) === control.optionId
        && (!state.requirePacking || !VAN_PACKING_GROUPS.includes(group.id) || state.packedGroups?.includes(group.id)),
      latched: false, focused: view.focusId === control.id });
  const witnessCopy = layout.witness.owned
    ? layout.witnessFitted ? 'WITNESS EDITION FITTED. APPEARANCE ONLY.' : 'INSPECT AND TURN OVER THE CLEAR ASSEMBLY. FIT FROM INSPECTION.'
    : `${layout.witness.count}/${layout.witness.required} DISTINCT ENDINGS FILED. INSPECT A PREVIEW; FIT AFTER TWO.`;
  const lines = fitLines(previewWitness ? witnessCopy : state.bagTaken ? option?.description || '' : 'Take the field case from the shelf. Then fit each component before you go.',
    Math.max(18, Math.floor(description.w * 1.75)), Math.max(1, Math.floor(description.h / .7)));
  lines.forEach((line, index) => plateText(description.x, description.y + index * .7, line, description.w,
    { h: .64, ink: '#d4d9c6' }));
  const effectLines = vanWorkbenchEffectRows(kit);
  if (description.h > lines.length * .7 + 3.1) effectLines.forEach((line, index) => plateText(description.x,
    description.y + lines.length * .7 + .8 + index * .64, line, description.w, { h: .58, ink: '#a5c9b3' }));
  for (const control of layout.groups) drawLampButton(control.x, control.y, control.w, control.h,
    { legend: control.label, color: control.color, controlId: control.id,
      lit: group.id === control.group, latched: false, focused: view.focusId === control.id });
  for (const control of layout.regions.filter(entry => entry.kind === 'inspect' && !entry.object)) {
    const label = control.id === 'van:inspect:map' ? 'INSPECT' : control.item === 'field-case' ? 'CASE' :
      control.id === 'van:inspect:recorder' && !layout.showRecorder ? 'INSPECT RECORDER' : 'INSPECT OBJECT  [I]';
    tag(control, label, '#c2cebb', view.focusId === control.id);
  }
  drawLampButton(layout.close.x, layout.close.y, layout.close.w, layout.close.h,
    { legend: 'BACK', color: 'white', controlId: layout.close.id, focused: view.focusId === layout.close.id });
  drawLampButton(layout.continueRegion.x, layout.continueRegion.y, layout.continueRegion.w, layout.continueRegion.h,
    { legend: 'TAKE THE NIGHT', color: 'green', controlId: layout.continueRegion.id,
      enabled: layout.continueRegion.enabled, lit: layout.continueRegion.enabled, focused: view.focusId === layout.continueRegion.id });
  const helpX = layout.close.x + layout.close.w + 1, helpW = layout.continueRegion.x - helpX - 1;
  const help = view.notice || (vanWorkbenchReady(state) ? '1–8 FIT · ARROWS SELECT · ENTER USE' : `FIRST: ${vanWorkbenchRemaining(state).join(' · ')}`);
  fitLines(help, Math.floor(helpW * 1.65), 2).forEach((line, index) => plateText(helpX, layout.footerY + .2 + index * .67, line, helpW,
    { h: .62, ink: '#ddd4b9' }));
  if (layout.spannerPrompt) {
    const prompt = layout.spannerPrompt;
    uiDraw(({ ctx, dpr, cellW, cellH }) => {
      ctx.fillStyle = '#07100ddd'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const x = prompt.x * cellW * dpr, y = prompt.y * cellH * dpr, w = prompt.w * cellW * dpr, h = prompt.h * cellH * dpr;
      ctx.fillStyle = '#42483b'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#c6b98a'; ctx.lineWidth = dpr; ctx.strokeRect(x, y, w, h);
      for (const dx of [8, w / dpr - 8]) for (const dy of [8, h / dpr - 8])
        drawHardwareScrew(ctx, x + dx * dpr, y + dy * dpr, 2.6 * dpr, { dpr, seed: `${dx}:${dy}` });
    });
    plateText(prompt.x + 2, prompt.y + .65, 'PLANT SPANNER  /  OPTIONAL EQUIPMENT', prompt.w - 4, { h: .85, ink: '#f0dfb4' });
    const promptLines = fitLines('Not on the work order. You probably will not need it. Take the spanner anyway?',
      Math.max(26, Math.floor((prompt.w - 4) * 1.55)), 3);
    promptLines.forEach((line, index) => plateText(prompt.x + 2, prompt.y + 2.1 + index * .85, line, prompt.w - 4,
      { h: .78, ink: '#ebe2c7' }));
    if (!state.bagTaken || view.notice) plateText(prompt.x + 2, prompt.y + prompt.h - 3.1,
      view.notice || 'TAKE THE FIELD CASE TO PACK IT.', prompt.w - 4, { h: .58, ink: '#f0c88c' });
    for (const control of layout.spannerChoices) drawLampButton(control.x, control.y, control.w, control.h,
      { legend: control.answer ? 'YES · TAKE IT' : 'NO · LEAVE IT', color: control.answer ? 'amber' : 'white',
        controlId: control.id, focused: view.focusId === control.id });
  }
  return { ...layout, previewFinish: previewWitness ? 'witness' : kit.cosmetics.faceplate,
    effects: fieldKitEffects(kit), descriptionLines: lines, effectLines };
}
