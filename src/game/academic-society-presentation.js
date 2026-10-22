import {ACADEMIC_SOCIETY_ACTORS as ACTORS,ACADEMIC_SOCIETY_TIMING as T} from '../data/academic-society.js';
import {academicSocietyArea} from './academic-society.js';

const BY_ID=new Map(ACTORS.map(actor=>[actor.id,actor]));

// Body acting may continue while the visitor reads the society's own dialogue,
// although that scene intentionally holds walking and the world's loan timer.
// A pause, native blur, hidden document or another modal still freezes it.
export function academicSocietyPresentationActive({onAcademicFloor=false,paused=false,
  hidden=false,nativeFocused=null,documentFocused=false,blocked=false,ownsTopScene=false}={}){
  return onAcademicFloor&&!paused&&!hidden
    &&(nativeFocused==null?documentFocused:nativeFocused)
    &&(!blocked||ownsTopScene);
}

export function createAcademicSocietyPresentationClock(){
  let seconds=0;
  return Object.freeze({
    tick(dt,context={}){
      if(!context.onAcademicFloor){seconds=0;return seconds;}
      if(academicSocietyPresentationActive(context)){
        seconds+=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
      }
      return seconds;
    },
    reset(){seconds=0;},
    view:()=>({timeSec:seconds}),
  });
}

// Issuing an exchange does not make it a radio transmission. Keep its full
// dependent chain in the same local area, within earshot of all its speakers.
// Voice-loan/release events have their own consent and floor lifetime.
export function academicSocietyAmbientAudible(event,listener){
  if(event?.type!=='social')return true;
  if(!listener||!Number.isFinite(listener.x)||!Number.isFinite(listener.y)
    ||academicSocietyArea(listener)!==event.area)return false;
  const speakers=[...new Set((event.lines||[]).map(line=>line.actorId))].map(id=>BY_ID.get(id));
  return speakers.length>0&&speakers.every(actor=>actor
    &&Math.hypot(actor.x-listener.x,actor.y-listener.y)<=T.earshot);
}
