import { INTENT_KIND } from '../game/combat-state.js';
import { GRID } from '../game/combat-damage.js';

const intent = (id, label, kind, damage = 2 * GRID, options = {}) => ({
  id, label, kind, damage,
  recordable: kind === INTENT_KIND.BROADCAST,
  invertible: kind === INTENT_KIND.LOOP,
  playbackDamage: kind === INTENT_KIND.BROADCAST ? Math.max(GRID, Math.min(3 * GRID, options.playbackDamage ?? damage)) : undefined,
  description: options.description || '',
  ...options,
});

// Damage bands, and why they are where they are. Every number here is in GRID
// units — the whole scale was multiplied by five so that outgoing damage could
// become a readable range rather than a flat integer (see combat-damage.js).
// A guard prevents 10–15, so a blow at 10 is a nuisance a braced recordist
// erases, and a blow at 20 is one they can only blunt. The heavy kinds live
// above the guard on purpose: the fight used to sit entirely underneath it,
// which meant a competent player finished every encounter untouched and the
// whole thing was decorative.
const B = (id, label, damage = 2 * GRID, options = {}) => intent(id, label, INTENT_KIND.BROADCAST, damage, options);
const C = (id, label, damage = 2 * GRID, options = {}) => intent(id, label, INTENT_KIND.CONCEAL, damage, options);
const O = (id, label, damage = 2 * GRID, options = {}) => intent(id, label, INTENT_KIND.OVERLOAD, damage, options);
const L = (id, label, damage = 4 * GRID, options = {}) => intent(id, label, INTENT_KIND.LOOP, damage, options);
const S = (id, label, options = {}) => intent(id, label, INTENT_KIND.SILENCE, 0, options);

function movement(id, title, coherence, intents, { reactions = null, severeIntents = null, deadAirIntents = null, formation = null } = {}) {
  return {
    id, title, coherence, intents,
    // Board-state reactions swap the cycle intent when a condition holds — the
    // opponent responding to how the fight is actually going, not a fixed loop.
    ...(reactions ? { reactions } : {}),
    // How large a formation this movement may field. Only the hall carries it;
    // every other encounter leaves it null and behaves exactly as before.
    ...(formation ? { formation } : {}),
    severeIntents: severeIntents || [...intents.slice(1), intents[0]],
    deadAirIntents: deadAirIntents || [...intents].reverse(),
  };
}

// A movement whose script does not change with the preset. Used by the bench
// drill, which is pinnedCycle and therefore teaches the same lesson in the same
// order however hard the night is set.
function pinned(id, title, coherence, intents, options = {}) {
  return movement(id, title, coherence, intents, { ...options, severeIntents: intents, deadAirIntents: intents });
}

