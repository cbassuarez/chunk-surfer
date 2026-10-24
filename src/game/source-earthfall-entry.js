import {SOURCE_CONTINUATION} from '../data/source-continuation.js';

// Existing journeys already inside Source II, reverse journeys and old onward
// saves keep their position. Only its unused forward entrance gets the omen.
export function sourceEarthfallNeeded(value,continuation,direction='forward'){
  if(direction!=='forward'||!continuation||continuation.completed||continuation.direction==='reverse')return false;
  if(value?.status==='completed')return false;
  const s=SOURCE_CONTINUATION.spawn;
  return continuation.phase==='wrong-return'&&(continuation.elapsed||0)<.001
    &&!(continuation.knowledge||[]).length
    &&Math.hypot(continuation.x-s.x,continuation.z-s.z)<.05
    &&Math.abs(continuation.feet-s.feet)<.05;
}
