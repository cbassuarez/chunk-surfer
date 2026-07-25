import { INTENT_KIND } from '../game/combat-state.js';

const intent = (id, label, kind, damage = 2, options = {}) => ({
  id, label, kind, damage,
  recordable: kind === INTENT_KIND.BROADCAST,
  invertible: kind === INTENT_KIND.LOOP,
  playbackDamage: kind === INTENT_KIND.BROADCAST ? Math.max(1, Math.min(3, options.playbackDamage ?? damage)) : undefined,
  description: options.description || '',
  ...options,
});

const B = (id, label, damage = 2, options = {}) => intent(id, label, INTENT_KIND.BROADCAST, damage, options);
const C = (id, label, damage = 2, options = {}) => intent(id, label, INTENT_KIND.CONCEAL, damage, options);
const O = (id, label, damage = 2, options = {}) => intent(id, label, INTENT_KIND.OVERLOAD, damage, options);
const L = (id, label, damage = 3, options = {}) => intent(id, label, INTENT_KIND.LOOP, damage, options);
const S = (id, label, options = {}) => intent(id, label, INTENT_KIND.SILENCE, 0, options);

function movement(id, title, coherence, intents, { reactions = null, severeIntents = null, deadAirIntents = null } = {}) {
  return {
    id, title, coherence, intents,
    // Board-state reactions swap the cycle intent when a condition holds — the
    // opponent responding to how the fight is actually going, not a fixed loop.
    ...(reactions ? { reactions } : {}),
    severeIntents: severeIntents || [...intents.slice(1), intents[0]],
    deadAirIntents: deadAirIntents || [...intents].reverse(),
  };
}

