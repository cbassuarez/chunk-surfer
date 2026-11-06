// The same sentence, with him in it. Pure, apart from the run's own flags and the
// ratchet, so a reload lands on the same words.
import {WHOSE_LIFE_OWNED,WHOSE_LIFE_PLACES,WHOSE_LIFE_HANDS} from '../data/whose-life.js';

const OWNED=new Map(WHOSE_LIFE_OWNED.map(row=>[row.id,row]));

/** The inspect line as it reads at this meaning. Rungs play once, through the run's flags. */
export function whoseLifeLine(id,text,{first=null,meaning=0,heard=false,isSet=()=>false,mark=()=>{},frozen=false}={}){
  if(frozen||!text)return text;
  let line=String(text);
  const row=OWNED.get(id);
  if(row&&meaning>=row.at){
    // Someone who read it early has moved on to the "again" line, and would never see it
    // change. So the first read after it becomes his is the original sentence, once.
    const opening=first&&row.swap.some(([from])=>first.includes(from))?first:null;
    if(opening&&line!==opening&&!isSet(`whose.owned.${id}`))line=opening;
    if(opening)mark(`whose.owned.${id}`);
    for(const[from,to]of row.swap)line=line.replace(from,to);
  }
  const added=[];
  const once=(key,value)=>{if(isSet(key))return false;mark(key);added.push(value);return true;};
  for(const[index,rung]of(WHOSE_LIFE_PLACES[id]||[]).entries())if(meaning>=rung.at&&once(`whose.place.${id}.${index}`,rung.text))break;
  // Shared across every marimba: it's his hands that have the memory, not the instrument.
  if(heard&&WHOSE_LIFE_HANDS.ids.includes(id))for(const[index,rung]of WHOSE_LIFE_HANDS.rungs.entries())if(meaning>=rung.at&&once(`whose.hands.${index}`,rung.text))break;
  return added.length?`${line} ${added.join(' ')}`:line;
}

/** A thing that has become his stays his, through a surge and out the other side. */
export function createWhoseLifeRatchet(){
  let run=null,highest=0;
  return(runId,meaning)=>{
    if(runId!==run){run=runId;highest=0;}
    highest=Math.max(highest,Number(meaning)||0);
    return highest;
  };
}
