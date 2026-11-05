// THE CASSETTES, AND WHAT HE WROTE ABOUT THEM.
//
// docs/plans/work-order.md. Seb's rulings: tape is whole cassettes and every
// attempt uses one, kept or not; out of blanks you can still record, but only
// over a take you already have; the client rejects weak takes; the level check
// is on cassette 1 and the first take goes over it; being taken can cost a
// cassette (never on Story, rarely on Contract, more on Night Shift and Dead
// Air); the B3 store has two more.
//
// Pure and serialisable: every function returns a new ledger. Nothing here
// decides whether a take was clean; the recorder does, and passes the outcome.
//
// HIS INK IS PERMANENT. `marks` only ever grows. An erased or lost take is not
// un-ticked by deleting the tick: he strikes his own tick and writes why. The
// work order draws every mark; the check-off animates the ones after the last
// order it showed.
import {recordistHandCovers} from '../data/recordist-hand.js';

const freeze=Object.freeze;
export const CASSETTE_LEDGER_SCHEMA=1;
export const CASSETTES_ISSUED=freeze({story:12,contract:8,night:6,'dead-air':5});
export const CASSETTE_LOSS_ON_CONTACT=freeze({story:0,contract:1/6,night:1/2,'dead-air':1/2});
export const B3_STORE_CASSETTES=2;
export const TAKE_OUTCOMES=freeze(['clean','rejected','spoilt']);
export const TAKE_CAUSES=freeze(['BREATH','HANDLING','CLOTHING','PRESENCE','NOISE','STOPPED']);
// A custom shift has no tape terms of its own yet; it is issued as a Contract.
const shiftOf=shift=>Object.hasOwn(CASSETTES_ISSUED,shift)?shift:'contract';

const copy=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
function clock(seconds){const s=Math.max(0,Math.floor(finite(seconds)));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}

export function createCassetteLedger(shift='contract'){
  const id=shiftOf(shift),issued=CASSETTES_ISSUED[id];
  return{schema:CASSETTE_LEDGER_SCHEMA,shift:id,issued,storeTaken:false,signed:null,order:0,
    cassettes:Array.from({length:issued},(_,i)=>({n:i+1,source:'issued',lost:false,content:null,history:[]})),marks:[]};
}

/** A saved ledger, or a fresh one for `shift` when the value is unusable. */
export function normalizeCassetteLedger(value,{shift='contract'}={}){
  if(!value||typeof value!=='object'||value.schema!==CASSETTE_LEDGER_SCHEMA||!Array.isArray(value.cassettes)||!Array.isArray(value.marks))
    return createCassetteLedger(shift);
  const next=copy(value);next.shift=shiftOf(next.shift);next.order=Math.max(finite(next.order),...next.marks.map(m=>finite(m.order)),0);
  return next;
}

function mark(ledger,kind,fields){ledger.order+=1;ledger.marks.push({id:`${kind}:${ledger.order}`,kind,order:ledger.order,...fields});}
const cassetteAt=(ledger,n)=>ledger.cassettes.find(c=>c.n===n)||null;
const acceptedBy=(ledger,roomId)=>ledger.cassettes.some(c=>!c.lost&&c.content?.kind==='take'&&c.content.roomId===roomId&&c.content.outcome==='clean');

/**
 * Ticking a shift on sheet 1, in the cab: the cassettes issued for it, and the
 * tick and the count in his hand. Once, and only before any take; a custom
 * shift is issued as a Contract and written in as CUSTOM.
 */
export function chooseShift(ledger,shift){
  if(ledger.shiftChosen||ledger.cassettes.some(c=>c.history.length))return ledger;
  const fresh=createCassetteLedger(shift),chosen=shift==='custom'?'custom':fresh.shift;
  const next={...copy(ledger),shift:fresh.shift,issued:fresh.issued,cassettes:fresh.cassettes,shiftChosen:chosen};
  mark(next,'shift',{shift:chosen});mark(next,'issued',{n:next.issued,text:String(next.issued)});
  return next;
}

/** Signing RECEIVED at the lodge window. If the shift was not ticked in the
 * cab (an older run, or a skipped van), the tick goes on with the signature. */
export function signWorkOrder(ledger,{time=''}={}){
  if(ledger.signed)return ledger;
  const next=copy(ledger);next.signed={time:String(time)};
  if(!next.shiftChosen){next.shiftChosen=next.shift;mark(next,'shift',{shift:next.shift});mark(next,'issued',{n:next.issued,text:String(next.issued)});}
  mark(next,'signature',{time:String(time)});
  return next;
}

