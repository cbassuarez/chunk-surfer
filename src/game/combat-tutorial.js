// The opening's bench rehearsal. A lesson owns its telegraph and useful tool,
// not a guessed number of turns through a moving enemy script. Player actions
// still resolve through the ordinary reducer; no lesson awards a win.
import { COMBAT_ACTION, availableCombatActions } from './combat-state.js';

export const COMBAT_TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    id: 'hold', allow: Object.freeze([COMBAT_ACTION.HOLD]), preferred: COMBAT_ACTION.HOLD,
    intentId: 'training:brace', spotlight: 'intent',
    say: '01 · HANDS / HOLD · READ THE INCOMING BLOW. BRACE NOW; WATCH YOUR COMPOSURE.',
    until: last => last.action === COMBAT_ACTION.HOLD,
  }),
  Object.freeze({
    id: 'expose', allow: Object.freeze([COMBAT_ACTION.EXPOSE]), preferred: COMBAT_ACTION.EXPOSE,
    intentId: 'training:conceal', spotlight: 'moves',
    say: '02 · TORCH / EXPOSE · IT IS HIDING. LIGHT BREAKS CONCEALMENT AND LEAVES RESIDUE.',
    until: last => last.action === COMBAT_ACTION.EXPOSE && last.perfect === true,
  }),
  Object.freeze({
    id: 'settle', allow: Object.freeze([COMBAT_ACTION.HOLD]), preferred: COMBAT_ACTION.HOLD,
    tempo: true, spotlight: 'tempo',
    say: '03 · HANDS / HOLD · YOUR READ EARNED ONE FREE TEMPO. SETTLE; THE NEXT BLOW WAITS.',
    until: last => last.action === COMBAT_ACTION.HOLD && last.bonus === true,
  }),
  Object.freeze({
    id: 'monitor', allow: Object.freeze([COMBAT_ACTION.MONITOR]), preferred: COMBAT_ACTION.MONITOR,
    intentId: 'training:capture', spotlight: 'intent',
    say: '04 · RECORDER / MONITOR · IT BROADCASTS. CATCH THAT SIGNAL; WATCH THE EMPTY TAKE FILL.',
    until: (last, after) => last.action === COMBAT_ACTION.MONITOR && last.perfect === true && !!after.take,
  }),
  Object.freeze({
    id: 'tempo', allow: Object.freeze([COMBAT_ACTION.PLAYBACK]), preferred: COMBAT_ACTION.PLAYBACK,
    tempo: true, spotlight: 'tempo',
    say: '05 · RECORDER / PLAYBACK · SPEND THE TAKE IN FREE TEMPO. THE TORCH RESIDUE GOES WITH IT.',
    until: (last, after) => last.action === COMBAT_ACTION.PLAYBACK && last.bonus === true && !after.take,
  }),
  Object.freeze({
    id: 'parry', allow: Object.freeze([COMBAT_ACTION.WAIT]), preferred: COMBAT_ACTION.WAIT,
    intentId: 'training:contact', spotlight: 'moves', patience: 2,
    say: '06 · HANDS / WAIT · LET IT COME. RELEASE CONFIRM; PRESS AGAIN INSIDE THE LIT CONTACT BAND.',
    until: last => last.action === COMBAT_ACTION.WAIT && last.parried === true,
  }),
  Object.freeze({
    id: 'free', allow: null, preferred: COMBAT_ACTION.EXPOSE, spotlight: 'tools',
    say: '07 · YOUR CALL · UP: TOOLS. LEFT / RIGHT: CHOOSE. EXPOSE, OR CAPTURE THEN PLAYBACK. FINISH IT.',
    until: (_last, after) => !!after.result,
  }),
]);

// A reaction rewrites state.last.action to PARRY. Observe the actual player
// commitment from the new action-log span, then add the reaction result. An
// enemy-only timeout or stale last record cannot impersonate a taught action.
function lessonEvent(before, after) {
  const hasLog = Array.isArray(after?.actionLog);
  const entries = hasLog ? after.actionLog.slice(before?.actionLog?.length || 0) : [];
  const player = entries.find(entry => !['enemy', COMBAT_ACTION.FIREBALL_RETURN, COMBAT_ACTION.FIREBALL_IMPACT].includes(entry.action));
  if (!player && hasLog) return null;
  return { ...(after?.last || {}), ...(player || {}), parried: after?.last?.parried === true };
}

export function createCombatTutorialDirector(steps = COMBAT_TUTORIAL_STEPS) {
  let index = 0, skipped = false, attempts = 0, houseIssued = false;
  const current = () => skipped || index >= steps.length ? null : steps[index];
  return {
    active: () => !!current(),
    // Compatibility for old integrations: completion is the actual coherence
    // result, never a director-issued synthetic victory.
    completeBattle: () => false,
    guided: () => Array.isArray(current()?.allow),
    pausesTurnClock: () => !!current(),
    allowsParry: () => !current() || ['parry', 'free'].includes(current().id),
    step: current,
    prompt: () => current()?.id === 'parry' && attempts > 0
      ? '06 · TRY ONCE MORE · WAIT, RELEASE CONFIRM, THEN PRESS IN THE LIT BAND. MISSING IS SAFE HERE.'
      : current()?.say || '',
    spotlight: () => current()?.spotlight || null,
    filterMoves(moves) {
      const step = current();
      if (!step?.allow) return moves;
      return moves.map(move => step.allow.includes(move.id) ? move : {
        ...move, enabled: false, reason: `DRILL · ${String(step.preferred || step.allow[0]).toUpperCase().replaceAll('-', ' ')} NEXT`,
      });
    },
    preferredAction(state) {
      const step = current();
      if (!step) return null;
      const actions = availableCombatActions(state);
      return actions.find(action => action.id === step.preferred && action.enabled)?.id
        || actions.find(action => action.enabled && (!step.allow || step.allow.includes(action.id)))?.id || null;
    },
    prepareState(state) {
      const step = current();
      if (!step || state?.result || state?.definition?.rehearsal !== 'bench-drill-v2') return state;
      let next = state;
      if (!houseIssued) {
        houseIssued = true;
        next = { ...next, battery: 1, take: null, techniques: [], composure: next.maxComposure,
          tools: { torch: true, recorder: true, rig: false, fork: false, radio: false, coffee: false, order: ['torch', 'recorder'] } };
      }
      if (!step.allow) return next;
      // Stage the read before selection, never after commitment. A missed
      // parry cannot cycle into a feint with no reaction window. TEMPO remains
      // what the preceding real counter earned; it is not a free supplied take.
      const intents = next.definition.movements[next.movementIndex]?.intents || [];
      const intentIndex = intents.findIndex(intent => intent.id === step.intentId);
      next = { ...next, enemyGuard: null, misread: null };
      if (intentIndex >= 0) {
        next.intentIndex = intentIndex;
        next.cycleIndex = intentIndex;
        next.committed = { id: step.intentId, index: intentIndex };
        next.tempo = false;
      }
      return next;
    },
    advance(before, after) {
      const step = current();
      if (!step) return false;
      const event = lessonEvent(before, after);
      if (!event && !after?.result) return false;
      if (!step.until(event || {}, after)) {
        if (step.allow && !step.allow.includes(event?.action)) return false;
        attempts += 1;
        if (!(step.patience > 0 && attempts >= step.patience)) return false;
      }
      index += 1;
      attempts = 0;
      return true;
    },
    skip() { skipped = true; },
    snapshot: () => ({ id: current()?.id || null, index, total: steps.length, skipped, attempts }),
  };
}
