import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawLocationIndicator, drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { createHitRegions } from '../render/hit-regions.js';
import { UI_COLOR } from '../render/palette.js';
import {
  cycleRuleValue,
  normalizeRuleValues,
  visiblePresets,
} from '../progression/difficulty.js';
import { RULE_HELP, RULE_LABELS, VALUE_LABELS } from '../progression/difficulty-defs.js';
import { deriveUnlocks } from '../progression/unlocks.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';

// Every preset but Dead Air is open from the first run; Dead Air asks for one
// finished night of any kind. Said on the row itself rather than in a manual.
const LOCKED_SUBTITLE = 'COMPLETE ANY ENDING TO UNLOCK';

const RULE_ORDER = Object.freeze([
  'presencePressure',
  'recordingForgiveness',
  'combatAssistance',
  'navigationSignal',
  'escapeTimer',
  'torchDrain',
  'involuntaryBreath',
]);

const CUSTOM_PRESET = Object.freeze({
  id: 'custom',
  name: 'CUSTOM',
  subtitle: 'CUSTOM RULES',
  rank: 4,
  intended: false,
  description: 'Adjust individual difficulty settings. Story progress and most achievements are unchanged, but custom settings cannot earn the Dead Air achievement.',
});

export function makeDifficultySelectScene({
  meta,
  initialPreset = 'contract',
  initialCustomValues = null,
  onConfirm = () => {},
  onCancel = () => {},
} = {}) {
  const customUnlocked = deriveUnlocks(meta).customShift;
  const presets = [
    ...visiblePresets(meta),
    ...(customUnlocked ? [{ ...CUSTOM_PRESET, values: normalizeRuleValues(initialCustomValues || {}) }] : []),
  ];
  const requested = presets.findIndex((preset) => preset.id === initialPreset);
  const contract = presets.findIndex((preset) => preset.id === 'contract');
  let sel = requested >= 0 ? requested : Math.max(0, contract);
  let mode = 'select'; // select | custom
  let ruleSel = 0;
  let customValues = normalizeRuleValues(initialCustomValues || {});
  let t = 0;
  const hits = createHitRegions();

  const selectedPreset = () => presets[sel] || presets[0];

  function selectPreset(index, { sound = true } = {}) {
    if (index < 0 || index >= presets.length || index === sel) return false;
    sel = index;
    if (sound) AUDIO.menuMove();
    return true;
  }

  function selectRule(index, { sound = true } = {}) {
    if (index < 0 || index >= RULE_ORDER.length || index === ruleSel) return false;
    ruleSel = index;
    if (sound) AUDIO.menuMove();
    return true;
  }

  function cycleCustomRule(index, delta) {
    selectRule(index, { sound: false });
    const key = RULE_ORDER[index];
    customValues = {
      ...customValues,
      [key]: cycleRuleValue(key, customValues[key], delta),
    };
    AUDIO.menuMove();
  }

  function confirmPreset() {
    const preset = selectedPreset();
    if (!preset) return;
    if (preset.locked) {
      AUDIO.menuMove();
      return;
    }
    if (preset.id === 'custom' && mode === 'select') {
      mode = 'custom';
      ruleSel = 0;
      AUDIO.menuConfirm();
      return;
    }
    AUDIO.menuConfirm();
    scenes.pop();
    onConfirm({
      preset: preset.id,
      values: preset.id === 'custom' ? { ...customValues } : { ...preset.values },
      custom: preset.id === 'custom',
    });
  }

  return {
    id: 'difficulty-select',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); },
    update(dt) { t += dt; },

    pointer(e) {
      if (e.type === 'pointermove') hits.handle(e, { click: false });
      else if (e.type === 'pointerdown') hits.handle(e);
      return true;
    },

    key(e) {
      const k = String(e.key || '').toLowerCase();

      if (mode === 'custom') {
        if (e.key === 'ArrowUp' || k === 'w') {
          ruleSel = (ruleSel - 1 + RULE_ORDER.length) % RULE_ORDER.length;
          AUDIO.menuMove();
          return true;
        }
        if (e.key === 'ArrowDown' || k === 's') {
          ruleSel = (ruleSel + 1) % RULE_ORDER.length;
          AUDIO.menuMove();
          return true;
        }
        if (e.key === 'ArrowLeft' || k === 'a' || e.key === 'ArrowRight' || k === 'd') {
          const delta = e.key === 'ArrowLeft' || k === 'a' ? -1 : 1;
          const key = RULE_ORDER[ruleSel];
          customValues = {
            ...customValues,
            [key]: cycleRuleValue(key, customValues[key], delta),
          };
          AUDIO.menuMove();
          return true;
        }
        if (e.key === 'Enter' || e.key === ' ' || k === 'z') {
          confirmPreset();
          return true;
        }
        if (e.key === 'Escape' || k === 'b') {
          mode = 'select';
          AUDIO.menuMove();
          return true;
        }
        return true;
      }

      if (e.key === 'ArrowUp' || k === 'w') {
        sel = (sel - 1 + presets.length) % presets.length;
        AUDIO.menuMove();
        return true;
      }
      if (e.key === 'ArrowDown' || k === 's') {
        sel = (sel + 1) % presets.length;
        AUDIO.menuMove();
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ' || k === 'z') {
        confirmPreset();
        return true;
      }
      if (e.key === 'Escape' || k === 'b') {
        AUDIO.menuMove();
        scenes.pop();
        onCancel();
        return true;
      }
      return true;
    },

    render() {
      hits.reset();
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const w = Math.min(96, cols - 4);
      const detailRowsNeeded = 11 + RULE_ORDER.length * 2 + 3;
      const h = Math.min(Math.max(36, detailRowsNeeded + 7), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        wordmark: 'AUDIOCORP',
        label: mode === 'custom' ? 'CUSTOM DIFFICULTY' : 'DIFFICULTY',
        source: 'SETUP',
        footer: mode === 'custom'
          ? promptLine([{ action: 'select', label: 'RULE' }, { action: 'set', label: 'SET' }, { action: 'start', label: 'START' }, { action: 'back', label: 'DIFFICULTY' }])
          : promptLine([{ action: 'select', label: 'DIFFICULTY' }, { action: 'start', label: 'START' }, { action: 'back', label: 'BACK' }]),
        meter: true,
      });

      drawVfdText(
        body.x,
        body.y,
        mode === 'custom' ? 'CUSTOM DIFFICULTY' : 'SELECT DIFFICULTY',
        { color: UI_COLOR.amber, max: body.w },
      );
      const listW = Math.max(22, Math.floor(body.w * 0.36));
      const divider = body.x + listW + 1;
      uiLine(divider, body.y + 2, divider, body.y + body.h - 1, UI_COLOR.frame, 0.7);

      const menuY = body.y + 4;
      presets.forEach((preset, index) => {
        const on = index === sel;
        const locked = !!preset.locked;
        const rowStyle = locked ? 'ui-secondary' : on ? 'ui-amber' : 'ui-primary';
        const subStyle = locked ? 'ui-secondary' : on ? 'ui-primary' : 'ui-secondary';
        const mark = on ? '▸' : ' ';
        const lock = locked ? ' ◇' : '';
        hits.add({
          id: `difficulty:${preset.id}`,
          kind: 'difficulty-preset',
          x: body.x,
          y: menuY + index * 3 - 0.35,
          w: Math.max(1, listW - 1),
          h: 2.35,
          selected: on,
          label: preset.name,
          data: { index, preset: preset.id },
          onHover: () => { if (mode === 'select') selectPreset(index); },
          onClick: () => {
            if (mode === 'custom' && index !== sel) mode = 'select';
            selectPreset(index, { sound: false });
            confirmPreset();
          },
        });
        uiText(body.x, menuY + index * 3, `${mark} ${preset.name}${lock}`, rowStyle, locked ? 0.52 : 1);
        uiText(
          body.x + 3,
          menuY + index * 3 + 1,
          // A locked row has to say what unlocks it. It read just 'LOCKED', and
          // pressing it only plays a bump — so Dead Air was a visible dead end
          // with no stated way in, which is the one thing showing it was for.
          locked ? LOCKED_SUBTITLE : preset.subtitle,
          subStyle,
          locked ? 0.42 : on ? 0.9 : 0.55,
        );
      });

      const preset = selectedPreset();
      const detailX = divider + 3;
      const detailW = body.x + body.w - detailX;
      const values = preset.id === 'custom' ? customValues : preset.values;
      const danger = preset.id === 'dead-air';
      const locked = !!preset.locked;
      uiText(detailX, body.y + 3, `${preset.name} / ${locked ? 'LOCKED' : preset.subtitle}`, locked ? 'ui-secondary' : danger ? 'ui-danger' : 'ui-amber', locked ? 0.6 : 1);
      if (locked) uiText(detailX, body.y + 4, 'COMPLETE THE STORY ONCE TO UNLOCK.', 'ui-blue', 0.78);
      else if (preset.intended) uiText(detailX, body.y + 4, 'RECOMMENDED FOR A FIRST PLAYTHROUGH.', 'ui-blue');
      else if (preset.id === 'custom') uiText(detailX, body.y + 4, 'CUSTOM SETTINGS CANNOT EARN THE DEAD AIR ACHIEVEMENT.', 'ui-blue');
      const explanation = mode === 'custom'
        ? RULE_HELP[RULE_ORDER[ruleSel]] || preset.description
        : locked ? `${preset.description} Complete the story once to unlock this preset.` : preset.description;
      uiWrap(explanation, detailW).slice(0, 3).forEach((line, i) =>
        uiText(detailX, body.y + 6 + i, line, locked ? 'ui-secondary' : 'ui-primary', locked ? 0.58 : 1));

      let ry = body.y + 11;
      for (let index = 0; index < RULE_ORDER.length; index++) {
        const key = RULE_ORDER[index];
        const active = mode === 'custom' && index === ruleSel;
        const label = RULE_LABELS[key];
        const value = VALUE_LABELS[values[key]] || String(values[key]).toUpperCase();
        uiText(detailX, ry, `${active ? '▸' : ' '} ${label}`.slice(0, 25), active ? 'ui-amber' : 'ui-secondary', locked ? 0.42 : 1);
        const vx = detailX + Math.max(26, Math.floor(detailW * 0.56));
        const rendered = active ? `◀ ${value} ▶` : value;
        if (mode === 'custom') {
          hits.add({
            id: `difficulty-rule:${key}`,
            kind: 'difficulty-rule',
            x: detailX,
            y: ry - 0.35,
            w: Math.max(1, detailW),
            h: 1.4,
            selected: active,
            label,
            data: { index, key },
            onHover: () => selectRule(index),
            onClick: (_, event) => cycleCustomRule(index, Number(event?.cellX) < vx ? -1 : 1),
          });
        }
        uiText(vx, ry, rendered.slice(0, Math.max(1, detailX + detailW - vx)), locked ? 'ui-secondary' : danger ? 'ui-danger' : active ? 'ui-amber' : 'ui-blue', locked ? 0.46 : 1);
        ry += 2;
      }

      const p = presets.length <= 1 ? 1 : sel / (presets.length - 1);
      drawLocationIndicator(detailX, Math.min(body.y + body.h - 2, ry), Math.max(10, detailW - 2), p, {
        theme: danger ? 'amber' : 'green',
      });
      if (preset.locked) {
        uiCenter(y + h - 3, 'LOCKED · COMPLETE THE STORY ONCE TO UNLOCK DEAD AIR', 'ui-secondary');
      } else if (danger && Math.floor(t * 3) % 2 === 0) {
        uiCenter(y + h - 3, 'MAKING THE GAME EASIER WILL DISABLE THE DEAD AIR ACHIEVEMENT FOR THIS RUN', 'ui-danger');
      }
    },

    view() {
      return {
        mode,
        selected: selectedPreset()?.id || null,
        selectedRule: mode === 'custom' ? RULE_ORDER[ruleSel] : null,
        hitRegions: hits.view(),
      };
    },
  };
}
