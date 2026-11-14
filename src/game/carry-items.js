import { RETAINED_BELONGINGS } from './retained-belongings.js';

// Readiness is broader than battle capability. This registry grants neither
// ownership nor a combat move; real item owners still decide what is present.

export const BATTLE_GEAR = Object.freeze({
  light: Object.freeze({ toolId: 'torch', label: 'FIELD TORCH' }),
  recorder: Object.freeze({ toolId: 'recorder', label: 'RECORDER' }),
  interface: Object.freeze({ toolId: 'rig', label: 'SERVICE INTERFACE' }),
  'tuning-fork': Object.freeze({ toolId: 'fork', label: 'TUNING FORK' }),
  radio: Object.freeze({ toolId: 'radio', label: 'RADIO' }),
  // OURS, out of our own van. The building's two-metre Stillson is not in this
  // registry and never will be: it is the plant's problem, it is dragged rather
  // than carried, and a man does not take it into a fight.
  'plant-spanner': Object.freeze({ toolId: 'spanner', label: 'ADJUSTABLE SPANNER' }),
  coffee: Object.freeze({ toolId: 'coffee', label: 'COFFEE' }),
  // THE FILM BADGE. Assignable to a quick slot like anything else in this
  // registry, and that is the entire cost of it: four slots, seven things worth
  // considering, and one of them will not help.
  //
  // Its toolId reaches combat-state and is never read — tools are resolved by
  // explicit name (torch/recorder/rig/fork/radio/coffee) and `order` is filtered
  // against COMBAT_TOOL, so this falls out of both. Inert by construction rather
  // than by a special case, which is why it needs no special case.
  badge: Object.freeze({ toolId: 'badge', label: 'FILM BADGE' }),
});


const CARRY_KEEPSAKES = Object.freeze({
  ...Object.fromEntries(Object.values(RETAINED_BELONGINGS).map(item=>[item.id,Object.freeze({label:item.label,heldModelId:item.heldModelId,description:item.description})])),
  'door-wedge': Object.freeze({label:'RUBBER DOOR WEDGE',heldModelId:'door-wedge',
    description:'One recoverable rubber wedge. It can keep an open door from closing; putting it under a leaf leaves it there.'}),
  'ren-home-cassette': Object.freeze({label:"REN'S HOME CASSETTE",heldModelId:'ren-home-cassette',
    description:'A cassette marked HOME, released under a signed warning for hand delivery to Ren.'}),
  'marble-eyes': Object.freeze({label:'TWO MARBLE EYES',heldModelId:'marble-eyes',
    description:'Two separate mineral eyes, still damp. They belong against the blind bust.'}),
});

export function recordingCassetteId(number) {
  return Number.isSafeInteger(number) && number > 0 ? `recording-cassette:${number}` : null;
}

export function parseRecordingCassetteId(value) {
  if (typeof value !== 'string' || !/^recording-cassette:[1-9]\d*$/.test(value)) return null;
  const number = Number(value.slice('recording-cassette:'.length));
  return Number.isSafeInteger(number) ? number : null;
}

export function carryItemDefinition(value) {
  const id = String(value || '').trim().toLowerCase();
  if (Object.hasOwn(BATTLE_GEAR,id)) {
    const gear=BATTLE_GEAR[id];
    return {id,label:gear.label,kind:'equipment',battleToolId:gear.toolId,heldModelId:gear.toolId,description:''};
  }
  if (Object.hasOwn(CARRY_KEEPSAKES,id)) return {id,...CARRY_KEEPSAKES[id],kind:'keepsake',battleToolId:null};
  const number=parseRecordingCassetteId(id);
  return number == null ? null : {id,label:`CASSETTE ${number}`,kind:'recording-stock',battleToolId:null,
    heldModelId:'recording-cassette',description:`Numbered recording cassette ${number}. Its contents belong to the recording ledger.`};
}

export function isCarryItem(id) { return carryItemDefinition(id) !== null; }
