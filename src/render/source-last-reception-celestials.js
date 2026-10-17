// Retained copies of the third-floor chamber cherub. They occupy the upper
// room as witnesses, with no chamber attack, collision or encounter triggers.
// All three anatomical parts keep the original rig and ordinary world material
// so lighting, shadows, depth and the final dither use their actual geometry.
import {heldNotePose, adversaryWorldMatrix} from './conservatory-adversary-performance.js';

const freeze=Object.freeze;
export const SOURCE_RECEPTION_CELESTIAL_MESHES=freeze([
  'held_note_body','held_note_faces','held_note_anatomy',
]);
export const SOURCE_RECEPTION_CELESTIALS=freeze([
  freeze({id:'north-lounge',x:-55.7,y:12.85,z:-444.9,yaw:Math.PI,pitch:.76,scale:.80,offset:1.7}),
  freeze({id:'west-lounge',x:-82.05,y:12.85,z:-449.3,yaw:Math.PI/2,pitch:.76,scale:.75,offset:7.1}),
  freeze({id:'return-room',x:-63.4,y:12.65,z:-465.1,yaw:0,pitch:.76,scale:.85,offset:13.6}),
]);

export function sourceLastReceptionCelestialInstances(frame={}, {origin={x:0,z:0},zone=0,reducedMotion=false}={}){
  const elapsed=Math.max(0,Number(frame.elapsed)||0);
  return SOURCE_RECEPTION_CELESTIALS.flatMap(actor=>{
    // One held, asynchronous breath rather than three copies of the original
    // encounter choreography. The reception clock pauses with conversation.
    const t=actor.offset+(reducedMotion?0:elapsed*.18);
    const character=heldNotePose({clipTime:t,wingTension:.2+.035*Math.sin(t*.7),wheelAngle:t*.04});
    const x=actor.x+(Number(origin.x)||0),z=actor.z+(Number(origin.z)||0);
    const matrix=adversaryWorldMatrix(x,actor.y,z,actor.yaw,actor.pitch,actor.scale);
    return SOURCE_RECEPTION_CELESTIAL_MESHES.map(mesh=>({
      id:`source-reception-celestial:${actor.id}:${mesh}`,mesh,x,y:actor.y,z,matrix,
      zone,structural:false,character,receptionCelestial:actor.id,cullRadius:3,
    }));
  });
}
