import {chooseHorizonOccupant} from '../data/horizon-approach.js';

export const HORIZON_RECORD_FLAGS=Object.freeze({
  sarahRefusal:'horizon.sarah.refusalHeard',
  sarahBench:'horizon.sarah.benchHeard',
  sarahPage:'horizon.sarah.pageSeen',
  lyleCab:'horizon.lyle.cabTuneHeard',
  lyleWhole:'horizon.lyle.wholeBoxHeard',
  antOutcome:'horizon.ant.outcome',
});
export const HORIZON_SARAH_RULE=Object.freeze({PENDING:'pending',REFUSAL_AND_NO_CALL:'refusal-and-no-call'});

// Reading a save never invents a missing encounter. Existing saves without the
// new evidence still have the daisy, whose condition is completed at the object.
export function readHorizonApproachRecord(flags={}, {sarahRule=HORIZON_SARAH_RULE.REFUSAL_AND_NO_CALL}={}){
  const read=typeof flags==='function'?flags:key=>flags?.[key],yes=key=>read(key)===true,
    named=read('confession.kind')==='name'?read('confession.value'):null,
    sarahRefusal=yes(HORIZON_RECORD_FLAGS.sarahRefusal),benchQuestion=yes(HORIZON_RECORD_FLAGS.sarahBench),
    coast=yes('station.coast.complete'),broken=coast&&yes('station.coast.musicbox.heard')||yes(HORIZON_RECORD_FLAGS.lyleCab),
    whole=yes(HORIZON_RECORD_FLAGS.lyleWhole),arc=Number(read('last.arc'));
  return{
    confession:typeof named==='string'?named:null,
    arc:Number.isFinite(arc)?Math.max(0,Math.min(1,arc)):0,
    sarahPage:yes(HORIZON_RECORD_FLAGS.sarahPage),benchQuestion,
    sarahRespected:sarahRule===HORIZON_SARAH_RULE.REFUSAL_AND_NO_CALL
      &&(sarahRefusal||benchQuestion)&&!read('phone.called.sarah'),
    coast,lyleBox:broken?'broken':whole?'whole':null,
    antWatched:read(HORIZON_RECORD_FLAGS.antOutcome)==='gone',
  };
}
export function horizonApproachSelection(flags={},options={}){
  const record=readHorizonApproachRecord(flags,options);
  return{...chooseHorizonOccupant(record),record};
}
