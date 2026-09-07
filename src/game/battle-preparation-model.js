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
  const snapshot = () => ({ loadout:structuredClone(tray), build:structuredClone(skills), available:[...available],
    selectedSlot, selectedSkill, page, committed, hasRig,
    skillStatus:techniqueAvailability(skills,selectedSkill,{hasRig}) });
  return {
    snapshot,
    tab(value) { if (!committed && ['equipment','skills'].includes(value)) page=value; return snapshot(); },
    slot(index) { if(!committed)selectedSlot=Math.max(0,Math.min(tray.top.length,3,Math.floor(Number(index)||0)));return snapshot(); },
    equip(id) {
      if(committed||!available.includes(id))return false;
      const result=assignCombatGearSlot(tray,id,selectedSlot);tray=result.loadout;return result.changed;
    },
    store() {
      if(committed)return false;
      const result=moveCombatGear(tray,tray.top[selectedSlot],'storage');tray=result.loadout;
      selectedSlot=Math.min(selectedSlot,tray.top.length,3);return result.changed;
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
