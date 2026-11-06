// Keeps the set in the parked cab looking like what its owner says it's doing: the tube,
// the latched key, the knob. Nothing here decides anything about the sound.
import {setOpeningCabRadioObserver} from '../audio/opening-cab-radio.js';
import {cabRadioPose} from '../data/cab-radio.js';
import {openingVehicleRadioLeaning,setOpeningVehicleRadioPose} from '../data/opening-vehicle.js';
import {createCabRadioFace} from '../render/cab-radio-vfd.js';
import {setDriveStudyCanvas} from '../render/props3d.js';

export function installParkedCabRadio({getClock=()=>null}={}){
  const face=createCabRadioFace({mesh:'opening_drive_radio_readout',close:openingVehicleRadioLeaning,upload:(mesh,canvas)=>setDriveStudyCanvas(mesh,canvas,{mipmaps:true})});
  setOpeningCabRadioObserver(radio=>{
    const preset=Number.isFinite(radio?.preset)?radio.preset-1:-1,on=radio?.on===true,volume=radio?.volume??0,seconds=performance.now()/1000;
    setOpeningVehicleRadioPose(cabRadioPose({on,preset,volume}));
    const clock=getClock();
    face.sync({on,preset,volume,name:radio?.station||'',receiving:radio?.playing===true,clock:!clock||clock.blank?null:clock.value},seconds);
  });
}
