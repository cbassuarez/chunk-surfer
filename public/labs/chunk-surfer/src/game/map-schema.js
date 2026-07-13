// Pure validation and normalization for authored/runtime map data.

const finite = (value) => Number.isFinite(Number(value));
const point = (value) => value && finite(value.x) && finite(value.y);

function uniqueIds(list, label, errors) {
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    if (!item?.id || typeof item.id !== 'string') {
      errors.push(`${label}: entry without a string id`);
      continue;
    }
    if (seen.has(item.id)) errors.push(`${label}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

export function validateBuildingMap(definition, { requiredRooms = [] } = {}) {
  const errors = [];
  const warnings = [];

  if (!definition || typeof definition !== 'object') {
    return { ok: false, errors: ['map definition is not an object'], warnings };
  }

  if (!Number.isInteger(definition.version) || definition.version < 1) {
    errors.push('map definition has no valid version');
  }

  const floorIds = uniqueIds(definition.floors, 'floor', errors);
  const targetIds = uniqueIds(definition.targets, 'target', errors);
  void targetIds;

  for (const floor of definition.floors || []) {
    if (!finite(floor.order)) errors.push(`${floor.id}: invalid floor order`);
    if (!String(floor.label || '').trim()) errors.push(`${floor.id}: missing label`);
    if (!(finite(floor.minHeight) || floor.minHeight === -Infinity)) errors.push(`${floor.id}: invalid minHeight`);
    if (!(finite(floor.maxHeight) || floor.maxHeight === Infinity)) errors.push(`${floor.id}: invalid maxHeight`);
    if (Number(floor.minHeight) >= Number(floor.maxHeight)) errors.push(`${floor.id}: floor band is empty`);
  }

  const rooms = new Set();
  for (const target of definition.targets || []) {
    if (!target.roomId || typeof target.roomId !== 'string') errors.push(`${target.id}: missing roomId`);
    else if (rooms.has(target.roomId)) errors.push(`${target.id}: duplicate room ${target.roomId}`);
    else rooms.add(target.roomId);
    if (!point(target.logical)) errors.push(`${target.id}: invalid logical anchor`);
  }

  for (const roomId of requiredRooms) {
    if (!rooms.has(roomId)) errors.push(`required target has no map entry: ${roomId}`);
  }

  if (!floorIds.size) errors.push('map definition contains no floors');
  if (!definition.targets?.length) warnings.push('map definition contains no targets');

  return { ok: errors.length === 0, errors, warnings };
}

export function validateMapSource(source) {
  const errors = [];
  const warnings = [];

  if (!source || typeof source !== 'object') return { ok: false, errors: ['map source missing'], warnings };
  const floorIds = uniqueIds(source.floors, 'runtime floor', errors);

  for (const floor of source.floors || []) {
    if (!(floor.open instanceof Set)) errors.push(`${floor.id}: topology.open must be a Set`);
    if (!floor.bounds || !finite(floor.bounds.minX) || !finite(floor.bounds.minY)
        || !finite(floor.bounds.maxX) || !finite(floor.bounds.maxY)) {
      errors.push(`${floor.id}: invalid bounds`);
    }
  }

  for (const target of source.targets || []) {
    if (!floorIds.has(target.floorId)) errors.push(`${target.id}: unknown floor ${target.floorId}`);
    if (!point(target.position)) errors.push(`${target.id}: invalid projected position`);
  }

  for (const connector of source.connectors || []) {
    if (!floorIds.has(connector.a?.floorId) || !floorIds.has(connector.b?.floorId)) {
      errors.push(`${connector.id}: connector references an unknown floor`);
    }
    if (!point(connector.a?.position) || !point(connector.b?.position)) {
      errors.push(`${connector.id}: connector has an invalid endpoint`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function assertMapSource(source) {
  const result = validateMapSource(source);
  if (!result.ok) throw new Error(`invalid map source:\n${result.errors.join('\n')}`);
  return source;
}
