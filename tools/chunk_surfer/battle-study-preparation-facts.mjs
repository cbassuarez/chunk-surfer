import { createCombatState, availableCombatActions, COMBAT_ACTION as A, TECHNIQUE } from '../../src/game/combat-state.js';
import { BATTLE_GEAR, availableBattleTools } from '../../src/game/combat-loadout.js';
import { authoredCombatProfile } from '../../src/data/combat-definitions.js';
import { normalizeCombatBuild, PIN_SOURCES } from '../../src/game/combat-progression.js';

// Study only. These are declared comparison inputs, never an arriving save.
export const PREPARATION_FIXTURE = Object.freeze({
  id:'natatorium', seed:7, battery:.42, composure:31, injuries:0, torchDrainScale:1,
  loadout:{top:['light','recorder','radio','interface']},
  equipment:['light','recorder','radio','interface','tuning-fork','coffee','plant-spanner','badge'],
  build:normalizeCombatBuild({techniques:[TECHNIQUE.AFTERIMAGE,TECHNIQUE.WHITEOUT]},PIN_SOURCES.encounters),
  hasRig:true,
});

export function preparationCombatState(snapshot, fixture=PREPARATION_FIXTURE) {
  const order=availableBattleTools(snapshot.loadout,snapshot.available||fixture.equipment);
  const tools=Object.fromEntries(Object.values(BATTLE_GEAR).map(gear=>[gear.toolId,order.includes(gear.toolId)]));
  return createCombatState(fixture.definition||{id:fixture.id,enemy:'STUDY',baseComposure:40,...authoredCombatProfile(fixture.id)}, {
    difficulty:fixture.difficulty||{},
    seed:fixture.seed, battery:fixture.battery, composure:fixture.composure, injuries:fixture.injuries,
    torchDrainScale:fixture.torchDrainScale, techniques:snapshot.build.techniques, tools:{...tools,order},
  });
}

// No enemy intentions, counter highlighting, damage forecasts, or conditional
// action availability leave this adapter. It exposes the player's operating
// contract, not an oracle for the enemy waiting behind the preparation screen.
export function preparationFacts(snapshot, fixture=PREPARATION_FIXTURE) {
  const state=preparationCombatState(snapshot,fixture);
  // Read the price of owned tools even while they are in the storage tray.
  // This temporary rule view never becomes the committed loadout.
  const moves=availableCombatActions({...state,tools:{...state.tools,torch:true,radio:true,coffee:true}});
  const by=id=>moves.find(move=>move.id===id);
  const whiteout=by(A.WHITEOUT),radio=by(A.RADIO_DECOY),coffee=by(A.STEADY_HANDS);
  return {
    composure:state.composure,ceiling:state.maxComposure,battery:state.battery,
    charge:state.charge,maxCharge:state.maxCharge,
    take:state.take?{label:state.take.label,tag:state.take.tag}:null,
    carried:[...snapshot.loadout.top],stored:(snapshot.available||[]).filter(id=>!snapshot.loadout.top.includes(id)),
    costs:{
      expose:{battery:by(A.EXPOSE)?.cost??0,charge:by(A.EXPOSE)?.charge??0},
      radio:radio?{charge:radio.charge,repeatable:true}:null,
      whiteout:whiteout?{battery:whiteout.cost,charge:whiteout.charge}:null,
      coffee:coffee?{heals:coffee.heals,once:true}:null,
    },
    techniques:[...snapshot.build.techniques],
  };
}

export function preparationToolCopy(id, facts) {
  switch(id) {
    case 'light': return `EXPOSE uses no battery. ${facts.costs.whiteout?`WHITEOUT spends ${facts.costs.whiteout.charge} charge and ${Math.round(facts.costs.whiteout.battery*100)}% battery.`:'WHITEOUT requires its patch.'}`;
    case 'recorder':return 'MONITOR can capture a hostile broadcast. PLAYBACK spends that loaded combat take. Your collected recordings remain separate.';
    case 'interface':return 'INVERT spends the loaded combat take to return a loop. Committing against the wrong signal can waste the take.';
    case 'radio':return `THROW VOICE spends ${facts.costs.radio.charge} charge. Earn charge to use it again. It makes the adversary decide again and gives protection.`;
    case 'tuning-fork':return 'TUNE is free and holds your read for this movement. The tone changes what happens according to the signal it meets. Once per movement.';
    case 'coffee':return `STEADY HANDS restores up to ${facts.costs.coffee.heals} composure. The cup is consumed.`;
    case 'plant-spanner':return 'SWING lands without a read, but it hears you. ON THE STEEL guards without needing a correct read.';
    case 'badge':return 'No combat action. Carrying it here occupies one of the same four reachable slots.';
    default:return 'Choose a carried tool to inspect.';
  }
}
