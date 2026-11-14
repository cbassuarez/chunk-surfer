import {parseRecordingCassetteId} from './carry-items.js';

// A view over real entries, never another inventory or a saved count. A member
// retains its source ID, ownership, charge, recording and action descriptors.
export function inventoryStackKey(entry){
  const explicit=entry?.stackKey??entry?.source?.stackKey;
  if(typeof explicit==='string'&&explicit.trim())return `group:${explicit.trim()}`;
  if(parseRecordingCassetteId(entry?.sourceId)!==null&&entry?.source?.content==null)return 'blank-recording-cassettes';
  return null;
}

export function inventoryEntryQuantity(entry){
  const value=entry?.quantity??entry?.source?.quantity;
  return Number.isFinite(value)&&value>=0?Math.floor(value):1;
}

export function projectInventoryStacks(entries=[],{selectedId=null,preferredMembers={}}={}){
  const stacks=[],byKey=new Map();
  for(const entry of entries){
    if(!entry?.id)continue;
    const group=inventoryStackKey(entry),id=group?`stack:${group}`:entry.id;
    let stack=byKey.get(id);
    if(!stack){stack={id,key:group,members:[],memberIds:[],label:group==='blank-recording-cassettes'?'Blank cassettes':entry?.source?.stackLabel||entry?.stackLabel||entry.title||entry.label||'Item'};byKey.set(id,stack);stacks.push(stack);}
    stack.members.push(entry);stack.memberIds.push(entry.id);
  }
  return stacks.map(stack=>{
    const desired=stack.memberIds.includes(selectedId)?selectedId:preferredMembers[stack.id];
    const entry=stack.members.find(member=>member.id===desired)
      ||stack.members.find(member=>member.present!==false&&!member.source?.deployed)||stack.members[0];
    const available=member=>member.present!==false&&!member.source?.deployed;
    const quantity=stack.members.reduce((sum,member)=>sum+inventoryEntryQuantity(member),0);
    const availableQuantity=stack.members.reduce((sum,member)=>sum+(available(member)?inventoryEntryQuantity(member):0),0);
    return{...stack,entry,memberCount:stack.members.length,memberIndex:stack.memberIds.indexOf(entry.id),
      quantity,availableQuantity,missingQuantity:quantity-availableQuantity,selected:stack.memberIds.includes(selectedId)};
  });
}

export function inventoryStackForEntry(stacks,entryId){return stacks.find(stack=>stack.memberIds.includes(entryId))||null;}

export function nextInventoryStackMember(stack,entryId,direction=1){
  if(!stack?.members?.length)return null;
  const at=Math.max(0,stack.memberIds.indexOf(entryId));
  return stack.members[(at+Math.sign(direction)+stack.members.length)%stack.members.length];
}
