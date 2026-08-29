// Fireballs replace the old modal "window channel". The immutable plan owns
// geometry only; the independent click/RETURN clock lives in
// fireball-exchange.js and never pauses or borrows an ordinary combat turn.

export const FIREBALL_BATTLE_IDS = Object.freeze([
  'natatorium', 'hall', 'practice', 'chapel', 'source-final',
]);

// HOW MANY COME AT ONCE.
//
// The authored escalation is intentionally uneven: the first three encounters
// teach one, then two, then three independent targets; Chapel reaches four;
// Source starts at two and becomes the only three-movement 2/3/4 sequence.
const CAST_COUNTS = Object.freeze({
  natatorium:Object.freeze({ room:1, voice:2, hold:3 }),
  hall:Object.freeze({ seated:1, attention:2, applause:3 }),
  practice:Object.freeze({ instrument:1, player:2, score:3 }),
  chapel:Object.freeze({ room:1, recordist:2, surfer:2, contract:3, source:4 }),
  'source-final':Object.freeze({ 'call-site':2, 'borrowed-body':3, 'final-clause':4 }),
});

// THE ONE MOVEMENT WHERE THEY ARRIVE TOGETHER.
//
// Every other cast is a phrase -- the comets leave a beat apart and can be
// answered in the order they were thrown. The last movement of each fight
// throws the whole volley on one frame, which is the only time the player is
// supposed to be unable to take them one at a time.
const VOLLEY_MOVEMENTS = Object.freeze({
  natatorium:'hold', hall:'applause', practice:'score',
  chapel:'source', 'source-final':'final-clause',
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export function canonicalFireballBattleId(value = '') {
  const id = String(value || '').toLowerCase();
  if (id === 'source' || id === 'source-final') return 'source-final';
  return FIREBALL_BATTLE_IDS.includes(id) ? id : null;
}

function hashString(value = '') {
  let hash = 0x811c9dc5;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

// Project an infinite ray from a point inside the normalized game rectangle to
// its first edge, then continue it beyond that edge. The external window uses
// this same line, so the comet does not change direction at the game bezel.
export function projectFireballRay({ origin = { x:.5, y:.28 }, direction = { x:1, y:0 }, beyond = .42 } = {}) {
  const ox=clamp(origin.x,0,1),oy=clamp(origin.y,0,1);
  let dx=Number(direction.x)||0,dy=Number(direction.y)||0;
  const length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
  const times=[];
  if(dx>.0001)times.push((1-ox)/dx);else if(dx<-.0001)times.push((0-ox)/dx);
  if(dy>.0001)times.push((1-oy)/dy);else if(dy<-.0001)times.push((0-oy)/dy);
  const edgeTime=Math.min(...times.filter((value)=>value>=0));
  const exit={x:clamp(ox+dx*edgeTime,0,1),y:clamp(oy+dy*edgeTime,0,1)};
  return Object.freeze({
    origin:Object.freeze({x:ox,y:oy}),
    direction:Object.freeze({x:dx,y:dy}),
    exit:Object.freeze(exit),
    beyond:Object.freeze({x:exit.x+dx*beyond,y:exit.y+dy*beyond}),
  });
}

export function fireballRayPoint(ray,{state='outbound',progress=0}={}){
  const reversed=state==='reversed';
  const from=reversed?ray?.exit:ray?.origin;
  const to=reversed?ray?.origin:ray?.exit;
  const travel=clamp(progress,0,1);
  return Object.freeze({
    x:Number(from?.x||0)+(Number(to?.x||0)-Number(from?.x||0))*travel,
    y:Number(from?.y||0)+(Number(to?.y||0)-Number(from?.y||0))*travel,
  });
}

function authoredCount(battleId, movementId, movementIndex) {
  const table=CAST_COUNTS[battleId]||{};
  const direct=Number(table[String(movementId||'')]);
  if(Number.isInteger(direct))return direct;
  const sequence=Object.values(table);
  return sequence[Math.max(0,Math.floor(Number(movementIndex)||0))]||sequence.at(-1)||1;
}

// The whole window, for anything that never says otherwise.
const FULL_FRAME=Object.freeze({x:0,y:0,w:1,h:1});
function normalizedStage(stage){
  const w=Number(stage?.w),h=Number(stage?.h);
  if(!(w>0&&w<=1)||!(h>0&&h<=1))return FULL_FRAME;
  return Object.freeze({
    x:clamp(stage.x,0,1),y:clamp(stage.y,0,1),
    w:clamp(w,.02,1),h:clamp(h,.02,1),
  });
}

export function compileFireballCastPlan({
  battleId='',movementId='',movementIndex=0,movementTitle='',
  castSequence=0,reducedMotion=false,stage=null,
}={}){
  const canonical=canonicalFireballBattleId(battleId);
  if(!canonical)return null;
  const rayCount=Math.max(1,Math.min(4,authoredCount(canonical,movementId,movementIndex)));
  const seed=parseInt(hashString(`${canonical}:${movementId}:${castSequence}`),16)>>>0;
  // Thrown from the middle of the stage, where the Surfer is, not from the top
  // of it. At .25 every comet crossed the band through the caption and the
  // house list -- reading as an overlay on the text rather than as something
  // travelling through the room the fight is in.
  const origin={x:.50+(((seed>>>4)%9)-4)*.008,y:.46+((seed>>>9)%5)*.018};
  const rays=[];
  for(let index=0;index<rayCount;index+=1){
    const side=index%2===0?1:-1;
    const rank=Math.floor(index/2);
    const angle=(side>0?-.23:Math.PI+.23)+side*rank*.22+(((seed>>>(index+1))&3)-1.5)*.025;
    const projected=projectFireballRay({origin,direction:{x:Math.cos(angle),y:Math.sin(angle)},beyond:reducedMotion?.24:.42});
    rays.push(Object.freeze({id:`ray-${index+1}`,...projected,surfaceIndex:index,directionSign:1}));
  }
  const castId=`fireball:${canonical}:${String(movementId||movementIndex)}:${Math.max(0,Math.floor(Number(castSequence)||0))}:${hashString(`${movementId}:${castSequence}`).slice(0,6)}`;
  return Object.freeze({
    schema:2,kind:'fireball-cast',castId,battleId:canonical,
    movementId:String(movementId||''),movementIndex:Math.max(0,Math.floor(Number(movementIndex)||0)),
    movementTitle:String(movementTitle||'').slice(0,64),source:'ranged',
    state:'outbound',rayCount,rays:Object.freeze(rays),
    // WHICH RECTANGLE THE RAY WAS MEASURED IN.
    //
    // Every coordinate above is a fraction of the battle's stage band, which is
    // a strip in the middle of the combat panel and emphatically not the game
    // window. Anything placing something outside the window against these
    // numbers -- the native cast surfaces do exactly that -- needs the mapping
    // or it aims at a rectangle the comet never crossed.
    stage:normalizedStage(stage),
    volley:VOLLEY_MOVEMENTS[canonical]===String(movementId||''),
    reducedMotion:!!reducedMotion,travelSeconds:2.2,damage:null,
  });
}

export function advanceFireballCastPlan(plan,{state='impact',damage=null}={}){
  if(!validateFireballCastPlan(plan))return null;
  const nextState=['deflected','reversed','impact'].includes(state)?state:'impact';
  const integerDamage=Number.isFinite(Number(damage))?Math.max(0,Math.floor(Number(damage))):null;
  return Object.freeze({
    ...plan,state:nextState,damage:integerDamage,
    rays:Object.freeze(plan.rays.map((ray)=>Object.freeze({...ray,directionSign:nextState==='reversed'?-1:1}))),
  });
}

export function validateFireballCastPlan(value){
  return !!value&&value.schema===2&&value.kind==='fireball-cast'
    &&value.source==='ranged'
    &&FIREBALL_BATTLE_IDS.includes(value.battleId)
    &&typeof value.castId==='string'&&value.castId.startsWith('fireball:')
    &&['outbound','deflected','reversed','impact'].includes(value.state)
    &&Number.isInteger(value.rayCount)&&value.rayCount>=1&&value.rayCount<=4
    &&Array.isArray(value.rays)&&value.rays.length===value.rayCount
    &&value.rays.every((ray)=>['origin','exit','beyond','direction'].every((field)=>(
      Number.isFinite(ray[field]?.x)&&Number.isFinite(ray[field]?.y)
    )));
}

export function movementFireballProfile({battleId='',movementId='',movementIndex=0}={}){
  const canonical=canonicalFireballBattleId(battleId);
  if(!canonical)return null;
  return Object.freeze({schema:2,kind:'fireball-profile',battleId:canonical,movementId:String(movementId||''),movementIndex:Math.max(0,Math.floor(Number(movementIndex)||0)),rayCount:authoredCount(canonical,movementId,movementIndex)});
}

// Old saves may still contain windowChannel continuation data. It is accepted
// as a migration input only and never resumes presentation or reducer state.
export function freshWindowChannelProgress(battleId=''){return{battleId:canonicalFireballBattleId(battleId),ignored:true};}
