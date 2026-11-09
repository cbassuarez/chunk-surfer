import {B3_CONSOLE_LAYOUT} from '../data/b3-console-layout.js';
// The control-room desk faces west. Its local +Z track points east in the
// physical world, towards the operator. The authored cap sits at .75; lowering
// the fader draws it toward the operator without changing collision or picking.
export const B3_FADER_CHANNELS=B3_CONSOLE_LAYOUT.channels;
export const B3_FADER_WORKING_POSITION=B3_CONSOLE_LAYOUT.workingValue;
export const B3_FADER_TRACK_METRES=B3_CONSOLE_LAYOUT.faderTrack;
export const b3FaderCapId=channel=>`b3-console-fader-${String(channel).padStart(2,'0')}`;
export function b3FaderDrift(value){
  const n=Number(value),v=Number.isFinite(n)?Math.max(0,Math.min(1,n)):B3_FADER_WORKING_POSITION;
  return {dx:B3_FADER_TRACK_METRES*(B3_FADER_WORKING_POSITION-v)};
}
export function syncB3FaderProps(props,faders=[]){
  if(typeof props?.setPropDrift!=='function')return 0;
  let found=0;
  for(let i=0;i<B3_FADER_CHANNELS;i++)if(props.setPropDrift(b3FaderCapId(i+1),b3FaderDrift(faders[i])))found++;
  return found;
}