const PROFILES = Object.freeze({
  natatorium: Object.freeze({
    kind: 'regular',
    signature: { id: 'echo', label: 'FOURTH RETURN', description: 'A missed response returns on the next hostile beat for +1 damage.' },
    music: { mode: 'fixed', lead: 'lead-1' },
    movements: [
      movement('room', 'THE EMPTY ROOM', 4, [
        B('natatorium:meter', 'METER MOVES WITHOUT AIR', 2, { takeLabel: 'ROOM TONE', playbackDamage: 2 }),
        O('natatorium:pressure', 'PRESSURE BEHIND THE EARS', 2, { effect: 'ringing' }),
        C('natatorium:piano', 'PIANO WITH NO TRANSIENT', 2),
      ]),
      movement('voice', 'THE VOICE ON TAPE', 4, [
        B('natatorium:voice', 'VOICE ON THE MONITOR PATH', 2, { takeLabel: 'VOICE PRINT', playbackDamage: 2 }),
        C('natatorium:memory', 'MEMORY PASSED AS SIGNAL', 2),
        O('natatorium:lean', 'THE ROOM LEANS CLOSER', 3, { effect: 'ringing' }),
      ], {
        // Hoard a take and the room leans on you for it — the opponent reacts to
        // your board rather than reading from a fixed script.
        reactions: [{ when: 'take-loaded', use: 'natatorium:lean' }],
      }),
      movement('hold', 'THE TAKE THAT HOLDS YOU', 4, [
        B('natatorium:echo', 'FOURTH RETURN OF THE ECHO', 3, { takeLabel: 'EMPTY RETURN', playbackDamage: 2 }),
        // The pressure returns once as a second, lighter blow — a chained enemy
        // turn you brace for as one.
        O('natatorium:depth', 'BLACK WATER PRESSURE', 3, { effect: 'ringing', followups: [{ id: 'natatorium:depth-echo', kind: 'overload', damage: 1 }] }),
        C('natatorium:absence', 'ABSENCE WEARING HER VOICE', 2),
      ]),
    ],
  }),
  hall: Object.freeze({
    kind: 'regular',
    signature: { id: 'feedback', label: 'HOUSE RETURN', description: 'The first Playback in Noise each phase recoils for 1 Composure.' },
    music: { mode: 'fixed', lead: 'lead-3' },
    movements: [
      movement('monitor', 'THE MONITOR RETURN', 4, [
        B('hall:send', 'HOUSE SEND ON AN OPEN FADER', 2, { takeLabel: 'HOUSE SEND', playbackDamage: 2 }),
        O('hall:bus', 'BUS VOLTAGE WITHOUT POWER', 2, { effect: 'ringing' }),
        C('hall:seat', 'A LISTENER IN THE EMPTY SEAT', 2),
      ]),
      movement('return', 'THE HOUSE RETURN', 4, [
        B('hall:room', 'ROOM RETURN ON THE TAPE', 2, { takeLabel: 'HOUSE RETURN', playbackDamage: 2 }),
        L('hall:loop', 'OUTPUT PATCHED TO INPUT', 3),
        O('hall:clip', 'THE RETURN CLIPS RED', 3, { effect: 'ringing' }),
      ]),
      movement('applause', 'APPLAUSE WITHOUT HANDS', 4, [
        B('hall:applause', 'APPLAUSE IN THE NOISE FLOOR', 3, { takeLabel: 'EMPTY APPLAUSE', playbackDamage: 2 }),
        C('hall:audience', 'AUDIENCE REMOVED FROM VIEW', 2),
        O('hall:stack', 'THE STACK COMES UP AT ONCE', 3, { effect: 'ringing' }),
      ]),
    ],
  }),
  practice: Object.freeze({
    kind: 'regular',
    signature: { id: 'ensemble', label: 'ENSEMBLE STACK', description: 'Every third hostile beat gains +1 damage unless this movement was Tuned.' },
    music: { mode: 'fixed', lead: 'lead-2' },
    movements: [
      movement('instrument', 'THE WRONG INSTRUMENT', 4, [
        B('practice:two-notes', 'TWO NOTES ON THE TAKE', 2, { takeLabel: 'TWO WRONG NOTES', playbackDamage: 2 }),
        C('practice:piano', 'PIANO HIDDEN IN A DEAD ROOM', 2),
        O('practice:ensemble', 'EVERY STAND ANSWERS', 2, { effect: 'ringing' }),
      ]),
      movement('player', 'THE PLAYER NOT PRESENT', 4, [
        B('practice:breath', 'BREATH BEFORE THE PHRASE', 2, { takeLabel: 'PLAYER BREATH', playbackDamage: 2 }),
        O('practice:downbeat', 'DOWNBEAT THROUGH THE FLOOR', 3, { effect: 'ringing' }),
        C('practice:chair', 'THE EMPTY CHAIR MOVES', 2),
      ]),
      movement('score', 'THE SCORE WRITES BACK', 4, [
        B('practice:phrase', 'THE PHRASE PLAYS ITSELF', 3, { takeLabel: 'SELF-PLAYING PHRASE', playbackDamage: 2 }),
        C('practice:rest', 'REST BLACKED OUT OF THE BAR', 2),
        O('practice:finale', 'ALL PARTS AT FULL LEVEL', 3, { effect: 'ringing' }),
      ]),
    ],
  }),
  chapel: Object.freeze({
    kind: 'chapel',
    signature: { id: 'contract', label: 'CHAIN OF PROOF', description: 'Perfect tool responses preserve evidence used by the final contract.' },
    music: { mode: 'movement', movementLeads: ['lead-1', 'lead-2', 'lead-3', 'lead-1', 'lead-3'] },
    movements: [
      movement('room', 'THE ROOM', 4, [
        B('chapel:room-tone', 'ROOM TONE CLAIMS A BODY', 2, { takeLabel: 'ROOM CLAIM', playbackDamage: 2 }),
        C('chapel:not-empty', 'NOT WRITTEN INTO EMPTY', 2),
        O('chapel:walls', 'THE WALLS CLOSE THE CIRCUIT', 3, { effect: 'ringing' }),
      ]),
      movement('recordist', 'THE PREVIOUS RECORDIST', 4, [
        B('chapel:body', 'BORROWED BODY ON THE MONITOR', 2, { takeLabel: 'BORROWED BODY', takeTag: 'body', playbackDamage: 2 }),
        O('chapel:consent', 'CONSENT BURIED UNDER NOISE', 3, { effect: 'ringing' }),
        C('chapel:previous', 'PREVIOUS RECORDIST HELD OFF-MIC', 2),
      ]),
      movement('surfer', 'THE SURFER', 4, [
        B('chapel:surfer', 'SURFER PRINT ON THE TAPE', 2, { takeLabel: 'SURFER PRINT', playbackDamage: 2 }),
        C('chapel:wearing', 'THE THING WEARING THE WORD', 2),
        O('chapel:process', 'PROCESS WITHOUT AN OPERATOR', 3, { effect: 'ringing' }),
      ]),
      movement('contract', 'THE CONTRACT', 4, [
        B('chapel:terms', 'TERMS READ INTO THE RECORDER', 2, { takeLabel: 'CONTRACT TERMS', playbackDamage: 2 }),
        L('chapel:contract-loop', 'AGREEMENT FED BACK AS CONSENT', 3),
        O('chapel:signature', 'SIGNATURE DRIVEN PAST ZERO', 3, { effect: 'ringing' }),
      ]),
      movement('source', 'THE SOURCE', 4, [
        B('chapel:body-return', 'BODY BORROWED RETURN', 2, { takeLabel: 'BODY BORROWED RETURN', takeTag: 'body', playbackDamage: 2 }),
        O('chapel:source-pressure', 'THE SOURCE PRESSES FOR AN ANSWER', 2, { effect: 'ringing' }),
        B('chapel:release-take', 'RELEASE PRINT ON THE RETURN', 2, { takeLabel: 'SIGNAL RELEASE', playbackDamage: 2 }),
        L('chapel:source-loop', 'SIGNAL PROCESS RELEASE', 3),
      ]),
    ],
  }),
  // The pre-shift bench drill. No signature rule: the drill teaches the base
  // verbs before any encounter twist is layered on. Intent order is load-bearing
  // — the combat tutorial director scripts one lesson per beat against it.
  training: Object.freeze({
    kind: 'regular',
    music: { mode: 'fixed', lead: 'lead-1' },
    movements: [
      movement('drill-a', 'CALIBRATION TONE', 8, [
        B('training:tone', 'TEST TONE ON THE BENCH SEND', 1, { takeLabel: 'TEST TONE', playbackDamage: 2 }),
        B('training:print', 'CLEAN PRINT, EASY CAPTURE', 1, { takeLabel: 'CLEAN PRINT', playbackDamage: 2 }),
        C('training:mask', 'THE TONE HIDES IN THE FLOOR', 1),
        O('training:swell', 'LEVEL SWELL PAST ZERO', 2, { effect: 'ringing' }),
      ]),
      movement('drill-b', 'PLAYBACK PROOF', 6, [
        B('training:slate', 'SLATE READ ONTO THE TAPE', 2, { takeLabel: 'BENCH SLATE', playbackDamage: 2 }),
        O('training:spike', 'A SPIKE YOU MUST SIT OUT', 2, { effect: 'ringing' }),
        C('training:fade', 'IT PRETENDS TO LEAVE', 1),
      ]),
    ],
  }),
  source: Object.freeze({
    kind: 'source',
    signature: { id: 'routing', label: 'THREE RETURNS', description: 'Every perfect response and phase break commits signal to the armed return channel.' },
    music: { mode: 'movement', movementLeads: ['lead-1', 'lead-2', 'lead-3'] },
    movements: [
      movement('call-site', 'THE CALL SITE', 5, [
        B('source:address', 'THE RECORDIST AT THIS ADDRESS', 2, { takeLabel: 'CALL SITE', playbackDamage: 2 }),
        C('source:alias', 'AN ALIAS WEARING YOUR NAME', 2),
        O('source:stack', 'THE STACK OPENS UNDERFOOT', 3, { effect: 'ringing' }),
      ]),
      movement('borrowed-body', 'THE BORROWED BODY', 5, [
        B('source:body', 'BODY RETURN ON THE MONITOR', 2, { takeLabel: 'BORROWED BODY', takeTag: 'body', playbackDamage: 2 }),
        L('source:recursion', 'RECORDIST CALLS RECORDIST', 3),
        O('source:wear', 'THE BODY TAKES THE SIGNAL', 3, { effect: 'ringing' }),
      ]),
      movement('final-clause', 'THE FINAL CLAUSE', 5, [
        B('source:return', 'RETURN VALUE STILL SPEAKING', 3, { takeLabel: 'RETURN VALUE', takeTag: 'body', playbackDamage: 3 }),
        L('source:final-loop', 'SOURCE FED BACK INTO SURFER', 3),
        C('source:redact', 'THE CLAUSE HIDES ITS SUBJECT', 2),
        S('source:silence', 'SILENCE CLAIMS THE OUTPUT', { effect: 'recover', recover: 1 }),
      ]),
    ],
  }),
});

