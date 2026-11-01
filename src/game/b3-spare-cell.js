// The booth contains one modest spare for the existing torch reserve. The
// credit and the one-time flag travel together in a single save snapshot.
export const B3_SPARE_CELL_FLAG = 'b3.spare-cell';
export const B3_SPARE_CELL_CHARGE = .25;

export function takeB3SpareCell({save, recorder, commit}) {
  if (save?.flags?.[B3_SPARE_CELL_FLAG]) return 'taken-already';
  const battery = recorder.batteryLevel();
  if (!Number.isFinite(battery) || battery > recorder.BATTERY_MAX - B3_SPARE_CELL_CHARGE) return 'no-room';
  recorder.addBattery(B3_SPARE_CELL_CHARGE);
  commit({flags: {...(save?.flags || {}), [B3_SPARE_CELL_FLAG]: true}, rec: recorder.saveRecState()});
  return 'taken';
}
