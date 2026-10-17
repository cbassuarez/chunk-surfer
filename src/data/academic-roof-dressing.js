// Placement contract for roof-only architectural observations. Import these
// alongside ACADEMIC_ROOF_PROPS; no quest requires them to be inspected.
export const ACADEMIC_ROOF_DRESSING_MESHES=Object.freeze({
  academic_roof_school_bell:{w:1.35,d:1.05,h:2.50,blocks:false},
  academic_roof_listening_vent:{w:1.24,d:1.28,h:1.55,blocks:false},
  academic_roof_guarantor_marks:{w:1.25,d:1.20,h:1.50,blocks:false},
  academic_roof_rehearsal_rest:{w:1.45,d:.92,h:.94,blocks:true},
  academic_roof_weatherwork:{w:24,d:27,h:.08,blocks:false},
});

const point=(x,y)=>Object.freeze({x,y});
const prop=(id,mesh,at,extra={})=>Object.freeze({
  id,mesh,x:at.x,y:at.y,yaw:0,scale:1,
  renderGroups:['academicRoof'],structural:true,blocks:false,...extra,
});

export const ACADEMIC_ROOF_DRESSING_PROPS=Object.freeze([
  prop('roof-school-bell','academic_roof_school_bell',point(194,273),{
    action:'roof-school-bell',label:'Old school bell',inspectAt:point(195,274),
  }),
  prop('roof-listening-vent','academic_roof_listening_vent',point(211,292),{
    action:'roof-listening-vent',label:'Listening vent',inspectAt:point(210,291),
  }),
  prop('roof-guarantor-marks','academic_roof_guarantor_marks',point(212,278),{
    action:'roof-guarantor-marks',label:'Two service tags',inspectAt:point(212.2,278.2),
  }),
  // A compact stored chair, coat and collapsed stand beside the listening
  // vent. It is real furniture with its own footprint; the broad south loop,
  // glass bays, return ladder and Ren's ritual remain clear.
  prop('roof-rehearsal-rest','academic_roof_rehearsal_rest',point(210.0,293.2),{
    interactive:false,blocks:true,
  }),
  prop('academic-roof-weatherwork','academic_roof_weatherwork',point(202,283.5),{
    interactive:false,
  }),
]);

// These observations should add texture, never gate either of Ren's favours.
// The listening vent needs a brief *ordinary* practice phrase, filtered through
// the building, with a missed note and a restart. It should be audible only on
// deliberate inspection, not a perpetual city-wide supernatural music bed.
export const ACADEMIC_ROOF_DRESSING_OBSERVATIONS=Object.freeze({
  'roof-school-bell':Object.freeze({
    prompt:'Examine the old school bell',
    text:'A call bell for lessons, small enough for this roof. The rope is gone. Students must have learned to come without it.',
  }),
  'roof-listening-vent':Object.freeze({
    prompt:'Listen at the vent',
    text:'Six piano notes rise from a practice room. The fifth catches; someone starts the phrase again. Rain closes over it.',
    sound:'roof-practice-through-vent',
  }),
  'roof-guarantor-marks':Object.freeze({
    prompt:'Examine the service tags',
    text:'One enamel locker tag, one worn service key. Neither has a name. Ren has left them where weather can reach them.',
  }),
});
