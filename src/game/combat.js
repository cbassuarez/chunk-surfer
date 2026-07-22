// Deterministic, player-paced signal combat.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiStrokeRect, uiLine } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';
import { textCps } from './access.js';
import { drawStoryArtCard, planStoryArtInPanel, planStoryArtSideBySide } from './story-art-card.js';
import { resolveStoryArt } from './story-art.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import {
  COMBAT_ACTION,
  SOURCE_CHANNEL,
  availableCombatActions,
  combatIntentLookahead,
  combatPrediction,
  combatResult,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
} from './combat-state.js';

const COL_W = 86;
const CPS = 40;
const BATTLE_GRID_LABEL = '168 BPM / 4:4 / 40 BARS';
const CHANNELS = Object.freeze([
  { id: SOURCE_CHANNEL.RESCUE, label: 'RETURN / RESCUE', glyph: '↩' },
  { id: SOURCE_CHANNEL.CONTAIN, label: 'ISOLATE / CONTAIN', glyph: '▣' },
  { id: SOURCE_CHANNEL.SUBMIT, label: 'OPEN / SUBMIT', glyph: '◇' },
]);
const textOf = (line) => String(line?.text ?? line ?? '');
const whoOf = (line) => line?.who || 'direction';

export function makeCombatScene({
  battle,
  playSound,
  fx,
  audio,
  getAudio,
  difficulty = null,
  loadout = {},
  resources = {},
  source = null,
  musicSession = null,
  onWin = () => {},
  onLose = () => {},
  onAbort = () => {},
} = {}) {
  if (!battle?.combat) throw new Error(`missing signal combat definition: ${battle?.id || 'unknown'}`);
  const voice = createSamDialogVoice({ volume: 0.26, getAudio });
  voice.warm?.();
  let state = createCombatState(battle.combat, {
    difficulty,
    injuries: loadout.injuries,
    battery: resources.battery ?? loadout.battery,
    torchDrainScale: loadout.torchDrainScale,
    tools: loadout.tools,
    techniques: loadout.techniques,
    source,
  });
  let phase = 'arrival';
  let queue = [];
  let cur = null;
  let typed = 0;
  let acc = 0;
  let held = 0;
  let handle = null;
  let onTalkEnd = () => {};
  let selected = 0;
  let notice = '';
  let takeConfirmation = false;
  let resultDelivered = false;
  let sceneEntered = false;
  let openingStarted = false;
  let musicBootResolved = !musicSession;
  let musicFinished = false;
  let actionRows = [];
  let channelRows = [];

  const movement = (index = state.movementIndex) => battle.combat.movements[index] || null;
  const stopVoice = () => { handle?.stop?.(); handle = null; };

  function speak(lines, then) {
    queue = (lines || []).filter((line) => textOf(line)).slice();
    onTalkEnd = then || (() => {});
    phase = 'talk';
    nextLine();
  }

  function nextLine() {
    stopVoice();
    audio?.stopTyping?.();
    cur = queue.shift() || null;
    typed = 0;
    acc = 0;
    held = 0;
    if (!cur) {
      musicSession?.setDialogueActive?.(false);
      onTalkEnd();
      return;
    }
    const who = whoOf(cur);
    const text = textOf(cur);
    const spoken = text && isVoiced(who) && cur.voice !== false;
    musicSession?.setDialogueActive?.(!!spoken);
    if (cur.cue) fx?.cue?.(cur.cue);
    if (spoken) handle = voice.start(text, { speaker: who, rate: cur.rate || 1 });
    else if (text) audio?.startTyping?.({ gain: TYPE_GAIN * (TYPE_LEVEL[who === 'direction' ? 'direction' : 'thought'] || 1) });
  }

  function enterMovement(index = state.movementIndex) {
    const next = movement(index);
    playSound?.({ threat: next?.threat ?? .45 + index * .1 });
    const lines = [...(next?.before || []), ...(next?.onListen || [])];
    if (lines.length) speak(lines, () => { phase = 'select'; musicSession?.setDialogueActive?.(false); });
    else { phase = 'select'; musicSession?.setDialogueActive?.(false); }
  }

  function beginOpening() {
    if (!sceneEntered || openingStarted) return;
    openingStarted = true;
    const opening = battle.intro || [];
    if (opening.length) speak(opening, () => enterMovement(0));
    else enterMovement(0);
  }

  function finishMusic() {
    if (musicFinished) return;
    musicFinished = true;
    musicSession?.setDialogueActive?.(false);
    musicSession?.finish?.();
  }

  function deliverResult() {
    if (resultDelivered) return;
    resultDelivered = true;
    const metrics = combatResult(state) || {};
    const legacyMetrics = {
      ...metrics,
      attempts: Math.max(1, Number(metrics.turns) || 1),
      failedSubmissions: Math.max(0, Number(metrics.missedCounters) || 0),
      playerHealth: metrics.composure,
      enemyHealth: 0,
    };
    speak(metrics.result === 'win' ? battle.win : battle.lose, () => {
      stopVoice();
      audio?.stopTyping?.();
      scenes.pop();
      (metrics.result === 'win' ? onWin : onLose)(legacyMetrics);
    });
  }

  function syncResourceSpend(before, after) {
    const spent = Math.max(0, Number(after.torchSpent) - Number(before.torchSpent));
    if (spent > 0) resources.spendBattery?.(spent);
  }

  function execute(actionId) {
    if (phase !== 'select') return;
    const actions = availableCombatActions(state);
    const action = actions.find((entry) => entry.id === actionId);
    if (!action?.enabled) {
      notice = action?.reason || 'ACTION UNAVAILABLE';
      audio?.menuMove?.();
      return;
    }
    const before = state;
    let next = reduceCombat(state, {
      type: actionId,
      replaceTake: actionId === COMBAT_ACTION.MONITOR && takeConfirmation,
    });
    if (next.last?.needsTakeConfirmation) {
      takeConfirmation = true;
      notice = 'TAKE SLOT OCCUPIED · CONFIRM MONITOR TO REPLACE';
      audio?.menuMove?.();
      return;
    }
    takeConfirmation = false;
    syncResourceSpend(before, next);
    state = next;
    notice = state.last?.notice || '';
    audio?.menuConfirm?.();
    selected = Math.min(selected, Math.max(0, availableCombatActions(state).length - 1));

    if (!state.result) musicSession?.onCombatEvent?.({
      perfect: state.last?.perfect === true,
      transition: state.last?.transition || null,
      movementIndex: state.movementIndex,
    });

    if (state.result) {
      finishMusic();
      const finished = movement(state.last?.transition?.from ?? state.movementIndex);
      const tail = [...(finished?.after || [])];
      if (tail.length) speak(tail, deliverResult);
      else deliverResult();
      return;
    }
    if (state.last?.transition?.to != null) {
      const old = movement(state.last.transition.from);
      const nextMovement = movement(state.last.transition.to);
      const lines = [...(old?.after || []), ...(nextMovement?.before || []), ...(nextMovement?.onListen || [])];
      playSound?.({ threat: nextMovement?.threat ?? .55 });
      if (lines.length) speak(lines, () => { phase = 'select'; });
      else phase = 'select';
    }
  }

  function cycleChannel(delta) {
    if (!state.source || phase !== 'select') return;
    const at = CHANNELS.findIndex((entry) => entry.id === state.source.armed);
    const next = CHANNELS[(at + delta + CHANNELS.length) % CHANNELS.length];
    state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: next.id });
    notice = state.last.notice;
    audio?.menuMove?.();
  }

  function moveSelection(delta) {
    const actions = availableCombatActions(state);
    if (!actions.length) return;
    selected = (selected + delta + actions.length) % actions.length;
    takeConfirmation = false;
    audio?.menuMove?.();
  }

  return {
    id: `battle:${battle.id}`,
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'battle',

    enter() {
      sceneEntered = true;
      phase = musicSession ? 'arrival' : 'talk';
      if (!musicSession) {
        beginOpening();
        return;
      }
      Promise.resolve(musicSession.start?.()).then((music) => {
        if (!sceneEntered) return;
        musicBootResolved = true;
        if (music?.phase !== 'arrival') beginOpening();
      }).catch((error) => {
        console.warn('battle music start failed', error);
        musicBootResolved = true;
        beginOpening();
      });
    },

    exit() {
      sceneEntered = false;
      stopVoice();
      audio?.stopTyping?.();
      if (!musicFinished) {
        if (state.result) finishMusic();
        else musicSession?.abort?.();
      }
      if (!resultDelivered && !state.result) onAbort();
    },

    battleView() {
      return {
        phase,
        state: JSON.parse(JSON.stringify(state)),
        intent: currentCombatIntent(state),
        lookahead: combatIntentLookahead(state),
        actions: availableCombatActions(state),
        prediction: combatPrediction(state),
        music: musicSession?.snapshot?.() || null,
        selected,
        notice,
      };
    },

    update(dt) {
      const music = musicSession?.update?.() || null;
      if (phase === 'arrival') {
        if (musicBootResolved && music?.phase !== 'arrival') beginOpening();
        return;
      }
      if (!cur || phase !== 'talk') return;
      const text = textOf(cur);
      held += dt;
      if (handle) {
        typed = handle.done() ? text.length : Math.min(text.length, handle.charsFor());
        return;
      }
      if (typed < text.length) {
        acc += dt;
        typed = Math.min(text.length, Math.floor(acc * textCps(CPS) * (cur.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
    },

    key(e) {
      if (phase === 'talk') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.controllerAction === 'confirm') {
          if (!cur) return true;
          const text = textOf(cur);
          if (typed < text.length) {
            typed = text.length;
            handle?.finish?.();
            handle = null;
            audio?.stopTyping?.();
          } else if (held >= .2) nextLine();
        }
        return true;
      }
      if (phase !== 'select') return true;
      if (e.key === 'ArrowUp' || e.key === 'w') moveSelection(-1);
      else if (e.key === 'ArrowDown' || e.key === 's') moveSelection(1);
      else if (e.key === 'ArrowLeft' || e.key === 'q') state.source ? cycleChannel(-1) : moveSelection(-1);
      else if (e.key === 'ArrowRight' || e.key === 'e') state.source ? cycleChannel(1) : moveSelection(1);
      else if (e.key === 't' || e.key === 'T') execute(COMBAT_ACTION.TUNE);
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.controllerAction === 'confirm') {
        execute(availableCombatActions(state)[selected]?.id);
      } else if (e.controllerAction === 'back') takeConfirmation = false;
      return true;
    },

    pointer(e) {
      if (phase !== 'select' || e.type !== 'pointerdown') return true;
      const x = Math.floor(Number(e.cellX));
      const y = Math.floor(Number(e.cellY));
      const channel = channelRows.find((row) => y === row.y && x >= row.x && x < row.x + row.w);
      if (channel) {
        state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: channel.id });
        notice = state.last.notice;
        audio?.menuMove?.();
        return true;
      }
      const row = actionRows.find((entry) => y === entry.y && x >= entry.x && x < entry.x + entry.w);
      if (row) {
        selected = row.index;
        execute(row.id);
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(2,2,3,0.96)');
      const w = Math.min(COL_W, cols - 4);
      const x = Math.floor((cols - w) / 2);
      const footer = phase === 'arrival'
        ? '168 BPM · LOCKING DOWNBEAT'
        : phase === 'select'
        ? state.source
          ? '[↑↓] ACTION · [←→] CHANNEL · [ENTER] CONFIRM · [T] TUNE'
          : activeInputPromptDevice() === 'controller'
            ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'ACT' }])
            : '[↑↓] SELECT · [ENTER] ACT · [T] TUNE'
        : promptLine([{ action: 'continue', label: 'CONTINUE' }]);
      const panel = drawMachinePanel(x - 2, 1, w + 4, rows - 2, {
        label: 'SIGNAL COMBAT', source: state.source ? 'SOURCE' : 'FIELD', meter: true, footer,
      });

      drawVfdText(panel.x, panel.y, battle.enemy || battle.combat.enemy, { color: UI_COLOR.danger, max: panel.w });
      const movementData = movement();
      uiText(panel.x, panel.y + 2, `COMPOSURE ${state.composure}/${state.maxComposure}`, state.composure <= 2 ? 'ui-danger' : 'ui-primary');
      const coherence = `COHERENCE ${state.movementCoherence}/${state.movementMaxCoherence}`;
      uiText(panel.x + Math.max(0, panel.w - coherence.length), panel.y + 2, coherence, 'ui-danger');
      uiLine(panel.x, panel.y + 3.2, panel.x + panel.w, panel.y + 3.2, UI_COLOR.frame, .7);

      let contentY = panel.y + 5;
      let contentX = panel.x;
      let contentW = panel.w;
      // Dialogue and movement interludes retain the authored still. Once the
      // player is choosing an action, exact intent math, Source channels, and
      // the complete action list take priority at the 1280x720 contract floor.
      const art = phase === 'select' || phase === 'arrival'
        ? null
        : resolveStoryArt(cur?.art || movementData?.art || battle.art || battle.combat.art || null);
      const sidePlan = planStoryArtSideBySide({
        art, mode: art?.mode || 'boss', panelRows: Math.max(0, panel.y + panel.h - contentY), panelCols: panel.w,
        textRowsMin: phase === 'select' ? 15 : 6, choicesRows: 0, minTextCols: phase === 'select' ? 50 : 34, bottomPadRows: 2,
      });
      if (sidePlan.show) {
        drawStoryArtCard(art, { x: panel.x, y: contentY, w: sidePlan.artCols, rows: sidePlan.rows, mode: sidePlan.mode || art.mode, lockRows: true });
        contentX = panel.x + sidePlan.artCols + sidePlan.gap;
        contentW = sidePlan.textCols;
      } else {
        const artPlan = planStoryArtInPanel({ art, mode: art?.mode || 'boss', panelRows: Math.max(0, panel.y + panel.h - contentY), textRowsMin: phase === 'select' ? 15 : 6, choicesRows: 0 });
        if (artPlan.show) {
          drawStoryArtCard(art, { x: panel.x, y: contentY, w: panel.w, rows: artPlan.rows, mode: artPlan.mode || art.mode });
          contentY += artPlan.rows + 1;
        }
      }

      if (phase === 'arrival') {
        const music = musicSession?.snapshot?.() || {};
        drawVfdText(contentX, contentY + 2, 'SIGNAL ACQUIRING', { color: UI_COLOR.amber, max: contentW });
        uiText(contentX, contentY + 5, `GRID · ${BATTLE_GRID_LABEL}`, 'ui-secondary');
        uiText(contentX, contentY + 7, music.entryVariant ? `ENTRY CIRCUIT · ${music.entryVariant}` : 'ENTRY CIRCUIT · SEARCHING', 'ui-counter');
        return;
      }

      if (phase === 'talk' && cur) {
        uiText(contentX, contentY, whoOf(cur).toUpperCase(), 'ui-label');
        const lines = uiWrap(textOf(cur).slice(0, typed), contentW);
        const limit = sidePlan.show ? Math.max(2, sidePlan.rows - 2) : Math.max(2, panel.y + panel.h - contentY - 3);
        lines.slice(0, limit).forEach((line, index) => uiText(contentX, contentY + 2 + index, line, whoOf(cur) === 'direction' ? 'ui-secondary' : 'ui-primary'));
        return;
      }

      const intent = currentCombatIntent(state);
      const ideal = intent?.kind === 'broadcast' ? 'MONITOR'
        : intent?.kind === 'conceal' ? 'EXPOSE'
          : intent?.kind === 'overload' ? 'HOLD'
            : intent?.kind === 'loop' ? 'INVERT / HOLD FALLBACK' : 'BREAK SILENCE';
      uiText(contentX, contentY, `${movementData?.title || movementData?.id || 'MOVEMENT'} · ${state.movementIndex + 1}/${battle.combat.movements.length}`, 'ui-label');
      uiText(contentX, contentY + 2, state.tempo ? 'OPEN CHANNEL · BONUS ACTION' : `INTENT · ${intent?.label || 'NONE'}`, state.tempo ? 'ui-amber' : 'ui-danger');
      if (!state.tempo && intent) {
        const response = state.difficulty.recommended ? ` · RESPONSE ${ideal}` : '';
        uiText(contentX, contentY + 3, `${intent.kind.toUpperCase()} · ${intent.damage} DAMAGE${response}`, 'ui-secondary', .78);
      }
      const lookahead = combatIntentLookahead(state);
      if ((state.tuneUsedMovement === state.movementIndex || lookahead.length > 1) && lookahead[1]) {
        uiText(contentX, contentY + 4, `NEXT · ${lookahead[1].label}`, 'ui-blue', .75);
      }
      uiText(contentX, contentY + 5, `TAKE · ${state.take ? `${state.take.label} / ${state.take.damage}` : 'EMPTY'}   BATTERY · ${Math.round(state.battery * 100)}%`, 'ui-counter', .8);

      let rowY = contentY + 7;
      channelRows = [];
      if (state.source) {
        const prediction = combatPrediction(state);
        const rescueStable = state.source.rescueEligible ? 'STABLE' : 'UNSTABLE';
        CHANNELS.forEach((channel, index) => {
          const armed = channel.id === state.source.armed;
          const value = state.source.channels[channel.id];
          const line = `${armed ? '▶' : ' '} ${channel.glyph} ${channel.label}  ${'▮'.repeat(Math.min(8, value))}${channel.id === SOURCE_CHANNEL.RESCUE ? ` / ${rescueStable}` : ''}`;
          uiText(contentX, rowY + index, line.slice(0, contentW), armed ? 'ui-amber' : 'ui-secondary', .76);
          channelRows.push({ id: channel.id, x: contentX, y: rowY + index, w: Math.min(contentW, line.length) });
        });
        uiText(contentX, rowY + 3, `RESOLUTION IF ENCOUNTER ENDS NOW · ${prediction.outcome.toUpperCase()}`, 'ui-blue', .75);
        rowY += 5;
      }

      const actions = availableCombatActions(state);
      actionRows = [];
      const maxRows = Math.max(3, panel.y + panel.h - rowY - 3);
      actions.slice(0, maxRows).forEach((action, index) => {
        const active = index === selected;
        const marker = active ? '▶' : ' ';
        const recommended = state.difficulty.recommended && action.perfect;
        const response = recommended ? ' / PERFECT' : '';
        const line = `${marker} ${action.label.padEnd(13)} ${action.enabled ? action.detail : action.reason}${response}`;
        uiText(contentX, rowY + index, line.slice(0, contentW), !action.enabled ? 'ui-secondary' : recommended ? 'ui-counter' : active ? 'ui-primary' : 'ui-secondary', active ? 1 : .78);
        if (active) uiStrokeRect(contentX - .4, rowY + index - .05, Math.min(contentW, line.length) + .8, 1, UI_COLOR.primary, .65, 1);
        actionRows.push({ id: action.id, index, x: contentX, y: rowY + index, w: Math.min(contentW, line.length) });
      });
      if (notice) {
        const summary = takeConfirmation ? notice : `LAST · ${notice}`;
        uiWrap(summary, contentW).slice(0, 2).forEach((line, index) => uiText(contentX, panel.y + panel.h - 3 + index, line, takeConfirmation ? 'ui-danger' : 'ui-amber', .78));
      }
    },
  };
}

// Compatibility export for probes and older integration call sites. The scene
// is signal combat; no redaction state is constructed.
export const makeBattleScene = makeCombatScene;
