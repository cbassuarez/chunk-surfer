import { availableCombatActions, chargeCost, COMBAT_ACTION as A } from './combat-state.js';
import { availableBattleTools, BATTLE_GEAR } from './combat-loadout.js';

// The reachable tray has one owner. Preparation previews use the same tool
// mapping as the committed fight, without mutating that tray or its save.
export function preparationBattleTools(draft = {}) {
  const order = availableBattleTools(draft.loadout, draft.available || []);
  return { ...Object.fromEntries(Object.values(BATTLE_GEAR).map(gear => [gear.toolId, order.includes(gear.toolId)])), order };
}

// Only operating facts leave this adapter. In particular, no enemy intention,
// predicted damage, counter label or enemy-dependent enabled state is exported.
export function combatOperatingFacts(state) {
  if (!state?.definition) return null;
  const moves = availableCombatActions({ ...state, phase:'select',
    tools:{ ...state.tools, torch:true, recorder:true, rig:true, fork:true, radio:true, coffee:true, spanner:true } });
  const move = id => moves.find(entry => entry.id === id);
  const whiteout = move(A.WHITEOUT), coffee = move(A.STEADY_HANDS);
  return {
    composure:state.composure, ceiling:state.maxComposure, battery:state.battery,
    charge:state.charge, maxCharge:state.maxCharge,
    take:state.take ? {label:state.take.label, tag:state.take.tag} : null,
    costs:{
      expose:{battery:move(A.EXPOSE)?.cost ?? 0, charge:chargeCost(A.EXPOSE)},
      radio:{charge:chargeCost(A.RADIO_DECOY), repeatable:true},
      whiteout:whiteout ? {battery:whiteout.cost ?? 0, charge:chargeCost(A.WHITEOUT)} : null,
      coffee:coffee ? {heals:coffee.heals, once:true} : null,
    },
  };
}

export const BATTLE_OPERATING_COPY = Object.freeze({
  light:{detail:'EXPOSE uses no battery. WHITEOUT spends charge and battery when its patch is fitted.',move:'EXPOSE'},
  recorder:{detail:'MONITOR captures a hostile broadcast. PLAYBACK spends that loaded combat take. Collected recordings stay in the case.',move:'MONITOR / PLAYBACK'},
  interface:{detail:'INVERT spends the loaded combat take to return a loop. A wrong read can waste the take.',move:'INVERT'},
  'tuning-fork':{detail:'TUNE is free and holds your read for this movement. A muted broadcast passes after one beat. Once per movement.',move:'TUNE'},
  radio:{detail:`THROW VOICE spends ${chargeCost(A.RADIO_DECOY)} charge. Earn charge to use it again. It makes the adversary decide again and gives protection.`,move:'THROW VOICE'},
  coffee:{detail:'STEADY HANDS restores composure. The cup is consumed.',move:'STEADY HANDS'},
  'plant-spanner':{detail:'SWING lands without a read, but it hears you. ON THE STEEL guards without needing a correct read.',move:'SWING / ON THE STEEL'},
  badge:{detail:'No combat action. The badge occupies one of the same four reachable slots.',move:'NO COMBAT ACTION'},
});

export function battleOperatingCopy(id, facts = null) {
  const copy = BATTLE_OPERATING_COPY[id];
  if (!copy) return {detail:'Choose a carried tool to inspect.',move:''};
  if (id === 'light' && facts) return {...copy,detail:`EXPOSE uses no battery. ${facts.costs.whiteout
    ? `WHITEOUT spends ${facts.costs.whiteout.charge} charge and ${Math.round(facts.costs.whiteout.battery * 100)}% battery.`
    : 'WHITEOUT requires its patch.'}`};
  if (id === 'coffee' && facts?.costs.coffee) return {...copy,detail:`STEADY HANDS restores up to ${facts.costs.coffee.heals} composure. The cup is consumed.`};
  return copy;
}
