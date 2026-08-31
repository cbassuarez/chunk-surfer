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
    // The page frames the plan, and the ground floor has a road and a park
    // outside that frame. A player standing out there is still on this floor and
    // must still be findable: pin them to the edge they are past, the same way
    // an off-page target is pinned, rather than drawing them into the margin.
    const view = layout.mapViewport;
    const raw = transform.point(model.player.position);
    const inside = insideRect(raw, view, 0.5);
    const pinned = {
      x: Math.max(view.x + .5, Math.min(view.x + view.w - .5, raw.x)),
      y: Math.max(view.y + .5, Math.min(view.y + view.h - .5, raw.y)),
    };
    commands.push({ kind: 'player', point: inside ? raw : pinned, offPage: !inside, heading: model.player.heading || 0 });
  }

  if(model.hush?.active&&(model.hush.sensed===true||model.hush.visible===true)
      &&model.hush.visible===true&&model.hush.floorId===floor.id&&model.hush.position){
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

export function localTopologyCoverage(floor, center, radius = 18) {
  if (!(floor?.open instanceof Set) || !center) return 0;
  const reach = Math.max(1, Math.ceil(Number(radius) || 1));
  const x0 = Math.floor(Number(center.x) - reach);
  const x1 = Math.ceil(Number(center.x) + reach);
  const y0 = Math.floor(Number(center.y) - reach);
  const y1 = Math.ceil(Number(center.y) + reach);
  let open = 0;
  const total = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (Array.isArray(floor.runs)) {
    for (const run of floor.runs) {
      if (run.y < y0 || run.y > y1 || run.x1 < x0 || run.x0 > x1) continue;
      open += Math.max(0, Math.min(x1, run.x1) - Math.max(x0, run.x0) + 1);
    }
  } else {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (floor.open.has(`${x},${y}`)) open += 1;
      }
    }
  }
  return total ? open / total : 0;
}

function localTopology(floor, transform, viewport, center, radius) {
  const coverage = localTopologyCoverage(floor, center, radius);
  return {
    kind: 'local-topology', floorId: floor.id, open: floor.open, runs: floor.runs || null,
    transform, viewport, center, radius, coverage,
    // A broad exterior or hall can be walkable across the entire instrument.
    // Filling every sampled cell then produces one featureless square. Keep the
    // exposed boundary hairlines and sight fan, but omit that meaningless fill.
    fillOpen: coverage < 0.94,
  };
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
  if(model.hush?.active&&(model.hush.sensed===true||model.hush.visible===true)
      &&perception?.mode&&perception.mode!=='none'){
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
        corrupted:!!model.waypoint.corrupted,glitchPhase:Number(model.waypoint.glitchPhase)||0,
        suppressExactDistance:!!model.waypoint.suppressExactDistance,
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
          corrupted:!!model.waypoint.corrupted,glitchPhase:Number(model.waypoint.glitchPhase)||0,
          suppressExactDistance:!!model.waypoint.suppressExactDistance,
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