function profileId(id = '') {
  const value = String(id).toLowerCase();
  if (value.includes('natatorium')) return 'natatorium';
  if (value.includes('practice')) return 'practice';
  if (value.includes('hall')) return 'hall';
  if (value.includes('chapel')) return 'chapel';
  if (value.includes('source')) return 'source';
  if (value.includes('training')) return 'training';
  return value;
}

export function authoredCombatProfile(id) {
  const profile = PROFILES[profileId(id)];
  if (!profile) throw new Error(`unknown signal combat profile: ${id}`);
  return JSON.parse(JSON.stringify(profile));
}

export function attachCombatDefinition(battle, combat = null) {
  const authored = authoredCombatProfile(battle.id);
  const profile = combat?.movements?.length ? JSON.parse(JSON.stringify(combat)) : authored;
  const rounds = battle.rounds || [];
  return {
    ...battle,
    combat: {
      id: battle.id,
      enemy: battle.enemy,
      art: battle.art || null,
      baseComposure: 8,
      kind: profile.kind,
      signature: profile.signature || authored.signature,
      music: profile.music || authored.music,
      movements: profile.movements.map((movement, index) => ({
        ...movement,
        // Narrative JSON owns prose and intent wording; the authored combat
        // profile owns balance so old story variants cannot silently pin an
        // obsolete health curve.
        coherence: authored.movements[index]?.coherence ?? movement.coherence,
        before: rounds[index]?.before || [],
        onListen: rounds[index]?.onListen || [],
        after: rounds[index]?.after || [],
        art: rounds[index]?.art || battle.art || null,
        threat: rounds[index]?.threat ?? .45 + index * .1,
      })),
    },
  };
}

