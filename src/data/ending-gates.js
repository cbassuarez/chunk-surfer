// HOW EACH ENDING IS REACHED, AND WHAT STOPS IT.
//
// data/endings.js says what an ending is: its arrivals, its timelines, its
// image, its epilogue. It says nothing about how a player gets one, because
// that answer is spread across the picker in conservatory-script.js, two flags,
// a set of combat proofs, the Source route reducers, and several call sites in
// main.js.
//
// This file collects that in one place, in plain language. Nothing here is
// executed by the game — it is a description, checked against the code by
// endingGateErrors() and by test/ending-contract.spec.mjs. Each entry names the
// file and symbol that actually enforces it, so a description that has drifted
// out of date fails a test instead of quietly misleading someone.
//
// Writing rules: `requires` is something that must be true when the ending is
// decided. `blocks` is something that takes the ending away from a player who
// would otherwise get it. Keep both readable by someone who has not read the
// code; put the code name in `identifier`.

import { ENDING_IDS } from '../progression/schema.js';
import { ENDING_MANIFEST, ENDING_ARRIVAL } from './endings.js';

// Where the rule lives. `symbol` is matched as text rather than pinned to a line
// number, because line numbers go stale without anyone noticing and a missing
// function name is worth failing a test over.
const at = (file, symbol) => Object.freeze({ file, symbol });

// Short labels for what kind of condition this is. Kept to ordinary words.
export const GATE_KIND = Object.freeze({
  OBJECT: 'an object',
  CHOICE: 'a choice',
  FIGHT: 'a fight',
  PROOF: 'something you proved',
  ROAD: 'which road you took',
  TASK: 'something you do',
  INSTEAD: 'you get another ending',
  LOCKED: 'the chapel locked it',
  PLACE: 'where the run is',
});

// The three roads a run can end on. It picks one and cannot change its mind.
export const ENDING_FAMILY = Object.freeze({
  chapel: Object.freeze({
    id: 'chapel',
    title: 'The chapel',
    reached: 'Walk away from the Source fight, take the Horizon tape, and get off it at the chapel. Four of the nine endings are here, and they are the only ones the player picks between.',
    where: at('src/main.js', 'function beginConfrontation('),
  }),
  contact: Object.freeze({
    id: 'contact',
    title: 'Contact',
    reached: 'Stay and fight at the Source fault instead of walking away. Once you commit there is no way back: this road never reaches Horizon, so the chapel and the tower are both gone.',
    where: at('src/game/chunk-surf-state.js', "case 'CONTACT_COMMITTED':"),
  }),
  tower: Object.freeze({
    id: 'tower',
    title: 'The tower',
    reached: 'Walk away from the fight, then leave the Horizon tape at the tower instead of the chapel. This is the detour the bust offers, and it takes about ten minutes.',
    where: at('src/game/chunk-surf-state.js', 'export const HORIZON_EXIT'),
  }),
});

// Conditions that come up under more than one ending, written once.
const RIG = Object.freeze({
  label: 'The bent recording rig',
  identifier: 'has.interface',
  kind: GATE_KIND.OBJECT,
  detail: 'Both ways out of the chapel need it. Without it the only thing the chapel offers is the agreement.',
  where: at('src/main.js', "const hasRig = flagTest('has.interface')"),
});
const FORK = Object.freeze({
  label: 'The tuning fork',
  identifier: 'finaleHasFork()',
  kind: GATE_KIND.OBJECT,
  detail: 'Needed on top of the rig to free the other recordist. It is the thing that sounds once and takes away the line the room was standing on.',
  where: at('src/main.js', 'const hasFork=finaleHasFork()'),
});
const COFFEE = Object.freeze({
  label: "You drank the guard's coffee",
  identifier: 'drank.coffee',
  kind: GATE_KIND.CHOICE,
  detail: 'Taken at the gate before you go in. One cup, hours earlier, and it decides which of two endings the same night produces.',
  where: at('src/main.js', "flagTest('drank.coffee')?'helped':'sacrifice'"),
});
const CHAPEL_ROAD = Object.freeze({
  label: 'The run has not already committed to another road',
  kind: GATE_KIND.ROAD,
  detail: 'If this run went to Contact or the tower, the chapel refuses to open: "This run already belongs to another return."',
  where: at('src/main.js', "if(route&&route!==SOURCE_FINALE_ROUTE.CHAPEL)"),
});

