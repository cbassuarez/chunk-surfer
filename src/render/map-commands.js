// Pure semantic render-command builders for MAP and minimap.

import { fitBounds, insideRect, clampMarkerToEdge, minimapTransform } from '../game/map-projection.js';
import { mapFloor, mapSpace, newestMapContact } from '../game/map-model.js';
import { selectedMapSpace } from '../game/map-navigation.js';

function connectorEndpoint(connector, floorId) {
  if (connector?.a?.floorId === floorId) return connector.a;
  if (connector?.b?.floorId === floorId) return connector.b;
  return null;
}

function objectiveTone(space) {
  if (space.objective?.recorded) return 'complete';
  if (space.waypoint) return 'active';
  if (space.current) return 'metadata';
  return 'normal';
}

export function buildMapCommands({ model, nav, layout, now = 0 } = {}) {
  const floor = mapFloor(model, nav?.floorId);
  if (!floor) return [];
  const transform = fitBounds(floor.bounds, layout.mapViewport, { padding: 0.8 });
  const selected = selectedMapSpace(nav, model);
  const commands = [];

  if (model.policy?.showMapTopology !== false) {
    commands.push({ kind: 'topology', floorId: floor.id, open: floor.open, runs: floor.runs || null, transform });
  }

  for (const door of model.doors || []) {
    if (door.floorId !== floor.id || !door.position) continue;
    commands.push({ kind: 'door', point: transform.point(door.position), state: door.state });
  }

  if (model.policy?.showRoute && model.route?.points?.length && model.player?.floorId === floor.id) {
    commands.push({ kind: 'route', points: model.route.points.map((point) => transform.point(point)), status: model.route.status });
  }

  for (const connector of model.connectors || []) {
    const endpoint = connectorEndpoint(connector, floor.id);
    if (!endpoint) continue;
    commands.push({ kind: 'connector', id: connector.id, point: transform.point(endpoint.position), selected: model.route?.nextConnectorId === connector.id });
  }

  for (const space of model.spaces || []) {
    if (space.floorId !== floor.id || !space.position) continue;
    const selectedHere = selected?.id === space.id;
    commands.push({
      kind: 'objective', id: space.id, roomId: space.roomId, point: transform.point(space.position),
      selected: selectedHere, current: !!space.current, waypoint: !!space.waypoint,
      recorded: !!space.objective?.recorded, tone: objectiveTone(space), unknown: !!space.unknown,
      sequence: space.objective?.sequence, label: space.label,
      // ALWAYS labelled. A marker whose name only appears once you have already
      // selected it cannot tell you that you could go there — which is the one
      // thing this screen is for. Unselected callouts are dimmed, not withheld.
      showLabel: true,
      dimLabel: !!space.unknown || !(selectedHere || space.current || space.waypoint || model.policy?.showAllTargetLabels),
    });
  }

  if (model.player?.resolved && model.player.floorId === floor.id && model.player.position && model.policy?.showExactPlayer !== false) {
    commands.push({ kind: 'player', point: transform.point(model.player.position), heading: model.player.heading || 0 });
  }

  if (model.waypoint && model.waypoint.floorId !== floor.id) {
    commands.push({ kind: 'floor-target', delta: model.route?.floorDelta || 0, status: model.route?.status || 'unresolved' });
  }

  const contact = newestMapContact(model);
  if (contact?.observation?.floorId === floor.id) {
    const observation = contact.observation;
    if (observation.position) {
      commands.push({ kind: 'anomaly-contact', id: contact.id, point: transform.point(observation.position), state: contact.state, confidence: observation.confidence, ageMs: Math.max(0, now - observation.observedAt), disturbance: contact.presentation?.disturbance || 0 });
    } else if (observation.region?.length) {
      commands.push({ kind: 'anomaly-region', id: contact.id, points: observation.region.map((point) => transform.point(point)), state: contact.state, confidence: observation.confidence, ageMs: Math.max(0, now - observation.observedAt) });
    } else if (observation.bearing) {
      commands.push({ kind: 'anomaly-bearing', id: contact.id, direction: observation.bearing, state: contact.state, ageMs: Math.max(0, now - observation.observedAt) });
    }
  } else if (contact?.observation?.floorId) {
    const from = model.floors.find((candidate) => candidate.id === floor.id);
    const to = model.floors.find((candidate) => candidate.id === contact.observation.floorId);
    commands.push({ kind: 'anomaly-floor', delta: from && to ? to.order - from.order : 0, state: contact.state, ageMs: Math.max(0, now - contact.observation.observedAt) });
  }

  return commands;
}

function localTopology(floor, transform, viewport, center, radius) {
  return { kind: 'local-topology', floorId: floor.id, open: floor.open, runs: floor.runs || null, transform, viewport, center, radius };
}

