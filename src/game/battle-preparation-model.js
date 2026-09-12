import { BATTLE_GEAR, normalizeCombatLoadout, assignCombatGearSlot, moveCombatGear } from './combat-loadout.js';
import { normalizeCombatBuild, TECHNIQUE_DEFS, pullCombatTechnique, techniqueAvailability } from './combat-progression.js';
import { connectSkillPatch, skillPatchSource } from './skill-patchbay.js';

// One explicit READY commits the draft, before any turn starts.
export function createBattlePreparationModel({ loadout, equipment = [], build, hasRig = false } = {}) {
  const available = [...new Set(equipment.filter(item => item?.present !== false)
    .map(item => typeof item === 'string' ? item : item.id).filter(id => BATTLE_GEAR[id]))];
  let tray = normalizeCombatLoadout(loadout);
  tray = normalizeCombatLoadout({ ...tray, top:tray.top.filter(id => available.includes(id)) });
  let skills = normalizeCombatBuild(build), selectedSlot = 0, selectedSkill = TECHNIQUE_DEFS[0].id, page = 'equipment';
  let committed = false;
  // THE ITEM WAITING FOR A SLOT.
  //
  // Null unless the player picked something out of the case with all four slots
  // already full. It is not a mode the player turns on — it is the one question
  // that could not be answered for them, and it appears only when it is asked.
  let replacing = null;
  const snapshot = () => ({ loadout:structuredClone(tray), build:structuredClone(skills), available:[...available],
    selectedSlot, selectedSkill, page, committed, hasRig, replacing,
    skillStatus:techniqueAvailability(skills,selectedSkill,{hasRig}) });
  // Put it in the first free slot. Returns where it landed, or -1 if it could
  // not go anywhere.
  const autofill = (id) => {
    const result = moveCombatGear(tray, id, 'top');
    if (!result.changed) return -1;
    tray = result.loadout; replacing = null;
    return tray.top.indexOf(id);
  };
  return {
    snapshot,
    tab(value) { if (!committed && ['equipment','skills'].includes(value)) { page=value; replacing=null; } return snapshot(); },
    slot(index) { if(!committed)selectedSlot=Math.max(0,Math.min(tray.top.length,3,Math.floor(Number(index)||0)));return snapshot(); },
    // PICK AN ITEM AND IT GOES IN.
    //
    // It used to assign to whichever slot happened to be selected, which meant
    // choosing a slot and then choosing an item — two steps to answer one
    // question, and the first step silently overwrote a slot that was already
    // holding something. Now an empty slot takes it, and the only time the
    // player is asked anything is when there is no empty slot left.
    equip(id) {
      if(committed||!available.includes(id))return false;
      if(tray.top.includes(id))return false;
      const at=autofill(id);
      if(at>=0){selectedSlot=Math.min(at,3);return true;}
      // Every slot full. Ask which one it takes the place of — see `replacing`.
      replacing=id;return true;
    },
    // Swap the waiting item in for the one NAMED. Not by slot number: the
    // player is deciding which tool to give up, and "the RADIO" is that
    // question where "slot 3" is a different question they have to translate
    // first.
    replace(targetId) {
      if(committed||!replacing)return false;
      const at=tray.top.indexOf(String(targetId||''));
      if(at<0)return false;
      const result=assignCombatGearSlot(tray,replacing,at);
      if(!result.changed)return false;
      tray=result.loadout;selectedSlot=Math.min(at,3);replacing=null;return true;
    },
    cancelReplace() { if(committed||!replacing)return false;replacing=null;return true; },
    store() {
      if(committed)return false;
      const result=moveCombatGear(tray,tray.top[selectedSlot],'storage');tray=result.loadout;
      selectedSlot=Math.min(selectedSlot,tray.top.length,3);
      // Putting something back while an item is waiting answers the question by
      // making it moot: there is a slot now, so it takes it rather than leaving
      // the player looking at a picker for a choice they no longer have to make.
      if(result.changed&&replacing){const at=autofill(replacing);if(at>=0)selectedSlot=Math.min(at,3);}
      return result.changed;
    },
    skill(id) { if(!committed&&TECHNIQUE_DEFS.some(t=>t.id===id))selectedSkill=id;return snapshot(); },
    patch() {
      if(committed)return {changed:false};
      const result=skills.techniques.includes(selectedSkill)?pullCombatTechnique(skills,selectedSkill)
        :connectSkillPatch(skills,skillPatchSource(selectedSkill),selectedSkill,{hasRig});
      if(result.changed)skills=result.build;return result;
    },
    commit(apply) {
      if(committed)return false;
      const result=apply?.({loadout:structuredClone(tray),build:structuredClone(skills)});
      if(result===false)return false;
      committed=true;return true;
    },
  };
}

export const BATTLE_EQUIPMENT_COPY = Object.freeze({
  light:{detail:'EXPOSE breaks concealment and strengthens your next PLAYBACK. WHITEOUT uses battery.',move:'EXPOSE'},
  recorder:{detail:'MONITOR captures a broadcast. PLAYBACK spends the loaded take.',move:'MONITOR / PLAYBACK'},
  interface:{detail:'INVERT counters a loop and spends the loaded take.',move:'INVERT'},
  'tuning-fork':{detail:'TUNE reveals the next two intents. Once per cycle.',move:'TUNE'},
  radio:{detail:'THROW VOICE counters a broadcast and guards against damage. Once per fight.',move:'THROW VOICE'},
  coffee:{detail:'Drink to restore composure. One use.',move:'SIP'},
  badge:{detail:'The film badge takes up a slot and has no combat action.',move:'NO COMBAT ACTION'},
});
