import * as scenes from './scenes.js';
import { createCombatState } from './combat-state.js';
import { createPracticeDrill, performPracticeMove, practiceDrillCue, PRACTICE_MOVES } from './practice-drill.js';
import { createPracticeClick } from '../audio/practice-click.js';
import { uiFill, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel, machinePanelBody } from '../render/presentation.js';
import { drawBattleWipe, drawCombatActionTile, drawCombatGauge, drawEnemyVoidStage, drawSignalBeing, drawFirstPersonHands } from '../render/combat-view.js';
import { pressControl, cancelControlScope } from './control-mechanics.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import { flashMode, shakeMode } from './access.js';

// A practice fight has its own finite rules. The ordinary combat reducer still
// owns real battles; this scene teaches its four basic moves with a local kit.
export function makePracticeFightScene({
  battle, seed = 0, difficulty, loadout = {}, resources = {}, getAudio,
  audio, practiceClues = null, onWin = () => {}, onLose = () => {}, onAbort = () => {},
  encounterIntro = false,
} = {}) {
  const initial = createCombatState(battle.combat, {
    difficulty: difficulty || {}, injuries: loadout.injuries, composure: loadout.composure,
    battery: resources.battery, tools: loadout.tools, techniques: loadout.techniques, seed,
  });
  let state = createPracticeDrill({ seed, composure: initial.composure, maxComposure: initial.maxComposure });
  let selected = 0, elapsed = 0, feedbackUntil = 0;
  let entered = false, finished = false, generation = 0, pending = false, native = false;
  let windowsDismissed = false;
  let windowIssue = '';
  let notice = 'Solve the two clue windows to choose your first move.';
  let tiles = [], click = null, closePromise = null;
  let arriving = encounterIntro, introElapsed = 0;
  const moves = () => PRACTICE_MOVES.map((move, index) => ({ ...move, label: `${index + 1}  ${move.label}`, enabled: !arriving && !state.result && !pending && elapsed >= feedbackUntil, free: true }));
  const metrics = () => ({
    result: state.result, composure: state.composure, maxComposure: state.maxComposure,
    turns: state.turns, perfects: state.cycle * 4 + state.step,
    practice: { cycles: state.cycles, completed: state.cycle, mistakes: state.mistakes, sequence: [...state.sequence] },
  });
  const closeClues = () => {
    if (!closePromise) closePromise = Promise.resolve().then(() => practiceClues?.close?.()).catch(() => null);
    return closePromise;
  };
  const showCue = async () => {
    const owner = ++generation;
    const cue = practiceDrillCue(state);
    if (!cue || !entered || windowsDismissed) return;
    pending = true;
    try {
      const result = await practiceClues?.show?.(cue);
      if (entered && owner === generation) { native = result?.native === true; windowIssue = result?.reason || ''; }
    } catch { if (entered && owner === generation) native = false; }
    finally { if (entered && owner === generation) pending = false; }
  };
  const dismissWindows = () => {
    generation++; pending = false; native = false; windowsDismissed = true;
  };
  const submit = (id) => {
    if (!entered || arriving || pending || state.result || elapsed < feedbackUntil) return;
    state = performPracticeMove(state, id);
    const move = PRACTICE_MOVES.find(entry => entry.id === id);
    if (!move || !state.last) return;
    pressControl(`combat:action:${id}`, { held: false });
    resources.playTool?.(move.tool);
    audio?.menuConfirm?.();
    feedbackUntil = elapsed + .65;
    if (state.last.correct) {
      notice = state.result === 'win' ? 'All cycles complete. Practice finished.'
        : state.last.cycleComplete ? `Cycle ${state.cycle} complete. Repeat the same sequence.`
          : `${move.label} correct. Read the next pair of clues.`;
      click?.setReturnLevel(Math.max(0, 1 - state.cycle / state.cycles));
    } else notice = `${move.label} is out of sequence. -${state.missCost} composure. Try the same clue again.`;
    if (state.result) { generation++; void closeClues(); click?.stop(); }
  };
  const finish = async () => {
    if (finished || !state.result || elapsed < feedbackUntil) return;
    finished = true;
    await closeClues();
    if (!entered) return;
    const result = metrics();
    scenes.remove(scene);
    (state.result === 'win' ? onWin : onLose)(result);
  };

  const scene = {
    id: `battle:${battle.id}`, blocksInput: true, blocksWorld: true, suppressesHud: true,
    worldPresentation: 'hidden', lensPreset: 'battle',
    enter() {
      entered = true;
      const rig = getAudio?.();
      click = createPracticeClick({ context: rig?.ctx, destination: rig?.destination });
      if (!arriving) click.start();
      globalThis.window?.addEventListener?.('chunk-surfer:fireball-forgive', dismissWindows);
      if (!arriving) void showCue();
    },
    resume() {
      if (entered && !arriving && !pending && !state.result) void showCue();
    },
    exit() {
      entered = false; generation++;
      globalThis.window?.removeEventListener?.('chunk-surfer:fireball-forgive', dismissWindows);
      click?.stop(); cancelControlScope('combat:action:');
      void closeClues();
      if (!finished) onAbort();
    },
    update(dt) {
      if (arriving) {
        introElapsed += Math.max(0, Math.min(.08, dt));
        if (introElapsed >= 1.54) { arriving = false; click?.start(); void showCue(); }
        return;
      }
      elapsed += Math.max(0, Number(dt) || 0);
      click?.tick();
      if (feedbackUntil && elapsed >= feedbackUntil) {
        feedbackUntil = 0;
        if (state.last?.correct && !state.result) void showCue();
      }
    },
    key(event) {
      if (event?.repeat) return true;
      const key = String(event?.key || '');
      if (key === 'Escape') return false;
      if (arriving) return true;
      if ((key.toLowerCase() === 'r' || event?.controllerAction === 'tabNext') && !pending && !state.result) {
        windowsDismissed = false; void showCue(); return true;
      }
      if (state.result) { if (key === 'Enter' || key === ' ') void finish(); return true; }
      if (/^[1-4]$/.test(key)) { selected = Number(key) - 1; submit(PRACTICE_MOVES[selected].id); return true; }
      if (['ArrowLeft', 'a', 'A', 'ArrowUp', 'w', 'W'].includes(key)) selected = (selected + 3) % 4;
      else if (['ArrowRight', 'd', 'D', 'ArrowDown', 's', 'S'].includes(key)) selected = (selected + 1) % 4;
      else if (key === 'Enter' || key === ' ') submit(PRACTICE_MOVES[selected].id);
      return true;
    },
    pointer(event) {
      if (arriving) return true;
      if (event?.type !== 'pointerdown' || (event.button ?? event.originalEvent?.button ?? 0) !== 0) return true;
      if (state.result) { void finish(); return true; }
      const hit = tiles.find(tile => event.cellX >= tile.x && event.cellX <= tile.x + tile.w && event.cellY >= tile.y && event.cellY <= tile.y + tile.h);
      if (hit) { selected = hit.index; submit(PRACTICE_MOVES[selected].id); }
      return true;
    },
    battleView() {
      return {
        phase: arriving ? 'arrival' : state.result ? 'result' : pending ? 'clues' : elapsed < feedbackUntil ? 'resolve' : 'move',
        state: { ...state, movementIndex: Math.min(state.cycle, state.cycles - 1), movementCoherence: state.result === 'win' ? 0 : 4 - state.step, movementMaxCoherence: 4 },
        practice: { ...state, sequence: [...state.sequence] }, cue: practiceDrillCue(state),
        moves: moves(), actions: moves(), selectedMove: selected,
        nativeClues: native, inlineClues: false, adversary: 'practice',
        controls: tiles.map(tile => ({ ...tile })), notice,
      };
    },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, '#050506');
      const controller = activeInputPromptDevice() === 'controller';
      const footer = controller
        ? promptLine(state.result ? [{ action: 'confirm', label: 'CONTINUE' }]
          : [{ action: 'select', label: 'MOVE' }, { action: 'confirm', label: 'ACT' }, { action: 'tabNext', label: 'RESTORE WINDOWS' }])
        : state.result ? 'ENTER / CLICK · CONTINUE' : '1–4 / CLICK · MOVE    ARROWS · SELECT    ENTER · ACT    R · RESTORE WINDOWS';
      drawMachinePanel(1, 1, cols - 2, rows - 2, {
        label: 'PRACTICE FIGHT', source: battle.enemy || 'THE SOUND OF SILENCE', footer, meter: false, theme: 'amber',
      });
      const panel = machinePanelBody(1, 1, cols - 2, rows - 2, { footer });
      const compact = panel.h < 24;
      let y = panel.y;
      const line = (text, role = 'ui-primary', alpha = .9) => {
        for (const value of uiWrap(text, Math.floor(panel.w))) { uiText(panel.x, y, value, role, alpha); y++; }
      };
      line(state.result ? (state.result === 'win' ? 'PRACTICE COMPLETE' : 'PRACTICE FAILED') : `OBJECTIVE: REPEAT THE FOUR-MOVE SEQUENCE FOR ${state.cycles} CYCLES.`, 'ui-amber');
      line(state.result ? `${state.cycle} cycles completed. ${state.mistakes} ${state.mistakes === 1 ? 'mistake' : 'mistakes'}.`
        : 'Clue windows: name each picture, subtract the letters, then combine left to right.');
      line(`Correct: -1 health. Wrong: -${state.missCost} composure. Practice equipment provided.`, 'ui-secondary', .9);
      y += .5;
      const gaugeY = y;
      drawCombatGauge({ x: panel.x, y, w: panel.w * .49, value: state.result === 'win' ? 0 : 4 - state.step, max: 4,
        label: `CYCLE ${Math.min(state.cycle + 1, state.cycles)}/${state.cycles}`, tone: 'enemy', now: elapsed });
      drawCombatGauge({ x: panel.x + panel.w * .53, y, w: panel.w * .47, value: state.composure, max: state.maxComposure,
        label: 'COMPOSURE', tone: 'player', now: elapsed });
      const actionY = compact ? gaugeY + 2.6 : panel.y + panel.h - 5.6;
      const stage = {x:panel.x,y:gaugeY+2.6,w:compact?panel.w*.61:panel.w,
        h:Math.max(3,compact?panel.y+panel.h-gaugeY-6.4:actionY-gaugeY-4.8)};
      const reducedMotion = shakeMode() !== 'full';
      const resolveProgress = feedbackUntil ? Math.max(0,Math.min(1,1-(feedbackUntil-elapsed)/.65)) : 0;
      const impact = feedbackUntil ? Math.max(0,1-resolveProgress*3) : 0;
      const enemyW = Math.min(40,stage.w*.46), enemyX = stage.x+stage.w*.54-enemyW/2;
      drawEnemyVoidStage('practice',{...stage,enemyBox:{x:enemyX,w:enemyW},reduceFlash:flashMode()!=='full',resolveProgress});
      drawSignalBeing('practice',{
        x:enemyX,y:stage.y,w:enemyW,h:stage.h,snr:'signal',
        coherenceRatio:state.result==='win'?0:(4-state.step)/4,movementIndex:state.cycle,
        now:elapsed,resolveProgress,reducedMotion,oblique:-.05,
        hitFlash:flashMode()==='off'?0:state.last?.correct?impact:0,
        knock:reducedMotion?0:state.last?.correct?impact:0,
      });
      drawFirstPersonHands(PRACTICE_MOVES[selected].tool,{
        stage,left:{x:stage.x+stage.w*.08,y:stage.y+stage.h*.42,w:stage.w*.27,h:stage.h*.58},
        right:{x:stage.x+stage.w*.7,y:stage.y+stage.h*.55,w:stage.w*.23,h:stage.h*.45},
        now:elapsed,resolveProgress,reducedMotion,hurt:state.last?.correct===false?impact:0,
        brace:state.last?.action==='hold'&&!!feedbackUntil,
      });
      if (arriving) drawBattleWipe({...stage,progress:Math.max(0,Math.min(1,(introElapsed-.38)/1.16)),reducedMotion});
      const progress = state.sequence.map((id, i) => state.result === 'win' || i < state.step ? id.toUpperCase() : '????').join('  >  ');
      if (!compact) uiText(panel.x, actionY - 1.4, `SEQUENCE: ${progress}`, 'ui-secondary', .85);
      tiles = [];
      const gap = .8, tileW = (panel.w - gap * 3) / 4;
      moves().forEach((move, index) => {
        const height = compact ? (panel.y + panel.h - actionY - 2.6) / 4 : 2.6;
        const tile = compact
          ? { index, x: panel.x + panel.w * .64, y: actionY + index * height, w: panel.w * .36, h: height - .25 }
          : { index, x: panel.x + index * (tileW + gap), y: actionY, w: tileW, h: height };
        drawCombatActionTile(move, { ...tile, selected: selected === index, focused: selected === index,
          executing: elapsed < feedbackUntil && state.last?.action === move.id, readout: false });
        tiles.push(tile);
      });
      y = compact ? panel.y + panel.h - 2.1 : actionY + 3.1;
      const windowStatus = pending ? 'OPENING CLUE WINDOWS...'
        : !native && !state.result ? windowIssue === 'disabled' ? 'ENABLE WINDOW CHOREOGRAPHY IN SETTINGS TO READ THE CLUES.'
          : windowIssue === 'desktop-required' ? 'THE CLUE WINDOWS REQUIRE THE DESKTOP VERSION.'
            : 'CLUE WINDOWS UNAVAILABLE. R: RETRY / ESC: SETTINGS.'
          : `PRACTICE TAKE: ${state.loaded ? 'LOADED' : 'EMPTY'}`;
      if (compact) uiText(panel.x, y - 1.4, state.result||native ? windowStatus : 'R: RESTORE CLUE WINDOWS', 'ui-secondary', .85);
      else line(windowStatus, 'ui-secondary', .85);
      line(notice, state.last?.correct === false ? 'ui-danger' : 'ui-amber', .95);
    },
  };
  return scene;
}