/** The level check and mic test go on cassette 1, for the first take to go over. */
export function recordLevelCheck(ledger){
  const first=cassetteAt(ledger,1);
  if(!first||first.lost||first.content||first.history.length)return ledger;
  const next=copy(ledger),c=cassetteAt(next,1);c.content={kind:'tutorial'};c.history.push({kind:'tutorial'});
  mark(next,'cassette-label',{n:1,text:'LVL'});
  return next;
}

/**
 * Where the next take goes. The first take of the night goes over the level
 * check; otherwise the first blank. With no blank, `options` lists what can be
 * recorded over: spoilt, then rejected, then clean takes (which erase a room),
 * oldest first within each. No options means every cassette is gone.
 */
export function nextCassette(ledger){
  const carried=ledger.cassettes.filter(c=>!c.lost);
  const tutorial=carried.find(c=>c.content?.kind==='tutorial');
  if(tutorial)return{n:tutorial.n,over:'tutorial',options:[]};
  const blank=carried.find(c=>!c.content);
  if(blank)return{n:blank.n,over:null,options:[]};
  const rank={spoilt:0,rejected:1,clean:2};
  const onlyClean=c=>c.content.outcome==='clean'&&!carried.some(o=>o!==c&&o.content?.kind==='take'&&o.content.roomId===c.content.roomId&&o.content.outcome==='clean');
  const options=carried.filter(c=>c.content?.kind==='take')
    .map(c=>({n:c.n,roomId:c.content.roomId,outcome:c.content.outcome,erases:onlyClean(c)?c.content.roomId:null}))
    .sort((a,b)=>rank[a.outcome]-rank[b.outcome]||a.n-b.n);
  return{n:null,over:null,options};
}

/** What he writes on the sheet for one attempt. Only glyphs his hand has. */
export function takeNote({n,outcome,atSec=0,cause='NOISE',over=null}={}){
  const lead=`${n}  ${over==='tutorial'?'OVER THE LEVEL CHECK. ':over!=null?`OVER ${over}. `:''}`;
  const why=TAKE_CAUSES.includes(cause)?cause:'NOISE';
  if(outcome==='clean')return `${lead}CLEAN`;
  if(outcome==='rejected')return `${lead}${why} ${clock(atSec)} - REJECT. REDO`;
  if(why==='STOPPED')return `${lead}STOPPED ${clock(atSec)}`;
  return `${lead}SPOILT ${clock(atSec)} ${why}`;
}

function loseAcceptance(next,roomId,n,why){
  if(!roomId||acceptedBy(next,roomId))return[];
  mark(next,'untick',{roomId});mark(next,'note',{roomId,text:`${n}  ${why}`});
  return[roomId];
}

/**
 * Put a finished or spoilt attempt on cassette `n`. Returns the new ledger and
 * any room whose only clean take was just recorded over.
 */
export function recordOnCassette(ledger,n,{roomId,outcome,takeId=null,atSec=0,cause='NOISE'}={}){
  if(!TAKE_OUTCOMES.includes(outcome))throw Error(`Unknown take outcome: ${outcome}`);
  if(!roomId)throw Error('A take needs its room.');
  const before=cassetteAt(ledger,n);
  if(!before||before.lost)throw Error(`Cassette ${n} is not in the bag.`);
  const next=copy(ledger),c=cassetteAt(next,n),previous=c.content,wasAccepted=acceptedBy(next,roomId);
  const over=previous?.kind==='tutorial'?'tutorial':previous?.kind==='take'?{roomId:previous.roomId,outcome:previous.outcome}:null;
  c.content={kind:'take',n,roomId,outcome,takeId,atSec:finite(atSec),cause};
  c.history.push({...c.content,over});
  if(previous?.kind==='tutorial')mark(next,'label-strike',{n,text:'LVL'});
  mark(next,'slash',{n});
  mark(next,'note',{roomId,text:takeNote({n,outcome,atSec,cause,over:over==='tutorial'?'tutorial':null})});
  // Only a room's clean take can be erased; recording over a spoilt or
  // rejected one costs nothing on the sheet but the cassette.
  const erased=previous?.kind==='take'&&previous.outcome==='clean'?loseAcceptance(next,previous.roomId,n,'ERASED'):[];
  if(outcome==='clean'&&!wasAccepted){mark(next,'tick',{roomId});mark(next,'strike',{roomId});}
  return{ledger:next,erased};
}

