import {STREET_CROWD_IDS,STREET_CROWD_DESIGNS} from '../data/street-crowd-characters.js';
import {vigilCharacterIdForMesh} from './vigil-character-performance.js';
const crowd=new Set(STREET_CROWD_IDS);
const crowdMeshes=new Set(Object.values(STREET_CROWD_DESIGNS).flatMap(entry=>
  [entry.mesh,...(entry.id.startsWith('district-')?[entry.legacyMesh]:[])].filter(Boolean)));
// Cached window scenery must never reintroduce a second, frozen copy of a
// performer that is owned by the live pass. Equipment inherits its owner view.
export function isLiveExteriorPerformer(instance,{crowdReady=false}={}){
  return !!instance&&(!!vigilCharacterIdForMesh(instance.mesh)||instance.id==='yard-bus-waiter'
    ||/^yard-booth-guard-(idle|ledger|handoff)$/.test(instance.id||'')||(crowdReady&&crowd.has(instance.id)));
}

// The crowd renderer also recognises authored meshes without a crowd ID. Keep
// those hosts in the dynamic input; window clipping applies its narrower rule.
export function isExteriorPerformerInput(instance,{crowdReady=false}={}){
  return isLiveExteriorPerformer(instance,{crowdReady})||(crowdReady&&crowdMeshes.has(instance?.mesh));
}
