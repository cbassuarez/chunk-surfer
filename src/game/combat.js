// Player-paced signal combat: deterministic rules, staged over a readable
// 1.2-second action beat. The opponent stays in the far corner; the selected
// field tool and the recordist's injured hands stay in the near corner.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiStrokeRect, uiLine } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';
import { flashMode, shakeMode, textCps } from './access.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import {
  combatInjuryStage,
  drawCombatBar,
  drawFirstPersonCombatant,
  drawOpponentCombatArt,
} from '../render/combat-view.js';
import {
  COMBAT_ACTION,
  COMBAT_TOOL,
  SNR_PROFILE,
  SOURCE_CHANNEL,
  availableCombatActions,
  availableCombatTools,
  combatIntentLookahead,
  combatMovesForTool,
  combatPrediction,
  combatResult,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
} from './combat-state.js';

export const ORDINARY_TURN_SECONDS = 1.2;
const UTILITY_TURN_SECONDS = .82;
const CPS = 40;
const BATTLE_GRID_LABEL = '168 BPM / 4:4 / 40 BARS';
const CHANNELS = Object.freeze([
  { id: SOURCE_CHANNEL.RESCUE, label: 'RETURN / RESCUE', glyph: '↩' },
  { id: SOURCE_CHANNEL.CONTAIN, label: 'ISOLATE / CONTAIN', glyph: '▣' },
  { id: SOURCE_CHANNEL.SUBMIT, label: 'OPEN / SUBMIT', glyph: '◇' },
]);
const textOf = (line) => String(line?.text ?? line ?? '');
const whoOf = (line) => line?.who || 'direction';
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const lerp = (a, b, t) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

function fallbackArt(combatId = '') {
  return { id: 'surfer', mode: 'boss', label: String(combatId || 'OPPONENT') };
}

function opponentArt(ref, combatId = '') {
  const id = typeof ref === 'string' ? ref : String(ref?.id || '');
  return ['surfer', 'guard'].includes(id) ? ref : fallbackArt(combatId);
}

function turnDuration(actionId) {
  return [COMBAT_ACTION.TUNE, COMBAT_ACTION.END_TEMPO].includes(actionId)
    ? UTILITY_TURN_SECONDS
    : ORDINARY_TURN_SECONDS;
}

