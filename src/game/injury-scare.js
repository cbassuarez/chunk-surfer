// A lasting injury belongs to an explicitly started scare, never a random
// optional effect or an exhausted ambient scare budget.
export function createInjuryScareGate({injure}={}){
  const receipts=new Map();
  return {
    authorize({eventId,kind,started=false}={}){
      if(!started||!eventId||!['contact','defeat'].includes(kind))return null;
      if(receipts.has(eventId))return receipts.get(eventId).receipt;
      const receipt=Object.freeze({eventId,kind});receipts.set(eventId,{receipt,spent:false});
      while(receipts.size>64)receipts.delete(receipts.keys().next().value);
      return receipt;
    },
    commit(receipt){
      const owner=receipts.get(receipt?.eventId);
      if(!owner||owner.receipt!==receipt||owner.spent)return null;
      owner.spent=true;return injure?.()??null;
    },
    reset(){receipts.clear();},
  };
}
