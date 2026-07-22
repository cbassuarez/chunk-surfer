// Player-paced signal combat: deterministic rules, staged over a readable
// 1.2-second action beat, presented as an abstract fight void — the opponent
// floats top-centre, the recordist's hands rise from the bottom foreground,
// and the command band underneath spells out what every move actually does.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiStrokeRect, uiLine } from '../render/ui.js';
import { drawMachinePanel, drawVfdCounter, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';
import { flashMode, shakeMode, textCps } from './access.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import {
  combatInjuryStage,
  drawBattleWipe,
  drawCombatPips,
  drawEnemyVoidStage,
  drawFirstPersonHands,
  drawOpponentCombatArt,
  drawSignalBeing,
  drawStanceTriangle,
} from '../render/combat-view.js';
import {
  COMBAT_ACTION,
  COMBAT_TOOL,
  SOURCE_CHANNEL,
  availableCombatActions,
  availableCombatTools,
  combatIntentLookahead,
  combatMoveSubtext,
  combatMovesForTool,
  combatPrediction,
  combatResult,
  counterMovesForIntent,
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

function opponentArt(ref, combatId = '') {
  const id = typeof ref === 'string' ? ref : String(ref?.id || '');
  // Encounters without authored raster art get the procedural signal-being
  // instead of borrowing another opponent's portrait.
  return ['surfer', 'guard'].includes(id) ? ref : { procedural: true, id: String(combatId || 'signal') };
}

function turnDuration(actionId) {
  return [COMBAT_ACTION.TUNE, COMBAT_ACTION.END_TEMPO].includes(actionId)
    ? UTILITY_TURN_SECONDS
    : ORDINARY_TURN_SECONDS;
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
  director = null,
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
  let lineDoneAt = null;
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
  let skipArmed = false;
  let regionRects = {};
  let introElapsed = 0;
  let hitstop = 0;
  let popups = [];
  let popupSeq = 0;
  let impactFx = null;
  let barGhost = { composure: null, coherence: null };

  const movement = (index = state.movementIndex) => battle.combat.movements[index] || null;
  const stopVoice = () => { handle?.stop?.(); handle = null; };

  function tools() { return availableCombatTools(state); }
  function activeTool() { return tools()[selectedTool] || tools()[0] || { id: COMBAT_TOOL.SELF, label: 'HANDS' }; }
  function moves() {
    const list = combatMovesForTool(state, activeTool().id);
    return director?.active?.() ? director.filterMoves(list) : list;
  }

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
    lineDoneAt = null;
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

  function spawnPopup(popup) {
    popupSeq += 1;
    popups.push({ ...popup, born: now, jx: ((popupSeq % 3) - 1) * 2 });
  }

  function fireImpact() {
    if (!resolution || resolution.impactFired) return;
    resolution.impactFired = true;
    const before = resolution.before;
    const after = resolution.after;
    const last = after.last || {};
    resources.playTool?.(resolution.action.tool, resolution.action.id);
    resources.playImpact?.({
      dealt: last.dealt || 0,
      received: last.received || 0,
      perfect: !!last.perfect,
    });
    impactFx = { at: now, dealt: last.dealt || 0, received: last.received || 0 };
    // Hit-stop: the whole beat freezes for a few frames so the hit has weight.
    if (shakeMode() === 'full' && (last.dealt > 0 || last.received > 0)) {
      hitstop = Math.min(.15, .05 + (last.dealt || 0) * .012 + (last.received || 0) * .03);
    }
    if (last.perfect && flashMode() === 'full') fx?.flash?.(60, 'rgba(255,214,120,0.30)');
    if (last.dealt > 0) {
      barGhost.coherence = { from: before.movementCoherence, at: now };
      spawnPopup({ value: last.dealt, kind: 'dealt', anchor: 'enemy' });
      fx?.flash?.(72, 'rgba(255,180,55,0.38)');
      fx?.glitch?.(.24 + Math.min(.32, last.dealt * .07), 150);
    }
    if (last.received > 0) {
      barGhost.composure = { from: before.composure, at: now };
      spawnPopup({ value: last.received, kind: 'received', anchor: 'hands' });
      fx?.flash?.(90, 'rgba(154,20,30,0.48)');
      fx?.shake?.(.26 + Math.min(.50, last.received * .11), 220);
    }
    if ((last.composureTo ?? 0) > (last.composureFrom ?? 0)) {
      barGhost.composure = { from: last.composureFrom, at: now };
      spawnPopup({ value: last.composureTo - last.composureFrom, kind: 'heal', anchor: 'hands' });
    }
    if (last.perfect) spawnPopup({ text: 'NEGATED', role: 'ui-amber', anchor: 'hands' });
    if (after.take && !before.take && last.action === COMBAT_ACTION.MONITOR) {
      spawnPopup({ text: 'CAPTURED', role: 'ui-blue', anchor: 'enemy' });
    }
  }

  function finishResolution() {
    if (!resolution) return;
    const resolved = resolution;
    resolution = null;
    director?.advance?.(resolved.before, resolved.after);
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
      resources.playImpact?.({ transition: true });
      barGhost.coherence = null;
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
        moves: moves(),
        actions: availableCombatActions(state),
        prediction: combatPrediction(state),
        music: musicSession?.snapshot?.() || null,
        selectedTool,
        selectedMove,
        notice,
        resolution: resolution ? { elapsed: resolution.elapsed, duration: resolution.duration, action: resolution.action.id } : null,
        tutorial: director?.snapshot?.() || null,
      };
    },

    update(dt) {
      introElapsed += dt;
      if (hitstop > 0) {
        // Frozen frames: the beat, the typewriter, and every animation clock
        // hold still so a landed hit visibly stops the world.
        hitstop = Math.max(0, hitstop - dt);
        return;
      }
      now += dt;
      const music = musicSession?.update?.() || null;
      if (phase === 'arrival') {
        arrivalElapsed += dt;
        if ((musicBootResolved && music?.phase !== 'arrival') || arrivalElapsed >= 1.2) beginOpening();
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
      } else if (typed < text.length) {
        acc += dt;
        typed = Math.min(text.length, Math.floor(acc * textCps(CPS) * (cur.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
      // The fight paces its own dialogue: once a line has landed it holds for a
      // reading beat and moves on, so battle never turns into a continue-mash.
      // Confirm still fast-forwards or skips ahead.
      if (typed >= text.length && (!handle || handle.done())) {
        if (lineDoneAt == null) lineDoneAt = now;
        else if (now - lineDoneAt >= 1.15) nextLine();
      }
    },

    key(e) {
      const confirm = e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.controllerAction === 'confirm';
      // Escape is the run-level pause everywhere, including mid-battle, so the
      // in-fight "step back" is Tab (with X as the legacy alternate).
      const back = e.key === 'Tab' || e.key === 'x' || e.controllerAction === 'back';
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
      if (!back) skipArmed = false;
      if (e.key === 'ArrowUp' || e.key === 'w') moveSelection(-1);
      else if (e.key === 'ArrowDown' || e.key === 's') moveSelection(1);
      else if (e.key === 'q') cycleChannel(-1);
      else if (e.key === 'e') cycleChannel(1);
      else if (back && phase === 'move') { phase = 'tool'; takeConfirmation = false; audio?.menuMove?.(); }
      else if (back && phase === 'tool' && director?.active?.()) {
        // The drill can always be walked away from: one Tab warns, two skip it.
        if (skipArmed) {
          director.skip();
          skipArmed = false;
          notice = 'DRILL SKIPPED · ALL MOVES OPEN';
        } else {
          skipArmed = true;
          notice = 'TAB AGAIN TO SKIP THE DRILL';
        }
        audio?.menuMove?.();
      } else if (confirm && phase === 'tool') {
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
            : `[↑↓] CHOOSE TOOL · [ENTER] OPEN MOVES${director?.active?.() ? ' · [TAB×2] SKIP DRILL' : ''}`
          : phase === 'move'
            ? '[↑↓] CHOOSE MOVE · [ENTER] ACT · [TAB] TOOLS'
            : phase === 'resolve'
              ? 'RESOLVING · [ENTER] FAST-FORWARD'
              : promptLine([{ action: 'continue', label: 'CONTINUE' }]);
      const panel = drawMachinePanel(x - 2, 1, w + 4, rows - 2, {
        label: 'AUDIOCORP / SIGNAL COMBAT', source: state.source ? 'SOURCE' : 'FIELD', meter: true, footer,
      });
      const compact = panel.h < 20;
      const visual = visualState();
      const movementData = movement(visual.movementIndex) || movement();
      const art = opponentArt(
        cur?.art || movementData?.art || battle.art || battle.combat.art,
        battle.combat.id,
      );
      regionRects = {};

      // ── header: enemy name, signature rule, enemy phase pips ───────────────
      const enemyName = String(battle.enemy || battle.combat.enemy);
      if (compact) uiText(panel.x, panel.y, enemyName.slice(0, panel.w - 20), 'ui-danger');
      else drawVfdText(panel.x, panel.y, enemyName.slice(0, Math.max(6, Math.floor((panel.w - 24) / 2))), { scale: 2 });
      const signature = battle.combat.signature;
      if (signature?.label) {
        const tag = `SIGNATURE · ${signature.label}`;
        uiText(panel.x + Math.max(0, panel.w - tag.length), panel.y, tag, 'ui-amber', .66);
      }

      // Health snaps at the moment of impact and leaves ghost pips behind —
      // before the hit lands, the bars still show the pre-hit reading.
      const preImpact = !!resolution && !resolution.impactFired;
      const snap = preImpact ? resolution.before : state;
      const transitioned = !preImpact && resolution?.after?.last?.transition != null;
      const ghostFor = (record) => (record && now - record.at < .7
        ? { ghostFrom: record.from, ghostAge: now - record.at }
        : { ghostFrom: null, ghostAge: 0 });

      const movementCount = battle.combat.movements.length;
      const barW = Math.min(38, Math.floor(panel.w * .34));
      const enemyBarY = compact ? panel.y + 1 : panel.y + 2;
      drawCombatPips({
        x: panel.x, y: enemyBarY, w: barW,
        value: transitioned ? 0 : snap.movementCoherence,
        max: snap.movementMaxCoherence,
        label: `${movementData?.title || 'COHERENCE'} ${visual.movementIndex + 1}/${movementCount}`,
        tone: 'enemy',
        now,
        ...ghostFor(barGhost.coherence),
      });

      // ── the void stage: one continuous backdrop, opponent right-of-centre in
      // an oblique fight stance, hands rising from the near-left ──────────────
      const stageY = enemyBarY + 2;
      const reserve = state.source ? 5 : 0;
      const stageH = compact
        ? Math.max(6, panel.h - (stageY - panel.y) - 8 - reserve)
        : Math.max(9, Math.min(15, panel.h - (stageY - panel.y) - 12 - reserve));
      const reducedMotion = shakeMode() !== 'full';
      const introP = Math.min(1, introElapsed / 1.05);
      const introIn = reducedMotion ? 1 : ease(introP);
      const dealtFlash = impactFx && impactFx.dealt > 0 ? Math.max(0, 1 - (now - impactFx.at) / .18) : 0;
      const hurtNow = impactFx && impactFx.received > 0 ? Math.max(0, 1 - (now - impactFx.at) / .35) : 0;
      const ew = Math.min(40, Math.floor(panel.w * .36));
      const eh = Math.max(4, stageH - 1);
      const ex = panel.x + Math.floor(panel.w * .56 - ew / 2) + Math.round((1 - introIn) * panel.w * .45);
      drawEnemyVoidStage(battle.combat.id, {
        x: panel.x, y: stageY, w: panel.w, h: stageH,
        enemyBox: { x: ex, w: ew },
        resolveProgress: visual.progress,
        reduceFlash: flashMode() !== 'full',
      });
      const intentState = resolution?.before || state;
      const intent = currentCombatIntent(intentState);
      if (art?.procedural) {
        drawSignalBeing(battle.combat.id, {
          x: ex, y: stageY, w: ew, h: eh,
          snr: state.snr,
          coherenceRatio: (transitioned ? 0 : snap.movementCoherence) / Math.max(1, snap.movementMaxCoherence),
          movementIndex: visual.movementIndex,
          intentKind: intent?.kind || null,
          now,
          resolveProgress: visual.progress,
          reducedMotion,
          oblique: -.05,
          hitFlash: dealtFlash,
          knock: dealtFlash * 1.4,
        });
      } else {
        drawOpponentCombatArt(art, {
          x: ex, y: stageY, w: ew, h: eh,
          coherence: transitioned ? 0 : snap.movementCoherence,
          maxCoherence: snap.movementMaxCoherence,
          snr: state.snr,
          resolveProgress: visual.progress,
          reduceFlash: flashMode() !== 'full',
          oblique: -.05,
          hitFlash: dealtFlash,
          knock: dealtFlash * 1.4,
        });
      }

      const selectedToolId = resolution?.action?.tool || activeTool().id;
      const injury = combatInjuryStage({ composure: snap.composure, maxComposure: snap.maxComposure, injuries: state.injuries });
      const lh = Math.min(12, stageH);
      const rh = Math.min(9, Math.max(4, stageH - 2));
      const introDrop = (1 - introIn);
      drawFirstPersonHands(selectedToolId, {
        stage: { x: panel.x, y: stageY, w: panel.w, h: stageH },
        left: {
          x: panel.x + Math.floor(panel.w * .13) - introDrop * panel.w * .35,
          y: stageY + stageH - lh + introDrop * lh * .7,
          w: Math.min(32, Math.floor(panel.w * .28)),
          h: lh,
        },
        right: {
          x: panel.x + Math.floor(panel.w * .62) - introDrop * panel.w * .18,
          y: stageY + stageH - rh + introDrop * rh * .9,
          w: Math.min(24, Math.floor(panel.w * .21)),
          h: rh,
        },
        injury,
        snr: state.snr,
        now,
        resolveProgress: visual.progress,
        reducedMotion,
        hurt: hurtNow,
      });

      // ── stage overlays: intent card (left) and stance triangle (right) ─────
      const showOverlays = !['arrival', 'talk'].includes(phase);
      const intentX = panel.x + 1;
      const intentW = Math.min(34, Math.floor(panel.w * .30));
      if (showOverlays) {
        if (phase === 'resolve' && resolution) {
          const last = resolution.after.last || {};
          const impactLine = [
            last.dealt ? `-${last.dealt} COHERENCE` : '',
            last.received ? `-${last.received} COMPOSURE` : '',
            last.snrFrom !== last.snrTo ? `${String(last.snrFrom).toUpperCase()} → ${String(last.snrTo).toUpperCase()}` : '',
          ].filter(Boolean).join(' · ') || 'POSITION HELD';
          if (last.perfect) {
            drawVfdText(intentX, stageY + 1, 'PERFECT RESPONSE', { scale: 2, role: 'ui-counter' });
            const why = `${resolution.action.label} COUNTERS ${String(intent?.kind || '').toUpperCase()} — HIT NEGATED · TEMPO OPENS`;
            uiText(intentX, stageY + 3, why.slice(0, intentW + 6), 'ui-amber', .8);
            uiText(intentX, stageY + 4, impactLine.slice(0, intentW), 'ui-secondary', .75);
          } else {
            drawVfdText(intentX, stageY + 1, impactLine.slice(0, intentW), { scale: 1, role: last.received ? 'ui-primary' : 'ui-counter' });
          }
        } else if (intentState.tempo) {
          drawVfdText(intentX, stageY + 1, 'TEMPO OPEN', { scale: 2, role: 'ui-counter' });
          uiText(intentX, stageY + 3, 'FREE ACTION · THE SIGNAL WAITS', 'ui-amber', .7);
          regionRects.tempo = { x: intentX, y: stageY + 1, w: intentW, h: 3.2 };
        } else if (intent) {
          uiText(intentX, stageY + 1, `INTENT · ${intent.label}`.slice(0, intentW), 'ui-danger');
          uiText(intentX, stageY + 2, `${intent.kind.toUpperCase()} · ${intent.damage} DMG`.slice(0, intentW), 'ui-secondary', .8);
          let intentRow = 3;
          if (state.difficulty.recommended) {
            const counters = counterMovesForIntent(intentState, intent);
            const names = counters.length ? counters.map((move) => move.label).join(' / ') : '—';
            uiText(intentX, stageY + intentRow, `COUNTER · ${names}`.slice(0, intentW), 'ui-counter', .8);
            intentRow += 1;
          }
          const lookahead = combatIntentLookahead(intentState);
          if (lookahead.length > 1 && lookahead[1]) {
            uiText(intentX, stageY + intentRow, `NEXT · ${lookahead[1].label}`.slice(0, intentW), 'ui-secondary', .5);
            intentRow += 1;
          }
          regionRects.intent = { x: intentX, y: stageY + 1, w: intentW, h: intentRow + .2 };
        }

        const stW = Math.max(20, Math.min(26, Math.floor(panel.w * .24)));
        const stX = panel.x + panel.w - stW - 1;
        const pendingShift = phase === 'move' ? moves()[selectedMove]?.stanceShift || null : null;
        const stanceRect = drawStanceTriangle(stX, stageY + 1, stW, { snr: state.snr, pendingShift, compact });
        regionRects.stance = stanceRect;
      }

      // ── floating damage numbers ─────────────────────────────────────────────
      popups = popups.filter((popup) => now - popup.born < .95);
      for (const popup of popups) {
        const t = (now - popup.born) / .95;
        const rise = ease(Math.min(1, t * 1.3)) * 2.6;
        const alpha = t < .12 ? 1 : Math.max(0, 1 - (t - .12) / .88);
        const ax = (popup.anchor === 'enemy' ? ex + ew * .64 : panel.x + Math.floor(panel.w * .30)) + popup.jx;
        const ay = popup.anchor === 'enemy' ? stageY + 2.4 : stageY + stageH - 3.4;
        if (popup.value != null) {
          const punch = t < .12 ? 1.5 - (t / .12) * .5 : 1;
          const scale = (popup.kind === 'received' ? 1.35 : 1.05) * punch;
          const color = popup.kind === 'received' ? `rgba(255,86,80,${alpha.toFixed(3)})`
            : popup.kind === 'heal' ? `rgba(126,214,150,${alpha.toFixed(3)})`
              : `rgba(255,196,84,${alpha.toFixed(3)})`;
          drawVfdCounter(ax, ay - rise, String(popup.value), { scale, color });
        } else {
          uiText(ax, ay - rise, popup.text, popup.role || 'ui-amber', alpha);
        }
      }

      // ── the entry wipe: opponent clears in from one side, you from the other
      drawBattleWipe({ x: panel.x, y: stageY, w: panel.w, h: stageH, progress: introP, reducedMotion });

      // ── the command band ────────────────────────────────────────────────────
      const cmdY = stageY + stageH + 1;
      const bottom = panel.y + panel.h - 2;
      uiLine(panel.x, cmdY - .4, panel.x + panel.w, cmdY - .4, UI_COLOR.frame, .55);
      drawCombatPips({
        x: panel.x, y: cmdY, w: barW,
        value: snap.composure, max: snap.maxComposure,
        label: 'COMPOSURE',
        now,
        ...ghostFor(barGhost.composure),
      });
      const takeText = `TAKE · ${state.take ? `${state.take.label} / ${state.take.damage}` : 'EMPTY'}`;
      const takeX = panel.x + barW + 3;
      uiText(takeX, cmdY, takeText.slice(0, Math.max(8, panel.w - barW - 20)), 'ui-counter', .76);
      regionRects.take = { x: takeX, y: cmdY, w: Math.min(takeText.length + 1, panel.w - barW - 20), h: 1.1 };
      uiText(panel.x + Math.max(0, panel.w - 15), cmdY, `BATTERY · ${Math.round(state.battery * 100)}%`, 'ui-counter', .76);
      const skillText = state.techniques.length
        ? state.techniques.map((id) => id.split('.').pop().replaceAll('-', ' ').toUpperCase()).join(' / ')
        : 'NONE';
      uiText(takeX, cmdY + 1, `SKILLS · ${skillText}`.slice(0, Math.max(8, panel.w - barW - 20)), 'ui-blue', .55);

      if (phase === 'arrival') {
        // No title card: the stage is already on screen behind the entry wipe.
        // The footer carries the BPM lock; one dim status line is enough.
        uiText(panel.x, cmdY + 2, `ACQUIRING · GRID ${BATTLE_GRID_LABEL}`.slice(0, panel.w), 'ui-secondary', .55);
        return;
      }

      if (phase === 'talk' && cur) {
        // Pokemon-style: dialogue takes over the command band, the fight stage
        // stays visible above it.
        uiText(panel.x, cmdY + 2, whoOf(cur).toUpperCase(), 'ui-label');
        const dlgW = Math.max(20, panel.w - 2);
        const lines = uiWrap(textOf(cur).slice(0, typed), dlgW);
        lines.slice(0, Math.max(2, bottom - (cmdY + 3) + 1)).forEach((line, index) => uiText(
          panel.x,
          cmdY + 3 + index,
          line,
          whoOf(cur) === 'direction' ? 'ui-secondary' : 'ui-primary',
        ));
        return;
      }

      // ── tool and move lists ────────────────────────────────────────────────
      let listY = cmdY + 2;
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
      const toolW = Math.min(26, Math.max(18, Math.floor(panel.w * .24)));
      const moveX = toolX + toolW + 2;
      const moveW = panel.w - toolW - 2;
      const detailY = compact ? null : panel.y + panel.h - 3;
      const listBottom = (detailY ?? bottom) - 1;
      const maxRows = Math.max(1, listBottom - (listY + 1) + 1);
      uiText(toolX, listY, 'TOOL', 'ui-label', .68);
      uiText(moveX, listY, `MOVES / ${activeTool().label}`, 'ui-label', .68);

      const windowSlice = (list, selected) => {
        if (list.length <= maxRows) return { start: 0, items: list };
        const start = Math.min(Math.max(0, selected - Math.floor(maxRows / 2)), list.length - maxRows);
        return { start, items: list.slice(start, start + maxRows) };
      };

      toolRows = [];
      const toolList = tools();
      const toolWindow = windowSlice(toolList, selectedTool);
      toolWindow.items.forEach((tool, row) => {
        const index = toolWindow.start + row;
        const active = index === selectedTool;
        const line = `${active ? '▶' : ' '} ${index === 0 ? '—' : String(index).padStart(2, '0')} ${tool.label}`;
        uiText(toolX, listY + 1 + row, line.slice(0, toolW), active ? 'ui-amber' : tool.ready ? 'ui-primary' : 'ui-secondary', active ? 1 : .72);
        if (active && phase === 'tool') uiStrokeRect(toolX - .3, listY + .9 + row, toolW, 1, UI_COLOR.amber, .55, 1);
        toolRows.push({ index, x: toolX, y: listY + 1 + row, w: toolW });
      });
      if (toolWindow.start > 0) uiText(toolX + toolW - 2, listY, '▲', 'ui-secondary', .6);
      if (toolWindow.start + maxRows < toolList.length) uiText(toolX + toolW - 1, listY, '▼', 'ui-secondary', .6);

      moveRows = [];
      const renderedMoves = phase === 'resolve' && resolution
        ? [{ ...resolution.action, enabled: true, detail: resolution.after.last?.notice || resolution.action.detail }]
        : moves();
      const moveWindow = windowSlice(renderedMoves, selectedMove);
      moveWindow.items.forEach((move, row) => {
        const index = moveWindow.start + row;
        const active = index === selectedMove;
        const recommended = state.difficulty.recommended && move.perfect;
        const subtext = phase === 'resolve' ? move.detail : combatMoveSubtext(state, move).short;
        const suffix = !move.enabled ? move.reason : `${subtext}${recommended ? ' / PERFECT' : ''}`;
        const line = `${active ? '▶' : ' '} ${move.label.padEnd(13)} ${suffix}`;
        uiText(moveX, listY + 1 + row, line.slice(0, moveW), !move.enabled ? 'ui-secondary' : recommended ? 'ui-counter' : active ? 'ui-primary' : 'ui-secondary', active ? 1 : .72);
        if (active && phase === 'move') uiStrokeRect(moveX - .3, listY + .9 + row, moveW, 1, UI_COLOR.primary, .60, 1);
        moveRows.push({ id: move.id, index, x: moveX, y: listY + 1 + row, w: moveW });
      });
      if (moveWindow.start > 0) uiText(moveX + moveW - 4, listY, '▲', 'ui-secondary', .6);
      if (moveWindow.start + maxRows < renderedMoves.length) uiText(moveX + moveW - 3, listY, '▼', 'ui-secondary', .6);
      regionRects.moves = { x: moveX - .3, y: listY + .9, w: moveW, h: Math.min(maxRows, moveWindow.items.length) + .2 };

      // ── detail, notice, drill callout ──────────────────────────────────────
      if (detailY != null) {
        const highlighted = phase === 'move'
          ? renderedMoves[selectedMove]
          : phase === 'resolve' && resolution ? resolution.action : null;
        if (highlighted) {
          const long = combatMoveSubtext(state, highlighted).long.toUpperCase();
          uiText(panel.x, detailY, long.slice(0, panel.w), 'ui-secondary', .6);
        }
      }

      if (director?.active?.() && choosing) {
        uiText(panel.x, bottom, String(director.prompt()).slice(0, panel.w), 'ui-counter', .92);
        const spotlight = director.spotlight?.();
        const target = spotlight ? regionRects[spotlight] : null;
        if (target) {
          const pulse = .30 + .35 * (0.5 + 0.5 * Math.sin(now * 3));
          uiStrokeRect(target.x - .4, target.y - .2, target.w + .8, target.h + .4, UI_COLOR.amber, pulse, 1);
        }
      } else if (notice && choosing) {
        const summary = takeConfirmation ? notice : `LAST · ${notice}`;
        uiText(panel.x, bottom, summary.slice(0, panel.w), takeConfirmation ? 'ui-danger' : 'ui-amber', .74);
      }
    },
  };

  return scene;
}

export const makeBattleScene = makeCombatScene;
