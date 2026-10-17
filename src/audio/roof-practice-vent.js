// A short, ordinary practice phrase heard through the roof's school vent.
// The fifth key is wrong, followed by a breath and a restart. It belongs to
// the player pressing on the grille; there is no supernatural loop or quest
// signal. All voices route through the world's SFX bus.
export const ROOF_PRACTICE_NOTES=Object.freeze([
  [261.63,0.00],[293.66,0.27],[329.63,0.53],[392.00,0.82],
  [369.99,1.11],[392.00,1.38],[261.63,2.14],[293.66,2.41],
  [329.63,2.69],
]);

export function playRoofPracticeVent(context,destination){
  if(!context||!destination||typeof context.createOscillator!=='function')return false;
  const start=context.currentTime+.035;
  const vent=context.createBiquadFilter();
  vent.type='lowpass';vent.frequency.setValueAtTime(720,start);vent.Q.value=.24;
  const room=context.createGain();room.gain.setValueAtTime(.26,start);
  vent.connect(room);room.connect(destination);
  let sounding=ROOF_PRACTICE_NOTES.length*3;
  for(const [frequency,offset] of ROOF_PRACTICE_NOTES){
    const when=start+offset;
    // Three inharmonic partials give a struck-string attack after the vent
    // removes most top end. The miss is a semitone low, never a horror sting.
    for(const [multiple,weight] of [[1,1],[2.01,.22],[3.03,.08]]){
      const oscillator=context.createOscillator(),envelope=context.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency*multiple,when);
      envelope.gain.setValueAtTime(.0001,when);
      envelope.gain.exponentialRampToValueAtTime(.15*weight,when+.012);
      envelope.gain.exponentialRampToValueAtTime(.0001,when+.61);
      oscillator.connect(envelope);envelope.connect(vent);
      oscillator.start(when);oscillator.stop(when+.64);
      oscillator.onended=()=>{
        oscillator.disconnect();envelope.disconnect();
        if(--sounding===0){vent.disconnect();room.disconnect();}
      };
    }
  }
  const finish=start+3.5;
  room.gain.setValueAtTime(.26,start+3.02);
  room.gain.linearRampToValueAtTime(0,finish);
  return true;
}
