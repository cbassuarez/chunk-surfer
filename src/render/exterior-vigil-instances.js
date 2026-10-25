import {VIGIL_VOICES} from '../data/exterior-vigil.js';
import {pubActor} from '../data/pub-population.js';
import {vigilCharacterIdForMesh,vigilCharacterDescriptor} from './vigil-character-performance.js';
import {pubSeatedVigilDescriptor} from './pub-character-performance.js';

const actorIds=new Map(Object.values(VIGIL_VOICES).map(voice=>[vigilCharacterIdForMesh(voice.mesh),voice.id]));
const seatedCache=new Map();
export function exteriorVigilInstances(instances=[],{frames=[],timeSec=0,reducedMotion=false,conversations={}}={}){
  return instances.flatMap(instance=>{
    const id=vigilCharacterIdForMesh(instance.mesh);if(!id||instance.visible===false)return[];
    const actorId=actorIds.get(id),frame=frames.find(entry=>entry.actorId===actorId);
    const conversation=conversations instanceof Map?conversations.get(actorId):conversations[actorId];
    const options={timeSec,reducedMotion,conversation},seat=pubActor(actorId);
    let character;
    if(seat?.posture==='seated'){
      const key=JSON.stringify([Math.floor(timeSec*30),reducedMotion,frame,conversation,seat.seatHeight]);
      let entry=seatedCache.get(id);
      if(entry?.key!==key){entry={key,character:pubSeatedVigilDescriptor(instance.mesh,frame,{...options,seatY:seat.seatHeight-.012})};seatedCache.set(id,entry);}
      character=entry.character;
    }else character=vigilCharacterDescriptor(instance.mesh,frame,options);
    return[{...instance,character}];
  });
}
