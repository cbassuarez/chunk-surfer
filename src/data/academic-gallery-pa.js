// Compact existing north-gallery PA; authored metres, base+10m. Front is local −Z.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const ACADEMIC_GALLERY_PA=freeze({ampId:'academic-gallery-pa-rack',floor:10,
 levels:['off','low','house'],defaultLevel:'house',
 approach:{x:31.4,y:244.5,yaw:Math.PI/2},source:{x:81.5,y:11.25,z:5.0},
 placements:[
  {id:'academic-gallery-pa-speaker-north',mesh:'academic_pa_speaker',x:31.5,y:243.6,yaw:-Math.PI/2,w:.58,d:.58,h:1.73,blocks:true},
  {id:'academic-gallery-pa-speaker-south',mesh:'academic_pa_speaker',x:31.5,y:246.4,yaw:-Math.PI/2,w:.58,d:.58,h:1.73,blocks:true},
  {id:'academic-gallery-pa-rack',mesh:'academic_pa_rack',x:32.8,y:244.5,yaw:-Math.PI/2,w:.86,d:.80,h:1.22,blocks:true,interactive:true,action:'academic-gallery-pa',label:'Gallery amplifier and playback rack'},
 ]});
export const academicGalleryPALevel=value=>ACADEMIC_GALLERY_PA.levels.includes(value)?value:ACADEMIC_GALLERY_PA.defaultLevel;
export const ACADEMIC_GALLERY_PA_PLACEMENTS=ACADEMIC_GALLERY_PA.placements;
