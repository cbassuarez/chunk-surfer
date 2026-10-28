// The field navigator learns the assignment when the recordist signs RECEIVED.
// prologueDone is the earlier save format's durable receipt of that handover;
// owning a case or previewing the work order is not an accepted assignment.
export const WORK_ORDER_ACCEPTED_FLAG='work-order.accepted';
export function workOrderAccepted(flags={}){
  return flags?.[WORK_ORDER_ACCEPTED_FLAG]===true||flags?.prologueDone===true;
}
