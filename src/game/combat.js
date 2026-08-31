// Player-paced signal combat: deterministic rules, ordinary actions staged over
// a readable 1.2-second beat and reactive strikes over a four-beat phrase — the opponent
// floats top-centre, the recordist's hands rise from the bottom foreground,
// and the command band underneath spells out what every move actually does.

import * as scenes from './scenes.js';
import { uiCellMetrics, uiSize, uiFill, uiText, uiStrokeRect, uiLine } from '../render/ui.js';
import { drawLocationIndicator, drawMachinePanel, drawVfdCounter, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';
import { flashMode, shakeMode, textCps } from './access.js';
import { practiceInstrument } from './practice-room.js';
import { createPracticeClick, practiceTempo } from '../audio/practice-click.js';
import { activeInputPromptDevice, promptLine } from './bindings.js';
import {
  combatInjuryStage,
  drawBattleWipe,
  drawCombatActionTile,
  drawCombatGauge,
  drawCombatToolTile,
  drawEnemyVoidStage,
  drawFirstPersonHands,
  drawHallApparitions,
  drawAttackNotes,
  drawFireballEngulf,
  drawOpponentCombatArt,
  drawSignalBeing,
  drawFireballCast,
  drawSubmergedBattleField,
  drawStanceTriangle,
  submergedBattleFrame,
  drawTurnGlyph,
} from '../render/combat-view.js';
import { combatHudLayout } from '../render/combat-hud-layout.js';
import {
  COMBAT_ACTION,
  COMBAT_TOOL,
  PARRY_TIER,
  PARRY_TIERS,
  SOURCE_CHANNEL,
  availableCombatActions,
  availableCombatTools,
  combatIntentLookahead,
  combatMoveSubtext,
  combatApparitions,
  combatApparitionsSnapshot,
  combatPractice,
  combatMovesForTool,
  combatPrediction,
  combatResult,
  counterMovesForIntent,
  createCombatState,
  currentCombatIntent,
  predictedCombatIntent,
  reduceCombat,
  rivalCombatIntent,
  resolveCombatResult,
  advanceEnemy,
  applyFireballImpact,
  applyFireballReturn,
  selectEnemyIntents,
} from './combat-state.js';
import { readFidelity, thoughtTrace } from './thought-trace.js';
import { GRID, HIT_QUALITY, QUALITY_PRESENTATION } from './combat-damage.js';

import { visibleList } from './conversation.js';
import { TECHNIQUE_DEFS } from './combat-progression.js';
import {
  COMBAT_DIALOGUE_MIN_MANUAL_DWELL,
  battleDialoguePageView,
  battleLineAutoHoldSeconds,
  hardWrapBattleText,
  shouldAutoAdvanceBattleLine,
} from './combat-dialogue-model.js';
import { enemyAttackCue, enemyAttackShape, enemyAttackVoice, surferAggression } from '../audio/piano-weapon.js';
import { performanceIntrusionStage, reducePerformanceIntrusion } from './performance-intrusion.js';
import {
  PARRY_CONTACT_HOLD_SECONDS,
  PARRY_REACTION_SECONDS,
  isParryableEnemyAction,
  parryInputDecision,
  parryOpportunitySnapshot,
} from './combat-parry.js';
import { createBattleSubmersionController } from './battle-submersion.js';
import { createBattleWaterAudio } from '../audio/battle-water.js';
import { createFireballExchange, FIREBALL_RETURN_DAMAGE } from './fireball-exchange.js';
import { createFireballVoice } from '../audio/fireball-voice.js';

// Five to eight seconds, cycling, so the clock is a rhythm rather than a number
// the player learns to count against.
const TURN_LIMIT_SECONDS = Object.freeze([7, 5, 8, 6, 7, 5, 6, 8]);

// Which techniques are fired as moves in the fight (vs passives that change the
// rules). Derived from the authored descriptor so new actives need no code here.
const ACTIVE_TECHNIQUE_IDS = new Set(TECHNIQUE_DEFS.filter((t) => t.active).map((t) => t.id));

export const ORDINARY_TURN_SECONDS = 1.2;

export function combatEnemyAttackAudioShape(shape = {}, presentation = null, submersion = null) {
  if (presentation?.mode !== 'submerged' || !submersion?.enabled || submersion.wetMix <= .001) return { ...shape };
  return { ...shape, lowpassHz: Math.max(120, Number(submersion.lowpassHz) || 720) };
}
// ── the parry window ────────────────────────────────────────────────────────
// The blow lands at IMPACT. From WINDOW_LO up to it you may guard; before that
// you are bracing at air.
//
// Two things were wrong with this and both were about the player never finding
// it. It was BINARY — land the window and you turned the blow entirely, miss it
// by a frame and you got NOTHING TO TURN — which teaches people not to reach for
// it at all. And its only announcement anywhere in the fight was one line of
// footer chrome, in the same slot that otherwise reads RESOLVING · [ENTER]
// FAST-FORWARD, so most players never learned the mechanic existed.
//
// It is graded now (see PARRY_TIERS in combat-state.js), and it takes over the
// command band while a real struck blow is incoming. See parryWindow() and the
// reaction branch of render().
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

export function combatDeckDirection(event = {}) {
  const action = String(event.controllerAction || '');
  if (action === 'move_left') return 'left';
  if (action === 'move_right') return 'right';
  if (action === 'move_up') return 'up';
  if (action === 'move_down') return 'down';
  const key = String(event.key || '').toLowerCase();
  if (key === 'arrowleft' || key === 'a') return 'left';
  if (key === 'arrowright' || key === 'd') return 'right';
  if (key === 'arrowup' || key === 'w') return 'up';
  if (key === 'arrowdown' || key === 's') return 'down';
  return null;
}

export function combatDeckNavigation({
  phase = 'tool', selectedTool = 0, selectedMove = 0, toolCount = 0, moveCount = 0,
} = {}, direction = null) {
  const next = { phase, selectedTool, selectedMove };
  if (direction === 'left' || direction === 'right') {
    const delta = direction === 'left' ? -1 : 1;
    const count = phase === 'move' ? moveCount : toolCount;
    if (count <= 0) return next;
    if (phase === 'move') next.selectedMove = (selectedMove + delta + count) % count;
    else {
      next.selectedTool = (selectedTool + delta + count) % count;
      next.selectedMove = 0;
    }
    return next;
  }
  if (direction === 'down' && phase === 'tool' && moveCount > 0) next.phase = 'move';
  else if (direction === 'up' && phase === 'move') next.phase = 'tool';
  return next;
}

function opponentArt(ref, combatId = '') {
  const id = typeof ref === 'string' ? ref : String(ref?.id || '');
  // Encounters without authored raster art get the procedural signal-being
  // instead of borrowing another opponent's portrait.
  return ['surfer', 'guard'].includes(id) ? ref : { procedural: true, id: String(combatId || 'signal') };
}

// How it went, in the words a recordist would use. This is the "IT WAS SUPER
// EFFECTIVE" slot: the player has to be able to tell, without reading a number,
// whether what they did worked — and if it did not, what the blow did instead.
export function strikeVerdict(last = {}, { parried = false } = {}) {
  if (last.perfect) return { text: 'COUNTERED · NOTHING GETS THROUGH', role: 'ui-counter' };
  if (parried || last.parried) return { text: 'TURNED BACK ON IT', role: 'ui-counter' };
  if (last.snrTo === 'noise' && last.received) return { text: 'IT LANDS HARD · YOU ARE IN NOISE', role: 'ui-danger' };
  if (last.received > 1) return { text: 'IT LANDS HARD', role: 'ui-danger' };
  if (last.received) return { text: 'IT CONNECTS', role: 'ui-primary' };
  return { text: 'IT GLANCES OFF', role: 'ui-secondary' };
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
  // Keyed per run so the fight is deterministic within a night and different
  // between them. See the note at the call site in main.js.
  seed = 0,
  loadout = {},
  resources = {},
  source = null,
  // Knowledge of what this player has already read, so a second run of a fight
  // is not the same thirty-seven presses as the first. Combat never had one;
  // conversation.js has had the acceleration since it shipped.
  replay = null,
  // What the opponent already knows about how this recordist plays, from
  // earlier in the night. Null for the bench drill, which remembers nothing.
  carriedRead = null,
  continuation = null,
  musicSession = null,
  director = null,
  interference = null,
  environmentLighting = null,
  initialPerformanceIntrusion = 0,
  onPerformanceStage = () => {},
  onWin = () => {},
  onLose = () => {},
  onAbort = () => {},
} = {}) {
  if (!battle?.combat) throw new Error(`missing signal combat definition: ${battle?.id || 'unknown'}`);
  const voice = createSamDialogVoice({ volume: 0.26, getAudio });
  voice.warm?.();
  const submersionController = createBattleSubmersionController({ presentation:battle.combat.presentation });
  let submersionSnapshot = submersionController.snapshot();
  const waterAudio = createBattleWaterAudio({ enabled:submersionSnapshot.enabled, getAudio });
  let state = createCombatState(battle.combat, {
    difficulty,
    seed,
    injuries: loadout.injuries,
    battery: resources.battery ?? loadout.battery,
    torchDrainScale: loadout.torchDrainScale,
    tools: loadout.tools,
    techniques: loadout.techniques,
    carriedRead,
    continuation,
    source,
  });
  let phase = 'arrival';
  let queue = [];
  let cur = null;
  let typed = 0;
  let acc = 0;
  let held = 0;
  let lineDoneAt = null;
  let talkPage = 0;
  let confirmAdvanceLocked = false;
  let confirmLockedAt = -Infinity;
  let now = 0;
  let arrivalElapsed = 0;
  let handle = null;
  let onTalkEnd = () => {};
  let selectedTool = 0;
  let selectedMove = 0;
  let notice = '';
  // The state the moment the player committed — one whole turn may resolve over
  // two beats (player, then enemy), and the director/music must see the turn as
  // one span from here to the settled end.
  let turnStart = null;
  let takeConfirmation = false;
  let resolution = null;

  // The parry window for the beat currently resolving, or null when there is
  // nothing to parry. One function so the meter, the tile, the footer and the
  // key handler can never disagree about when the window is open or which grade
  // a press would earn.
  //
  // `parryWindowScale` (see COMBAT_RULES) widens the window by opening it
  // earlier. Seconds, grades, input grace, and the visible track all come from
  // one pure snapshot so there is no second, almost-matching UI definition.
  function parryWindow() {
    if (phase !== 'resolve' || !resolution) return null;
    return parryOpportunitySnapshot({
      side: resolution.side,
      actionKind: resolution.action?.kind,
      elapsed: resolution.elapsed,
      duration: resolution.duration,
      windowScale: state.difficulty?.parryWindowScale,
      attempted: resolution.parryTried,
      buffered: resolution.parryBuffered,
      parried: resolution.parried,
      whiffed: resolution.parryWhiffed,
      tier: resolution.parryTier,
      impactFired: resolution.impactFired,
    });
  }

  function commitParry(tier = PARRY_TIER.LATE) {
    if (!resolution || resolution.parryTried) return false;
    resolution.parryBuffered = false;
    resolution.parryTried = true;
    state = reduceCombat(state, { type: COMBAT_ACTION.PARRY, tier });
    resolution.after = state;
    resolution.parried = !!state.last?.parried;
    resolution.parryTier = state.last?.parryTier || tier;
    if (resolution.parried) {
      const weight = tier === PARRY_TIER.PERFECT ? .44
        : tier === PARRY_TIER.GOOD ? .30 : .18;
      fx?.flash?.(70, `rgba(120,220,255,${weight})`);
      audio?.menuMove?.();
    }
    return true;
  }

  function attemptParry(event = {}) {
    const opportunity = parryWindow();
    if (!opportunity || resolution?.impactFired) return false;
    const keyboardPress = event.key === ' ' || event.key === 'Enter' || event.key === 'z';
    const decision = parryInputDecision(opportunity, {
      repeat: event.repeat,
      held: keyboardPress && confirmHeld,
    });
    if (decision === 'ignore') return true;
    if (keyboardPress) confirmHeld = true;
    if (decision === 'buffer') {
      resolution.parryBuffered = true;
      resolution.parryEarly = false;
      notice = 'CONTACT ARMED';
      audio?.menuMove?.();
      return true;
    }
    if (decision === 'parry') {
      commitParry(opportunity.tier);
      return true;
    }
    if (decision === 'miss') {
      resolution.parryTried = true;
      resolution.parryWhiffed = true;
      notice = 'MISSED CONTACT';
      return true;
    }
    resolution.parryEarly = true;
    notice = 'WAIT FOR CONTACT';
    return true;
  }
  // Rotates the adversary's piano voice within a movement's stem set, so
  // successive enemy beats don't repeat the same note.
  let enemyBeatSeq = 0;
  // What the surfer is hitting you with THIS beat, said out loud on the stage:
  // who, the blow, the instrument, and then whether it worked. Every enemy attack
  // is announced — the fight used to show numbers after the fact and expect the
  // player to work backwards from them to a move they never saw named.
  let strike = null;
  // Whether the recordist's last read missed. Set when a blow arrives that the
  // thought did not name, cleared once the next thought has owned up to it, so
  // the correction is said exactly once and by the person who was wrong.
  let readMissed = false;
  const integer = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback);
  // The exchange the fight is on, shown by the turn glyph. One per player+enemy
  // beat pair; incremented as each turn settles into the next.
  let turnCount = 1;
  let resultDelivered = false;
  let sceneEntered = false;
  let openingStarted = false;
  let musicBootResolved = !musicSession;
  // The wing's metronome. Nothing else in the game has one, and it is the only
  // clock in that room — see practice-click.js.
  let practiceClick = null;
  let musicFinished = false;
  let toolRows = [];
  let moveRows = [];
  let channelRows = [];
  let apparitionRows = [];
  let reactionRect = null;
  let fireballRect = null;
  let onSurfaceHit = null;
  // Where and when a comet last landed on the frame. The engulf is drawn over
  // the whole panel from the bearing it came in on -- see drawFireballEngulf.
  let fireballEngulf = null;
  // THE TURN HAS A CLOCK NOW.
  //
  // Five to eight seconds to read the intent and answer it. Long enough to
  // think, short enough that you have to think on your feet; varied per turn so
  // the rhythm cannot be learned as a count. Let it run out and the beat is the
  // opponent's alone -- not a penalty applied to you, just the fight carrying
  // on without your answer, which is what a forfeit is.
  let turnClock = null;
  let skipRect = null;
  let skipArmed = false;
  let regionRects = {};
  let introElapsed = 0;
  let resultSurfacePending = false;
  let resultChoreographyPending = false;
  let hitstop = 0;
  let popups = [];
  let popupSeq = 0;
  let impactFx = null;
  let barGhost = { composure: null, coherence: null };
  let performanceIntrusion = Math.max(0,Math.min(.32,Number(initialPerformanceIntrusion)||0));
  let performanceStage = performanceIntrusionStage(performanceIntrusion);
  // The comets are pitched. See fireball-voice.js: a cast is an arpeggio, a
  // volley is that chord struck at once, a deflection answers a fifth up, and
  // the third one -- the one that arms the RETURN -- is the only resolved sound
  // anywhere in the exchange.
  const fireballVoice=createFireballVoice({getAudio});
  // `ray-3` is the third degree of the scale. The pitch belongs to the comet,
  // so answering the second one always answers it in the same place.
  const rayIndexOf=(rayId)=>Math.max(0,(Number(String(rayId||'').split('-')[1])||1)-1);
  const fireballExchange=createFireballExchange({
    battleId:battle.combat.id,
    reducedMotion:shakeMode()!=='full',
    manual:false,
    returnDamage:FIREBALL_RETURN_DAMAGE,
    beginCast:(event)=>interference?.beginFireballCast?.(event)||null,
    resolveCast:(event)=>interference?.resolveFireballCast?.(event),
    onReturn:({castId,damage,casterId})=>{
      fireballVoice.returned();
      return commitFireballReturn({castId,damage,casterId});
    },
    onImpact:({castId,rayId,damage})=>{
      const ray=fireballExchange.snapshot().active?.plan?.rays?.[rayIndexOf(rayId)];
      fireballEngulf={at:now,u:Math.max(0,Math.min(1,ray?.exit?.x??.5)),v:Math.max(0,Math.min(1,ray?.exit?.y??.5)),answered:false};
      fireballVoice.land(rayIndexOf(rayId));
      return commitFireballImpact({castId,damage});
    },
    onLaunch:({index,volley})=>fireballVoice.cast(index,{volley}),
    // Everything drawn outside the game window comes from this, once a frame,
    // for the whole volley. Nothing else opens, moves or closes a surface.
    onSync:(frame)=>{void Promise.resolve(interference?.syncFireballCast?.(frame)).catch(()=>null);},
    // Where in the night this cast is. Sampled once per cast so the shoal's
    // behaviour is a staircase across turns rather than something that changes
    // under the player's hand mid-flight.
    getPressure:()=>({battleId:battle.combat.id,turn:state.turns}),
    // The stage band, as a fraction of the game window. Every ray coordinate is
    // relative to THIS rect, and anything drawing outside the window has to be
    // told so -- see the note on the plan's `stage` field.
    getStage:()=>{
      if(!fireballRect)return null;
      const {cols,rows}=uiSize();
      if(!cols||!rows)return null;
      return{
        x:fireballRect.x/cols,y:fireballRect.y/rows,
        w:fireballRect.w/cols,h:fireballRect.h/rows,
      };
    },
  });

  const movement = (index = state.movementIndex) => battle.combat.movements[index] || null;
  const stopVoice = () => { handle?.stop?.(); handle = null; };
  const isConfirmInput = (e = {}) => e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.controllerAction === 'confirm';

  function estimateDialogueViewport() {
    const { cols, rows } = uiSize();
    // This mirrors the centred battle panel loosely enough for auto-advanced
    // authored barks; render() computes the exact viewport for player-visible
    // pagination.
    const panelW = Math.min(118, cols - 4);
    const width = Math.max(20, panelW - 4);
    const available = Math.max(2, Math.min(6, rows - 20));
    // A lead-in eats rows off the top and indents the body, so the paging maths
    // here has to know about it or the MORE state disagrees with what is drawn.
    const lead = String(cur?.lead || '').trim();
    if (!lead) return { width, rows: available };
    const leadRows = hardWrapBattleText(lead, width).length;
    return { width: Math.max(12, width - 2), rows: Math.max(1, available - leadRows) };
  }

  function currentBattleDialogueView({ width, rows } = {}) {
    const viewport = width && rows ? { width, rows } : estimateDialogueViewport();
    return battleDialoguePageView({
      text: textOf(cur),
      typed,
      width: viewport.width,
      maxRows: viewport.rows,
      page: talkPage,
    });
  }

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

  // Deterministic per turn: a fight replayed from the same state gets the same
  // clock, and the length is not a coin flip the player can feel being tossed.
  function turnSeconds(turn = 0) {
    return TURN_LIMIT_SECONDS[Math.abs(Math.floor(Number(turn) || 0)) % TURN_LIMIT_SECONDS.length];
  }

  function armTurnClock() {
    const limit = turnSeconds(state.turns);
    turnClock = { limit, left:limit, expired:false };
  }

  function disarmTurnClock() { turnClock = null; }

  function forfeitTurn() {
    disarmTurnClock();
    notice = 'NO ANSWER · THE BEAT IS THEIRS';
    audio?.menuMove?.();
    fx?.flash?.(70, 'rgba(255,88,40,0.22)');
    turnStart = state;
    beginEnemyBeat();
  }

  function beginToolSelection() {
    phase = 'tool';
    takeConfirmation = false;
    selectedMove = 0;
    armTurnClock();
    repairSelection();
    // The exchange is over and the beat is his again: this is where a bark
    // lands, on top of the deck he is already reading.
    nextBark();
  }

  // A blocking block. The scene stops, the command deck goes away, and the
  // player reads at their own pace. `before`, `after`, the intro and the two
  // endings arrive this way.
  //
  // `when:` is honoured here and nowhere else in the fight — a line the flags
  // hide never enters the queue. The rule comes from conversation.js so that a
  // line cannot be invisible in a thought tree and visible in a battle.
  function speak(lines, then) {
    queue = visibleList(lines || []).filter((line) => textOf(line)).slice();
    onTalkEnd = then || (() => {});
    phase = 'talk';
    nextLine();
  }

  // ── barks ─────────────────────────────────────────────────────────────────
  // `on-listen` used to be concatenated onto `before` and delivered as the
  // second half of one block, which made the channel a fiction: a round
  // authored in three movements arrived as one wall of prose with the fight
  // waiting behind it.
  //
  // It means what it says now. These are the lines you hear WHILE the take is
  // running — barked between exchanges, one per exchange, over the top of the
  // command deck rather than in place of it. They do not block, they do not
  // hide the intent card, and they time out on their own.
  // The stable id of the line on screen, and whether this player has finished
  // reading it in an earlier run. Authored lines carry `sourceId` through
  // rehydration, so the key survives a rewrite of the surrounding tree.
  let activeLineId = null;
  let activeLineSeenBefore = false;
  let confirmHeld = false;

  let barkQueue = [];
  let bark = null;
  let barkHold = 0;

  function armBarks(m) {
    barkQueue = visibleList(m?.onListen || []).filter((line) => textOf(line));
    bark = null;
    barkHold = 0;
  }

  function nextBark() {
    // Never on the opening beat. The block that set the scene has only just
    // finished; a bark on top of it is the wall of prose again with extra steps.
    if (bark || !barkQueue.length || integer(state.turnsInMovement, 0) < 1) return;
    bark = barkQueue.shift();
    barkHold = battleLineAutoHoldSeconds(bark);
    const who = whoOf(bark);
    const text = textOf(bark);
    if (bark.cue) fx?.cue?.(bark.cue, { group: 'battle' });
    if (text && isVoiced(who) && bark.voice !== false) voice.start(text, { speaker: who, rate: bark.rate || 1 });
  }

  function clearBark() { bark = null; barkHold = 0; }

  function nextLine() {
    stopVoice();
    audio?.stopTyping?.();
    cur = queue.shift() || null;
    typed = 0;
    acc = 0;
    held = 0;
    talkPage = 0;
    lineDoneAt = null;
    if (!cur) {
      musicSession?.setDialogueActive?.(false);
      onTalkEnd();
      return;
    }
    activeLineId = replay && (cur.sourceId || cur.id) ? `${battle.combat?.id || battle.id}:${cur.sourceId || cur.id}` : null;
    activeLineSeenBefore = activeLineId ? replay.lineStatus?.(activeLineId) === 'seen-before-run' : false;
    const who = whoOf(cur);
    const text = textOf(cur);
    const spoken = text && isVoiced(who) && cur.voice !== false;
    musicSession?.setDialogueActive?.(!!spoken);
    // Grouped, so stopCueGroup('battle') reaches it. Ungrouped, a line's cue
    // outlived the fight that fired it.
    if (cur.cue) fx?.cue?.(cur.cue, { group: 'battle' });
    if (spoken) handle = voice.start(text, { speaker: who, rate: cur.rate || 1 });
    else if (text) audio?.startTyping?.({ gain: TYPE_GAIN * (TYPE_LEVEL[who === 'direction' ? 'direction' : 'thought'] || 1) });
  }

  function enterMovement(index = state.movementIndex) {
    const next = movement(index);
    fireballExchange.setMovement({
      id:next?.id||'',index,
      title:next?.title||next?.label||next?.id||'',
    });
    submersionSnapshot = submersionController.setMovement(index);
    waterAudio.setPhase(submersionSnapshot);
    musicSession?.setSubmersion?.(submersionSnapshot);
    voice.setEnvironment?.(submersionSnapshot);
    playSound?.({ threat: next?.threat ?? .45 + index * .1 });
    void Promise.resolve(interference?.movement?.({
      id: next?.id || '',
      index,
      title: next?.title || next?.label || next?.id || '',
    })).catch(() => null);
    armBarks(next);
    const lines = next?.before || [];
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
    musicSession?.finish?.(state.result?.result || 'win');
  }

  function beginResultDelivery() {
    const result = state.result?.result || 'win';
    submersionSnapshot = submersionController.beginResult(result);
    waterAudio.setPhase(submersionSnapshot);
    musicSession?.setSubmersion?.(submersionSnapshot);
    voice.setEnvironment?.(submersionSnapshot);
    if (result === 'win' && submersionSnapshot.enabled && !submersionSnapshot.settled) {
      resultSurfacePending = true;
      phase = 'submersion';
      return;
    }
    finishMusic();
    if(result==='lose'&&!resultChoreographyPending){
      resultChoreographyPending=true;
      phase='result-choreography';
      Promise.resolve(interference?.result?.(result)).catch(()=>null).finally(deliverResult);
      return;
    }
    deliverResult();
  }

  function deliverResult() {
    if (resultDelivered) return;
    resultDelivered = true;
    fx?.stopCues?.();   // the last blow does not outlive the fight
    const metrics = combatResult(state) || {};
    const legacyMetrics = {
      ...metrics,
      continuation: { ...(metrics.continuation || {}) },
      attempts: Math.max(1, Number(metrics.turns) || 1),
      playerHealth: metrics.composure,
      enemyHealth: 0,
      performanceIntrusion,
      performanceStage,
    };
    speak(metrics.result === 'win' ? battle.win : battle.lose, () => {
      stopVoice();
      audio?.stopTyping?.();
      Promise.resolve(interference?.finish?.(metrics.result, legacyMetrics)).catch(() => null).finally(() => {
        scenes.pop();
        (metrics.result === 'win' ? onWin : onLose)(legacyMetrics);
      });
    });
  }

  function syncResourceSpend(before, after) {
    const spent = Math.max(0, Number(after.torchSpent) - Number(before.torchSpent));
    if (spent > 0) resources.spendBattery?.(spent);
    if (after.last?.consumed) resources.consumeItem?.(after.last.consumed);
  }

  function spawnPopup(popup) {
    popupSeq += 1;
    popups.push({ ...popup, born: now + (popup.delay || 0), jx: ((popupSeq % 3) - 1) * 2 });
  }

  function fireImpact() {
    if (!resolution || resolution.impactFired) return;
    resolution.impactFired = true;
    const before = resolution.before;
    const after = resolution.after;
    const last = after.last || {};
    const enemyBeatImpact = resolution.side === 'enemy';
    // The player's tool sound belongs to the player beat; the enemy beat is the
    // opponent's, so it plays no tool. dealt is zeroed for the enemy beat's
    // audio/fx because it carries over from the player step (see below).
    if (!enemyBeatImpact) resources.playTool?.(resolution.action.tool, resolution.action.id);
    const impactDealt = enemyBeatImpact ? 0 : (last.dealt || 0);
    resources.playImpact?.({
      dealt: impactDealt,
      received: last.received || 0,
      perfect: !!last.perfect,
    });
    impactFx = { at: now, dealt: impactDealt, received: last.received || 0 };
    // Hit-stop: the whole beat freezes for a few frames so the hit has weight.
    if (shakeMode() === 'full' && (impactDealt > 0 || last.received > 0)) {
      // Divided by GRID because damage numbers are five times what they were
      // when these coefficients were chosen; a critical would otherwise freeze
      // the beat for the whole cap every time.
      hitstop = Math.min(.15, .05 + (impactDealt * .012 + (last.received || 0) * .03) / GRID);
    }
    if (last.perfect && flashMode() === 'full') fx?.flash?.(60, 'rgba(255,214,120,0.30)');
    const enemyBeat = resolution.side === 'enemy';
    // The player beat shows what the player did to the enemy (coherence, heal);
    // the enemy beat shows what it did back (composure). `last.dealt` carries
    // over from the player step into the enemy-after state, so the side guard is
    // what stops the dealt popup firing twice.
    if (!enemyBeat && last.enemyDodge) {
      // The surfer turned your swing. No coherence lost; a parry nicks composure.
      spawnPopup({ text: last.enemyDodge.mode === 'parry' ? 'PARRIED' : 'DODGED', role: 'ui-danger', anchor: 'enemy' });
      if (last.enemyDodge.nick > 0) spawnPopup({ value: last.enemyDodge.nick, kind: 'received', anchor: 'hands', delay: .12 });
      fx?.flash?.(66, 'rgba(120,220,255,0.24)');
      fx?.shake?.(.2, 180);
    } else if (!enemyBeat && last.dealt > 0) {
      barGhost.coherence = { from: before.movementCoherence, at: now };
      spawnPopup({ value: last.dealt, kind: 'dealt', anchor: 'enemy' });
      // HOW WELL, not just how much. Damage is a band now (combat-damage.js) and
      // where the hit landed inside it is the feedback on how the beat was
      // played — so the tier is named, and the screen answers proportionally. A
      // CLEAN hit says nothing, because "clean" is the thing that needs no word.
      const grade = QUALITY_PRESENTATION[last.quality] || null;
      if (grade?.label) {
        spawnPopup({
          text: grade.label,
          role: last.quality === HIT_QUALITY.CRITICAL ? 'ui-amber'
            : last.quality === HIT_QUALITY.GRAZE ? 'ui-secondary' : 'ui-primary',
          anchor: 'enemy',
          delay: .08,
        });
      }
      const weight = grade?.weight ?? 1;
      fx?.flash?.(72, `rgba(255,180,55,${(0.38 * weight).toFixed(3)})`);
      fx?.glitch?.((.24 + Math.min(.32, last.dealt * .014)) * weight, 150);
      if (last.quality === HIT_QUALITY.CRITICAL && shakeMode() === 'full') fx?.shake?.(.28, 200);
    }
    if (enemyBeat && last.parried) {
      // Turned. No composure lost this beat — the blow's force went back as
      // coherence, and the guard reads cold-blue, not red.
      spawnPopup({ text: 'PARRIED', role: 'ui-blue', anchor: 'hands' });
      if (last.dealt > 0) {
        barGhost.coherence = { from: before.movementCoherence, at: now };
        spawnPopup({ value: last.dealt, kind: 'dealt', anchor: 'enemy', delay: .1 });
      }
      fx?.flash?.(80, 'rgba(120,220,255,0.42)');
    } else if (enemyBeat && last.received > 0) {
      barGhost.composure = { from: before.composure, at: now };
      // Chained hits each get their own popup, fanned out in time so a two-hit
      // enemy turn reads as two blows rather than one big number.
      const hits = last.enemyHits?.length ? last.enemyHits : [{ received: last.received }];
      hits.forEach((hit, i) => {
        if (hit.received > 0) spawnPopup({ value: hit.received, kind: 'received', anchor: 'hands', delay: i * .16 });
      });
      fx?.flash?.(90, 'rgba(154,20,30,0.48)');
      // /GRID: the coefficient predates the rescale (see combat-damage.js).
      fx?.shake?.(.26 + Math.min(.50, last.received * .11 / GRID), 220);
    }
    if (!enemyBeat && (last.composureTo ?? 0) > (last.composureFrom ?? 0)) {
      barGhost.composure = { from: last.composureFrom, at: now };
      spawnPopup({ value: last.composureTo - last.composureFrom, kind: 'heal', anchor: 'hands' });
    }
    if (last.perfect) spawnPopup({ text: 'NEGATED', role: 'ui-amber', anchor: 'hands' });
    if (after.take && !before.take && last.action === COMBAT_ACTION.MONITOR) {
      spawnPopup({ text: 'CAPTURED', role: 'ui-blue', anchor: 'enemy' });
    }
    if (enemyBeatImpact) {
      waterAudio.impact({
        received:Math.max(0,Number(last.received)||0),
        parried:!!last.parried,
      },submersionSnapshot);
      // Personalized bookkeeping may write asynchronously, but presentation is
      // never a combat fence.
      void Promise.resolve(interference?.impact?.({
        kind: resolution.action?.kind || null,
        perfect: !!last.perfect,
        parried: !!last.parried,
        received: Math.max(0, Number(last.received) || 0),
        transition: last.transition || null,
        windowLock:fireballCatchLocked(),
      })).catch(() => null);
    }
  }

  function fireballCatchLocked(){
    const snapshot=fireballExchange.snapshot();
    return !!snapshot.choreography?.settled&&!!snapshot.active?.rays?.some((ray)=>ray.state==='approach');
  }

  function finishResolution() {
    if (!resolution) return;
    // A player beat that deferred the enemy turn hands off to the enemy beat;
    // everything else (tempo, movement break, KO, or the finished enemy beat)
    // settles the whole turn.
    if (resolution.side === 'player' && state.phase === 'enemy' && !state.result) {
      resolution = null;
      beginEnemyBeat();
      return;
    }
    // Hall initiative is YOU → 01 → 02 → 03. Fireballs keep their own clock;
    // advancing an apparition neither creates nor cancels one.
    if (resolution.side === 'enemy' && state.apparitions && state.phase === 'enemy' && !state.result) {
      resolution = null;
      beginEnemyBeat();
      return;
    }
    settleTurn();
  }

  function handleStateEndpoint(fallbackMovementIndex=state.movementIndex,{fromFireball=false}={}){
    if(state.result){
      if(!fromFireball)fireballExchange.cancel();
      const finished=movement(state.last?.transition?.from??fallbackMovementIndex);
      const tail=[...(finished?.after||[])];
      if(tail.length)speak(tail,beginResultDelivery);
      else beginResultDelivery();
      return true;
    }
    if(state.last?.transition?.to!=null){
      if(!fromFireball)fireballExchange.cancel();
      const old=movement(state.last.transition.from);
      const closing=old?.after||[];
      clearBark();
      resources.playImpact?.({transition:true});
      interference?.windowLock?.(fireballCatchLocked());
      void Promise.resolve(interference?.phaseBreak?.({
        from:state.last.transition.from,
        to:state.last.transition.to,
      })).catch(()=>null);
      barGhost.coherence=null;
      const openNext=()=>enterMovement(state.movementIndex);
      if (closing.length) speak(closing, openNext);
      else openNext();
      return true;
    }
    return false;
  }

  // ONE ANSWER FOR A STRUCK COMET, WHEREVER THE CLICK CAME FROM.
  //
  // The in-canvas pointer and a click on an external cast surface are the same
  // act, so they say the same thing and make the same sound -- which is a fifth
  // above the note that comet was thrown at, except for the third one, which is
  // the tonic and the only time this exchange resolves.
  function announceFireballHit(result){
    const degree=rayIndexOf(result.rayId);
    if(result.returned)fireballVoice.arm();
    else fireballVoice.deflect(degree);
    notice=result.returned
      ? 'RETURN ARMED · RANGED IN FLIGHT'
      : `DEFLECT · RETURN ${result.charge}/${result.threshold}`;
    fx?.flash?.(55,result.returned?'rgba(120,220,255,0.30)':'rgba(255,188,52,0.20)');
  }

  function commitFireballReturn({castId='',damage=FIREBALL_RETURN_DAMAGE,casterId=null}={}){
    if(state.result)return false;
    const before=state;
    const coherenceFrom=state.movementCoherence;
    state=applyFireballReturn(state,{castId,damage,casterId});
    const dealt=Math.max(0,coherenceFrom-state.movementCoherence);
    if(dealt<=0)return false;
    notice=`RETURN · ${dealt} RANGED`;
    barGhost.coherence={from:coherenceFrom,at:now};
    spawnPopup({text:'RETURN',role:'ui-blue',anchor:'enemy'});
    spawnPopup({value:dealt,kind:'dealt',anchor:'enemy',delay:.08});
    resources.playImpact?.({dealt,received:0,perfect:true,ranged:true});
    fx?.flash?.(82,'rgba(120,220,255,0.42)');
    if(resolution)resolution.after=state;
    if(state.result||state.last?.transition?.to!=null){
      const fallback=before.movementIndex;
      resolution=null;
      turnStart=null;
      fx?.stopCues?.();
      handleStateEndpoint(fallback,{fromFireball:true});
    }
    return true;
  }

  // A COMET NOBODY TOUCHED LANDS ON YOU.
  //
  // The mirror of commitFireballReturn, and the reason the RETURN is worth
  // anything: ignoring a fireball used to be free, which made three clicks for
  // ten damage a bonus rather than a decision. Outside the turn, like the
  // return — no move consumed, no clock advanced.
  function commitFireballImpact({castId='',damage=0}={}){
    if(state.result)return false;
    const before=state;
    const composureFrom=state.composure;
    state=applyFireballImpact(state,{castId,damage});
    const received=Math.max(0,composureFrom-state.composure);
    if(received<=0)return false;
    notice=`RANGED · ${received}`;
    barGhost.composure={from:composureFrom,at:now};
    spawnPopup({value:received,kind:'received',anchor:'player'});
    resources.playImpact?.({dealt:0,received,perfect:false,ranged:true});
    fx?.flash?.(70,'rgba(255,140,40,0.34)');
    if(shakeMode()==='full')fx?.shake?.(.4,180);
    if(resolution)resolution.after=state;
    if(state.result){
      const fallback=before.movementIndex;
      resolution=null;
      turnStart=null;
      fx?.stopCues?.();
      handleStateEndpoint(fallback,{fromFireball:true});
    }
    return true;
  }

  function settleTurn() {
    if (!resolution) return;
    const resolved = resolution;
    resolution = null;
    // The exchange is over, and so is the sound of it.
    fx?.stopCues?.();
    // The director and music read the turn as one span: from where the player
    // committed (turnStart) to the settled end-state.
    const tutorialAdvanced=director?.advance?.(turnStart || resolved.before, state);
    if(tutorialAdvanced&&director?.completeBattle?.()&&!state.result){
      state=resolveCombatResult(state,'win');
    }
    turnStart = null;
    const last=state.last||{};
    const correct=last.perfect===true||last.parried===true||((Number(last.dealt)||0)>0&&(Number(last.received)||0)===0);
    const changed=reducePerformanceIntrusion(performanceIntrusion,{
      missed:(Number(last.received)||0)>0||!correct,
      correct,
      movementTransition:last.transition?.to!=null,
    });
    const previousStage=performanceStage;
    performanceIntrusion=changed.value;
    performanceStage=changed.stage;
    musicSession?.setIntrusion?.(performanceIntrusion);
    if(previousStage!==performanceStage)onPerformanceStage({
      battleId:battle.combat.id,value:performanceIntrusion,stage:performanceStage,previousStage,
    });
    // This exchange has settled; the next one is a new turn on the glyph.
    if (!state.result) turnCount += 1;
    if (!state.result) musicSession?.onCombatEvent?.({
      perfect: state.last?.perfect === true,
      transition: state.last?.transition || null,
      movementIndex: state.movementIndex,
    });

    if(handleStateEndpoint(resolved.before.movementIndex))return;
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
    disarmTurnClock();
    syncResourceSpend(before, next);
    turnStart = before;
    state = next;
    interference?.action?.(actionId);
    notice = state.last?.notice || '';
    audio?.menuConfirm?.();
    resolution = {
      before,
      after: state,
      action,
      side: 'player',
      elapsed: 0,
      duration: turnDuration(actionId),
      impactFired: false,
    };
    phase = 'resolve';
    repairSelection();
  }

  // The opponent's own beat. It runs when the player step deferred the enemy
  // turn (phase 'enemy'). A tempo action, completed movement, or KO can settle
  // directly; a perfect counter still hands over initiative because it blunts
  // the committed blow instead of deleting it.
  function beginEnemyBeat() {
    const before = state;
    const intents = selectEnemyIntents(state);
    const primary = intents[0] || null;
    // Did the recordist have this one wrong? Asked here, against the state the
    // blow is arriving out of, because advanceEnemy clears the misread when it
    // writes the next commitment — and the answer has to survive into the
    // thought that owns up to it a beat later.
    readMissed = !!before.misread && before.misread.id !== primary?.id;
    const next = advanceEnemy(state);
    state = next;
    notice = state.last?.notice || '';
    // The adversary's attack is an instrument: each movement has its own piano
    // voice, and a low-composure recordist hears the SCREAM instead. Fired here,
    // on the enemy beat, so the sound arrives with the blow.
    if (primary) {
      // The surfer sounds like what it is doing this beat — its intent's voice —
      // not a slot on a clock.
      const beat = enemyBeatSeq++;
      const cueId = enemyAttackCue({
        intentKind: primary.kind,
        beat,
        composure: next.composure,
        maxComposure: next.maxComposure,
        // In the practice wing the sound is the room bleeding through the
        // partition, not the shape of a blow. Null everywhere else, which leaves
        // the intent mapping exactly as it was.
        instrument: next.practice ? practiceInstrument(next.practice) : null,
      });
      // The blow is a chop off the surfer's take, and it is this beat's sound
      // and no longer: it is cut to half a bar on the way in (enemyAttackShape)
      // and it goes out on the battle voice group, which is cut when the turn
      // settles. A stem still ringing in the next exchange — or out past the end
      // of the fight — is the surfer playing at a fight that is over.
      // The chop carries the opponent's mood: a cornered surfer is louder and
      // holds the bite longer than one that is still taking your measure.
      const lean = surferAggression(state.difficulty?.composureBonus, before.stance?.id);
      if (cueId) {
        const shape=combatEnemyAttackAudioShape(
          {group:'battle',...enemyAttackShape(cueId,beat,Math.random,lean)},
          battle.combat.presentation,
          submersionSnapshot,
        );
        fx?.cue?.(cueId,shape);
      }
      strike = { ...enemyAttackVoice(primary.kind, cueId), label: `${primary.actorLabel ? `${primary.actorLabel} · ` : ''}${primary.label}`, kind: primary.kind };
    } else strike = null;
    resolution = {
      before,
      after: next,
      action: { id: 'enemy', tool: COMBAT_TOOL.SELF, label: `${primary?.actorLabel ? `${primary.actorLabel} · ` : ''}${primary?.label || 'INTENT'}`, kind: primary?.kind || null },
      intent:primary,
      side: 'enemy',
      elapsed: 0,
      // Struck blows receive a four-beat reaction phrase. Other enemy actions
      // keep the ordinary duration; the score conductor itself is untouched.
      duration: isParryableEnemyAction(primary?.kind)
          ? PARRY_REACTION_SECONDS
          : ORDINARY_TURN_SECONDS * Math.max(1, next.last?.enemyHits?.length || 1),
      impactFired: false,
      parryBuffered: false,
      parryTried: false,
      parryWhiffed: false,
      parryEarly: false,
    };
    phase='resolve';
  }

  function cycleChannel(delta) {
    if (!['tool', 'move'].includes(phase)) return;
    // Q/E is "pick the thing on the left of the stage", and no encounter has
    // both: the source battle arms a channel, the Hall picks one apparition.
    // Sharing the binding keeps the deck's shape identical everywhere.
    if (state.apparitions) {
      state = reduceCombat(state, { type: COMBAT_ACTION.TARGET, delta });
      notice = state.last.notice;
      audio?.menuMove?.();
      return;
    }
    if (!state.source) return;
    const at = CHANNELS.findIndex((entry) => entry.id === state.source.armed);
    const next = CHANNELS[(at + delta + CHANNELS.length) % CHANNELS.length];
    state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: next.id });
    notice = state.last.notice;
    audio?.menuMove?.();
  }

  function navigateDeck(direction) {
    const before = { phase, selectedTool, selectedMove };
    const next = combatDeckNavigation({
      ...before,
      toolCount: tools().length,
      moveCount: moves().length,
    }, direction);
    phase = next.phase;
    selectedTool = next.selectedTool;
    selectedMove = next.selectedMove;
    if (phase === before.phase && selectedTool === before.selectedTool && selectedMove === before.selectedMove) return;
    takeConfirmation = false;
    audio?.menuMove?.();
  }

  function skipDrill() {
    if (!director?.active?.()) return false;
    director.skip();
    skipArmed = false;
    notice = 'DRILL SKIPPED · ALL MOVES OPEN';
    audio?.menuMove?.();
    return true;
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
      if (state.practice) {
        const rig = getAudio?.();
        practiceClick = createPracticeClick({ ctx: rig?.ctx, context: rig?.ctx, destination: rig?.destination });
        practiceClick.start();
      }
      void Promise.resolve(interference?.enter?.()).catch(() => null);
      // A fireball that has left the frame is on a cast surface, and clicking
      // that surface is the same act as clicking the comet on the stage. The
      // surface reports which ray was struck; nothing else about it is trusted
      // or needed. Bound for the life of the scene only — no fight ever hands a
      // click to the one after it.
      if (typeof window !== 'undefined') {
        onSurfaceHit = (event) => {
          if (!sceneEntered || state.result) return;
          if (!['tool', 'move', 'resolve'].includes(phase)) return;
          const result = fireballExchange.strike(event?.detail || {});
          if (result.hit) announceFireballHit(result);
        };
        window.addEventListener('chunk-surfer:fireball-hit', onSurfaceHit);
      }
      phase = musicSession ? 'arrival' : 'talk';
      if (!musicSession) { beginOpening(); return; }
      Promise.resolve(musicSession.start?.()).then((music) => {
        if (!sceneEntered) return;
        musicBootResolved = true;
        musicSession?.setIntrusion?.(performanceIntrusion);
        if (music?.phase !== 'arrival') beginOpening();
      }).catch((error) => {
        console.warn('battle music start failed', error);
        musicBootResolved = true;
        beginOpening();
      });
    },

    exit() {
      sceneEntered = false;
      if (onSurfaceHit && typeof window !== 'undefined') {
        window.removeEventListener('chunk-surfer:fireball-hit', onSurfaceHit);
        onSurfaceHit = null;
      }
      stopVoice();
      audio?.stopTyping?.();
      fx?.stopCues?.();   // never let a stem the surfer was mid-swing with outlive the scene
      // A metronome ticking in a corridor he has left is the same failure as a
      // weapon stem outliving the fight.
      practiceClick?.stop();
      practiceClick = null;
      fireballExchange.stop();
      fireballVoice.dispose();
      waterAudio.stop();
      voice.dispose?.();
      if (!musicFinished) {
        if (state.result) finishMusic();
        else musicSession?.abort?.();
      }
      if (!resultDelivered && !state.result) onAbort();
      if (!resultDelivered && !state.result) void Promise.resolve(interference?.finish?.('abort', {})).catch(() => null);
    },

    battleView() {
      return {
        phase,
        state: JSON.parse(JSON.stringify(state)),
        intent: currentCombatIntent(state),
        // Both sides of the split, so a test can prove they are the same when
        // the read is good and prove they differ when it is not.
        predicted: predictedCombatIntent(state),
        lookahead: combatIntentLookahead(state),
        // What the recordist thinks is coming, as the card is currently saying
        // it. Exposed so the trace can be read back in tests without a canvas.
        thought: thoughtTrace(state, {
          intent: predictedCombatIntent(state),
          alternative: rivalCombatIntent(state),
          counters: counterMovesForIntent(state, predictedCombatIntent(state)),
          wrong: readMissed,
          fidelity: readFidelity(state),
          apparitions: combatApparitions(state),
        }),
        tools: availableCombatTools(state),
        moves: moves(),
        actions: availableCombatActions(state),
        prediction: combatPrediction(state),
        music: musicSession?.snapshot?.() || null,
        submersion: submersionSnapshot,
        waterAudio: waterAudio.snapshot(),
        presentation:battle.combat.presentation||null,
        performanceIntrusion,
        performanceStage,
        fireball:fireballExchange.snapshot(),
        selectedTool,
        selectedMove,
        notice,
        resolution: resolution ? {
          elapsed: resolution.elapsed,
          duration: resolution.duration,
          action: resolution.action.id,
          side: resolution.side,
          parry: parryWindow(),
        } : null,
        statePhase: state.phase,
        tutorial: director?.snapshot?.() || null,
      };
    },

    update(dt) {
      introElapsed += dt;
      if (practiceClick) {
        const wing = combatPractice(state);
        practiceClick.setRetakes(wing?.retakes || 0);
        practiceClick.setReturnLevel(wing ? Math.max(0, 1 - wing.listens / Math.max(1, wing.listensToStop)) : 0);
        practiceClick.tick();
      }
      // Advances through hitstop as well: the water is a place, not an
      // animation, and freezing a landed hit must not un-submerge the room.
      submersionSnapshot = submersionController.update(dt);
      waterAudio.setPhase(submersionSnapshot);
      musicSession?.setSubmersion?.(submersionSnapshot);
      voice.setEnvironment?.(submersionSnapshot);
      fireballExchange.update(dt,{
        enabled:!state.result && ['tool','move','resolve'].includes(phase),
      });
      // Only while the deck is his and nothing else owns the screen. A bark, a
      // checkpoint or an authored line is not time the player was given.
      if(turnClock&&!state.result&&['tool','move'].includes(phase)&&!bark&&!cur){
        turnClock.left=Math.max(0,turnClock.left-dt);
        if(turnClock.left<=0){turnClock.expired=true;forfeitTurn();}
      }
      if (resultSurfacePending && submersionSnapshot.settled) {
        resultSurfacePending = false;
        finishMusic();
        deliverResult();
      }
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
        const opportunity = parryWindow();
        if (opportunity?.buffered && opportunity.armed && !resolution.parryTried) {
          commitParry(PARRY_TIER.LATE);
        }
        if (opportunity && !resolution.parryWindowSignaled && opportunity.phase === 'open') {
          resolution.parryWindowSignaled = true;
          audio?.menuMove?.();
        }
        const impactAt = opportunity
          ? opportunity.impactSeconds + PARRY_CONTACT_HOLD_SECONDS
          : resolution.duration * .28;
        if (!resolution.impactFired && resolution.elapsed >= impactAt) fireImpact();
        if (resolution.elapsed >= resolution.duration) finishResolution();
        return;
      }
      if (bark) {
        barkHold -= dt;
        if (barkHold <= 0) clearBark();
      }
      if (!cur || phase !== 'talk') return;
      const text = textOf(cur);
      held += dt;
      if (handle) {
        typed = handle.done() ? text.length : Math.min(text.length, handle.charsFor());
      } else if (typed < text.length) {
        // Hold confirm on a line you finished in an earlier run and it comes in
        // fast — or instantly, if that is the setting. Only on a line you have
        // ALREADY read: a first read is never hurried.
        const mode = replay?.seenTextMode?.() || 'normal';
        const accelerating = confirmHeld && activeLineSeenBefore && mode !== 'normal';
        const scale = accelerating && mode === 'instant' ? 1e6 : accelerating ? 4 : 1;
        if (accelerating) replay?.noteSeenTextAssist?.();
        acc += dt * scale;
        typed = Math.min(text.length, Math.floor(acc * textCps(CPS) * (cur.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
      // Battle dialogue is player-paced by default. Individual authored lines can
      // opt into cinematic auto-advance with auto:true / battleAuto:true /
      // advance:'auto', but the engine never advances ordinary story text on its
      // own and never silently discards wrapped overflow.
      if (typed >= text.length && (!handle || handle.done())) {
        if (activeLineId) { replay?.markLine?.(activeLineId); activeLineId = null; }
        if (lineDoneAt == null) lineDoneAt = now;
        else if (shouldAutoAdvanceBattleLine(cur) && now - lineDoneAt >= battleLineAutoHoldSeconds(cur)) {
          const view = currentBattleDialogueView();
          if (view.hasMore) {
            talkPage = view.page + 1;
            lineDoneAt = now;
          } else {
            nextLine();
          }
        }
      }
    },

    key(e) {
      const confirm = isConfirmInput(e);
      // Escape remains the run-level pause. The fight's semantic Back is the
      // controller binding (or X on keyboard), never Tab.
      const back = String(e.key || '').toLowerCase() === 'x' || e.controllerAction === 'back';
      if (phase === 'talk') {
        if (confirm) {
          if (!cur) return true;
          const text = textOf(cur);

          // A single physical press may reveal OR advance. Repeated keydown events
          // from a held confirm are ignored until keyup; controller-like confirm
          // pulses get a short time fallback so they cannot become permanently
          // locked if the platform never emits a keyup for synthetic actions.
          confirmHeld = true;
          // A held confirm on a line already read is an accelerator, not a
          // press. Let it through to the reveal loop rather than swallowing it.
          const replayMode = replay?.seenTextMode?.() || 'normal';
          if (typed < text.length && activeLineSeenBefore && replayMode !== 'normal') return true;

          if (confirmAdvanceLocked) {
            if (e.repeat || now - confirmLockedAt < Math.max(0.24, COMBAT_DIALOGUE_MIN_MANUAL_DWELL)) return true;
            confirmAdvanceLocked = false;
          }

          if (typed < text.length) {
            typed = text.length;
            acc = 1e6;
            handle?.finish?.();
            handle = null;
            audio?.stopTyping?.();
            lineDoneAt = now;
            confirmAdvanceLocked = true;
            confirmLockedAt = now;
            return true;
          }

          if (lineDoneAt == null) lineDoneAt = now;
          if (now - lineDoneAt < COMBAT_DIALOGUE_MIN_MANUAL_DWELL) return true;

          const view = currentBattleDialogueView();
          if (view.hasMore) {
            talkPage = view.page + 1;
            lineDoneAt = now;
            confirmAdvanceLocked = true;
            confirmLockedAt = now;
            audio?.menuMove?.();
            return true;
          }

          nextLine();
          confirmAdvanceLocked = true;
          confirmLockedAt = now;
        }
        return true;
      }
      if (phase === 'resolve') {
        // A parryable enemy strike owns confirm until contact. It cannot be
        // accidentally fast-forwarded out from under the player, and an early
        // press outside the small buffer teaches WAIT without spending the try.
        const opportunity = parryWindow();
        if (confirm && opportunity && !resolution.impactFired) return attemptParry(e);
        if (confirm && opportunity && resolution.impactFired) {
          finishResolution();
          return true;
        }
        if (confirm && resolution && resolution.elapsed >= .22) {
          if (!resolution.impactFired) fireImpact();
          finishResolution();
        }
        return true;
      }
      if (!['tool', 'move'].includes(phase)) return true;
      if (!back) skipArmed = false;
      const direction = combatDeckDirection(e);
      if (direction) navigateDeck(direction);
      else if (String(e.key || '').toLowerCase() === 'q' || e.controllerAction === 'tabPrev') cycleChannel(-1);
      else if (String(e.key || '').toLowerCase() === 'e' || e.controllerAction === 'tabNext') cycleChannel(1);
      else if (back && phase === 'move') navigateDeck('up');
      else if (back && phase === 'tool' && director?.active?.()) {
        // The drill can always be walked away from: one Back warns, two skip it.
        if (skipArmed) {
          skipDrill();
        } else {
          skipArmed = true;
          notice = 'BACK AGAIN TO SKIP THE DRILL';
          audio?.menuMove?.();
        }
      } else if (confirm && phase === 'move') execute(moves()[selectedMove]?.id);
      return true;
    },

    keyup(e) {
      if (isConfirmInput(e)) {
        confirmAdvanceLocked = false;
        confirmHeld = false;
        return phase === 'talk';
      }
      return false;
    },

    pointer(e) {
      if (e.type !== 'pointerdown') return true;
      const x = Math.floor(Number(e.cellX));
      const y = Math.floor(Number(e.cellY));
      if(['tool','move','resolve'].includes(phase)&&fireballRect
        &&x>=fireballRect.x&&x<fireballRect.x+fireballRect.w
        &&y>=fireballRect.y&&y<fireballRect.y+fireballRect.h){
        const metrics=uiCellMetrics();
        const result=fireballExchange.click({
          x:(Number(e.cellX)-fireballRect.x)/Math.max(.001,fireballRect.w),
          y:(Number(e.cellY)-fireballRect.y)/Math.max(.001,fireballRect.h),
          aspect:(fireballRect.w*metrics.cellW)/Math.max(.001,fireballRect.h*metrics.cellH),
        });
        if(result.hit){
          announceFireballHit(result);
          return true;
        }
      }
      if (phase === 'resolve' && reactionRect
        && x >= reactionRect.x && x < reactionRect.x + reactionRect.w
        && y >= reactionRect.y && y < reactionRect.y + reactionRect.h) {
        attemptParry({ key: 'pointer' });
        return true;
      }
      if (!['tool', 'move'].includes(phase)) return true;
      if (skipRect && x >= skipRect.x && x < skipRect.x + skipRect.w && y >= skipRect.y && y < skipRect.y + skipRect.h) {
        skipDrill();
        return true;
      }
      const section = apparitionRows.find((row) => y >= row.y && y < row.y + (row.h || 1) && x >= row.x && x < row.x + row.w);
      if (section) {
        state = reduceCombat(state, { type: COMBAT_ACTION.TARGET, targetId: section.id });
        notice = state.last.notice;
        audio?.menuMove?.();
        return true;
      }
      const channel = channelRows.find((row) => y >= row.y && y < row.y + (row.h || 1) && x >= row.x && x < row.x + row.w);
      if (channel) {
        state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: channel.id });
        notice = state.last.notice;
        audio?.menuMove?.();
        return true;
      }
      const tool = toolRows.find((row) => y >= row.y && y < row.y + (row.h || 1) && x >= row.x && x < row.x + row.w);
      if (tool) {
        selectedTool = tool.index;
        selectedMove = 0;
        phase = 'tool';
        takeConfirmation = false;
        audio?.menuMove?.();
        return true;
      }
      const move = moveRows.find((row) => y >= row.y && y < row.y + (row.h || 1) && x >= row.x && x < row.x + row.w);
      if (move) {
        // CLICKING A MOVE IS ENTERING THE MOVE COLUMN.
        //
        // `execute` refuses anything that is not already phase 'move', and the
        // only thing that set that phase was the DOWN key -- so a click on a
        // move tile did nothing at all unless the player had first arrowed into
        // the row, which is precisely the keyboard-only feel this is meant to
        // stop. Pointing at a thing is a way of choosing it.
        selectedMove = move.index;
        phase = 'move';
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
      const parryPrompt = activeInputPromptDevice() === 'controller'
        ? promptLine([{ action: 'confirm', label: 'PARRY' }])
        : '[SPACE] PARRY';
      const footer = phase === 'arrival'
        ? '168 BPM · LOCKING DOWNBEAT'
        : phase === 'tool'
          ? activeInputPromptDevice() === 'controller'
            ? '[STICK / D-PAD ←→] TOOL · [↓] ACTIONS'
            : '[←→ / A D] TOOL · [↓ / S] ACTIONS'
          : phase === 'move'
            ? activeInputPromptDevice() === 'controller'
              ? `${promptLine([{ action: 'select', label: '←→ ATTACK' }, { action: 'confirm', label: 'ACT' }])} · [↑] TOOL`
              : '[←→ / A D] ATTACK · [ENTER] ACT · [↑ / W] TOOL'
            : phase === 'resolve'
              ? (() => {
                const opportunity = parryWindow();
                if (opportunity && !opportunity.spent) {
                  if (opportunity.buffered) return `CONTACT ARMED · ${parryPrompt}`;
                  return opportunity.armed
                    ? `${parryPrompt} · ${PARRY_TIERS[opportunity.tier]?.label || ''}`
                    : `WAIT FOR CONTACT · ${parryPrompt}`;
                }
                if (resolution?.parried) {
                  return `${PARRY_TIERS[resolution.parryTier]?.label || 'PARRIED'} · [ENTER] CONTINUE`;
                }
                if (opportunity) return 'MISSED CONTACT · [ENTER] CONTINUE';
                return 'RESOLVING · [ENTER] FAST-FORWARD';
              })()
              : promptLine([{ action: 'continue', label: 'CONTINUE' }]);
      const interferenceStatus = interference?.active?.() ? interference?.statusLine?.() : '';
      const panel = drawMachinePanel(x - 2, 1, w + 4, rows - 2, {
        label: 'SIGNAL COMBAT', source: state.source ? 'SOURCE' : 'FIELD', meter: true,
        footer: interferenceStatus ? `${footer} · ${interferenceStatus}` : footer,
      });
      skipRect = null;
      if (director?.active?.() && choosing) {
        const skipLabel = activeInputPromptDevice() === 'controller'
          ? skipArmed
            ? `${promptLine([{ action: 'back', label: 'AGAIN' }])} / CLICK TO SKIP`
            : `${promptLine([{ action: 'back', label: '×2' }])} / CLICK SKIP DRILL`
          : skipArmed ? 'BACK AGAIN / CLICK TO SKIP' : 'BACK×2 / CLICK SKIP DRILL';
        const skipX = x + w - skipLabel.length;
        const skipY = rows - 3;
        uiText(skipX, skipY, skipLabel, skipArmed ? 'ui-danger' : 'ui-amber', skipArmed ? .95 : .72);
        skipRect = { x: skipX, y: skipY, w: skipLabel.length, h: 1 };
      }
      const reaction = parryWindow();
      const hudMode = reaction ? 'reaction'
        : phase === 'talk' ? 'dialogue'
          : phase === 'arrival' ? 'arrival' : 'command';
      const layout = combatHudLayout({ panel, mode: hudMode, sourceActive: !!state.source, rosterActive: !!state.apparitions || !!state.practice });
      const compact = layout.compact;
      reactionRect = null;
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
      // Health snaps at the moment of impact and leaves ghost segments behind —
      // before the hit lands, the bars still show the pre-hit reading.
      const preImpact = !!resolution && !resolution.impactFired;
      const snap = preImpact ? resolution.before : state;
      const transitioned = !preImpact && resolution?.after?.last?.transition != null;
      const ghostFor = (record) => (record && now - record.at < .7
        ? { ghostFrom: record.from, ghostAge: now - record.at }
        : { ghostFrom: null, ghostAge: 0 });

      const movementCount = battle.combat.movements.length;
      const enemyBarY = layout.enemyGauge.y;
      drawCombatGauge({
        x: layout.enemyGauge.x, y: enemyBarY, w: layout.enemyGauge.w,
        value: transitioned ? 0 : snap.movementCoherence,
        max: snap.movementMaxCoherence,
        label: `${movementData?.title || 'COHERENCE'} ${visual.movementIndex + 1}/${movementCount}`,
        tone: 'enemy',
        now,
        ...ghostFor(barGhost.coherence),
      });
      if(layout.returnMonitor.w >= 10){
        drawVfdText(layout.returnMonitor.x,enemyBarY,`RETURN ${performanceStage}`.slice(0,Math.floor(layout.returnMonitor.w)),{scale:1,role:performanceStage==='CORRECTION'?'ui-danger':'ui-amber'});
        drawLocationIndicator(layout.returnMonitor.x,enemyBarY+1,layout.returnMonitor.w,performanceIntrusion,{theme:performanceStage==='CORRECTION'?'red':'amber'});
      }

      // Whose beat it is + the exchange count, as a persistent glyph readout in
      // the header. The enemy beat is the opponent's turn; anything else is yours.
      if (layout.turn.w > 0) {
        drawTurnGlyph(layout.turn.x, enemyBarY, {
          active: resolution?.side === 'enemy' ? 'enemy' : 'player',
          turn: turnCount,
          reducedMotion: shakeMode() !== 'full',
          now,
        });
      }

      // ── the void stage: one continuous backdrop, opponent right-of-centre in
      // an oblique fight stance, hands rising from the near-left ──────────────
      const stageY = layout.stage.y;
      const stageH = layout.stage.h;
      fireballRect={x:panel.x,y:stageY,w:panel.w,h:stageH};
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
        environmentLighting,
      });
      // Whose turn it is, stated over the opponent it belongs to. The enemy beat
      // is the opponent's own turn now, so it gets a lit banner centred on the
      // being the moment control leaves the player.
      if (resolution?.side === 'enemy') {
        const hits = resolution.after?.last?.enemyHits?.length || 1;
        const chained = hits > 1;
        const actorLabel = resolution.intent?.actorLabel || resolution.after?.last?.enemyActor?.label || 'ENEMY';
        const banner = chained ? `${actorLabel} TURN · CHAIN` : `${actorLabel} TURN`;
        uiText(ex + Math.floor((ew - banner.length) / 2), stageY, banner, 'ui-danger', .95);
        // What they are playing, made visible: notes come off the figure and keep
        // dancing for as long as the attack lasts. A chain throws more of them.
        // Seeded off the turn and the action so the swarm is stable frame to
        // frame instead of reshuffling every render.
        drawAttackNotes({
          x: ex, y: stageY + 1, w: ew, h: Math.max(3, eh - 1),
          count: Math.min(9, 3 + hits * 2),
          now,
          seed: (state.turn || 0) * 31 + (resolution.action?.kind || '').length * 7 + hits,
          reducedMotion,
          alpha: .55 + (1 - visual.progress) * .45,
        });
      }
      const intentState = resolution?.before || state;
      // On the enemy beat, show the intent actually landing (a board-state
      // reaction may have overridden the cycle intent); otherwise show what the
      // player is bracing against.
      // Before the blow, this is the READ — what the recordist believes is
      // coming — because everything drawn from it is something they can see:
      // the thought trace, and the shape the opponent takes on the stage. On
      // the enemy beat it becomes the truth, which is how the misread is
      // revealed: the thing that arrives is not the thing that was drawn.
      const intent = resolution?.side === 'enemy'
        ? (resolution.intent||{ kind: resolution.action?.kind || currentCombatIntent(intentState)?.kind || null })
        : predictedCombatIntent(intentState);
      // THE HALL. One encounter has more than one thing in it, and a single
      // figure on the void stage cannot say so. The three bodies share the box
      // the being would have had, so the banner and attack notes still land.
      const apparitions = combatApparitions(intentState);
      if (apparitions) {
        drawHallApparitions(apparitions, {
          x: ex, y: stageY + 1, w: ew, h: Math.max(3, eh - 1),
          now, reducedMotion,
          // They watch you. The lean follows the selected tool across the deck,
          // which is the only thing on screen that stands in for where he is.
          watch: Math.sin(now * .55) * .5,
          dim: transitioned ? .5 : 1,
        });
      } else if (art?.procedural) {
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

      const fireball=fireballExchange.snapshot();
      // Drawn under the comets and over the room: the thing that arrived is in
      // front of the stage it crossed, and the next one is in front of it.
      drawFireballEngulf({
        x:panel.x,y:panel.y,w:panel.w,h:panel.h,
        at:fireballEngulf,now,reducedMotion,answered:!!fireballEngulf?.answered,
      });
      drawFireballCast({
        x:panel.x,y:stageY,w:panel.w,h:stageH,
        cast:fireball.active?.plan||null,
        flights:fireball.active?.rays||null,
        now,reducedMotion,
      });

      const submerged=submergedBattleFrame({
        submersion:submersionSnapshot,
        presentation:battle.combat.presentation,
        movementIndex:visual.movementIndex,
        intent,
      });
      drawSubmergedBattleField({
        x:panel.x,y:panel.y,w:panel.w,h:panel.h,frame:submerged,now,reducedMotion,
        resolveProgress:visual.progress,
      });

      // Optical water treatment has already run. RETURN is type, so it stays on
      // the sharp HUD plane while the projectile itself refracts with the room.
      const returnLabel=fireball.returnReady
        ? 'RETURN / IN FLIGHT'
        : `RETURN ${fireball.charge}/${fireball.threshold}`;
      uiText(panel.x+Math.max(0,panel.w-returnLabel.length),stageY+.25,returnLabel,
        fireball.returnReady?'ui-counter':'ui-amber',fireball.charge||fireball.returnReady?1:.58);

      // THE CLOCK, WHERE HIS HANDS ARE.
      //
      // A bar rather than a number: the point is not how many seconds are left,
      // it is that they are going. Red for the last second and a half, which is
      // the only part anybody actually reads.
      if(turnClock&&['tool','move'].includes(phase)){
        const left=Math.max(0,turnClock.left),span=Math.max(.001,turnClock.limit);
        const width=Math.max(6,Math.min(18,Math.floor(panel.w*.22)));
        const filled=Math.max(0,Math.min(width,Math.round(width*(left/span))));
        const urgent=left<=1.5;
        const bar=`${'█'.repeat(filled)}${'·'.repeat(width-filled)}`;
        const blink=urgent&&!reducedMotion?(Math.floor(now*6)%2?1:.5):1;
        uiText(panel.x,stageY+.25,bar,urgent?'ui-danger':'ui-amber',blink);
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
        brace: !!reaction && reaction.phase !== 'resolved',
      });

      // ── stage overlays: intent card (left) and stance triangle (right) ─────
      const showOverlays = !['arrival', 'talk'].includes(phase) && !reaction;
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
          // ── the strike banner ──────────────────────────────────────────────
          // Every enemy blow says itself: WHO does WHAT, with WHICH instrument,
          // and then whether it worked. The fight used to print only the numbers
          // and leave the player to infer, from -1 COMPOSURE, which move they had
          // just been hit by — a move they had never seen named.
          if (resolution.side === 'enemy' && strike) {
            const who = String(battle.enemy || 'THE SIGNAL').toUpperCase();
            drawVfdText(intentX, stageY + 1, `${who} ${strike.verb}`.slice(0, intentW), { scale: 1, role: 'ui-danger' });
            uiText(intentX, stageY + 2, `${strike.label} · ${strike.instrument}`.slice(0, intentW), 'ui-amber', .9);
            const verdict = strikeVerdict(last, { parried: resolution.parried });
            uiText(intentX, stageY + 3, verdict.text.slice(0, intentW + 6), verdict.role, .95);
            // The blow that arrived was not the blow the recordist named. Said
            // plainly, at the moment it lands, so a misread reads as a thing
            // that happened rather than as the card having glitched.
            if (readMissed) uiText(intentX, stageY + 5, 'NOT WHAT YOU READ', 'ui-danger', .8);
            uiText(intentX, stageY + 4, impactLine.slice(0, intentW), 'ui-secondary', .75);
          } else if (last.perfect) {
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
        } else if (intent && ['full','trace'].includes(state.difficulty.guidance)) {
          // Not a readout. A guess — see thought-trace.js. The recordist says
          // what they reckon is coming and what they mean to do about it, and
          // how sure they sound is itself the information the old INTENT · KIND
          // · DMG · COUNTER card was spelling out in capitals.
          //
          // The counter no longer needs naming in prose: the move it points at
          // is already lit green in the command band, which is where the
          // player's hands are. The thought says why that tile is lit.
          const fidelity = readFidelity(intentState);
          const { lines: thought } = thoughtTrace(intentState, {
            intent,
            alternative: rivalCombatIntent(intentState),
            counters: counterMovesForIntent(intentState, intent),
            wrong: readMissed,
            fidelity,
            guidance: state.difficulty.guidance,
            stance: state.stance?.id || null,
            // Prevention only ever blunts the first hit of a chain, so a chained
            // blow slips a guard that would otherwise have covered it.
            chained: (selectEnemyIntents(intentState).length || 1) > 1,
            chargeReady: availableCombatActions(intentState).some((move) => move.special && move.enabled),
            apparitions,
          });
          let intentRow = 1;
          for (const line of thought) {
            const role = line.tone === 'miss' || line.tone === 'warn' ? 'ui-danger'
              : line.tone === 'plan' ? 'ui-counter'
                : line.tone === 'stance' ? 'ui-amber' : 'ui-primary';
            uiText(intentX, stageY + intentRow, line.text.slice(0, intentW), role, line.tone === 'read' ? .82 : .95);
            intentRow += 1;
          }
          // The surfer's guard is telegraphed here too, in the same voice:
          // swing into it and it slips or turns the hit, so the read is to set
          // up instead.
          if (state.enemyGuard) {
            const guarding = state.enemyGuard.mode === 'parry' ? 'turn' : 'slip';
            uiText(intentX, stageY + intentRow, `it's set to ${guarding} my swing.`.slice(0, intentW), 'ui-danger', .85);
            intentRow += 1;
          }
          regionRects.intent = { x: intentX, y: stageY + 1, w: intentW, h: intentRow + .2 };
        }

        const stW = Math.max(20, Math.min(26, Math.floor(panel.w * .24)));
        const stX = panel.x + panel.w - stW - 1;
        const pendingShift = phase === 'move' ? moves()[selectedMove]?.stanceShift || null : null;
        const stanceId = String(state.stance?.id || 'reading').toUpperCase();
        if (compact) {
          uiText(stX, stageY + 1, `${stanceId} · ${String(state.snr || '').toUpperCase()}`.slice(0, stW), 'ui-amber', .75);
          regionRects.stance = { x: stX, y: stageY + 1, w: stW, h: 1 };
        } else {
          uiText(stX, stageY + 1, `SNR · ${stanceId}`.slice(0, stW), 'ui-label', .62);
          const stanceRect = drawStanceTriangle(stX, stageY + 2, stW, { snr: state.snr, pendingShift, compact: false });
          regionRects.stance = { ...stanceRect, y: stageY + 1, h: stanceRect.h + 1 };
        }
      }

      // ── floating damage numbers ─────────────────────────────────────────────
      popups = popups.filter((popup) => now - popup.born < .95);
      for (const popup of popups) {
        if (now < popup.born) continue; // staggered chain popup, not born yet
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
      const cmdY = layout.playerGauge.y;
      const bottom = layout.contentBottom;
      uiLine(panel.x, cmdY - .4, panel.x + panel.w, cmdY - .4, UI_COLOR.frame, .55);
      drawCombatGauge({
        x: layout.playerGauge.x, y: cmdY, w: layout.playerGauge.w,
        value: snap.composure, max: snap.maxComposure,
        label: 'COMPOSURE',
        now,
        ...ghostFor(barGhost.composure),
      });
      const resourceText = (cell, text, role = 'ui-counter', alpha = .76) => {
        if (!cell || cell.w < 3) return;
        uiText(cell.x, cell.y, String(text).slice(0, Math.max(1, Math.floor(cell.w))), role, alpha);
      };
      const takeText = `TAKE · ${state.take ? `${state.take.label} / ${state.take.damage}` : 'EMPTY'}`;
      resourceText(layout.resourceCells.take, takeText);
      regionRects.take = layout.resourceCells.take;
      // Charge, beside the take, because they are the two things the player
      // spends. Drawn as filled and empty diamonds rather than a number: it is
      // read at a glance, mid-beat, to answer one question — can I afford to be
      // loud yet. It fills on a perfect counter or a landed parry, so a player
      // watching it fill is watching their own reading pay out.
      const charge = Math.max(0, Math.min(integer(state.maxCharge, 3), integer(state.charge, 0)));
      const pips = `${'◆'.repeat(charge)}${'◇'.repeat(Math.max(0, integer(state.maxCharge, 3) - charge))}`;
      resourceText(layout.resourceCells.charge, `CHARGE ${pips}`, charge > 0 ? 'ui-counter' : 'ui-secondary', charge > 0 ? .9 : .55);
      regionRects.charge = layout.resourceCells.charge;
      resourceText(layout.resourceCells.battery, `CELL · ${Math.round(state.battery * 100)}%`);
      regionRects.battery = layout.resourceCells.battery;
      const shortName = (id) => id.split('.').pop().replaceAll('-', ' ').toUpperCase();
      const passives = state.techniques.filter((id) => !ACTIVE_TECHNIQUE_IDS.has(id));
      const actives = state.techniques.filter((id) => ACTIVE_TECHNIQUE_IDS.has(id));
      resourceText(layout.resourceCells.mods, `MODS · ${state.techniques.length}`, state.techniques.length ? 'ui-blue' : 'ui-secondary', state.techniques.length ? .75 : .5);
      regionRects.mods = layout.resourceCells.mods;

      const interferenceLine = interference?.line?.();
      if (interferenceLine && !bark) {
        uiText(layout.body.x, layout.body.y, String(interferenceLine.text || '').slice(0, layout.body.w), interferenceLine.stage === 'handoff' ? 'ui-danger' : 'ui-amber', .92);
      }

      // A BARK, over the deck rather than in place of it.
      //
      // This is the whole point of the on-listen channel: the thing talks while
      // the take is running, and the player keeps their hands on the tools. So
      // it draws here — after the command band, before the deck is laid out —
      // and it takes one row it can have without hiding a move. It cannot
      // collide with the interference line above because that path returns.
      if (bark && phase !== 'talk') {
        const who = whoOf(bark);
        const spoken = `${who === 'direction' ? '' : `${who} — `}${textOf(bark)}`;
        uiText(layout.detail.x, layout.detail.y, spoken.slice(0, layout.detail.w), who === 'direction' ? 'ui-secondary' : 'ui-primary', .88);
      }

      if (phase === 'arrival') {
        // No title card: the stage is already on screen behind the entry wipe.
        // The footer carries the BPM lock; one dim status line is enough.
        uiText(layout.arrival.x, layout.arrival.y, `ACQUIRING · GRID ${BATTLE_GRID_LABEL}`.slice(0, layout.arrival.w), 'ui-secondary', .55);
        return;
      }

      if (phase === 'talk' && cur) {
        // Dialogue gets a real command-card region during battles. Long lines are
        // paged with a visible MORE state instead of being silently dropped, and
        // the combat stage is slightly shorter while this card is active.
        const speakerY = layout.dialogue.y;
        const textY = speakerY + 1;
        const hintY = bottom;
        const maxTextRows = Math.max(2, Math.floor(hintY - textY));
        const dlgW = Math.max(20, panel.w - 2);
        const who = whoOf(cur);
        const text = textOf(cur);
        // A LEAD-IN. One utterance split across two registers: the first half
        // arrives as an unattributed fragment and the text finishes it.
        //
        // This used to be authored by putting the fragment in `who`, which made
        // it a SPEAKER — shouted in caps, hard-truncated at panel width with no
        // overflow mark, and knocked out of VOICED so the line typed instead of
        // speaking and the music never ducked for it. As its own field it keeps
        // a real speaker, and it wraps.
        const lead = String(cur.lead || '').trim();
        const leadRows = lead ? hardWrapBattleText(lead, dlgW) : [];
        const bodyIndent = lead ? 2 : 0;
        const view = currentBattleDialogueView({
          width: Math.max(12, dlgW - bodyIndent),
          rows: Math.max(1, maxTextRows - leadRows.length),
        });

        uiText(panel.x, speakerY, who.toUpperCase().slice(0, panel.w), 'ui-label');
        leadRows.forEach((line, index) => uiText(
          panel.x,
          textY + index,
          line.slice(0, dlgW),
          'ui-secondary',
          .74,
        ));
        view.rows.forEach((line, index) => uiText(
          panel.x + bodyIndent,
          textY + leadRows.length + index,
          line.slice(0, dlgW - bodyIndent),
          who === 'direction' ? 'ui-secondary' : 'ui-primary',
        ));

        const done = typed >= text.length && (!handle || handle.done());
        const hint = view.hasMore
          ? `MORE ${view.page + 1}/${view.pageCount} · PRESS CONTINUE`
          : done ? 'PRESS CONTINUE' : '';
        if (hint) {
          uiText(
            panel.x + Math.max(0, panel.w - hint.length),
            hintY,
            hint.slice(0, panel.w),
            view.hasMore ? 'ui-amber' : 'ui-secondary',
            .72,
          );
        }
        return;
      }

      if (reaction && resolution) {
        // The reaction is the control surface now, not a tiny second action
        // card. The entire panel is also the pointer target for the same
        // semantic input used by Space and controller Confirm.
        const box = layout.reaction;
        reactionRect = box;
        toolRows = [];
        moveRows = [];
        channelRows = [];
        apparitionRows = [];
        uiFill(box.x, box.y, box.w, box.h, 'rgba(7,10,13,.94)');
        uiStrokeRect(box.x, box.y, box.w, box.h, reaction.armed ? UI_COLOR.amber : UI_COLOR.frame, reaction.armed ? .88 : .42, reaction.armed ? 1.6 : 1);
        const contentY = box.y + Math.max(.25, (box.h - 6.4) / 2);
        const incoming = `INCOMING — ${String(strike?.label || resolution.action?.label || 'CONTACT').toUpperCase()}`;
        drawVfdText(box.x + 1, contentY + .3, incoming.slice(0, Math.max(12, Math.floor(box.w * .66))), {
          scale: compact ? 1 : 1.35,
          role: reaction.armed || reaction.contact ? 'ui-danger' : 'ui-amber',
        });
        const promptX = box.x + Math.max(1, box.w - parryPrompt.length - 1);
        uiText(promptX, contentY + .47, parryPrompt, reaction.armed ? 'ui-counter' : 'ui-amber', reaction.armed ? 1 : .68);

        const trackX = box.x + 1;
        const trackW = Math.max(8, box.w - 2);
        const trackY = contentY + 3.05;
        const trackH = compact ? .95 : 1.25;
        const atX = (progress) => trackX + trackW * clamp(progress, 0, 1);
        const openX = atX(reaction.openProgress);
        const goodX = atX(reaction.goodProgress);
        const perfectX = atX(reaction.perfectProgress);
        const impactX = atX(reaction.impactProgress);
        const contactX = atX(reaction.contactEndProgress);
        uiText(trackX, trackY - 1, 'WAIT', 'ui-secondary', .5);
        uiText(openX, trackY - 1, 'TURN', 'ui-blue', .7);
        uiText(perfectX, trackY - 1, 'PERFECT', 'ui-counter', .9);
        uiFill(trackX, trackY, Math.max(0, openX - trackX), trackH, 'rgba(255,255,255,.045)');
        uiFill(openX, trackY, Math.max(0, goodX - openX), trackH, 'rgba(120,220,255,.15)');
        uiFill(goodX, trackY, Math.max(0, perfectX - goodX), trackH, 'rgba(120,220,255,.30)');
        uiFill(perfectX, trackY, Math.max(0, impactX - perfectX), trackH, 'rgba(120,220,255,.60)');
        uiFill(impactX, trackY, Math.max(.3, contactX - impactX), trackH, 'rgba(255,244,230,.75)');
        uiFill(contactX, trackY, Math.max(0, trackX + trackW - contactX), trackH, 'rgba(255,255,255,.035)');
        uiStrokeRect(trackX, trackY, trackW, trackH, UI_COLOR.frame, .55, 1);
        const headX = atX(reaction.progress);
        uiFill(headX - .22, trackY - .35, .5, trackH + .7, reaction.spent ? UI_COLOR.secondary : reaction.armed ? UI_COLOR.primary : UI_COLOR.amber);
        uiLine(impactX, trackY - .55, impactX, trackY + trackH + .55, UI_COLOR.danger, .82, 1.35);

        const result = resolution.parried
          ? `${PARRY_TIERS[resolution.parryTier]?.label || 'TURNED'} · TURNED`
          : resolution.impactFired || resolution.parryWhiffed
            ? 'MISSED CONTACT'
            : reaction.buffered
              ? 'HOLD — CONTACT ARMED'
              : reaction.armed
                ? `NOW — ${PARRY_TIERS[reaction.tier]?.label || 'PARRY'}`
                : resolution.parryEarly
                  ? 'WAIT FOR CONTACT · RELEASE AND PRESS AGAIN'
                  : 'HOLD — WAIT FOR CONTACT';
        const resultRole = resolution.parried ? 'ui-counter'
          : resolution.impactFired || resolution.parryWhiffed ? 'ui-danger'
            : reaction.armed ? 'ui-amber' : 'ui-secondary';
        uiText(box.x + 1, Math.min(box.y + box.h - 1.1, trackY + trackH + .85), result.slice(0, Math.max(1, Math.floor(box.w - 2))), resultRole, .95);
        regionRects.reaction = box;
        return;
      }

      // ── icon-forward command deck ─────────────────────────────────────────
      let listY = layout.channels.h ? layout.channels.y : layout.tools.y;
      channelRows = [];
      apparitionRows = [];
      // ── the Hall apparition target rail ───────────────────────────────────
      //
      // The channel row is Source-only, and no encounter has both — so the Hall
      // borrows the slot for three cards, one per body. Each card carries the
      // apparition's seat, role, health, and current defence, so the decision
      // of which person to target is made from what is on screen
      // now, so the decision of where to point is made from what is on screen
      // rather than from memory. Pointer and touch use the same body targets as
      // Q/E and controller shoulders.
      // ── the transport ─────────────────────────────────────────────────────
      //
      // The practice wing borrows the same slot the Hall roster and the Source
      // channels use. It draws the only three numbers in that room: where the
      // playhead is in the fragment, how many times he has taken it from the
      // top, and what he has managed to hear. There is no opponent gauge because
      // there is no opponent — the bar the file ends at is the whole of it.
      if (state.practice) {
        const wing = combatPractice(state);
        const cardH = Math.max(2.1, layout.channels.h - .55);
        uiFill(panel.x, listY, panel.w, cardH, 'rgba(255,255,255,.018)');
        uiStrokeRect(panel.x, listY, panel.w, cardH, UI_COLOR.frame, .22, 1);

        // The fragment, drawn as bars. The last one is the bar it ends at and it
        // is marked differently, because that is the one he cannot get past.
        const slotW = 2.4;
        const barsW = wing.bars * slotW;
        for (let index = 0; index < wing.bars; index += 1) {
          const bx = panel.x + .8 + index * slotW;
          const here = index + 1 === wing.bar;
          const last = index + 1 === wing.bars;
          const glyph = last ? '▌' : here ? '▐' : '│';
          const role = here ? 'ui-amber' : last ? 'ui-danger' : 'ui-label';
          uiText(bx, listY + .34, glyph, role, here ? 1 : last ? .7 : .4);
        }
        uiText(panel.x + .8, listY + 1.16,
          wing.atEnd ? 'THE FILE ENDS HERE' : `BAR ${wing.bar} OF ${wing.bars}`,
          wing.atEnd ? 'ui-danger' : 'ui-secondary', wing.atEnd ? .9 : .6);

        // THE CLICK, AND THE ONE THAT COMES BACK.
        //
        // Leila practised in here: "a click coming back through the partition.
        // Not enough to count cleanly. Enough to pull the stick out of your hand
        // if you listened to it." The room runs a metronome on the ordinary
        // battle grid, and a second mark sits behind it — the same click,
        // returning late off the partition.
        //
        // The return does not lie to him and it does not take anything: it is
        // simply louder than the grid until he understands the room, and it
        // fades as he does. Three passes at the bar and it is gone, which is
        // what "maintenance packed the grille twice" was always describing.
        const clickX = panel.x + panel.w - 12;
        if (roomForClick) {
        // The SAME clock the metronome is running on, rushed by exactly as much.
        // Two clocks would have the drawn beat and the heard beat disagreeing in
        // the one room whose whole subject is whether you can trust your time.
        const grid = 60 / practiceTempo(wing.retakes) * 4;
        const phase = reducedMotion ? 0 : (performance.now() / 1000 % grid) / grid;
        const beatOn = phase < .16;
        const returnLag = .085 / grid;                    // the partition, ~85ms behind
        const returnOn = phase >= returnLag && phase < returnLag + .16;
        const returnLevel = Math.max(0, 1 - wing.listens / Math.max(1, wing.listensToStop));
        uiText(clickX, listY + .34, 'CLICK', 'ui-label', .45);
        uiText(clickX + 6, listY + .34, beatOn ? '●' : '○', 'ui-amber', beatOn ? .95 : .3);
        if (returnLevel > 0) {
          uiText(clickX, listY + 1.16, 'RETURN', 'ui-label', .4 * returnLevel);
          uiText(clickX + 6, listY + 1.16, returnOn ? '●' : '○', 'ui-blue',
            (returnOn ? .8 : .25) * returnLevel);
        } else {
          uiText(clickX, listY + 1.16, 'RETURN GONE', 'ui-label', .35);
        }
        }

        // What it has cost and what the next one will. Printed before he presses
        // it, because the point is that he does it anyway.
        // The click only gets a corner if there is one to give it; on a narrow
        // deck the fragment and what he has heard come first.
        const roomForClick = panel.w >= barsW + 30;
        const textRight = panel.x + (roomForClick ? panel.w - 13 : panel.w - 1);
        const right = panel.x + Math.max(barsW + 3, panel.w * .40);
        const textW = Math.max(8, Math.floor(textRight - right));
        uiText(right, listY + .34, `FROM THE TOP  ${wing.retakes}`, 'ui-label', .6);
        uiText(right, listY + 1.16, (wing.heard.length
          ? wing.heard.map((pass) => pass.label).join(' · ')
          : 'NOTHING PLAYED BACK YET').slice(0, textW),
        wing.heard.length ? 'ui-blue' : 'ui-label', wing.heard.length ? .75 : .45);
        listY = layout.tools.y;
      }
      if (state.apparitions) {
        const selectedAction = phase === 'move' ? moves()[selectedMove]?.id : null;
        const snapshot = combatApparitionsSnapshot(state, selectedAction);
        const gap = .8;
        const cardH = Math.max(2.1, layout.channels.h - .55);
        const cards = snapshot?.members || [];
        const cardW = (panel.w - gap * Math.max(0, cards.length - 1)) / Math.max(1, cards.length);
        cards.forEach((card, index) => {
          const x = panel.x + index * (cardW + gap);
          const width = Math.max(1, Math.floor(cardW - 1));
          const tint = card.defeated ? 'rgba(255,255,255,.012)'
            : card.targeted ? 'rgba(242,168,30,.07)'
              : card.acting ? 'rgba(214,64,48,.06)'
                : card.parryReady ? 'rgba(120,150,214,.05)' : 'rgba(255,255,255,.018)';
          const edge = card.defeated ? UI_COLOR.frame
            : card.targeted ? UI_COLOR.amber
              : card.acting ? UI_COLOR.danger
                : card.parryReady ? UI_COLOR.blue : UI_COLOR.frame;
          uiFill(x, listY, cardW, cardH, tint);
          uiStrokeRect(x, listY, cardW, cardH, edge, card.targeted ? .72 : card.acting || card.parryReady ? .5 : .2, card.primary ? 1.35 : 1);
          const nameStyle = card.defeated ? 'ui-label' : card.primary ? 'ui-amber' : card.acting ? 'ui-danger' : 'ui-primary';
          uiText(x + .55, listY + .3, card.label.slice(0, width), nameStyle, card.defeated ? .35 : card.primary ? .95 : .78);
          uiText(x + .55, listY + 1.05, `${card.seat} · ${card.roleLabel}`.slice(0, width), card.defeated ? 'ui-label' : 'ui-secondary', card.defeated ? .3 : .6);
          const statusStyle = card.defeated ? 'ui-label'
            : card.parryReady ? 'ui-blue'
              : card.acting ? 'ui-danger'
                : card.targeted ? 'ui-amber' : 'ui-label';
          uiText(x + .55, listY + 1.72, card.status.slice(0, width), statusStyle, card.defeated ? .3 : .7);
          if (!card.defeated) apparitionRows.push({ id: card.id, x, y: listY, w: cardW, h: cardH });
        });
        const initiative = (snapshot?.initiative || [])
          .map((entry) => entry.defeated ? `× ${entry.label}` : entry.active ? `▶ ${entry.label}` : entry.label)
          .join('  →  ');
        uiText(panel.x, listY + cardH + .2, initiative.slice(0, panel.w), 'ui-blue', .6);
        listY = layout.tools.y;
      }
      if (state.source) {
        const prediction = combatPrediction(state);
        const channelGap = .8;
        const channelH = Math.max(2.1, layout.channels.h - .55);
        const channelW = (panel.w - channelGap * (CHANNELS.length - 1)) / CHANNELS.length;
        CHANNELS.forEach((channel, index) => {
          const armed = channel.id === state.source.armed;
          const x = panel.x + index * (channelW + channelGap);
          uiFill(x, listY, channelW, channelH, armed ? 'rgba(242,168,30,.07)' : 'rgba(255,255,255,.018)');
          uiStrokeRect(x, listY, channelW, channelH, armed ? UI_COLOR.amber : UI_COLOR.frame, armed ? .72 : .2, armed ? 1.35 : 1);
          uiText(x + .7, listY + .38, `${channel.glyph} ${channel.label}`.slice(0, Math.max(1, Math.floor(channelW - 5))), armed ? 'ui-amber' : 'ui-secondary', armed ? .9 : .58);
          uiText(x + Math.max(1, channelW - 3), listY + .38, String(state.source.channels[channel.id]), armed ? 'ui-counter' : 'ui-label', armed ? 1 : .58);
          channelRows.push({ id: channel.id, x, y: listY, w: channelW, h: channelH });
        });
        uiText(panel.x, listY + channelH + .2, `SIGNAL ROUTE · ${prediction.outcome.toUpperCase()}`.slice(0, panel.w), 'ui-blue', .6);
        listY = layout.tools.y;
      }

      const detailY = layout.detail.y;
      const centredWindow = (list, selected, visible) => {
        if (list.length <= visible) return { start: 0, items: list };
        const start = Math.min(Math.max(0, selected - Math.floor(visible / 2)), list.length - visible);
        return { start, items: list.slice(start, start + visible) };
      };

      toolRows = [];
      const toolList = tools();
      const toolGap = .65;
      const visibleToolCount = Math.max(1, Math.min(toolList.length, Math.floor((panel.w + toolGap) / 14)));
      const toolWindow = centredWindow(toolList, selectedTool, visibleToolCount);
      const toolW = (panel.w - toolGap * Math.max(0, toolWindow.items.length - 1)) / Math.max(1, toolWindow.items.length);
      const toolRect = compact ? layout.carousel : layout.tools;
      const showToolRow = !compact || phase === 'tool';
      if (showToolRow) {
        listY = toolRect.y;
        toolWindow.items.forEach((tool, slot) => {
          const index = toolWindow.start + slot;
          const x = panel.x + slot * (toolW + toolGap);
          drawCombatToolTile(tool, {
            x, y: listY, w: toolW, h: toolRect.h,
            selected: index === selectedTool,
            focused: phase === 'tool' && index === selectedTool,
          });
          toolRows.push({ index, x, y: listY, w: toolW, h: toolRect.h });
        });
        if (toolWindow.start > 0) uiText(panel.x + .2, listY + toolRect.h - .8, '◀', 'ui-secondary', .75);
        if (toolWindow.start + toolWindow.items.length < toolList.length) uiText(panel.x + panel.w - 1.2, listY + toolRect.h - .8, '▶', 'ui-secondary', .75);
        regionRects.tools = toolRect;
      }

      moveRows = [];
      const renderedMoves = phase === 'resolve' && resolution
        ? [{ ...resolution.action, enabled: true, detail: resolution.after.last?.notice || resolution.action.detail }]
        : moves();
      const moveGap = .75;
      const visibleMoveCount = Math.max(1, Math.min(renderedMoves.length, Math.floor((panel.w + moveGap) / 17)));
      const moveWindow = centredWindow(renderedMoves, selectedMove, visibleMoveCount);
      const moveRect = compact ? layout.carousel : layout.actions;
      const moveY = moveRect.y;
      const moveW = (panel.w - moveGap * Math.max(0, moveWindow.items.length - 1)) / Math.max(1, moveWindow.items.length);
      const showMoveRow = !compact || phase !== 'tool';
      if (showMoveRow) {
        moveWindow.items.forEach((move, slot) => {
          const index = moveWindow.start + slot;
          const x = panel.x + slot * (moveW + moveGap);
          drawCombatActionTile(move, {
            x, y: moveY, w: moveW, h: moveRect.h,
            selected: index === selectedMove,
            focused: phase === 'move' && index === selectedMove,
          });
          moveRows.push({ id: move.id, index, x, y: moveY, w: moveW, h: moveRect.h });
        });
        if (moveWindow.start > 0) uiText(panel.x + .2, moveY + moveRect.h - .8, '◀', 'ui-secondary', .75);
        if (moveWindow.start + moveWindow.items.length < renderedMoves.length) uiText(panel.x + panel.w - 1.2, moveY + moveRect.h - .8, '▶', 'ui-secondary', .75);
        regionRects.moves = moveRect;
      }

      // ── detail, notice, drill callout ──────────────────────────────────────
      if (!bark) {
        const highlighted = phase === 'move'
          ? renderedMoves[selectedMove]
          : phase === 'resolve' && resolution ? resolution.action : null;
        const modifierNames = [...passives, ...actives].map(shortName);
        if (phase === 'tool') {
          const tool = activeTool();
          const summary = `TOOLS · ${tool.label} · ${tool.ready === false ? 'LOCKED' : 'READY'}${modifierNames.length ? ` · MOD ${modifierNames.join(' / ')}` : ''}`;
          uiText(layout.detail.x, detailY, summary.slice(0, layout.detail.w), tool.ready === false ? 'ui-danger' : 'ui-secondary', .64);
        } else if (highlighted) {
          const long = highlighted.enabled === false
            ? `${highlighted.label} — ${highlighted.reason || 'UNAVAILABLE'}`
            : combatMoveSubtext(state, highlighted).long;
          const summary = `${long}${modifierNames.length ? ` · MOD ${modifierNames.join(' / ')}` : ''}`;
          uiText(layout.detail.x, detailY, summary.slice(0, layout.detail.w), 'ui-secondary', .6);
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