export function buildMinimapCommands({ model, viewport, radius = 18, now = 0, aspect = 1 } = {}) {
  if (!model?.player?.resolved || !model.player.position) return [{ kind: 'compass-fallback' }];
  const floor = mapFloor(model, model.player.floorId);
  if (!floor) return [{ kind: 'compass-fallback' }];
  const policy = model.policy || {};
  const heading = Number(model.player.heading) || 0;
  const transform = minimapTransform({ center: model.player.position, radius, viewport, heading, aspect });
  const commands = [];

  if (policy.minimapMode !== 'compass' && policy.showMapTopology !== false) {
    commands.push(localTopology(floor, transform, viewport, model.player.position, radius));
  }
  // What he can actually SEE, as a wedge the geometry cuts into. The old facing
  // hint was a 0.75-cell tick on the player dot, which told you which way you
  // were pointing and nothing about whether you could see anything that way —
  // and it happily pointed straight through a corner. This carries the same open
  // cells the topology layer draws, so the cone is masked by the real walls.
  if (policy.minimapMode !== 'compass' && policy.showMapTopology !== false) {
    commands.push({
      kind: 'sight',
      floorId: floor.id,
      origin: { ...model.player.position },
      heading: model.player.heading || 0,
      open: floor.open,
      runs: floor.runs || null,
      transform,
      viewport,
      radius,
    });
  }
  commands.push({ kind: 'player', point: transform.point(model.player.position), heading: model.player.heading || 0 });

  if (policy.showWaypoint !== false && model.waypoint) {
    if (model.waypoint.floorId === model.player.floorId && model.waypoint.position) {
      const raw = transform.point(model.waypoint.position);
      const inside = insideRect(raw, viewport, 0.7);
      commands.push({ kind: inside ? 'waypoint' : 'waypoint-edge', point: inside ? raw : clampMarkerToEdge(model.player.position, model.waypoint.position, viewport, 0.8, heading), floorDelta: 0 });
    } else {
      const target = model.route?.targetPosition;
      if (target && policy.showCrossFloorConnector) {
        const raw = transform.point(target);
        const inside = insideRect(raw, viewport, 0.7);
        commands.push({ kind: inside ? 'connector-target' : 'connector-edge', point: inside ? raw : clampMarkerToEdge(model.player.position, target, viewport, 0.8, heading), floorDelta: model.route?.floorDelta || 0 });
      } else {
        commands.push({ kind: 'floor-target', delta: model.route?.floorDelta || 0, status: model.route?.status || 'unresolved' });
      }
    }
  }

  const contact = newestMapContact(model);
  if (contact?.observation) {
    const observation = contact.observation;
    if (observation.floorId === model.player.floorId && observation.position) {
      const raw = transform.point(observation.position);
      const inside = insideRect(raw, viewport, 0.7);
      commands.push({
        kind: inside ? 'anomaly-contact' : 'anomaly-edge', id: contact.id,
        point: inside ? raw : clampMarkerToEdge(model.player.position, observation.position, viewport, 0.8),
        state: contact.state, confidence: observation.confidence,
        ageMs: Math.max(0, now - observation.observedAt), disturbance: contact.presentation?.disturbance || 0,
      });
    } else if (observation.floorId) {
      const here = model.floors.find((candidate) => candidate.id === model.player.floorId);
      const there = model.floors.find((candidate) => candidate.id === observation.floorId);
      commands.push({ kind: 'anomaly-floor', delta: here && there ? there.order - here.order : 0, state: contact.state, ageMs: Math.max(0, now - observation.observedAt) });
    }
  }

  // Playtesting requires an unambiguous body marker. Main supplies only this
  // sanitized position/floor pair; pathfinding and detection internals remain
  // outside the map model.
  if (model.hush?.active && model.hush.position) {
    if (model.hush.floorId === model.player.floorId) {
      const raw = transform.point(model.hush.position);
      const inside = insideRect(raw, viewport, 0.7);
      commands.push({
        kind: inside ? 'hush' : 'hush-edge',
        point: inside ? raw : clampMarkerToEdge(model.player.position, model.hush.position, viewport, 0.8),
      });
    } else if (model.hush.floorId) {
      const here = model.floors.find((candidate) => candidate.id === model.player.floorId);
      const there = model.floors.find((candidate) => candidate.id === model.hush.floorId);
      commands.push({ kind: 'hush-floor', delta: here && there ? there.order - here.order : 0 });
    }
  }

  return commands;
}

export function commandOf(commands, kind) { return (commands || []).find((command) => command.kind === kind) || null; }
export function selectedCommand(commands) { return (commands || []).find((command) => command.kind === 'objective' && command.selected) || null; }
export function objectiveCommand(commands, roomId) { return (commands || []).find((command) => command.kind === 'objective' && command.roomId === roomId) || null; }