function idealResponse(intent) {
  if (intent?.kind === 'broadcast') return 'MONITOR';
  if (intent?.kind === 'conceal') return 'EXPOSE';
  if (intent?.kind === 'overload') return 'HOLD';
  if (intent?.kind === 'loop') return 'INVERT / HOLD';
  return 'BREAK SILENCE';
}

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
  let now = 0;
  let arrivalElapsed = 0;
  let handle = null;
  let onTalkEnd = () => {};
  let selectedTool = 0;
  let selectedMove = 0;
  let notice = '';
  let takeConfirmation = false;
  let resolution = null;
  let resultDelivered = false;
  let sceneEntered = false;
  let openingStarted = false;
  let musicBootResolved = !musicSession;
  let musicFinished = false;
  let toolRows = [];
  let moveRows = [];
  let channelRows = [];

  const movement = (index = state.movementIndex) => battle.combat.movements[index] || null;
  const stopVoice = () => { handle?.stop?.(); handle = null; };

  function tools() { return availableCombatTools(state); }
  function activeTool() { return tools()[selectedTool] || tools()[0] || { id: COMBAT_TOOL.SELF, label: 'HANDS' }; }
  function moves() { return combatMovesForTool(state, activeTool().id); }

  function repairSelection() {
    const list = tools();
    selectedTool = Math.min(Math.max(0, selectedTool), Math.max(0, list.length - 1));
    selectedMove = Math.min(Math.max(0, selectedMove), Math.max(0, moves().length - 1));
  }

  function beginToolSelection() {
    phase = 'tool';
    takeConfirmation = false;
    selectedMove = 0;
    repairSelection();
  }

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
    if (lines.length) speak(lines, () => { beginToolSelection(); musicSession?.setDialogueActive?.(false); });
    else { beginToolSelection(); musicSession?.setDialogueActive?.(false); }
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
    if (after.last?.consumed) resources.consumeItem?.(after.last.consumed);
  }

  function fireImpact() {
    if (!resolution || resolution.impactFired) return;
    resolution.impactFired = true;
    const last = resolution.after.last || {};
    resources.playTool?.(resolution.action.tool, resolution.action.id);
    if (last.dealt > 0) {
      fx?.flash?.(72, 'rgba(255,180,55,0.38)');
      fx?.glitch?.(.24 + Math.min(.32, last.dealt * .07), 150);
    }
    if (last.received > 0) {
      fx?.flash?.(90, 'rgba(154,20,30,0.48)');
      fx?.shake?.(.26 + Math.min(.50, last.received * .11), 220);
    }
  }

  function finishResolution() {
    if (!resolution) return;
    const resolved = resolution;
    resolution = null;
    if (!state.result) musicSession?.onCombatEvent?.({
      perfect: state.last?.perfect === true,
      transition: state.last?.transition || null,
      movementIndex: state.movementIndex,
    });

    if (state.result) {
      finishMusic();
      const finished = movement(state.last?.transition?.from ?? resolved.before.movementIndex);
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
      if (lines.length) speak(lines, beginToolSelection);
      else beginToolSelection();
      return;
    }
    beginToolSelection();
  }

  function execute(actionId) {
    if (phase !== 'move') return;
    const action = moves().find((entry) => entry.id === actionId);
    if (!action?.enabled) {
      notice = action?.reason || 'MOVE UNAVAILABLE';
      audio?.menuMove?.();
      return;
    }
    const before = state;
    const next = reduceCombat(state, {
      type: actionId,
      replaceTake: actionId === COMBAT_ACTION.MONITOR && takeConfirmation,
    });
    if (next.last?.needsTakeConfirmation) {
      takeConfirmation = true;
      notice = 'TAKE SLOT OCCUPIED · CONFIRM MONITOR AGAIN TO REPLACE';
      audio?.menuMove?.();
      return;
    }
    takeConfirmation = false;
    syncResourceSpend(before, next);
    state = next;
    notice = state.last?.notice || '';
    audio?.menuConfirm?.();
    resolution = {
      before,
      after: state,
      action,
      elapsed: 0,
      duration: turnDuration(actionId),
      impactFired: false,
    };
    phase = 'resolve';
    repairSelection();
  }

  function cycleChannel(delta) {
    if (!state.source || !['tool', 'move'].includes(phase)) return;
    const at = CHANNELS.findIndex((entry) => entry.id === state.source.armed);
    const next = CHANNELS[(at + delta + CHANNELS.length) % CHANNELS.length];
    state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: next.id });
    notice = state.last.notice;
    audio?.menuMove?.();
  }

  function moveSelection(delta) {
    if (phase === 'tool') {
      const list = tools();
      if (!list.length) return;
      selectedTool = (selectedTool + delta + list.length) % list.length;
      selectedMove = 0;
    } else if (phase === 'move') {
      const list = moves();
      if (!list.length) return;
      selectedMove = (selectedMove + delta + list.length) % list.length;
    }
    takeConfirmation = false;
    audio?.menuMove?.();
  }

  function visualState() {
    if (!resolution) return {
      movementIndex: state.movementIndex,
      coherence: state.movementCoherence,
      maxCoherence: state.movementMaxCoherence,
      composure: state.composure,
      maxComposure: state.maxComposure,
      progress: 0,
    };
    const progress = ease(resolution.elapsed / resolution.duration);
    const transitioned = resolution.after.last?.transition != null;
    return {
      movementIndex: resolution.before.movementIndex,
      coherence: lerp(
        resolution.before.movementCoherence,
        transitioned ? 0 : resolution.after.movementCoherence,
        progress,
      ),
      maxCoherence: resolution.before.movementMaxCoherence,
      composure: lerp(resolution.before.composure, resolution.after.composure, progress),
      maxComposure: resolution.before.maxComposure,
      progress,
    };
  }

  const scene = {
    id: `battle:${battle.id}`,
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'battle',

    enter() {
      sceneEntered = true;
      phase = musicSession ? 'arrival' : 'talk';
      if (!musicSession) { beginOpening(); return; }
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
        tools: availableCombatTools(state),
        moves: combatMovesForTool(state, activeTool().id),
        actions: availableCombatActions(state),
        prediction: combatPrediction(state),
        music: musicSession?.snapshot?.() || null,
        selectedTool,
        selectedMove,
        notice,
        resolution: resolution ? { elapsed: resolution.elapsed, duration: resolution.duration, action: resolution.action.id } : null,
      };
    },

    update(dt) {
      now += dt;
      const music = musicSession?.update?.() || null;
      if (phase === 'arrival') {
        arrivalElapsed += dt;
        if ((musicBootResolved && music?.phase !== 'arrival') || arrivalElapsed >= 2.2) beginOpening();
        return;
      }
      if (phase === 'resolve' && resolution) {
        resolution.elapsed += dt;
        if (!resolution.impactFired && resolution.elapsed / resolution.duration >= .28) fireImpact();
        if (resolution.elapsed >= resolution.duration) finishResolution();
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
      const confirm = e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.controllerAction === 'confirm';
      const back = e.key === 'Escape' || e.key === 'x' || e.controllerAction === 'back';
      if (phase === 'talk') {
        if (confirm) {
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
      if (phase === 'resolve') {
        if (confirm && resolution && resolution.elapsed >= .22) {
          if (!resolution.impactFired) fireImpact();
          finishResolution();
        }
        return true;
      }
      if (!['tool', 'move'].includes(phase)) return true;
      if (e.key === 'ArrowUp' || e.key === 'w') moveSelection(-1);
      else if (e.key === 'ArrowDown' || e.key === 's') moveSelection(1);
      else if (e.key === 'q') cycleChannel(-1);
      else if (e.key === 'e') cycleChannel(1);
      else if (back && phase === 'move') { phase = 'tool'; takeConfirmation = false; audio?.menuMove?.(); }
      else if (confirm && phase === 'tool') {
        if (moves().length) { phase = 'move'; selectedMove = 0; audio?.menuConfirm?.(); }
      } else if (confirm && phase === 'move') execute(moves()[selectedMove]?.id);
      return true;
    },

    pointer(e) {
      if (!['tool', 'move'].includes(phase) || e.type !== 'pointerdown') return true;
      const x = Math.floor(Number(e.cellX));
      const y = Math.floor(Number(e.cellY));
      const channel = channelRows.find((row) => y === row.y && x >= row.x && x < row.x + row.w);
      if (channel) {
        state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: channel.id });
        notice = state.last.notice;
        audio?.menuMove?.();
        return true;
      }
      const tool = toolRows.find((row) => y === row.y && x >= row.x && x < row.x + row.w);
      if (tool) {
        selectedTool = tool.index;
        selectedMove = 0;
        phase = 'move';
        audio?.menuConfirm?.();
        return true;
      }
      const move = moveRows.find((row) => y === row.y && x >= row.x && x < row.x + row.w);
      if (move) {
        selectedMove = move.index;
        execute(move.id);
      }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(2,2,3,0.97)');
      const w = Math.min(118, cols - 4);
      const x = Math.floor((cols - w) / 2);
      const choosing = ['tool', 'move'].includes(phase);
      const footer = phase === 'arrival'
        ? '168 BPM · LOCKING DOWNBEAT'
        : phase === 'tool'
          ? activeInputPromptDevice() === 'controller'
            ? promptLine([{ action: 'select', label: 'CHOOSE TOOL' }, { action: 'confirm', label: 'OPEN MOVES' }])
            : '[↑↓] CHOOSE TOOL · [ENTER] OPEN MOVES'
          : phase === 'move'
            ? '[↑↓] CHOOSE MOVE · [ENTER] ACT · [ESC] TOOLS'
            : phase === 'resolve'
              ? 'RESOLVING · [ENTER] FAST-FORWARD'
              : promptLine([{ action: 'continue', label: 'CONTINUE' }]);
      const panel = drawMachinePanel(x - 2, 1, w + 4, rows - 2, {
        label: 'AUDIOCORP / SIGNAL COMBAT', source: state.source ? 'SOURCE' : 'FIELD', meter: true, footer,
      });
      const visual = visualState();
      const movementData = movement(visual.movementIndex) || movement();
      const art = opponentArt(
        cur?.art || movementData?.art || battle.art || battle.combat.art,
        battle.combat.id,
      );

      drawVfdText(panel.x, panel.y, battle.enemy || battle.combat.enemy, { color: UI_COLOR.danger, max: panel.w });
      const signature = battle.combat.signature;
      if (signature?.label) {
        const tag = `SIGNATURE · ${signature.label}`;
        uiText(panel.x + Math.max(0, panel.w - tag.length), panel.y, tag, 'ui-amber', .66);
      }

      const barY = panel.y + 2;
      const barGap = 4;
      const barW = Math.floor((panel.w - barGap) / 2);
      drawCombatBar({ x: panel.x, y: barY, w: barW, value: visual.composure, max: visual.maxComposure, label: 'COMPOSURE' });
      drawCombatBar({ x: panel.x + barW + barGap, y: barY, w: barW, value: visual.coherence, max: visual.maxCoherence, label: `${movementData?.title || 'COHERENCE'} / COHERENCE`, tone: 'enemy' });

      const stageY = panel.y + 5;
      const stageH = Math.max(15, Math.min(19, panel.h - 16));
      const infoX = panel.x + Math.floor(panel.w * .54);
      const infoW = Math.max(28, panel.x + panel.w - infoX - 1);
      drawOpponentCombatArt(art, {
        x: panel.x, y: stageY, w: panel.w, h: stageH,
        coherence: visual.coherence, maxCoherence: visual.maxCoherence,
        snr: state.snr,
        resolveProgress: visual.progress,
        reduceFlash: flashMode() !== 'full',
      });

      const selectedToolId = resolution?.action?.tool || activeTool().id;
      const injury = combatInjuryStage({ composure: visual.composure, maxComposure: visual.maxComposure, injuries: state.injuries });
      drawFirstPersonCombatant(selectedToolId, {
        x: panel.x,
        y: stageY + Math.max(5, stageH - 9),
        w: panel.w,
        h: 9,
        stage: injury,
        snr: state.snr,
        now,
        resolveProgress: visual.progress,
        reducedMotion: shakeMode() !== 'full',
      });

      if (phase === 'arrival') {
        drawVfdText(infoX, stageY + 1, 'SIGNAL ACQUIRING', { color: UI_COLOR.amber, max: infoW });
        uiText(infoX, stageY + 4, `GRID · ${BATTLE_GRID_LABEL}`.slice(0, infoW), 'ui-secondary');
        const music = musicSession?.snapshot?.() || {};
        uiText(infoX, stageY + 6, (music.entryVariant ? `ENTRY · ${music.entryVariant}` : 'ENTRY · SEARCHING').slice(0, infoW), 'ui-counter');
        return;
      }

      if (phase === 'talk' && cur) {
        uiText(infoX, stageY, whoOf(cur).toUpperCase(), 'ui-label');
        const lines = uiWrap(textOf(cur).slice(0, typed), infoW);
        lines.slice(0, Math.max(3, stageH - 5)).forEach((line, index) => uiText(
          infoX,
          stageY + 2 + index,
          line,
          whoOf(cur) === 'direction' ? 'ui-secondary' : 'ui-primary',
        ));
        return;
      }

      const intentState = resolution?.before || state;
      const intent = currentCombatIntent(intentState);
      const snr = SNR_PROFILE[state.snr];
      uiText(infoX, stageY, `${intentState.tempo ? 'TEMPO OPEN' : `INTENT · ${intent?.label || 'NONE'}`}`.slice(0, infoW), intentState.tempo ? 'ui-amber' : 'ui-danger');
      if (!intentState.tempo && intent) {
        const response = state.difficulty.recommended ? ` · RESPONSE ${idealResponse(intent)}` : '';
        uiText(infoX, stageY + 1, `${intent.kind.toUpperCase()} · ${intent.damage} DAMAGE${response}`.slice(0, infoW), 'ui-secondary', .78);
      }
      uiText(infoX, stageY + 3, `SNR · ${snr?.label || state.snr.toUpperCase()}`, state.snr === 'noise' ? 'ui-danger' : state.snr === 'signal' ? 'ui-blue' : 'ui-secondary');
      uiWrap(snr?.description || '', infoW).slice(0, 2).forEach((line, index) => uiText(infoX, stageY + 4 + index, line, 'ui-secondary', .62));

      if (phase === 'resolve' && resolution) {
        const last = resolution.after.last || {};
        const impactLine = [
          last.dealt ? `-${last.dealt} COHERENCE` : '',
          last.received ? `-${last.received} COMPOSURE` : '',
          last.snrFrom !== last.snrTo ? `${String(last.snrFrom).toUpperCase()} → ${String(last.snrTo).toUpperCase()}` : '',
        ].filter(Boolean).join(' · ') || 'POSITION HELD';
        drawVfdText(infoX, stageY + 6, impactLine, { color: last.received ? UI_COLOR.danger : UI_COLOR.amber, max: infoW });
      }

      const controlsY = stageY + stageH + 1;
      const bottom = panel.y + panel.h - 2;
      uiLine(panel.x, controlsY - .4, panel.x + panel.w, controlsY - .4, UI_COLOR.frame, .55);
      uiText(panel.x, controlsY, `TAKE · ${state.take ? `${state.take.label} / ${state.take.damage}` : 'EMPTY'}`, 'ui-counter', .76);
      const skillText = state.techniques.length
        ? state.techniques.map((id) => id.split('.').pop().replaceAll('-', ' ').toUpperCase()).join(' / ')
        : 'NONE';
      uiText(panel.x + Math.floor(panel.w * .42), controlsY, `SKILLS · ${skillText}`.slice(0, Math.floor(panel.w * .35)), 'ui-blue', .65);
      uiText(panel.x + Math.max(0, panel.w - 15), controlsY, `BATTERY · ${Math.round(state.battery * 100)}%`, 'ui-counter', .76);

      let listY = controlsY + 2;
      channelRows = [];
      if (state.source) {
        const prediction = combatPrediction(state);
        CHANNELS.forEach((channel, index) => {
          const armed = channel.id === state.source.armed;
          const line = `${armed ? '▶' : ' '} ${channel.glyph} ${channel.label} ${state.source.channels[channel.id]}`;
          uiText(panel.x, listY + index, line, armed ? 'ui-amber' : 'ui-secondary', .72);
          channelRows.push({ id: channel.id, x: panel.x, y: listY + index, w: Math.min(31, line.length) });
        });
        uiText(panel.x, listY + 3, `ENDS AS · ${prediction.outcome.toUpperCase()}`, 'ui-blue', .64);
        listY += 5;
      }

      const toolX = panel.x;
      const toolW = Math.min(31, Math.max(24, Math.floor(panel.w * .29)));
      const moveX = toolX + toolW + 2;
      const moveW = panel.w - toolW - 2;
      uiText(toolX, listY, 'LOCKED TOP COMPARTMENT / TOOL', 'ui-label', .68);
      uiText(moveX, listY, `MOVES / ${activeTool().label}`, 'ui-label', .68);
      toolRows = [];
      tools().slice(0, Math.max(1, bottom - listY - 2)).forEach((tool, index) => {
        const active = index === selectedTool;
        const line = `${active ? '▶' : ' '} ${index === 0 ? '—' : String(index).padStart(2, '0')} ${tool.label}`;
        uiText(toolX, listY + 2 + index, line.slice(0, toolW), active ? 'ui-amber' : tool.ready ? 'ui-primary' : 'ui-secondary', active ? 1 : .72);
        if (active && phase === 'tool') uiStrokeRect(toolX - .3, listY + 1.9 + index, toolW, 1, UI_COLOR.amber, .55, 1);
        toolRows.push({ index, x: toolX, y: listY + 2 + index, w: toolW });
      });

      moveRows = [];
      const renderedMoves = phase === 'resolve' && resolution
        ? [{ ...resolution.action, enabled: true, detail: resolution.after.last?.notice || resolution.action.detail }]
        : moves();
      renderedMoves.slice(0, Math.max(1, bottom - listY - 2)).forEach((move, index) => {
        const active = index === selectedMove;
        const recommended = state.difficulty.recommended && move.perfect;
        const suffix = !move.enabled ? move.reason : `${move.detail}${recommended ? ' / PERFECT' : ''}`;
        const line = `${active ? '▶' : ' '} ${move.label.padEnd(13)} ${suffix}`;
        uiText(moveX, listY + 2 + index, line.slice(0, moveW), !move.enabled ? 'ui-secondary' : recommended ? 'ui-counter' : active ? 'ui-primary' : 'ui-secondary', active ? 1 : .72);
        if (active && phase === 'move') uiStrokeRect(moveX - .3, listY + 1.9 + index, moveW, 1, UI_COLOR.primary, .60, 1);
        moveRows.push({ id: move.id, index, x: moveX, y: listY + 2 + index, w: moveW });
      });

      if (notice && choosing) {
        const summary = takeConfirmation ? notice : `LAST · ${notice}`;
        uiText(panel.x, bottom, summary.slice(0, panel.w), takeConfirmation ? 'ui-danger' : 'ui-amber', .74);
      }
    },
  };

  return scene;
}

export const makeBattleScene = makeCombatScene;
