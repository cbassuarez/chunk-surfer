const ALPHABET_LENGTH=26;
const alphabetIndex=letter=>letter.charCodeAt(0)-65;
const wrap=value=>((value%ALPHABET_LENGTH)+ALPHABET_LENGTH)%ALPHABET_LENGTH;
const result=(kind,index,delta=0)=>({kind,index,delta});

// Pure mechanical state for an alphabet-wheel lock. No wheel has a blank face.
//
// view() returns detached letters, word, cursor and unwrapped detent positions.
// select(index) and move(delta) clamp the selection to the available wheels.
// cycle(integerDelta, index=cursor) turns a wheel without changing selection.
// type(singleAsciiLetter) turns the selected wheel by its shortest route, then
// advances the selection (clamped at the last wheel). A 13-detent tie goes up.
// delete() resets the selected wheel to A by the same shortest route.
// backspace() first resets the last typed wheel, then steps left on each call.
// A selection, movement, manual turn or Delete starts that sequence at the
// selected wheel instead. This distinguishes a typed A from an empty position.
//
// Each method returns {kind:'turn'|'select'|'none', index, delta}. For a turn,
// index identifies the wheel and delta is its signed, actual detent movement;
// consult view().cursor for the selection after typing. Invalid arguments are
// no-ops. A repeated letter still advances selection even if its wheel is set.
export function createRoofWordLock({wordLength=6}={}){
  if(!Number.isInteger(wordLength)||wordLength<1)throw new RangeError('wordLength must be a positive integer');
  const turns=Array(wordLength).fill(0);
  let cursor=0,backspaceTarget=null;
  const clamp=index=>Math.max(0,Math.min(wordLength-1,index));
  const none=()=>result('none',cursor);
  const resetTyping=()=>{backspaceTarget=null;};
  const setWheel=(index,target)=>{
    let delta=wrap(target-wrap(turns[index]));
    if(delta>ALPHABET_LENGTH/2)delta-=ALPHABET_LENGTH;
    turns[index]+=delta;
    return delta;
  };
  const select=index=>{
    if(!Number.isInteger(index))return none();
    resetTyping();
    const next=clamp(index);
    if(next===cursor)return none();
    cursor=next;
    return result('select',cursor);
  };
  return {
    view(){
      const letters=turns.map(turn=>String.fromCharCode(65+wrap(turn)));
      return {letters,word:letters.join(''),cursor,turns:[...turns]};
    },
    select,
    move(delta){
      if(!Number.isInteger(delta))return none();
      return select(cursor+delta);
    },
    cycle(delta,index=cursor){
      if(!Number.isInteger(delta)||!Number.isInteger(index)||index<0||index>=wordLength)return none();
      resetTyping();
      if(delta===0)return none();
      turns[index]+=delta;
      return result('turn',index,delta);
    },
    type(letter){
      if(typeof letter!=='string'||!/^[a-z]$/i.test(letter))return none();
      const index=cursor,delta=setWheel(index,alphabetIndex(letter.toUpperCase()));
      const previousCursor=cursor;
      cursor=Math.min(wordLength-1,cursor+1);
      backspaceTarget=index;
      return delta!==0?result('turn',index,delta):cursor!==previousCursor?result('select',cursor):none();
    },
    backspace(){
      const index=backspaceTarget??cursor,previousCursor=cursor;
      const delta=setWheel(index,0);
      cursor=index;
      backspaceTarget=Math.max(0,index-1);
      return delta!==0?result('turn',index,delta):cursor!==previousCursor?result('select',cursor):none();
    },
    delete(){
      resetTyping();
      const delta=setWheel(cursor,0);
      return delta!==0?result('turn',cursor,delta):none();
    },
  };
}
