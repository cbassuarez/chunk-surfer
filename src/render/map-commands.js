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

function edgeDirection(raw,viewport){
  const cx=viewport.x+viewport.w/2,cy=viewport.y+viewport.h/2;
  const dx=Number(raw?.x||0)-cx,dy=Number(raw?.y||0)-cy;
  return Math.abs(dx)>=Math.abs(dy)?(dx>=0?'→':'←'):(dy>=0?'↓':'↑');
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
      // The five issued job rooms stay labelled on the drawing. The synchronized
      // room list carries every other plan name without printing forty labels on
      // top of the topology; selected/current/marked spaces still call out here.
      showLabel: !!space.objective || selectedHere || !!space.current || !!space.waypoint,
      dimLabel: !!space.unknown || !(selectedHere || space.current || space.waypoint || model.policy?.showAllTargetLabels),
    });
  }

  for(const marker of model.equipmentMarkers||[]){
    if(marker.floorId!==floor.id||!marker.position)continue;
    commands.push({kind:'equipment',id:marker.id,label:marker.label,point:transform.point(marker.position),carrierOpen:!!marker.carrierOpen});
  }

  if (model.player?.resolved && model.player.floorId === floor.id && model.player.position && model.policy?.showExactPlayer !== false) {
    commands.push({ kind: 'player', point: transform.point(model.player.position), heading: model.player.heading || 0 });
  }

  if(model.hush?.active&&model.hush.visible===true&&model.hush.floorId===floor.id&&model.hush.position){
    commands.push({kind:'hush-visible',point:transform.point(model.hush.position)});
  }

  if (model.waypoint && model.waypoint.floorId !== floor.id) {
    commands.push({ kind: 'floor-target', delta: model.route?.floorDelta || 0, status: model.route?.status || 'unresolved' });
  }

  const contact = newestMapContact(model);
  if (contact?.observation?.floorId === floor.id) {
    const observation = contact.observation;
    if (observation.position) {
      // Point telemetry is not a reciprocal body tracker. Direct visibility is
      // drawn from model.hush above; an unseen point remains status text only.
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
      visibilityOpen: floor.visibilityOpen || null,
      visibilityScale: floor.visibilityScale || model.topologyStride || 1,
      doors: (model.doors || []).filter((door) => door.floorId === floor.id),
      occluders: Array.isArray(model.visibilityOccluders) ? model.visibilityOccluders : [],
      transform,
      viewport,
      radius,
    });
  }

  if(policy.showRoute&&model.route?.points?.length){
    commands.push({kind:'route-local',points:model.route.points.map((point)=>transform.point(point)),status:model.route.status,viewport});
  }

  for(const door of model.doors||[]){
    if(door.floorId!==floor.id||!door.position)continue;
    const point=transform.point(door.position);
    if(insideRect(point,viewport,.1))commands.push({kind:'door-local',id:door.id,point,state:door.state});
  }

  for(const connector of model.connectors||[]){
    const endpoint=connectorEndpoint(connector,floor.id);
    if(!endpoint?.position)continue;
    const point=transform.point(endpoint.position);
    if(insideRect(point,viewport,.2))commands.push({kind:'connector-local',id:connector.id,point,selected:model.route?.nextConnectorId===connector.id});
  }

  const playerPoint=transform.point(model.player.position);
  const perception=model.hush?.perception;
  if(model.hush?.active&&perception?.mode&&perception.mode!=='none'){
    commands.push({kind:'hush-awareness',point:playerPoint,mode:perception.mode,label:perception.label,detail:perception.detail});
  }
  commands.push({ kind: 'player', point: playerPoint, heading: model.player.heading || 0 });

  for(const marker of model.equipmentMarkers||[]){
    if(marker.floorId!==floor.id||!marker.position)continue;
    const raw=transform.point(marker.position),inside=insideRect(raw,viewport,.7);
    commands.push({kind:inside?'equipment':'equipment-edge',id:marker.id,label:marker.label,
      point:inside?raw:clampMarkerToEdge(model.player.position,marker.position,viewport,.8,heading),carrierOpen:!!marker.carrierOpen});
  }

  // Exact position is permitted only for a manifestation the player can see
  // right now. Losing sight removes the marker on the next model update.
  if (model.hush?.active && model.hush.visible === true
      && model.hush.floorId === model.player.floorId && model.hush.position) {
    const raw = transform.point(model.hush.position);
    const inside = insideRect(raw, viewport, 0.7);
    commands.push({
      kind: inside ? 'hush-visible' : 'hush-visible-edge',
      point: inside ? raw : clampMarkerToEdge(model.player.position, model.hush.position, viewport, 0.8, heading),
      edgeDirection:inside?'':edgeDirection(raw,viewport),
    });
  }

  if (policy.showWaypoint !== false && model.waypoint) {
    if (model.waypoint.floorId === model.player.floorId && model.waypoint.position) {
      const raw = transform.point(model.waypoint.position);
      const inside = insideRect(raw, viewport, 0.7);
      commands.push({
        kind: inside ? 'waypoint' : 'waypoint-edge',
        point: inside ? raw : clampMarkerToEdge(model.player.position, model.waypoint.position, viewport, 0.8, heading),
        edgeDirection:inside?'':edgeDirection(raw,viewport),
        floorDelta:0,label:model.waypoint.label||null,playerSelected:!!model.waypoint.playerSelected,
        distanceM:Math.hypot(model.waypoint.position.x-model.player.position.x,model.waypoint.position.y-model.player.position.y),
      });
    } else {
      const target = model.route?.targetPosition;
      if (target && policy.showCrossFloorConnector) {
        const raw = transform.point(target);
        const inside = insideRect(raw, viewport, 0.7);
        commands.push({
          kind: inside ? 'connector-target' : 'connector-edge',
          point: inside ? raw : clampMarkerToEdge(model.player.position, target, viewport, 0.8, heading),
          edgeDirection:inside?'':edgeDirection(raw,viewport),
          floorDelta:model.route?.floorDelta||0,label:model.waypoint.label||null,playerSelected:!!model.waypoint.playerSelected,
          distanceM:Math.hypot(target.x-model.player.position.x,target.y-model.player.position.y),
        });
      } else {
        commands.push({ kind: 'floor-target', delta: model.route?.floorDelta || 0, status: model.route?.status || 'unresolved' });
      }
    }
  }

  const contact = newestMapContact(model);
  if (contact?.observation) {
    const observation = contact.observation;
    if (observation.floorId === model.player.floorId && observation.position) {
      // See the direct-visibility HUSH command below. Acoustic point telemetry
      // never supplies a second exact marker.
    } else if (observation.floorId) {
      const here = model.floors.find((candidate) => candidate.id === model.player.floorId);
      const there = model.floors.find((candidate) => candidate.id === observation.floorId);
      commands.push({ kind: 'anomaly-floor', delta: here && there ? there.order - here.order : 0, state: contact.state, ageMs: Math.max(0, now - observation.observedAt) });
    }
  }

  // Unseen HUSH knowledge is still confirmed by the status line rather than a
  // body, bearing, radius, or floor marker. Only direct visual confirmation may
  // produce the short-lived body command above.

  return commands;
}

export function commandOf(commands, kind) { return (commands || []).find((command) => command.kind === kind) || null; }
export function selectedCommand(commands) { return (commands || []).find((command) => command.kind === 'objective' && command.selected) || null; }
export function objectiveCommand(commands, roomId) { return (commands || []).find((command) => command.kind === 'objective' && command.roomId === roomId) || null; }
