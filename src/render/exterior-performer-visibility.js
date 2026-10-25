import {STREET_CROWD_IDS} from '../data/street-crowd-characters.js';
import {vigilCharacterIdForMesh} from './vigil-character-performance.js';
const crowd=new Set(STREET_CROWD_IDS);
// Cached window scenery must never reintroduce a second, frozen copy of a
// performer that is owned by the live pass. Equipment inherits its owner view.
export function isLiveExteriorPerformer(instance,{crowdReady=false}={}){
  return !!instance&&(!!vigilCharacterIdForMesh(instance.mesh)||instance.id==='yard-bus-waiter'
    ||/^yard-booth-guard-(idle|ledger|handoff)$/.test(instance.id||'')||(crowdReady&&crowd.has(instance.id)));
}
