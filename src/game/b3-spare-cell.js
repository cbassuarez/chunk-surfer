import {BAG_SUPPLIES,BAG_SUPPLY_IDS,takeBagSupply} from './bag-supplies.js';
// Keep the established pickup entry point and cache receipt. Taking a spare is
// now a custody change; fitting it is a separate explicit bag operation.
export const B3_SPARE_CELL_FLAG=BAG_SUPPLIES[BAG_SUPPLY_IDS.B3].cacheFlag;
export const B3_SPARE_CELL_CHARGE=BAG_SUPPLIES[BAG_SUPPLY_IDS.B3].charge;
export function takeB3SpareCell({save,recorder,commit}){
  const result=takeBagSupply(save,BAG_SUPPLY_IDS.B3);
  if(!result.changed)return result.reason;
  commit({...result.patch,...(recorder?.saveRecState?{rec:recorder.saveRecState()}:{})});
  return 'taken';
}
