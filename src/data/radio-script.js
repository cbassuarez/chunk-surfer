// Compatibility adapter for tests and small tools that still import this path.
// Narrative Studio JSON is the sole prose source; no dialogue is duplicated in
// code, so a registry rebuild and the shipped runtime always read the same tree.
import { runtimeTree } from '../narrative/runtime-content.js';

export function radioDialogue(cueId,{roomLabel='the next room',...context}={}){
  return runtimeTree(`radio.${cueId}`,{
    ...context,
    roomLabel,
    ROOMLABEL:String(roomLabel).toUpperCase(),
  });
}
