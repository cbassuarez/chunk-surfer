const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};

// This is an authored loss of the acquired world image, not a simulation of a
// medical condition. Colour, form grouping and field visibility have separate
// envelopes. A musical mistake may hurt, but never advances this chronology.
export function sourceRestFacultyFrame(progress,{affliction=null,reducedMotion=false,reducedDread=false,effectsMode='full'}={}){
  const p=clamp(progress),canLeave=affliction?.canLeave!==false,
    embodied=affliction?.active===true&&affliction?.embodied===true,
    occupied=affliction?.bodyProgress==null?1:clamp(affliction.bodyProgress),
    enabled=embodied&&effectsMode!=='off'&&occupied>0,
    rally=smooth(.80,.84,p)*(1-smooth(.87,.91,p)),
    gain=enabled?occupied*(reducedDread?.65:1):0;
  const colourSeparation=reducedMotion?0:smooth(.27,.40,p)*(1-smooth(.42,.50,p))*.78,
    colourFlattening=smooth(.50,.74,p),
    bindingLoss=smooth(.58,.88,p)*(1-rally*.28),
    fieldLoss=smooth(.70,.94,p)*(1-rally*.52),
    // The full-field ending belongs to the existing irreversible departure.
    // Before it, the renderer also preserves a central/lower viewing aperture.
    black=enabled&&!canLeave?smooth(.89,.96,p)*occupied:0;
  return{enabled,progression:p,canLeave,reducedMotion:!!reducedMotion,reducedDread:!!reducedDread,
    colourSeparation:gain*(canLeave?Math.min(.23,colourSeparation):colourSeparation),
    colourFlattening:gain*(canLeave?Math.min(.32,colourFlattening):colourFlattening),
    bindingLoss:gain*(canLeave?Math.min(.14,bindingLoss):bindingLoss),
    fieldLoss:canLeave?0:gain*fieldLoss,black};
}

// A slow peripheral loss followed by one sustained recovery. No flashing,
// camera seizure or randomized loss of text; the last words stay readable.
export function sourceRestVisionFrame(progress,{interruption=false,reducedMotion=false,affliction=null}={}){
  const p=clamp(progress),rally=smooth(.80,.84,p)*(1-smooth(.87,.91,p));
  const closing=smooth(.58,.80,p),standing=affliction?.embodied===false,
    leaveable=affliction?.embodied===true&&affliction?.canLeave!==false,
    black=standing||leaveable?0:smooth(.89,.96,p);
  const hurt=clamp(affliction?.pain),strain=clamp(affliction?.strain),loss=clamp(affliction?.facultyLoss);
  const periphery=clamp(closing*.91-rally*.63+hurt*.18+strain*.14),
    aperture=Math.max(.18,.82-closing*.53+rally*.38-hurt*.07-loss*.06);
  // The old Canvas cover shares the same departure authority as the acquired
  // image. A late/resumed clock must not black out a seat the player can leave,
  // or survive into the first frame of ordinary standing movement.
  return {periphery:standing?0:leaveable?Math.min(.25,periphery):periphery,
    aperture:standing?.82:leaveable?Math.max(.72,aperture):aperture,
    black,interruption:!standing&&interruption?.12:0,rally:reducedMotion||standing?0:rally,
    faculties:sourceRestFacultyFrame(p,{affliction,reducedMotion})};
}