export const ENDING_GATES = Object.freeze({
  // ── THE SEAL ───────────────────────────────────────────────────────────────
  sacrifice: Object.freeze({
    id: 'sacrifice',
    family: 'chapel',
    summary: 'What happens if you stay, sober. Agree to it, get beaten into it, or run out of time trying to avoid it. This is the ending a player gets without doing anything special, which is the point of it.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.AGREED]: Object.freeze({
        how: 'Pick "Give the room the agreement it is asking for" at the chapel.',
        where: at('src/data/conservatory-script.js', "set: ['ending.choice=sacrifice']"),
      }),
      [ENDING_ARRIVAL.DEFEATED]: Object.freeze({
        how: 'Lose the chapel fight. The choice is taken off you, and a short scene about that plays before the ending.',
        where: at('src/main.js', 'onLose: ()=> endSacrifice(ENDING_ARRIVAL.DEFEATED)'),
      }),
      [ENDING_ARRIVAL.TIMED_OUT]: Object.freeze({
        how: 'Choose to invert the signal, then miss the deadline on the escape run. A short scene about running out of time plays first.',
        where: at('src/main.js', 'endSacrifice(ENDING_ARRIVAL.TIMED_OUT)'),
      }),
    }),
    requires: Object.freeze([
      CHAPEL_ROAD,
      Object.freeze({
        label: 'You did not drink the coffee',
        identifier: 'drank.coffee',
        kind: GATE_KIND.CHOICE,
        detail: 'Exactly the same walk to the chapel screen becomes He Tried to Help if you took the cup.',
        where: at('src/main.js', 'function completeSacrificeEnding()'),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Drinking the coffee',
        kind: GATE_KIND.INSTEAD,
        detail: 'Not really a block. Every route that would end here ends in He Tried to Help instead, with the same walk and the same arrival.',
        to: 'helped',
        where: at('src/main.js', 'function endSacrifice('),
      }),
      Object.freeze({
        label: 'Having committed to Contact or the tower',
        kind: GATE_KIND.ROAD,
        detail: 'The chapel never opens, so none of the three ways in can happen.',
        where: at('src/main.js', 'function beginConfrontation('),
      }),
    ]),
  }),

  // ── HE TRIED TO HELP ───────────────────────────────────────────────────────
  helped: Object.freeze({
    id: 'helped',
    family: 'chapel',
    summary: 'The same ending as The Seal, seen through a paper cup. Identical route; one choice apart.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.AGREED]: Object.freeze({
        how: 'Take the agreement at the chapel, having drunk the coffee.',
        where: at('src/data/conservatory-script.js', "set: ['ending.choice=sacrifice']"),
      }),
      [ENDING_ARRIVAL.DEFEATED]: Object.freeze({
        how: 'Lose the chapel fight, having drunk the coffee.',
        where: at('src/main.js', 'onLose: ()=> endSacrifice(ENDING_ARRIVAL.DEFEATED)'),
      }),
      [ENDING_ARRIVAL.TIMED_OUT]: Object.freeze({
        how: 'Miss the escape deadline, having drunk the coffee.',
        where: at('src/main.js', 'endSacrifice(ENDING_ARRIVAL.TIMED_OUT)'),
      }),
    }),
    requires: Object.freeze([CHAPEL_ROAD, COFFEE]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Turning the cup down',
        kind: GATE_KIND.INSTEAD,
        detail: 'Sober, the same three routes give you The Seal.',
        to: 'sacrifice',
        where: at('src/main.js', 'function completeSacrificeEnding()'),
      }),
      Object.freeze({
        label: 'Having committed to Contact or the tower',
        kind: GATE_KIND.ROAD,
        detail: 'The chapel never opens.',
        where: at('src/main.js', 'function beginConfrontation('),
      }),
    ]),
  }),

  // ── THE OTHER DOOR ─────────────────────────────────────────────────────────
  inversion: Object.freeze({
    id: 'inversion',
    family: 'chapel',
    summary: 'Play the room back to itself, then run for the exit — first the grey door you came in through, then the public door the guard told you about — before the clock runs out.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.ESCAPED]: Object.freeze({
        how: 'Reach the grey door, play the scene there, then reach the main entrance. Sober.',
        where: at('src/main.js', "playEnding(flagTest('drank.coffee')?'drugged':'inversion',ENDING_ARRIVAL.ESCAPED)"),
      }),
    }),
    requires: Object.freeze([
      CHAPEL_ROAD,
      RIG,
      Object.freeze({
        label: 'You qualified, one of two ways',
        identifier: 'canInvertEnding()',
        kind: GATE_KIND.PROOF,
        detail: 'Either you proved it in the chapel fight — a clean inversion in both the contract and source rounds — or you learned it at the grey door, by going and putting your hand on your own exit on the first night. There are two ways because a proof earned anywhere else is cancelled: the chapel fight locks whichever proof you did not land.',
        where: at('src/main.js', 'function canInvertEnding()'),
      }),
      Object.freeze({
        label: 'Both legs of the run, inside the time limit',
        kind: GATE_KIND.TASK,
        detail: 'How long you get depends on the difficulty. If you spoke at the grey door earlier you get six seconds more.',
        where: at('src/main.js', 'function startEscape()'),
      }),
      Object.freeze({
        label: 'You did not drink the coffee',
        kind: GATE_KIND.CHOICE,
        detail: 'Sober, the yard is not there when you get out and the night starts again.',
        where: at('src/main.js', "playEnding(flagTest('drank.coffee')?'drugged':'inversion',ENDING_ARRIVAL.ESCAPED)"),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Losing the proof in the chapel and never having searched the grey door',
        kind: GATE_KIND.LOCKED,
        detail: 'With neither way to qualify, the option is simply not on the list the chapel offers.',
        where: at('src/main.js', 'function canInvertEnding()'),
      }),
      Object.freeze({
        label: 'Not having the rig',
        kind: GATE_KIND.OBJECT,
        detail: 'Checked first, and it closes both ways out.',
        where: at('src/main.js', 'function canInvertEnding()'),
      }),
      Object.freeze({
        label: 'Running out of time',
        kind: GATE_KIND.INSTEAD,
        detail: 'You get The Seal, but the game knows the difference and says so before it starts.',
        to: 'sacrifice',
        where: at('src/main.js', 'function tickFinale()'),
      }),
      Object.freeze({
        label: 'Drinking the coffee',
        kind: GATE_KIND.INSTEAD,
        detail: 'The same finished run reads as eight hours of nothing.',
        to: 'drugged',
        where: at('src/main.js', 'function tickFinale()'),
      }),
    ]),
  }),

  // ── COLD, BITTER, GONE ─────────────────────────────────────────────────────
  drugged: Object.freeze({
    id: 'drugged',
    family: 'chapel',
    summary: 'The same escape run, finished, with the cup taken. The yard is exactly where it should be, the building is still standing, and the recordings are ruined.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.ESCAPED]: Object.freeze({
        how: 'Both legs of the escape run, having drunk the coffee.',
        where: at('src/main.js', "playEnding(flagTest('drank.coffee')?'drugged':'inversion',ENDING_ARRIVAL.ESCAPED)"),
      }),
    }),
    requires: Object.freeze([
      CHAPEL_ROAD,
      RIG,
      Object.freeze({
        label: 'You qualified, one of two ways',
        identifier: 'canInvertEnding()',
        kind: GATE_KIND.PROOF,
        detail: 'The same two ways as The Other Door: proved in the chapel fight, or learned at the grey door.',
        where: at('src/main.js', 'function canInvertEnding()'),
      }),
      Object.freeze({
        label: 'Both legs of the run, inside the time limit',
        kind: GATE_KIND.TASK,
        detail: 'The same run, on the same clock.',
        where: at('src/main.js', 'function startEscape()'),
      }),
      COFFEE,
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Turning the cup down',
        kind: GATE_KIND.INSTEAD,
        detail: 'The same finished run becomes The Other Door.',
        to: 'inversion',
        where: at('src/main.js', 'function tickFinale()'),
      }),
      Object.freeze({
        label: 'Running out of time',
        kind: GATE_KIND.INSTEAD,
        detail: 'You get He Tried to Help, because you took the cup.',
        to: 'helped',
        where: at('src/main.js', 'function tickFinale()'),
      }),
    ]),
  }),

  // ── THE OTHER RECORDIST ────────────────────────────────────────────────────
  surfaced: Object.freeze({
    id: 'surfaced',
    family: 'chapel',
    summary: 'The hardest ending to reach. Free the other recordist, then carry him out at walking-with-a-body pace and sign both names in the gate register.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.CARRIED]: Object.freeze({
        how: 'Pick "Tune the borrowed body loose from the source", carry him to the public doors, then to the gate register.',
        where: at('src/main.js', 'function endSurfaced()'),
      }),
    }),
    requires: Object.freeze([
      CHAPEL_ROAD,
      RIG,
      FORK,
      Object.freeze({
        label: 'You qualified, one of two ways',
        kind: GATE_KIND.PROOF,
        detail: 'Either you proved it in the chapel fight — both return proofs, a clean monitor in the recordist round and a playback of a body-tagged recording in the source round — or you brought enough evidence: every piece of the story found, the fork, the rig, and the right redaction.',
        where: at('src/main.js', 'const canSurface = hasRig&&hasFork&&(chapelProof||evidenceProof)'),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Missing the fork or the rig',
        kind: GATE_KIND.OBJECT,
        detail: 'Both are checked before either qualification is looked at. No amount of proof stands in for the objects.',
        where: at('src/main.js', 'const canSurface = hasRig&&hasFork&&(chapelProof||evidenceProof)'),
      }),
      Object.freeze({
        label: 'The chapel locked it and the evidence is incomplete',
        kind: GATE_KIND.LOCKED,
        detail: 'The chapel says so out loud: "RETURN is missing from too many pages. Something could still be saved, but not cleanly."',
        where: at('src/data/conservatory-script.js', "locks.has('route.surfaced')"),
      }),
      Object.freeze({
        label: 'Having gone to the tower instead',
        kind: GATE_KIND.ROAD,
        detail: 'The tower road never reaches the chapel, so the choice is never offered.',
        where: at('src/main.js', 'function beginConfrontation('),
      }),
    ]),
  }),

  // ── OPEN CHANNEL ───────────────────────────────────────────────────────────
  'contact-won': Object.freeze({
    id: 'contact-won',
    family: 'contact',
    summary: 'Stay and fight at the Source fault, and win. Source ends, and so do you, with about forty seconds of breathing left on the recorder.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.AGREED]: Object.freeze({
        how: 'Commit to Contact, then win the fight.',
        where: at('src/game/chunk-surf-state.js', 'export function chunkSurfCompletion('),
      }),
    }),
    requires: Object.freeze([
      Object.freeze({
        label: 'You are at the last page with the fight ready',
        kind: GATE_KIND.PLACE,
        detail: 'Committing to Contact anywhere else is ignored.',
        where: at('src/game/chunk-surf-state.js', "case 'CONTACT_COMMITTED':"),
      }),
      Object.freeze({
        label: 'The run has not already committed to another road',
        kind: GATE_KIND.ROAD,
        detail: 'Contact will not overwrite a tower or chapel commitment.',
        where: at('src/game/chunk-surf-state.js', "case 'CONTACT_COMMITTED':"),
      }),
      Object.freeze({
        label: 'Win the fight',
        kind: GATE_KIND.FIGHT,
        detail: 'Any of the three ways of winning counts. Which ending you get turns on winning or losing, not on how you won.',
        where: at('src/game/chunk-surf-state.js', "case 'FINAL_ENCOUNTER_RESOLVED':"),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Walking away from the fault',
        kind: GATE_KIND.ROAD,
        detail: 'You end up on the Horizon tape instead. The reading is kept, but this road is gone: from there only the chapel and the tower are left.',
        where: at('src/game/chunk-surf-state.js', "case 'SOURCE_NORMAL_EXIT':"),
      }),
      Object.freeze({
        label: 'Losing',
        kind: GATE_KIND.INSTEAD,
        detail: 'There is no way back onto the Horizon tape from here.',
        to: 'contact-lost',
        where: at('src/game/chunk-surf-state.js', "case 'FINAL_ENCOUNTER_LOST':"),
      }),
    ]),
  }),

  // ── NO RETURN ──────────────────────────────────────────────────────────────
  'contact-lost': Object.freeze({
    id: 'contact-lost',
    family: 'contact',
    summary: 'Stay and fight, and lose. The signal carries on without you, and the camera leaves you behind in it.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.DEFEATED]: Object.freeze({
        how: 'Lose the fight after committing to Contact.',
        where: at('src/main.js', 'function beginContactEnding('),
      }),
    }),
    requires: Object.freeze([
      Object.freeze({
        label: 'You committed to Contact',
        kind: GATE_KIND.ROAD,
        detail: 'Losing anywhere else is not final. On this road it is.',
        where: at('src/game/chunk-surf-state.js', "case 'FINAL_ENCOUNTER_LOST':"),
      }),
      Object.freeze({
        label: 'Lose the fight',
        kind: GATE_KIND.FIGHT,
        detail: 'It also rules out saving the other recordist for the rest of the run.',
        where: at('src/game/chunk-surf-state.js', "case 'FINAL_ENCOUNTER_LOST':"),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Never committing',
        kind: GATE_KIND.ROAD,
        detail: 'Walking away cannot lose. This is the only ending that needs you to be beaten somewhere you chose to stand.',
        where: at('src/game/chunk-surf-state.js', "case 'SOURCE_NORMAL_EXIT':"),
      }),
    ]),
  }),

  // ── EXIT THROUGH THE GIFT SHOP ─────────────────────────────────────────────
  'tower-won': Object.freeze({
    id: 'tower-won',
    family: 'tower',
    summary: 'Take the detour off the Horizon tape, survive both halves of the bell fight, then drag the Surfer out through the west doors.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.CARRIED]: Object.freeze({
        how: 'Get both bodies out of the church at the west doors, still holding on.',
        where: at('src/main.js', "playEnding('tower-won',ENDING_ARRIVAL.CARRIED)"),
      }),
    }),
    requires: Object.freeze([
      Object.freeze({
        label: 'Walk away at the Source fault',
        kind: GATE_KIND.ROAD,
        detail: 'The tower is only reachable through Horizon, and Horizon is only reachable by not fighting.',
        where: at('src/game/chunk-surf-state.js', "case 'SOURCE_NORMAL_EXIT':"),
      }),
      Object.freeze({
        label: 'Take the bust up on the tower, not the chapel',
        kind: GATE_KIND.CHOICE,
        detail: 'Where you get off the Horizon tape decides the road, and the decision sticks through a reload.',
        where: at('src/game/chunk-surf-state.js', 'export const HORIZON_EXIT'),
      }),
      Object.freeze({
        label: 'Walk to the cathedral crossing',
        kind: GATE_KIND.TASK,
        detail: 'Getting close to the crossing starts the first half of the fight.',
        where: at('src/main.js', 'function tickCathedralFinale()'),
      }),
      Object.freeze({
        label: 'Win both halves of the bell fight',
        kind: GATE_KIND.FIGHT,
        detail: 'It is one fight with a scene in the middle: no second ready screen, no healing between the two, and damage carries over.',
        where: at('src/main.js', 'function openCathedralSecondPhase('),
      }),
      Object.freeze({
        label: 'Drag him out',
        kind: GATE_KIND.TASK,
        detail: 'The body has real collision and you can lose your grip; the doorway makes you take hold again. Both of you have to be outside.',
        where: at('src/main.js', 'function startCathedralCarry()'),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Getting off the tape at the chapel',
        kind: GATE_KIND.ROAD,
        detail: 'That commits the chapel, and the tower is gone for the rest of the run.',
        where: at('src/game/chunk-surf-state.js', 'export const HORIZON_EXIT'),
      }),
      Object.freeze({
        label: 'Losing the fight three times',
        kind: GATE_KIND.INSTEAD,
        detail: 'Both halves lose the same way, and the first two losses are not the end: the bust sends you back in with the chapel closed. The third resolves.',
        to: 'tower-lost',
        where: at('src/main.js', 'function resolveCathedralLoss()'),
      }),
      Object.freeze({
        label: 'Fighting at the Source fault',
        kind: GATE_KIND.ROAD,
        detail: 'Horizon never opens, so the tower cannot be reached.',
        where: at('src/game/chunk-surf-state.js', "case 'CONTACT_COMMITTED':"),
      }),
    ]),
  }),

  // ── THE FULL PEAL ──────────────────────────────────────────────────────────
  'tower-lost': Object.freeze({
    id: 'tower-lost',
    family: 'tower',
    summary: 'Take the detour and lose it. Six bells finish the job on both bodies, one faculty at a time.',
    arrivals: Object.freeze({
      [ENDING_ARRIVAL.DEFEATED]: Object.freeze({
        how: 'Lose either half of the cathedral fight TOWER_DEFEAT_CEILING times. The first two send you back to the bust with only its own path left.',
        where: at('src/main.js', 'function resolveCathedralLoss()'),
      }),
    }),
    requires: Object.freeze([
      Object.freeze({
        label: 'You took the tower road',
        kind: GATE_KIND.ROAD,
        detail: 'The same first half as Exit Through the Gift Shop: walk away from the fight, take the bust up, get off at the tower.',
        where: at('src/game/chunk-surf-state.js', 'export const HORIZON_EXIT'),
      }),
      Object.freeze({
        label: 'Lose either half of the bell fight, to the ceiling',
        kind: GATE_KIND.FIGHT,
        detail: 'Damage carries from the first half into the second, so the second is usually the one that gets you.',
        where: at('src/main.js', 'function openCathedralSecondPhase('),
      }),
    ]),
    blocks: Object.freeze([
      Object.freeze({
        label: 'Winning both halves',
        kind: GATE_KIND.INSTEAD,
        detail: 'The carry starts straight away and the run is committed to getting him out.',
        to: 'tower-won',
        where: at('src/main.js', 'function startCathedralCarry()'),
      }),
    ]),
  }),
});

