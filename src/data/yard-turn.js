// The retained yard rooms keep their authored/logical addresses. Only their
// physical embedding turns: north-up, +X east and +Z south, 90 degrees CCW.
// Geometry, room cells, map, sound and review waypoints share these frames.
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const YARD_TURN_YAW=-Math.PI/2;
export const YARD_TURN_FRAMES=freeze({
  'yard-former-stables':{source:{x:36,z:18},target:{x:36,z:18},quarterTurns:-1},
  'yard-rehearsal-annex':{source:{x:39,z:34},target:{x:39,z:34},quarterTurns:-1},
  'yard-baths-plant':{source:{x:39,z:55},target:{x:38,z:55.5},quarterTurns:-1},
  'yard-covered-stores':{source:{x:40,z:77},target:{x:37.5,z:77},quarterTurns:-1},
});
export const yardTurnFrame=id=>YARD_TURN_FRAMES[id==='lyric'?'yard-rehearsal-annex':id]||null;
export function yardTurnPoint(id,point){
  const f=yardTurnFrame(id);if(!f)return{...point};
  const z=Number.isFinite(point.z)?point.z:point.y,dx=point.x-f.source.x,dz=z-f.source.z;
  const out={...point,x:f.target.x+dz,z:f.target.z-dx};
  if(Number.isFinite(point.y)&&!Number.isFinite(point.z))out.y=out.z;
  return out;
}
export function yardUnturnPoint(id,point){
  const f=yardTurnFrame(id);if(!f)return{...point};
  const z=Number.isFinite(point.z)?point.z:point.y,dx=point.x-f.target.x,dz=z-f.target.z;
  const out={...point,x:f.source.x-dz,z:f.source.z+dx};
  if(Number.isFinite(point.y)&&!Number.isFinite(point.z))out.y=out.z;
  return out;
}
export function yardTurnBounds(id,bounds){
  const z0=bounds.z0??bounds.y0,z1=bounds.z1??bounds.y1;
  const p=[[bounds.x0,z0],[bounds.x1,z0],[bounds.x1,z1],[bounds.x0,z1]].map(([x,z])=>yardTurnPoint(id,{x,z}));
  return{x0:Math.min(...p.map(p=>p.x)),x1:Math.max(...p.map(p=>p.x)),z0:Math.min(...p.map(p=>p.z)),z1:Math.max(...p.map(p=>p.z))};
}
export const YARD_TURN_REVIEW=freeze([
  {id:'lyric-front',at:{x:30.25,z:36.25},target:yardTurnPoint('lyric',{x:39,z:29.05,y:2.0})},
  {id:'cross-alley',at:{x:34.25,z:43.75},target:{x:45.25,y:1.55,z:43.75}},
  {id:'garden-spine',at:{x:45.25,z:46.25},target:{x:45.25,y:1.55,z:58}},
  {id:'stores-garden',at:{x:45.25,z:76.25},target:{x:45.25,y:1.55,z:83}},
  {id:'public-front',at:{x:79.25,z:-4.25},target:{x:79,y:5,z:3}},
  {id:'east-return',at:{x:132.25,z:28.25},target:{x:100,y:6,z:28}},
]);
export const YARD_TURN_REVIEW_PATH=freeze([
  {x:30.25,z:36.25},{x:30.25,z:43.75},{x:45.25,z:43.75},
  {x:45.25,z:13.25},{x:43.25,z:13.25},{x:43.25,z:-.25},
  {x:43.25,z:-4.25},{x:79.25,z:-4.25},{x:132.25,z:-4.25},
  {x:132.25,z:28.25},
]);