/**
 * Being taken. On most shifts it can cost a cassette, chosen from everything
 * he carries; if that cassette had a room's only clean take, the room goes.
 */
export function loseCassetteOnContact(ledger,{random=Math.random}={}){
  const chance=CASSETTE_LOSS_ON_CONTACT[ledger.shift]??0,carried=ledger.cassettes.filter(c=>!c.lost);
  if(!carried.length||!(random()<chance))return{ledger,lost:null,erased:[]};
  const pick=carried[Math.min(carried.length-1,Math.floor(random()*carried.length))];
  const next=copy(ledger),c=cassetteAt(next,pick.n);c.lost=true;
  mark(next,'ring',{n:c.n,text:'LOST'});
  const erased=c.content?.kind==='take'&&c.content.outcome==='clean'?loseAcceptance(next,c.content.roomId,c.n,'LOST'):[];
  return{ledger:next,lost:c.n,erased};
}

/** He found it where it was put. A clean take on it counts again. */
export function recoverCassette(ledger,n){
  const before=cassetteAt(ledger,n);if(!before?.lost)return{ledger,restored:[]};
  const next=copy(ledger),c=cassetteAt(next,n),roomId=c.content?.kind==='take'&&c.content.outcome==='clean'?c.content.roomId:null;
  const wasAccepted=roomId?acceptedBy(next,roomId):true;c.lost=false;
  mark(next,'cassette-label',{n,text:'FOUND'});
  if(roomId&&!wasAccepted){mark(next,'tick',{roomId});mark(next,'note',{roomId,text:`${n}  FOUND`});}
  return{ledger:next,restored:roomId&&!wasAccepted?[roomId]:[]};
}

/** The B3 tape store: two blanks, once, numbered after the issued ones. */
export function takeB3Store(ledger){
  if(ledger.storeTaken)return{ledger,added:[]};
  const next=copy(ledger),start=Math.max(0,...next.cassettes.map(c=>c.n))+1,added=[];
  for(let i=0;i<B3_STORE_CASSETTES;i++){const n=start+i;next.cassettes.push({n,source:'b3-store',lost:false,content:null,history:[]});added.push(n);mark(next,'store-written',{n,text:'B3'});}
  next.storeTaken=true;mark(next,'store-note',{text:`FOUND ${B3_STORE_CASSETTES} - B3 STORE`});
  return{ledger:next,added};
}

/**
 * A save from before the ledger: its counted rooms were clean takes, on the
 * first cassettes in the order they were rolled. Nothing else is invented.
 */
export function adoptExistingTakes(ledger,roomIds=[],{takeIdFor=()=>null}={}){
  let next=ledger;
  for(const roomId of roomIds){if(acceptedRooms(next).includes(roomId))continue;const at=nextCassette(next);if(!at.n)break;
    next=recordOnCassette(next,at.n,{roomId,outcome:'clean',takeId:takeIdFor(roomId)}).ledger;}
  return next;
}

export function acceptedRooms(ledger){
  return[...new Set(ledger.cassettes.filter(c=>!c.lost&&c.content?.kind==='take'&&c.content.outcome==='clean').map(c=>c.content.roomId))];
}
export const blankCassettes=ledger=>ledger.cassettes.filter(c=>!c.lost&&(!c.content||c.content.kind==='tutorial')).length;
/** Marks newer than `order`: what the check-off still has to write. */
export const marksSince=(ledger,order=0)=>ledger.marks.filter(m=>m.order>finite(order));

/** For the run summary and the ending metrics. */
export function cassetteSummary(ledger){
  const takes=ledger.cassettes.flatMap(c=>c.history.filter(h=>h.kind==='take'));
  const count=outcome=>takes.filter(t=>t.outcome===outcome).length;
  return{shift:ledger.shift,issued:ledger.issued,found:ledger.cassettes.filter(c=>c.source==='b3-store').length,
    attempts:takes.length,clean:count('clean'),rejected:count('rejected'),spoilt:count('spoilt'),
    lost:ledger.cassettes.filter(c=>c.lost).length,blank:blankCassettes(ledger),
    erased:ledger.marks.filter(m=>m.kind==='untick').length,acceptedRooms:acceptedRooms(ledger),
    notes:ledger.marks.filter(m=>m.kind==='note').map(m=>({roomId:m.roomId,text:m.text}))};
}

/** Every written word on the sheet is one his hand can form. */
export const ledgerTextIsWritable=ledger=>ledger.marks.every(m=>m.text==null||recordistHandCovers(m.text));