export function endingGate(id) {
  return ENDING_GATES[id] || null;
}

// Every ending is described; every description matches an ending; every way in
// it lists is one the manifest declares; every ending it points at exists.
// Checked by test/ending-contract.spec.mjs, which also checks that the code
// citations still resolve.
export function endingGateErrors() {
  const errors = [];
  const kinds = Object.values(GATE_KIND);
  for (const id of ENDING_IDS) {
    const gate = ENDING_GATES[id];
    if (!gate) { errors.push(`${id} is not described`); continue; }
    if (!ENDING_FAMILY[gate.family]) errors.push(`${id} belongs to unknown road ${gate.family}`);
    if (!String(gate.summary || '').trim()) errors.push(`${id} has no summary`);
    const declared = ENDING_MANIFEST[id]?.arrivals || [];
    const described = Object.keys(gate.arrivals || {});
    if (!described.length) errors.push(`${id} lists no way in`);
    for (const arrival of described) {
      if (!declared.includes(arrival)) errors.push(`${id} describes the arrival ${arrival}, which the manifest does not declare`);
      if (!String(gate.arrivals[arrival]?.how || '').trim()) errors.push(`${id} does not say how the ${arrival} arrival is reached`);
    }
    for (const arrival of declared) {
      if (!described.includes(arrival)) errors.push(`${id} declares the arrival ${arrival} and nothing says how anybody gets it`);
    }
    if (!gate.requires?.length) errors.push(`${id} requires nothing at all`);
    for (const entry of [...(gate.requires || []), ...(gate.blocks || [])]) {
      if (!String(entry.label || '').trim()) errors.push(`${id} has an unlabelled condition`);
      if (!String(entry.detail || '').trim()) errors.push(`${id} condition "${entry.label}" explains nothing`);
      if (!kinds.includes(entry.kind)) errors.push(`${id} condition "${entry.label}" has unknown kind ${entry.kind}`);
      if (!entry.where?.file || !entry.where?.symbol) errors.push(`${id} condition "${entry.label}" names no code`);
      if (entry.to && !ENDING_IDS.includes(entry.to)) errors.push(`${id} points at ${entry.to}, which is not an ending`);
    }
  }
  for (const id of Object.keys(ENDING_GATES)) {
    if (!ENDING_IDS.includes(id)) errors.push(`${id} is described and is not an ending`);
  }
  return errors;
}
