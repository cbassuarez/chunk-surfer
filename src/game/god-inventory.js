// State-aware developer inventory. Each adapter writes through the same owner
// as the real case; no parallel has.<item> inventory or story-event replay.
import { FIELD_KIT_OPTIONS, fieldKitOptionAvailability, resolveFieldKit } from './field-kit.js';
import { BENCH_PACK_GROUPS, prepareWorkbenchFlags } from './bench-preparation.js';
import { mapAcquired } from './map-ownership.js';
import { godActionRow } from './god-menu-actions.js';

function cycle(values, current, delta) {
  if (!values.length) return undefined;
  let index = values.indexOf(current);
  if (index < 0 && typeof current === 'number') {
    index = values.reduce((best, value, at) => Math.abs(value - current) < Math.abs(values[best] - current) ? at : best, 0);
  }
  return values[(Math.max(0, index) + Math.sign(delta || 1) + values.length) % values.length];
}
const owned = value => value ? 'OWNED' : 'MISSING';

export function createGodInventory({
  getSave, commit, getMeta = () => null, recorder, plant, marble, radio, keys,
  sheets = [], forkFlag = 'source.fork', guard = () => '',
  location = () => null, onChange = () => {}, notify = () => {},
  clearLost = () => {},
}) {
  const entries = [];
  const flags = () => getSave().flags || {};
  const writeFlags = patch => commit({ flags: { ...flags(), ...patch } });
  const add = entry => { entries.push(entry); return entry; };
  const flag = (id, label, key, group = 'Tools and objects') => add({
    id, label, group, read: () => !!flags()[key], format: owned,
    write: value => { writeFlags({ [key]: !!value }); return true; },
  });
  const persist = (key, owner, save) => { commit({ [key]: owner[save]() }); return true; };
  const packed = group => !flags()['van.bench.v2'] || !!flags()['kit.fitted'] || !!flags()[`van.packed.${group}`];

  add({ id: 'field-case', label: 'FIELD CASE', group: 'Case and acquisition', read: () => !!flags()['bag.taken'], format: owned,
    write: value => { writeFlags({ 'bag.taken': !!value, 'kit.taken': !!value, ...(!value ? { 'kit.fitted': false } : {}) }); return true; } });
  add({ id: 'survey-indicator', label: 'SURVEY INDICATOR', group: 'Case and acquisition', read: () => mapAcquired(flags()), format: owned,
    write: value => { writeFlags({ 'map.taken': !!value, 'god.map-acquired': !!value }); return true; } });
  add({ id: 'kit-fitted', label: 'FIELD KIT / FITTED', group: 'Case and acquisition', read: () => !!flags()['kit.fitted'], format: value => value ? 'FITTED' : 'PACKING',
    write: value => {
      writeFlags(value ? { 'bag.taken': true, 'kit.taken': true, 'kit.fitted': true, 'van.bench.v2': true,
        ...Object.fromEntries(BENCH_PACK_GROUPS.map(group => [`van.packed.${group}`, true])) } : { 'kit.fitted': false });
      return true;
    } });
  for (const group of BENCH_PACK_GROUPS) {
    add({ id: `packed-${group}`, label: `PACKED ${group === 'recorder' ? 'AMPLIFIER' : group.toUpperCase()}`, group: 'Hardware packing', read: () => packed(group),
      format: value => value ? 'IN CASE' : 'ON BENCH', write: value => {
        const next = { ...prepareWorkbenchFlags(flags()), [`van.packed.${group}`]: !!value };
        if (value) { next['bag.taken'] = true; next['kit.taken'] = true; }
        else next['kit.fitted'] = false;
        commit({ flags: next }); return true;
      } });
  }
  for (const group of BENCH_PACK_GROUPS) {
    const options = FIELD_KIT_OPTIONS[group];
    add({ id: `kit-${group}`, label: `${group === 'recorder' ? 'RECORDER / AMP' : group.toUpperCase()} MODEL`, group: 'Hardware models',
      choices: () => options.map(option => option.id), read: () => resolveFieldKit(getSave().fieldKit, getMeta())[group],
      format: value => options.find(option => option.id === value)?.label || value,
      write: value => {
        if (!options.some(option => option.id === value)) return false;
        commit({ fieldKit: { ...resolveFieldKit(getSave().fieldKit, getMeta()), [group]: value } }); return true;
      } });
  }
  for (const [group, options] of Object.entries(FIELD_KIT_OPTIONS.cosmetics)) {
    add({ id: `kit-${group}`, label: `FINISH / ${group.toUpperCase()}`, group: 'Hardware appearance',
      choices: () => options.filter(option => fieldKitOptionAvailability(getSave().fieldKit, group, option.id, getMeta()).available).map(option => option.id),
      read: () => resolveFieldKit(getSave().fieldKit, getMeta()).cosmetics[group],
      format: value => options.find(option => option.id === value)?.label || value,
      write: value => {
        const kit = resolveFieldKit(getSave().fieldKit, getMeta());
        if (!fieldKitOptionAvailability(kit, group, value, getMeta()).available) return false;
        commit({ fieldKit: { ...kit, cosmetics: { ...kit.cosmetics, [group]: value } } }); return true;
      } });
  }
  flag('interface', 'BENT RIG INTERFACE', 'has.interface');
  add({ id: 'tuning-fork', label: 'TUNING FORK', group: 'Tools and objects', read: () => !!(flags()['has.fork'] || flags()[forkFlag]), format: owned,
    write: value => { writeFlags({ 'has.fork': !!value, [forkFlag]: !!value }); return true; } });
  add({ id: 'plant-spanner', label: 'ADJUSTABLE SPANNER', group: 'Tools and objects', read: () => plant.hasPlantSpanner(), format: owned,
    write: value => {
      if (!plant.debugSetPlantSpanner(value)) return false;
      commit({ plantIncident: plant.savePlantIncident(), flags: { ...flags(), 'van.spanner.taken': !!value } }); return true;
    } });
  add({ id: 'marble-eyes', label: 'MARBLE EYES / QUEST STATE', group: 'Tools and objects', choices: () => Object.values(marble.MARBLE_HEAD_PHASE),
    read: () => marble.marbleHeadState().phase, format: value => value.toUpperCase(), write: value => {
      if (!Object.values(marble.MARBLE_HEAD_PHASE).includes(value)) return false;
      marble.loadMarbleHead({ ...marble.saveMarbleHead(), phase: value, toldWhereTheKeyIs: value === marble.MARBLE_HEAD_PHASE.RETURNED });
      return persist('marbleHead', marble, 'saveMarbleHead');
    } });
  flag('film-badge', 'FILM BADGE', 'badge.taken');
  add({ id: 'master-key', label: 'MASTER KEY / DEBUG OVERRIDE', group: 'Access', read: () => keys.has('master'), format: owned,
    write: value => { value ? keys.add('master') : keys.delete('master'); writeFlags({ 'god.master-key': !!value }); return true; } });
  for (const [id, label, key, item, flag] of [
    ['chapel-key', 'CHAPEL KEY C-17', 'chapel', 'chapel_key', 'chapel.keyTaken'],
    ['services-key', 'SERVICES CORE KEY', 'services-core', 'services_core_key', 'key.servicesCore'],
    // Ren's reward, the caged service ladder off the roof. Owning it is the item
    // and the keyring and nothing else: the conversation that grants it belongs
    // to roofRen, and the ROOF tab sets that on its own row.
    ['ren-service-key', 'REN SERVICE KEY / ROOF LADDER', 'ren-service', 'ren-service-key', null],
  ]) add({ id, label, group: 'Access', read: () => keys.has(key), format: owned, write: value => {
    const items = new Set(getSave().items || []);
    if (value) { items.add(item); keys.add(key); } else { items.delete(item); keys.delete(key); }
    commit({ items: [...items], ...(flag ? { flags: { ...flags(), [flag]: !!value } } : {}) }); return true;
  } });
  flag('chapel-key-identified', 'C-17 / EXPLICIT IDENTIFICATION', 'chapel.keyIdentified', 'Access');
  flag('coffee-owned', 'COFFEE / OWNED', 'has.coffee', 'Consumables');
  // Consumed and owned are intentionally independent, as in the real bag.
  flag('coffee', 'COFFEE / CONSUMED', 'drank.coffee', 'Consumables');
  flag('cells', 'SPARE CELLS / ACQUIRED', 'rig.cells', 'Consumables');
  add({ id: 'battery', label: 'TORCH / FIELD CELL CHARGE', group: 'Consumables', choices: () => [0, .25, .5, 1, 1.5, 2],
    read: () => recorder.batteryLevel(), format: value => `${Math.round(value * 100)}%`, write: value => {
      if (!Number.isFinite(value) || value < 0 || value > 2) return false;
      recorder.addBattery(value - recorder.batteryLevel()); return persist('rec', recorder, 'saveRecState');
    } });
  for (const sheet of sheets) add({ id: `sheet-${sheet.id}`, label: sheet.title, group: 'Named sheet music', choices: () => ['uncollected', 'carried', 'spent'],
    read: () => recorder.carriedSheets().includes(sheet.id) ? 'carried' : recorder.sheetTaken(sheet.id) ? 'spent' : 'uncollected',
    format: value => value.toUpperCase(), write: value => recorder.debugSetSheet(sheet.id, value) && persist('rec', recorder, 'saveRecState') });
  add({ id: 'radio-phase', label: 'RADIO / OPERATING STATE', group: 'Radio', choices: () => Object.values(radio.RADIO_PHASE),
    read: () => radio.radioPhase(), format: value => value.toUpperCase(),
    write: value => radio.debugSetRadioPhase(value) && persist('radio', radio, 'saveRadioState') });
  add({ id: 'radio-deployed', label: 'RADIO / DEPLOYMENT', group: 'Radio', read: () => radio.isDropped(), format: value => value ? 'DEPLOYED' : 'CARRIED', write: value => {
    if (value === radio.isDropped()) return true;
    if (value) {
      const at = location();
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y) || at.unavailable) return false;
      if (!radio.dropRadio(at.x, at.y, { roomId: at.roomId, floorId: at.floorId })) return false;
    } else {
      const at = radio.radioLocation();
      if (!at || !radio.pickUpRadio(at.x, at.y, 0)) return false;
    }
    return persist('radio', radio, 'saveRadioState');
  } });

  const byId = new Map(entries.map(entry => [entry.id, entry]));
  function set(id, value) {
    const entry = byId.get(id), blocked = guard();
    if (!entry || blocked) { notify(blocked || `UNKNOWN ITEM: ${id}`); return false; }
    if (entry.choices && !entry.choices().includes(value)) { notify(`INVALID VALUE: ${entry.label}`); return false; }
    if (!entry.choices && typeof value !== 'boolean') { notify(`INVALID VALUE: ${entry.label}`); return false; }
    if (entry.write(value) !== true) { notify(`CANNOT CHANGE ${entry.label} IN THE CURRENT STATE`); return false; }
    onChange(id);
    notify(`${entry.label}: ${entry.format?.(entry.read()) ?? entry.read()}`);
    return true;
  }
  function fieldReady() {
    const blocked = guard();
    if (blocked) { notify(blocked); return false; }
    writeFlags({ 'bag.taken': true, 'kit.taken': true, 'map.taken': true, 'god.map-acquired': true,
      'kit.fitted': true, 'van.bench.v2': true,
      ...Object.fromEntries(BENCH_PACK_GROUPS.map(group => [`van.packed.${group}`, true])) });
    clearLost();
    if (radio.isDropped()) {
      const at = radio.radioLocation(); radio.pickUpRadio(at.x, at.y, 0);
      commit({ radio: radio.saveRadioState() });
    }
    recorder.addBattery(Math.max(0, 1 - recorder.batteryLevel()));
    commit({ rec: recorder.saveRecState() });
    onChange('field-ready'); notify('FIELD-READY KIT; QUESTS AND COFFEE UNCHANGED'); return true;
  }
  function rowFor(entry, rowId = entry.id) {
    return { id: rowId, label: entry.label, value: () => entry.format?.(entry.read()) ?? String(entry.read()),
      adjust: delta => set(entry.id, entry.choices ? cycle(entry.choices(), entry.read(), delta) : !entry.read()) };
  }
  function rows() {
    const result = [{ kind: 'section', label: 'Equipment presets' }, godActionRow({ id: 'field-ready', label: 'FIELD-READY KIT', value: '[GRANT]', activate: fieldReady })];
    let group;
    for (const entry of entries) {
      if (entry.group !== group) { group = entry.group; result.push({ kind: 'section', label: group }); }
      result.push(rowFor(entry));
    }
    return result;
  }
  // One entry's row, for a tab that wants it beside its own controls. It writes
  // through the same entry, so the two rows can never disagree. Row ids are
  // unique per tab, so another tab names its copy.
  function row(id, rowId = id) {
    const entry = byId.get(id);
    return entry ? rowFor(entry, rowId) : null;
  }
  return { entries, set, rows, row, fieldReady };
}