const PROFILES = Object.freeze({
  natatorium: Object.freeze({
    kind: 'regular',
    signature: { id: 'echo', label: 'FOURTH RETURN', description: 'A missed response returns on the next hostile beat for +1 damage.' },
    music: {
      mode: 'fixed', lead: 'lead-1',
      submersion: {
        enabled:true,
        q:.8,
        wetMix:{ dry:0, half:.5, full:.92 },
        lowpassHz:{ dry:20000, half:1800, full:720 },
        transitionSeconds:{ dry:0, half:1, full:1.1, win:1.35 },
      },
    },
    presentation: {
      mode:'submerged',
      submersionPhases:['dry','half','full'],
      resultPhases:{ win:'dry', lose:'full' },
      wetMix:{ dry:0, half:.5, full:.92 },
      lowpassHz:{ dry:20000, half:1800, full:720 },
      transitionSeconds:{ dry:0, half:1, full:1.1, win:1.35 },
    },
    movements: [
      movement('room', 'THE DRY ROOM LISTENS', 25, [
        B('natatorium:meter', 'METER MOVES IN THE DRY ROOM', 10, { takeLabel: 'ROOM TONE', playbackDamage: 10, presentation:{visualClass:'meter-return'} }),
        O('natatorium:pressure', 'ROOM TONE HAMMERS BEHIND THE EARS', 10, { effect: 'ringing', presentation:{visualClass:'pressure-field'} }),
        C('natatorium:piano', 'TWO NOTES WITHOUT AIR', 10, { presentation:{visualClass:'surface-notes'} }),
      ]),
      movement('voice', 'THE VOICE IN THE DRAIN', 25, [
        B('natatorium:voice', 'HER VOICE IN THE DRAIN RETURN', 10, { takeLabel: 'VOICE PRINT', playbackDamage: 10, presentation:{visualClass:'drain-return'} }),
        C('natatorium:memory', 'SILT PASSED AS MEMORY', 10, { presentation:{visualClass:'silt-memory'} }),
        O('natatorium:lean', 'UNDERTOW TAKES THE CASE', 20, { effect: 'ringing', presentation:{visualClass:'undertow'} }),
      ], {
        // Hoard a take and the room leans on you for it — the opponent reacts to
        // your board rather than reading from a fixed script.
        reactions: [{ when: 'take-loaded', use: 'natatorium:lean' }],
      }),
      movement('hold', 'THE DEEP END', 30, [
        B('natatorium:echo', 'FOURTH RETURN FROM THE BOTTOM', 15, { takeLabel: 'EMPTY RETURN', playbackDamage: 10, presentation:{visualClass:'bottom-return'} }),
        // The pressure returns once as a second, lighter blow — a chained enemy
        // turn you brace for as one.
        O('natatorium:depth', 'BLACK WATER PRESSURE', 20, { effect: 'ringing', presentation:{visualClass:'depth-pressure'}, followups: [{ id: 'natatorium:depth-echo', kind: 'overload', damage: 5 }] }),
        C('natatorium:absence', 'THE LADDER IS NOT ABOVE YOU', 10, { presentation:{visualClass:'ladder-absence'} }),
      ]),
    ],
  }),
  // THE ONLY FIGHT WITH MORE THAN ONE THING IN IT.
  //
  // The hall's blows were all written for an empty house — A LISTENER IN THE
  // EMPTY SEAT, APPLAUSE IN THE NOISE FLOOR, AUDIENCE REMOVED FROM VIEW — and
  // the recordist's refusal was "nobody is sitting there". The seats are full
  // now (see battle-house.js), so that refusal is off the table and the blows
  // have to come from people rather than from architecture.
  //
  // `house` is what turns this profile into a group fight. Nothing else in the
  // combat layer needs to know: every path behaves exactly as it did when the
  // field is absent, which it is for all five other encounters.
  hall: Object.freeze({
    kind: 'regular',
    signature: { id: 'feedback', label: 'HOUSE RETURN', description: 'The first Playback in Noise each phase recoils for 1 Composure.' },
    music: { mode: 'fixed', lead: 'lead-3' },
    house: { figures: null },
    // THE ARC IS THE FORMATION GROWING.
    //
    // The three movements were mechanically identical before — the same one row
    // acting, three times, with different words over the top. The authored text
    // already said the sections were learning to coordinate; this is that text
    // becoming true. One lead teaches you what the roles do, two teaches you
    // that they combine, three is the fight the third movement is named after.
    movements: [
      movement('seated', 'THE HOUSE IS SEATED', 30, [
        B('hall:regard', 'A FULL HOUSE REGARDS YOU', 10, { takeLabel: 'THE REGARD', playbackDamage: 10 }),
        O('hall:shift', 'EVERY SEAT SHIFTS AT ONCE', 10, { effect: 'ringing' }),
        C('hall:gap', 'ONE SEAT EMPTIES WHEN YOU LOOK AT IT', 10),
      ], { formation: { supports: 0, ovation: false } }),
      movement('attention', 'EVERY HEAD AT ONCE', 30, [
        B('hall:turn', 'THE HOUSE TURNS ON YOUR LEVEL', 10, { takeLabel: 'THE TURN', playbackDamage: 10 }),
        L('hall:loop', 'OUTPUT PATCHED TO INPUT', 15),
        O('hall:lean', 'THE WHOLE TIER LEANS IN', 20, { effect: 'ringing' }),
      ], { formation: { supports: 1, ovation: false } }),
      // The old title was APPLAUSE WITHOUT HANDS. There are hands.
      movement('applause', 'APPLAUSE WITH HANDS', 30, [
        B('hall:applause', 'APPLAUSE, AND THEY MEAN IT', 15, { takeLabel: 'THE OVATION', playbackDamage: 10 }),
        C('hall:standing', 'THE ROW BEHIND YOU STANDS', 10),
        O('hall:stack', 'THE WHOLE HOUSE COMES UP AT ONCE', 20, { effect: 'ringing' }),
      ], { formation: { supports: 2, ovation: true } }),
    ],
  }),
  // NOTHING IN THIS ROOM ATTACKS HIM.
  //
  // Every intent below used to belong to the building — THE EMPTY CHAIR MOVES,
  // THE PHRASE PLAYS ITSELF, THE SCORE WRITES BACK — and every one of them put
  // the agency somewhere he could not be blamed for it, which is the move he has
  // been making for three years. A room that wants something is a ghost story.
  //
  // So they are his now. Each beat is a thing he does to a file: winding it back,
  // running it hotter, cutting the rest out, both hands on the fader. The damage
  // is what the repetition costs him. There is no opponent to reduce, because
  // there is nobody in here.
  //
  // The movement titles are the room's whole vocabulary, three times over. That
  // repetition is the content, not a failure to vary it.
  practice: Object.freeze({
    kind: 'regular',
    // NO SIGNATURE. It carried ENSEMBLE STACK — "every third hostile beat gains
    // +1 damage" — and there are no hostile beats in the practice wing any more.
    // A signature that cannot fire is a promise on the card the fight does not
    // keep, so it is gone rather than quietly inert. What the wing has instead of
    // a signature is the retake, and the retake is on the transport.
    music: { mode: 'fixed', lead: 'lead-2' },
    // FOUR BARS. He is not running the piece — nobody practises that way. He is
    // working the fragment that ends where the recording ends, which is three
    // beats to the wall and then a decision: wind it back, or play it back.
    practice: { bars: 4 },
    movements: [
      // THESE NUMBERS ARE WHAT A REPETITION COSTS, not what a blow does.
      //
      // They were the authored 10-20, balanced against a player countering an
      // attacker every beat. There is no attacker here and nothing to counter,
      // so a man simply walking the fragment was dead in three beats. A pass
      // through the bar costs a little and the later movements cost more,
      // because the hand goes and the ear goes — which is the only escalation
      // the wing has and the only one it needs.
      movement('instrument', 'TAKE IT FROM THE TOP', 25, [
        B('practice:two-notes', 'WIND IT BACK TWO BARS', 3, { takeLabel: 'TWO WRONG NOTES', playbackDamage: 10 }),
        C('practice:piano', 'PLAY IT UNDER YOUR BREATH', 3),
        O('practice:ensemble', 'RUN IT AT FULL LEVEL', 4, { effect: 'ringing' }),
      ]),
      movement('player', 'AGAIN, FROM THE TOP', 30, [
        B('practice:breath', 'CATCH THE BREATH BEFORE THE PHRASE', 4, { takeLabel: 'PLAYER BREATH', playbackDamage: 10 }),
        O('practice:downbeat', 'COUNT IT IN HARDER', 5, { effect: 'ringing' }),
        C('practice:chair', 'STOP WATCHING THE METER', 3),
      ]),
      movement('score', 'AND AGAIN', 30, [
        B('practice:phrase', 'PLAY THE BAR ON ITS OWN', 4, { takeLabel: 'THE BAR ON ITS OWN', playbackDamage: 10 }),
        C('practice:rest', 'CUT THE REST OUT OF IT', 3),
        O('practice:finale', 'BOTH HANDS ON THE FADER', 6, { effect: 'ringing' }),
      ]),
    ],
  }),
  chapel: Object.freeze({
    kind: 'chapel',
    signature: { id: 'contract', label: 'CHAIN OF PROOF', description: 'Perfect tool responses preserve evidence used by the final contract.' },
    music: { mode: 'movement', movementLeads: ['lead-1', 'lead-2', 'lead-3', 'lead-1', 'lead-3'] },
    movements: [
      movement('room', 'THE ROOM', 20, [
        B('chapel:room-tone', 'ROOM TONE CLAIMS A BODY', 10, { takeLabel: 'ROOM CLAIM', playbackDamage: 10 }),
        C('chapel:not-empty', 'NOT WRITTEN INTO EMPTY', 10),
        O('chapel:walls', 'THE WALLS CLOSE THE CIRCUIT', 20, { effect: 'ringing' }),
      ]),
      movement('recordist', 'THE PREVIOUS RECORDIST', 20, [
        B('chapel:body', 'BORROWED BODY ON THE MONITOR', 10, { takeLabel: 'BORROWED BODY', takeTag: 'body', playbackDamage: 10 }),
        O('chapel:consent', 'CONSENT BURIED UNDER NOISE', 20, { effect: 'ringing' }),
        C('chapel:previous', 'PREVIOUS RECORDIST HELD OFF-MIC', 10),
      ]),
      movement('surfer', 'THE SURFER', 20, [
        B('chapel:surfer', 'SURFER PRINT ON THE TAPE', 10, { takeLabel: 'SURFER PRINT', playbackDamage: 10 }),
        C('chapel:wearing', 'THE THING WEARING THE WORD', 10),
        O('chapel:process', 'PROCESS WITHOUT AN OPERATOR', 20, { effect: 'ringing' }),
      ]),
      movement('contract', 'THE CONTRACT', 20, [
        B('chapel:terms', 'TERMS READ INTO THE RECORDER', 10, { takeLabel: 'CONTRACT TERMS', playbackDamage: 10 }),
        L('chapel:contract-loop', 'AGREEMENT FED BACK AS CONSENT', 15),
        O('chapel:signature', 'SIGNATURE DRIVEN PAST ZERO', 20, { effect: 'ringing' }),
      ]),
      movement('source', 'THE SOURCE', 20, [
        B('chapel:body-return', 'BODY BORROWED RETURN', 10, { takeLabel: 'BODY BORROWED RETURN', takeTag: 'body', playbackDamage: 10 }),
        O('chapel:source-pressure', 'THE SOURCE PRESSES FOR AN ANSWER', 10, { effect: 'ringing' }),
        B('chapel:release-take', 'RELEASE PRINT ON THE RETURN', 10, { takeLabel: 'SIGNAL RELEASE', playbackDamage: 10 }),
        L('chapel:source-loop', 'SIGNAL PROCESS RELEASE', 15),
      ]),
    ],
  }),
  // The pre-shift bench drill. No signature rule: the drill teaches the base
  // verbs before any encounter twist is layered on. Intent order is load-bearing
  // — the combat tutorial director scripts one lesson per beat against it.
  training: Object.freeze({
    kind: 'regular',
    // Pinned to its script. The drill's lesson steps are written against this
    // order beat for beat and each waits on a specific perfect counter before
    // releasing the next move (combat-tutorial.js). A teaching sequence is the
    // one place an opponent with opinions is simply wrong.
    pinnedCycle: true,
    music: { mode: 'fixed', lead: 'lead-1' },
    movements: [
      // `pinned` keeps the severe and dead-air scripts IDENTICAL to the standard
      // one. Every other profile gets auto-rotated variants, which is what makes
      // the meaner presets throw a different order — but the drill's lesson steps
      // are written against this order beat for beat, so a rotation would have
      // the director waiting on a counter the opponent is not going to offer, and
      // would open the drill on two blows the recorder cannot capture.
      pinned('drill-a', 'CALIBRATION TONE', 40, [
        B('training:tone', 'TEST TONE ON THE BENCH SEND', 5, { takeLabel: 'TEST TONE', playbackDamage: 10 }),
        B('training:print', 'CLEAN PRINT, EASY CAPTURE', 5, { takeLabel: 'CLEAN PRINT', playbackDamage: 10 }),
        C('training:mask', 'THE TONE HIDES IN THE FLOOR', 5),
        O('training:swell', 'LEVEL SWELL PAST ZERO', 10, { effect: 'ringing' }),
      ]),
      pinned('drill-b', 'PLAYBACK PROOF', 30, [
        B('training:slate', 'SLATE READ ONTO THE TAPE', 10, { takeLabel: 'BENCH SLATE', playbackDamage: 10 }),
        O('training:spike', 'A SPIKE YOU MUST SIT OUT', 10, { effect: 'ringing' }),
        C('training:fade', 'IT PRETENDS TO LEAVE', 5),
      ]),
    ],
  }),
  source: Object.freeze({
    kind: 'source',
    signature: { id: 'routing', label: 'THREE RETURNS', description: 'Every perfect response and phase break commits signal to the armed return channel.' },
    music: { mode: 'movement', movementLeads: ['lead-1', 'lead-2', 'lead-3'] },
    movements: [
      movement('call-site', 'THE CALL SITE', 25, [
        B('source:address', 'THE RECORDIST AT THIS ADDRESS', 10, { takeLabel: 'CALL SITE', playbackDamage: 10 }),
        C('source:alias', 'AN ALIAS WEARING YOUR NAME', 10),
        O('source:stack', 'THE STACK OPENS UNDERFOOT', 20, { effect: 'ringing' }),
      ]),
      movement('borrowed-body', 'THE BORROWED BODY', 25, [
        B('source:body', 'BODY RETURN ON THE MONITOR', 10, { takeLabel: 'BORROWED BODY', takeTag: 'body', playbackDamage: 10 }),
        L('source:recursion', 'RECORDIST CALLS RECORDIST', 15),
        O('source:wear', 'THE BODY TAKES THE SIGNAL', 20, { effect: 'ringing' }),
      ]),
      movement('final-clause', 'THE FINAL CLAUSE', 25, [
        B('source:return', 'RETURN VALUE STILL SPEAKING', 15, { takeLabel: 'RETURN VALUE', takeTag: 'body', playbackDamage: 15 }),
        L('source:final-loop', 'SOURCE FED BACK INTO SURFER', 15),
        C('source:redact', 'THE CLAUSE HIDES ITS SUBJECT', 10),
        S('source:silence', 'SILENCE CLAIMS THE OUTPUT', { effect: 'recover', recover: 5 }),
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

// The one thing a story snapshot may still say: what the opponent's phases and
// blows are CALLED. Matched by intent id, never by position, so re-ordering the
// authored script can never hang a name on somebody else's move.
function reworded(movement, snapshot) {
  if (!snapshot) return null;
  const named = new Map((snapshot.intents || []).filter((intent) => intent?.label).map((intent) => [intent.id, intent.label]));
  if (!named.size && !snapshot.title) return null;
  const relabel = (intents) => (Array.isArray(intents)
    ? intents.map((intent) => (named.has(intent.id) ? { ...intent, label: named.get(intent.id) } : intent))
    : intents);
  return {
    ...(snapshot.title ? { title: snapshot.title } : {}),
    intents: relabel(movement.intents),
    ...(movement.severeIntents ? { severeIntents: relabel(movement.severeIntents) } : {}),
    ...(movement.deadAirIntents ? { deadAirIntents: relabel(movement.deadAirIntents) } : {}),
  };
}

// Narrative JSON owns prose and intent wording; the authored profile owns every
// mechanic. These two used to be rivals — whichever had movements won outright,
// and the JSON always did, because the importer freezes a copy of the profile
// into metadata.combat. That copy was taken before reactions, followups and the
// opponent's authoring fields existed, so the story battles have been quietly
// running an obsolete script: the natatorium's authored reaction, the one with
// the comment about reading your board instead of a fixed list, has never once
// fired in a shipped fight.
//
// So the authored profile is the spine now and the snapshot may only re-word
// what it names. Anything authored in this file reaches the story battles
// without regenerating content/ — which matters, because the chapel's five
// movements are hand-authored past what the importer would write back.
export function attachCombatDefinition(battle, combat = null) {
  const authored = authoredCombatProfile(battle.id);
  const snapshot = combat?.movements?.length ? combat : null;
  const rounds = battle.rounds || [];
  return {
    ...battle,
    combat: {
      id: battle.id,
      enemy: battle.enemy,
      art: battle.art || null,
      baseComposure: 8 * GRID,
      kind: authored.kind,
      signature: authored.signature,
      music: authored.music,
      ...(authored.presentation ? { presentation:authored.presentation } : {}),
      // Only the hall declares one. Absent everywhere else, which is what keeps
      // every other encounter on the single-opponent path unchanged.
      ...(authored.house ? { house: authored.house } : {}),
      ...(authored.practice ? { practice: authored.practice } : {}),
      movements: authored.movements.map((movement, index) => ({
        ...movement,
        ...reworded(movement, snapshot?.movements?.[index]),
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
    pinnedCycle: profile.pinnedCycle,
    enemy: 'THE THING NOT THERE YET',
    art: null,
    baseComposure: 8 * GRID,
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
    win: [{ who: 'direction', text: 'You blink. The dock, the dark, the meter still under sixty, your feet exactly where you left them. Six seconds, and you held every one of them. Whatever that was, you already know what you do about it.' }],
    lose: [{ who: 'direction', text: 'You blink, and lose the thread of it, and it is only the dock again. Six seconds, a good level, and a slightly stupid feeling. Nothing touched you. Nothing has started yet — and you have already told it what you are frightened of.' }],
  };
}

// One practice room, on one night, was still being used. Which room it is gets
// dealt per run (see game/practice-rooms.js); it is never the same one twice and
// it is never announced. You touch something in there and the room finishes its
// phrase at you.
//
// Deliberately two movements, not the recording battle's three. This is a fight
// you walked into by opening a door, not the set piece the work order sent you
// for, and it must not read as a second copy of THE SOUND OF SILENCE. The
// authored practice profile already carries the beat this is built on:
// `practice:chair` — THE EMPTY CHAIR MOVES.
export function practiceRoomHushDefinition() {
  const profile = authoredCombatProfile('practice');
  return {
    id: 'practice-room-hush',
    enemy: 'THE ROOM THAT WAS PRACTISING',
    art: null,
    baseComposure: 8 * GRID,
    kind: profile.kind,
    signature: profile.signature,
    music: profile.music,
    movements: profile.movements.slice(0, 2),
  };
}

export function practiceRoomHushBattle() {
  const combat = practiceRoomHushDefinition();
  return {
    id: combat.id,
    enemy: combat.enemy,
    art: combat.art,
    combat,
    intro: [
      { who: 'direction', text: 'The door was wedged open, like all of them, because whoever was in here was coming back after a coffee.' },
      { who: 'direction', text: 'They came back. The room takes up the phrase where it was interrupted, at full level, six feet away, with nobody at the instrument.' },
      { who: 'you', text: 'No. No, that is a room. That is a room with nothing in it.' },
    ],
    win: [
      { who: 'direction', text: 'The phrase gives up halfway through a bar, the way a phrase does when the player stops believing in it.' },
      { who: 'you', text: 'Wedge the door. Leave the door. Whatever. I am not shutting anything in here.' },
    ],
    lose: [
      { who: 'direction', text: 'You are out in the corridor with your hand on the frame and no memory of the two steps that put you there.' },
      { who: 'direction', text: 'Behind you the room finishes the phrase properly, and stops, and waits to be interrupted again.' },
    ],
  };
}

export function sourceCombatDefinition({ bodyReturn = false } = {}) {
  const profile = authoredCombatProfile('source');
  return {
    id: 'source-final',
    enemy: 'THE THING WEARING THE RECORDIST',
    art: { id: 'surfer', mode: 'boss', caption: 'Source / borrowed body', status: 'RETURN' },
    baseComposure: (bodyReturn ? 10 : 8) * GRID,
    kind: profile.kind,
    signature: profile.signature,
    music: profile.music,
    movements: profile.movements.map((entry) => entry.id === 'borrowed-body' && bodyReturn
      ? { ...entry, coherence: 4 * GRID }
      : entry),
    bodyReturnAssist: !!bodyReturn,
  };
}

export function sourceCombatBattle(options = {}) {
  const combat = sourceCombatDefinition(options);
  return {
    id: combat.id,
    enemy: combat.enemy,
    art: combat.art,
    combat,
    // Rig-neutral. What he is holding when the channels open is the rig
    // bridge's line to say — see applyRigAdvantage() in source-rig-bridge.js.
    intro: [
      { who: 'direction', text: 'The exposed fault opens. Three return channels rise out of the source at once.' },
      { who: 'you', text: 'Return. Isolate. Open. I decide where every signal goes.' },
    ],
    win: [{ who: 'direction', text: 'The clause loses coherence. The armed channel takes the return value.' }],
    lose: [{ who: 'direction', text: 'Your monitoring path clips to silence. The page remains unresolved.' }],
  };
}

export function cathedralBellCombatDefinition({ phase = 1, carriedDamage = 0 } = {}) {
  const source = authoredCombatProfile('source');
  const second = Number(phase) >= 2;
  const movements = second
    ? [
        movement('surfer-return', 'THE SURFER ENTERS THE PEAL', 30, [
          B('cathedral:surfer-print', 'SURFER PRINT IN SIX BELLS', 15, { takeLabel: 'SURFER / RETURN', playbackDamage: 15 }),
          L('cathedral:amplify', 'SIX MOUTHS PATCHED TO ONE BODY', 20),
          O('cathedral:full-peal', 'THE FULL PEAL THROUGH THE CROSSING', 25, { effect: 'ringing' }),
        ]),
        movement('severance', 'THE LINE BETWEEN BODY AND BELL', 30, [
          C('cathedral:hidden-line', 'THE RETURN HIDES IN THE FRAME', 15),
          B('cathedral:body-line', 'BORROWED BODY UNDER THE STRIKE', 15, { takeLabel: 'BODY / BELL', takeTag: 'body', playbackDamage: 15 }),
          O('cathedral:weight-drop', 'CLOCK WEIGHTS FALL THROUGH THE MONITOR', 25, { effect: 'ringing' }),
        ]),
      ]
    : [
        movement('bell-borne', 'THE BELLS BELOW THE BELLS', 25, [
          B('cathedral:cold-chord', 'COLD WINDOW CHORD ON THE RETURN', 10, { takeLabel: 'WINDOW / BELL', playbackDamage: 10 }),
          O('cathedral:clapper', 'CLAPPER THROUGH THE CROSSING PIER', 20, { effect: 'ringing' }),
          C('cathedral:louvre', 'THE STRIKE HIDES ABOVE THE LOUVRES', 10),
        ]),
        movement('frame', 'THE FRAME BEGINS TO MOVE', 25, [
          B('cathedral:timber', 'OLD TIMBER CARRIES A NEW RETURN', 15, { takeLabel: 'BELL FRAME', playbackDamage: 10 }),
          L('cathedral:wheel', 'WHEEL TURNS OUTPUT BACK TO INPUT', 15),
          O('cathedral:weight', 'TEN METRES OF CLOCK WEIGHT', 20, { effect: 'ringing' }),
        ]),
      ];
  return {
    id: second ? 'cathedral-surfer-final' : 'cathedral-bell-return',
    enemy: second ? 'THE SURFER / THE FULL PEAL' : 'THE CATHEDRAL BELL RETURN',
    art: { id: 'surfer', mode: second ? 'boss' : 'signal', caption: second ? 'Surfer / amplified return' : 'St Brendan\'s / crossing', status: second ? 'AMPLIFY' : 'STRIKE' },
    baseComposure: Math.max(4 * GRID, 8 * GRID - Math.min(4 * GRID, Math.max(0,Number(carriedDamage)||0))),
    kind: source.kind,
    signature: source.signature,
    music: { ...source.music, movementLeads: second ? ['lead-2','lead-3'] : ['lead-1','lead-2'] },
    movements,
    cathedralPhase: second ? 2 : 1,
  };
}

export function cathedralBellCombatBattle(options = {}) {
  const combat = cathedralBellCombatDefinition(options);
  const second = combat.cathedralPhase === 2;
  return {
    id: combat.id,
    enemy: combat.enemy,
    art: combat.art,
    combat,
    slate: second ? 'ST BRENDAN\'S / FULL PEAL' : 'ST BRENDAN\'S / BELL RETURN',
    intro: second ? [
      { who: 'direction', text: 'A man drops from the crossing dark and catches the bell return before it can die.' },
      { who: 'surfer', text: 'You brought me a cathedral.' },
      { who: 'direction', text: 'He opens both hands. Every bell answers through him, and the pressure you spent reaching this phase remains spent.' },
    ] : [
      { who: 'direction', text: 'At the crossing, the six bells begin without moving. Their return comes down the clustered piers looking for a body.' },
      { who: 'you', text: 'Not a rope. Not a pattern. Just a signal with too much stone behind it.' },
    ],
    win: second
      ? [{ who: 'direction', text: 'The monitor finds the line between the Surfer and the bells. The line parts. He does not.' }]
      : [{ who: 'direction', text: 'The first return breaks against the screen. Something alive lands inside the remaining tone.' }],
    lose: [{ who: 'direction', text: 'The bells complete their return through both available bodies.' }],
  };
}
