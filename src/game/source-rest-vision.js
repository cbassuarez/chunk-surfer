const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};

// A slow peripheral loss followed by one sustained recovery. No flashing,
// camera seizure or randomized loss of text; the last words stay readable.
export function sourceRestVisionFrame(progress,{interruption=false,reducedMotion=false,affliction=null}={}){
  const p=clamp(progress),rally=smooth(.80,.84,p)*(1-smooth(.87,.91,p));
  const closing=smooth(.58,.80,p),black=smooth(.89,.96,p);
  const hurt=clamp(affliction?.pain),strain=clamp(affliction?.strain),loss=clamp(affliction?.facultyLoss);
  return {periphery:clamp(closing*.91-rally*.63+hurt*.18+strain*.14),aperture:Math.max(.18,.82-closing*.53+rally*.38-hurt*.07-loss*.06),
    black,interruption:interruption?.12:0,rally:reducedMotion?0:rally};
}