export function trainingCombatDefinition() {
  const profile = authoredCombatProfile('training');
  return {
    id: 'training',
    enemy: 'THE THING NOT THERE YET',
    art: null,
    baseComposure: 8,
    kind: profile.kind,
    signature: null,
    music: profile.music,
    movements: profile.movements,
  };
}

export function trainingCombatBattle() {
  const combat = trainingCombatDefinition();
  return {
    id: combat.id,
    enemy: combat.enemy,
    art: combat.art,
    combat,
    // He is asleep on his feet on the loading dock with the levels good, and the
    // stupid joke he just made to pass the time is happening to him. He did not
    // prepare for this and he is not being brave: he bored himself into a
    // nightmare and it is going to be embarrassing when he wakes up.
    //
    // The count and the drift that get him here are the daydream beat, which runs
    // during the take itself (see beginDaydream in main.js). By the time this
    // opens he has already said the demon part out loud.
    intro: [
      { who: 'direction', text: 'And there it is. Nine feet of it, in the deep end, exactly as daft as he described.' },
      { who: 'you', text: "Oh, that's not fair. I was joking. I was making a joke." },
    ],
    win: [{ who: 'direction', text: 'You blink. The dock, the dark, the meter still under sixty, your feet exactly where you left them. Six seconds. You have been standing here six seconds.' }],
    lose: [{ who: 'direction', text: 'You blink, and lose the thread of it, and it is only the dock again. Six seconds, a good level, and a slightly stupid feeling. Nothing touched you. Nothing has started yet.' }],
  };
}

export function sourceCombatDefinition() {
  const profile = authoredCombatProfile('source');
  return {
    id: 'source-final',
    enemy: 'THE THING WEARING THE RECORDIST',
    art: { id: 'surfer', mode: 'boss', caption: 'Source / borrowed body', status: 'RETURN' },
    baseComposure: 8,
    kind: profile.kind,
    signature: profile.signature,
    music: profile.music,
    movements: profile.movements,
  };
}

export function sourceCombatBattle() {
  const combat = sourceCombatDefinition();
  return {
    id: combat.id,
    enemy: combat.enemy,
    art: combat.art,
    combat,
    intro: [
      { who: 'direction', text: 'The final page does not wait for a mark. Its three return channels rise out of the source at once.' },
      { who: 'you', text: 'Return. Isolate. Open. I decide where every signal goes.' },
    ],
    win: [{ who: 'direction', text: 'The clause loses coherence. The armed channel takes the return value.' }],
    lose: [{ who: 'direction', text: 'Your monitoring path clips to silence. The page remains unresolved.' }],
  };
}
