// Query-driven system laboratory: ?hushaudiolab=1

import { uiCenter, uiScrim, uiSize, uiText } from '../render/ui.js';
import { drawMachinePanel, drawVfdMeter } from '../render/presentation.js';
import { monitorSnapshotForRms } from '../audio/monitor.js';
import { propagateNoise, isAudibleToHush } from '../audio/acoustic-propagation.js';
import { freshHushAudition, ingestHeardNoise, tickHushAudition } from './hush-audition.js';
import { applyFieldPresentationPolicy, computeHushField, effectiveTorchScale } from './hush-field.js';
import { chooseHushIntent } from './hush-director.js';
import { hushAudioPolicyForDifficulty } from './hush-sensory-policy.js';
import { HUSH_AUDIO_CASES } from './hush-audio-fixtures.js';

const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '--';

export function makeHushAudioLabScene({ playCue = null, applyField = null, resetField = null } = {}) {
  let index = 0;
  let audition = null;
  let propagation = null;
  let field = null;
  let intent = { kind: 'IGNORE' };
  let lastAt = 0;
  let hushDistanceDelta = 0;
  let doorClosed = false;
  let reducedEffects = false;
  let monitorGainIndex = 2;
  let pressureOverride = null;
  const MONITOR_GAINS = [.25, .5, 1];
  const PRESSURES = ['reduced', 'standard', 'severe', 'dead-air'];
  const current = () => HUSH_AUDIO_CASES[index];
  const pressure = () => pressureOverride || current().pressure;
  const monitorGain = () => MONITOR_GAINS[monitorGainIndex];
  const labSettings = () => ({
    ...(current().settings || {}),
    ...(reducedEffects ? {
      hushAudioDistortion: 'reduced',
      hushSilence: 'reduced',
      hushHiss: 'reduced',
      hushLightFlicker: 'reduced',
      hushSuddenCuts: 'softened',
    } : {}),
  });
  const hushPosition = () => {
    const c = current();
    const dx = c.hush.x - c.player.x, dy = c.hush.y - c.player.y;
    const distance = Math.hypot(dx, dy) || 1;
    const next = Math.max(.1, distance + hushDistanceDelta);
    return { ...c.hush, x: c.player.x + dx / distance * next, y: c.player.y + dy / distance * next };
  };
  const occlusion = () => (current().occlusionDb || 0) + (doorClosed ? 12 : 0);

  function rebuild({ emit = false } = {}) {
    const c = current();
    const difficulty = { values: { presencePressure: pressure() } };
    const policy = hushAudioPolicyForDifficulty(difficulty);
    audition = { ...freshHushAudition(policy), ...(c.seedAudition || {}) };
    propagation = c.event ? propagateNoise({
      event: c.event,
      listener: { position: hushPosition(), roomId: c.hush.roomId || 'main_b3', floorId: 'b1' },
      occlusionDb: occlusion(),
    }) : null;
    if (emit && c.event && isAudibleToHush(propagation, policy)) {
      audition = ingestHeardNoise(audition, { event: c.event, propagation, now: performance.now(), policy });
    }
    field = applyFieldPresentationPolicy(computeHushField({
      hush: { active: true, position: hushPosition(), roomId: c.hush.roomId || 'main_b3', floorId: 'b1' },
      operator: { position: c.player, roomId: 'main_b3', floorId: 'b1' },
      fieldScale: policy.fieldScale,
      occlusion: occlusion() / 24,
      now: performance.now(),
    }), labSettings());
    intent = chooseHushIntent({ audition, field, cooldowns: { mischiefReady: true }, narrative: { enabled: true, allowMischief: true }, random: () => .2 });
    lastAt = performance.now();
    applyField?.(field, { settings: labSettings(), monitorGain: monitorGain() });
  }

  rebuild();

  return {
    id: 'hush-audio-lab', blocksInput: true, blocksWorld: true, lensPreset: 'hush',
    enter() { rebuild(); },
    exit() { resetField?.(); },
    update(dt) {
      const policy = hushAudioPolicyForDifficulty({ values: { presencePressure: pressure() } });
      audition = tickHushAudition(audition, dt, policy);
      field = applyFieldPresentationPolicy(computeHushField({
        hush: { active: true, position: hushPosition(), roomId: current().hush.roomId || 'main_b3', floorId: 'b1' },
        operator: { position: current().player, roomId: 'main_b3', floorId: 'b1' },
        fieldScale: policy.fieldScale,
        occlusion: occlusion() / 24,
        now: performance.now(),
      }), labSettings());
      intent = chooseHushIntent({ audition, field, cooldowns: { mischiefReady: true }, narrative: { enabled: true, allowMischief: true }, random: () => .2 });
      applyField?.(field, { settings: labSettings(), monitorGain: monitorGain() });
    },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      if (k === 'c') { index = (index + (e.shiftKey ? -1 : 1) + HUSH_AUDIO_CASES.length) % HUSH_AUDIO_CASES.length; hushDistanceDelta = 0; doorClosed = false; pressureOverride = null; rebuild(); return true; }
      if (k === 'r') { hushDistanceDelta = 0; doorClosed = false; reducedEffects = false; monitorGainIndex = 2; pressureOverride = null; rebuild(); return true; }
      if (k === 'h') { hushDistanceDelta += e.shiftKey ? 3 : -3; rebuild(); return true; }
      if (k === 'd') { doorClosed = !doorClosed; rebuild(); return true; }
      if (k === 'g') { monitorGainIndex = (monitorGainIndex + 1) % MONITOR_GAINS.length; rebuild(); return true; }
      if (k === 'a') { reducedEffects = !reducedEffects; rebuild(); return true; }
      if (k === 'p') { const at = Math.max(0, PRESSURES.indexOf(pressure())); pressureOverride = PRESSURES[(at + 1) % PRESSURES.length]; rebuild(); return true; }
      if (k === 'f') { hushDistanceDelta = -Math.max(0, Math.hypot(current().hush.x-current().player.x,current().hush.y-current().player.y)-.35); rebuild(); return true; }
      if (e.key === ' ' || e.code === 'Space') { rebuild({ emit: true }); playCue?.(intent, field); return true; }
      if (k === 'm') { playCue?.({ kind: 'PLAY', intensity: Math.max(.4, audition.interest) }, field); return true; }
      if (e.key === 'Escape') return false;
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiScrim(1);
      const w = Math.min(92, cols - 4), h = Math.min(27, rows - 2);
      const x = Math.floor((cols - w) / 2), y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        theme: 'green', wordmark: 'AUDIOCORP', label: 'HUSH AUDIO LAB', source: current().id.toUpperCase(),
        footer: '[C] CASE · [H] DIST · [D] DOOR · [G] GAIN · [P] PRESSURE · [A] FX · [R] RESET', meter: false,
      });
      const left = body.x, top = body.y + 1;
      const col = Math.floor(body.w / 2);
      uiText(left, body.y, current().label, 'ui-primary');
      uiText(left, top + 1, `EVENT          ${current().event?.kind || 'NONE'}`, 'ui-secondary');
      uiText(left, top + 2, `SOURCE LEVEL   ${current().event ? fmt(current().event.acoustic.levelDb, 1) + ' dB' : '--'}`, 'ui-secondary');
      uiText(left, top + 3, `PATH LOSS      ${propagation ? fmt(propagation.totalLossDb, 1) + ' dB' : '--'}`, 'ui-secondary');
      uiText(left, top + 4, `EFFECTIVE      ${propagation ? fmt(propagation.effectiveLevelDb, 1) + ' dB' : '--'}`, 'ui-secondary');
      uiText(left, top + 5, `HEARD          ${propagation ? (isAudibleToHush(propagation, hushAudioPolicyForDifficulty({ values: { presencePressure: pressure() } })) ? 'YES' : 'NO') : '--'}`, propagation && isAudibleToHush(propagation, hushAudioPolicyForDifficulty({ values: { presencePressure: pressure() } })) ? 'ui-danger' : 'ui-secondary');
      uiText(left, top + 7, `INTEREST       ${fmt(audition.interest)}`, 'ui-amber');
      drawVfdMeter(left + 15, top + 7, 14, monitorSnapshotForRms(audition.interest), { theme: 'amber' });
      uiText(left, top + 8, `CERTAINTY      ${fmt(audition.certainty)}`, 'ui-blue');
      drawVfdMeter(left + 15, top + 8, 14, monitorSnapshotForRms(audition.certainty), { theme: 'green' });
      uiText(left, top + 9, `AGITATION      ${fmt(audition.agitation)}`, 'ui-danger');
      uiText(left, top + 10, `PLAYFULNESS    ${fmt(audition.playfulness)}`, 'ui-secondary');

      const right = left + col + 2;
      uiText(right, top + 1, `INTENT         ${intent.kind}`, intent.kind === 'PLAY' ? 'ui-amber' : 'ui-primary');
      uiText(right, top + 2, `FIELD STAGE    ${String(field.stage || 'none').toUpperCase()}`, 'ui-secondary');
      uiText(right, top + 3, `AUDIO ABSORB   ${fmt(field.presentation?.audio ?? field.absorption.audio)}`, 'ui-secondary');
      uiText(right, top + 4, `MONITOR ABSORB ${fmt(field.presentation?.monitor ?? field.absorption.monitor)}`, 'ui-secondary');
      uiText(right, top + 5, `LIGHT ABSORB   ${fmt(field.presentation?.light ?? field.absorption.light)}`, 'ui-secondary');
      uiText(right, top + 6, `TORCH OUTPUT   ${Math.round(effectiveTorchScale(field) * 100)}%`, effectiveTorchScale(field) < .25 ? 'ui-danger' : 'ui-amber');
      uiText(right, top + 7, `MONITOR GAIN   ${Math.round(monitorGain()*100)}% · ${pressure().toUpperCase()}`, 'ui-secondary');
      uiText(right, top + 8, `PATH STATE     ${doorClosed?'DOOR CLOSED':'OPEN'} · ${reducedEffects?'REDUCED FX':'FULL FX'}`, 'ui-secondary');
      uiText(right, top + 10, 'THE PLAYER MAKES SOUND.', 'ui-label');
      uiText(right, top + 11, 'THE HUSH HEARS THE BUILDING.', 'ui-label');
      uiText(right, top + 12, 'THE OPERATOR HEARS THE HUSH', 'ui-label');
      uiText(right, top + 13, 'THROUGH MONITOR GAIN.', 'ui-label');
      uiCenter(body.y + body.h - 1, `LAST RESET ${Math.round(performance.now() - lastAt)} ms`, 'ui-secondary', .72);
    },
    debugState() { return { case: current(), audition, propagation, field, intent, pressure: pressure(), monitorGain: monitorGain(), doorClosed, reducedEffects, hush: hushPosition() }; },
  };
}
