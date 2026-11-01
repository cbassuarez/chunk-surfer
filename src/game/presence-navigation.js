// Collision-aware navigation for the ordinary building HUSH.
//
// This deliberately consumes the same floorplan queries as the player. A
// manifestation is only valid when it can stand there and a route through the
// currently open building exists. The HUSH may know a sound happened; it does
// not get permission to walk through the wall between itself and that sound.

const CARDINAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const keyFor = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
const cellPoint = (point) => ({ x: Math.floor(point.x), y: Math.floor(point.y) });
const finitePoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);

function minHeap() {
  const values = [];
  return {
    get size() { return values.length; },
    push(value) {
      values.push(value);
      let i = values.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (values[p].score <= value.score) break;
        values[i] = values[p]; i = p;
      }
      values[i] = value;
    },
    pop() {
      if (!values.length) return null;
      const first = values[0], last = values.pop();
      if (!values.length) return first;
      let i = 0;
      while (true) {
        const left = i * 2 + 1, right = left + 1;
        if (left >= values.length) break;
        let child = right < values.length && values[right].score < values[left].score ? right : left;
        if (values[child].score >= last.score) break;
        values[i] = values[child]; i = child;
      }
      values[i] = last;
      return first;
    },
  };
}

export function createPresenceNavigation({
  isSolid,
  canStep,
  canOccupy = () => true,
  connectorDestination = () => null,
  rebaseHeading = null,
  planSize = () => ({ w: 0, h: 0 }),
  keys = null,
  maxVisited = 24000,
} = {}) {
  let routeCache = new Map();

  function isWalkable(point) {
    if (!finitePoint(point)) return false;
    const { x, y } = cellPoint(point);
    const size = planSize?.() || {};
    if (x < 0 || y < 0 || x >= (size.w || 0) || y >= (size.h || 0)) return false;
    return !isSolid?.(x, y) && canOccupy?.(x, y) !== false;
  }

  function traverse(from, to) {
    if (!isWalkable(to)) return null;
    const result = canStep?.(from.x, from.y, to.x, to.y, { keys }) || { ok: false };
    if (!result.ok) return null;
    const redirect = result.redirect || connectorDestination?.(to.x, to.y);
    const destination = redirect && finitePoint(redirect) ? cellPoint(redirect) : cellPoint(to);
    return isWalkable(destination) ? destination : null;
  }

  function reconstruct(cameFrom, current) {
    const path = [current];
    let key = keyFor(current.x, current.y);
    while (cameFrom.has(key)) {
      const previous = cameFrom.get(key);
      path.push(previous);
      key = keyFor(previous.x, previous.y);
    }
    path.reverse();
    return path;
  }

  // A closed door may have a floor cell but no legal incoming step. Sound can
  // originate there even though no body can stand there. Do not treat a portal
  // with at least one legitimate incoming edge as blocked.
  function enterable(point) {
    return CARDINAL.some(([dx,dy]) => {
      const neighbor = {x:point.x+dx,y:point.y+dy};
      if (!isWalkable(neighbor)) return false;
      const into = traverse(neighbor,point);
      return into?.x===point.x && into?.y===point.y;
    });
  }

  function destinationCandidates(goal) {
    if (enterable(goal)) return {direct:true, points:[goal]};
    // A physical door can occupy a 2x2 grid footprint. Search only its local
    // perimeter; A* then selects a real reachable side from the sound-listener.
    const points=[];
    for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
      if ((!dx&&!dy)||Math.abs(dx)+Math.abs(dy)>2) continue;
      const point={x:goal.x+dx,y:goal.y+dy};
      if (isWalkable(point)&&enterable(point)) points.push(point);
    }
    return {direct:false, points};
  }

  function rememberRoute(key, path) {
    routeCache.set(key,{path,at:typeof performance!=='undefined'?performance.now():Date.now()});
    if (routeCache.size>64) routeCache.delete(routeCache.keys().next().value);
  }

  function findPath(fromPoint, toPoint) {
    if (!isWalkable(fromPoint)) return null;
    const start = cellPoint(fromPoint);
    const goal = nearestWalkable(toPoint, 6);
    if (!goal) return null;
    const candidates=destinationCandidates(goal);
    if (!candidates.points.length) return null;
    // Candidate identities in the key invalidate a cached closed-door approach
    // as soon as the nearby door or furniture geometry changes.
    const ids=candidates.points.map(point=>keyFor(point.x,point.y)).sort();
    const cacheKey = `${keyFor(start.x, start.y)}>${keyFor(goal.x, goal.y)}:${candidates.direct?'direct':ids.join(';')}`;
    const cached = routeCache.get(cacheKey),now=typeof performance!=='undefined'?performance.now():Date.now();
    if (cached?.path) return cached.path.map((point) => ({ ...point }));
    // An unrelated obstacle can change elsewhere, so a negative result is held
    // briefly rather than poisoning this route forever.
    if (cached && now-cached.at<1000) return null;
    const goalPenalty=new Map(candidates.points.map(point=>[keyFor(point.x,point.y),
      candidates.direct?0:2*(Math.abs(goal.x-point.x)+Math.abs(goal.y-point.y))]));
    // Prefer a point near the sound, but never send HUSH on a long detour to a
    // marginally closer opposite side of a closed leaf.
    const heuristic=(point)=>Math.min(...candidates.points.map(dest=>Math.abs(dest.x-point.x)+Math.abs(dest.y-point.y)+goalPenalty.get(keyFor(dest.x,dest.y))));

    const open = minHeap();
    const cameFrom = new Map();
    const best = new Map([[keyFor(start.x, start.y), 0]]);
    open.push({ ...start, cost: 0, score: heuristic(start) });
    let visited = 0,bestGoal=null,bestGoalCost=Infinity;
    while (open.size && visited++ < maxVisited) {
      const current = open.pop();
      const currentKey = keyFor(current.x, current.y);
      if (current.cost !== best.get(currentKey)) continue;
      if(current.score>=bestGoalCost)break;
      if (goalPenalty.has(currentKey)) {
        const cost=current.cost+goalPenalty.get(currentKey);
        if(cost<bestGoalCost){bestGoalCost=cost;bestGoal={x:current.x,y:current.y};}
      }
      for (const [dx, dy] of CARDINAL) {
        const stepped = traverse(current, { x: current.x + dx, y: current.y + dy });
        if (!stepped) continue;
        const nextKey = keyFor(stepped.x, stepped.y);
        const nextCost = current.cost + 1;
        if (nextCost >= (best.get(nextKey) ?? Infinity)) continue;
        best.set(nextKey, nextCost);
        cameFrom.set(nextKey, { x: current.x, y: current.y });
        open.push({
          ...stepped,
          cost: nextCost,
          score: nextCost + heuristic(stepped),
        });
      }
    }
    if(bestGoal){
      const path=reconstruct(cameFrom,bestGoal);rememberRoute(cacheKey,path);
      return path.map(point=>({...point}));
    }
    rememberRoute(cacheKey,null);
    return null;
  }

  // Only consult the pathfinder when the sound's floor cell cannot be entered.
  // The returned approach is based on the listener and geometry, never the
  // player's transform; a null result means the sound remains unreachable.
  function reachableSoundTarget(fromPoint, soundPoint) {
    const goal=nearestWalkable(soundPoint,6);
    if (!goal) return null;
    if (enterable(goal)) return goal;
    const path=findPath(fromPoint,goal);
    return path?.length ? {...path[path.length-1]} : null;
  }

  function nearestWalkable(point, radius = 8) {
    if (!finitePoint(point)) return null;
    const origin = cellPoint(point);
    if (isWalkable(origin)) return origin;
    for (let r = 1; r <= radius; r += 1) {
      for (let x = -r; x <= r; x += 1) {
        for (const y of [-r, r]) {
          const candidate = { x: origin.x + x, y: origin.y + y };
          if (isWalkable(candidate)) return candidate;
        }
      }
      for (let y = -r + 1; y < r; y += 1) {
        for (const x of [-r, r]) {
          const candidate = { x: origin.x + x, y: origin.y + y };
          if (isWalkable(candidate)) return candidate;
        }
      }
    }
    return null;
  }

  function resolveMove(fromPoint, targetPoint, maxDistance) {
    if (!finitePoint(fromPoint) || !finitePoint(targetPoint) || maxDistance <= 0) return { ...fromPoint };
    const path = findPath(fromPoint, targetPoint);
    if (!path?.length) return { ...fromPoint };
    const currentCell = cellPoint(fromPoint);
    // Once both points occupy the same cell, A* quite correctly returns only
    // that cell. Finish the sub-cell approach directly; otherwise the actor
    // stalls up to almost a full cell away from the sound it was following.
    if (path.length === 1) {
      if (Math.floor(targetPoint.x)!==currentCell.x||Math.floor(targetPoint.y)!==currentCell.y)
        return {...fromPoint};
      const dx = targetPoint.x - fromPoint.x, dy = targetPoint.y - fromPoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= maxDistance) return { x: targetPoint.x, y: targetPoint.y };
      return { x: fromPoint.x + dx / distance * maxDistance, y: fromPoint.y + dy / distance * maxDistance };
    }
    let index = path.findIndex((point) => point.x === currentCell.x && point.y === currentCell.y);
    if (index < 0) index = 0;
    const waypoint = path[Math.min(path.length - 1, index + 1)];
    const transitionValid = waypoint && CARDINAL.some(([dx, dy]) => {
      const stepped = traverse(currentCell, { x: currentCell.x + dx, y: currentCell.y + dy });
      return stepped?.x === waypoint.x && stepped?.y === waypoint.y;
    });
    if (!transitionValid) {
      routeCache = new Map();
      return { ...fromPoint };
    }
    const dx = waypoint.x - fromPoint.x, dy = waypoint.y - fromPoint.y;
    const distance = Math.hypot(dx, dy);
    // Connector endpoints are distant in logical atlas space but adjacent in
    // the physical building. Crossing one is the same discrete redirect used
    // by player movement; interpolating through the atlas gap would cut walls.
    if (Math.abs(waypoint.x - currentCell.x) + Math.abs(waypoint.y - currentCell.y) > 1) {
      return { x: waypoint.x, y: waypoint.y, redirect: true };
    }
    if (distance <= maxDistance) return { x: waypoint.x, y: waypoint.y };
    return { x: fromPoint.x + dx / distance * maxDistance, y: fromPoint.y + dy / distance * maxDistance };
  }

  function classifySector(player, point, forward) {
    const dx = point.x - player.x, dy = point.y - player.y;
    const distance = Math.max(.001, Math.hypot(dx, dy));
    const dot = (dx * forward.x + dy * forward.y) / distance;
    return dot > .38 ? 'front' : dot < -.38 ? 'rear' : 'side';
  }

  function sampleSpawn({
    player,
    forward = { x: 0, y: -1 },
    minDistance = 18,
    maxDistance = 46,
    random = Math.random,
    attempts = 72,
  } = {}) {
    if (!isWalkable(player)) return null;
    const fm = Math.hypot(forward.x, forward.y) || 1;
    const facing = { x: forward.x / fm, y: forward.y / fm };
    // Front and side manifestations are deliberately common. Rear remains
    // possible, but is no longer a privileged default or a camera trick.
    const sectorRoll = random();
    const preferred = sectorRoll < .38 ? 'front' : sectorRoll < .80 ? 'side' : 'rear';
    const base = Math.atan2(facing.y, facing.x);
    const sectorAngle = preferred === 'front'
      ? base + (random() - .5) * Math.PI * .72
      : preferred === 'rear'
        ? base + Math.PI + (random() - .5) * Math.PI * .72
        : base + (random() < .5 ? -1 : 1) * (Math.PI * (.42 + random() * .30));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const spread = attempt < 18 ? .32 : Math.PI;
      const angle = sectorAngle + (random() - .5) * spread;
      const distance = minDistance + random() * Math.max(1, maxDistance - minDistance);
      const candidate = nearestWalkable({
        x: player.x + Math.cos(angle) * distance,
        y: player.y + Math.sin(angle) * distance,
      }, attempt < 36 ? 3 : 8);
      if (!candidate) continue;
      const actualDistance = Math.hypot(candidate.x - player.x, candidate.y - player.y);
      if (actualDistance < minDistance * .72 || actualDistance > maxDistance * 1.22) continue;
      const path = findPath(candidate, player);
      if (!path || path.length < 2) continue;
      return { ...candidate, sector: classifySector(player, candidate, facing), pathLength: path.length - 1 };
    }
    return null;
  }

  return {
    isWalkable,
    nearestWalkable,
    reachableSoundTarget,
    findPath,
    resolveMove,
    rebaseHeading,
    sampleSpawn,
    clearCache() { routeCache = new Map(); },
  };
}
