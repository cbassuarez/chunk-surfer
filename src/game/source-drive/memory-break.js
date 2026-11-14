// The shared picture/receiver clock for one involuntary break in the road.
// Full cover is a construction requirement, not an opacity guessed by a HUD.
export const DRIVE_MEMORY_BREAK=Object.freeze({seconds:1.6,coverAt:.34,placeAt:.76,revealAt:1.04,contactLead:.52});
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
const ease=v=>{const t=clamp(v);return t*t*t*(10+t*(-15+6*t));};
export function driveMemoryBreakFrame(cut,spec=DRIVE_MEMORY_BREAK){
  if(!cut)return{active:false,cover:0,grain:0,serial:0};
  const t=Math.max(0,Number(cut.age)||0),cover=t<spec.coverAt?ease(t/spec.coverAt):t<=spec.revealAt?1:1-ease((t-spec.revealAt)/(spec.seconds-spec.revealAt));
  return{active:true,serial:cut.serial,age:t,seconds:spec.seconds,fraction:clamp(t/spec.seconds),
    cover,grain:.065*Math.sin(Math.PI*clamp(t/spec.seconds))*(1-cover),
    phase:t<spec.coverAt?'loss':t<spec.placeAt?'held-world':t<spec.revealAt?'replacement':'reception',
    from:cut.from,to:cut.to,reason:cut.reason,destination:cut.destination,
    destinationReady:!!cut.destinationReady,coveredPresented:!!cut.coveredPresented,
    placed:!!cut.placed,waiting:!!cut.waiting,receiverPowerException:true};
}
