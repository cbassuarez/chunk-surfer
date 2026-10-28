// Physical damage belongs to one existing interval of the continuous tape.
// It changes the readability of that material, never its identity or timing.
export const CHAPEL_DAMAGE_ROOMS=Object.freeze(['main_b3','the_tub','amplifications','soundnoisemusic']);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const short=value=>typeof value==='string'&&value.length>0&&value.length<=160;
const hash=text=>{let h=2166136261;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const interval=take=>{
  const from=take?.startSeconds,to=take?.endSeconds;
  return finite(from)&&finite(to)&&from>=0&&to>from?{from,to}:null;
};
export function normalizeTapeDamage(raw,take){
  const span=interval(take);
  if(!span||raw?.schema!==1||!short(raw.id)||raw.cause!=='chapel-spill'
    ||raw.takeId!==take.id||raw.roomId!==take.roomId
    ||!finite(raw.fromSeconds)||!finite(raw.toSeconds)
    ||Math.abs(raw.fromSeconds-span.from)>.001||Math.abs(raw.toSeconds-span.to)>.001)return null;
  return{schema:1,id:raw.id,cause:'chapel-spill',takeId:take.id,roomId:take.roomId,
    fromSeconds:span.from,toSeconds:span.to,seed:hash(`${raw.id}:${take.id}:${take.roomId}`)};
}
export function makeTapeDamage(take,{damageId,cause='chapel-spill'}={}){
  const span=interval(take);if(!span)return null;
  return normalizeTapeDamage({schema:1,id:damageId,cause,takeId:take.id,roomId:take.roomId,fromSeconds:span.from,toSeconds:span.to},take);
}
export function takeHasUsableWork(take){
  return!!take&&take.status==='accepted'&&take.sealed!==false&&take.counted!==false&&!take.voided&&!normalizeTapeDamage(take.damage,take);
}
export function selectChapelDamageTarget(takes,{rooms=CHAPEL_DAMAGE_ROOMS}={}){
  const allowed=new Set(Array.isArray(rooms)?rooms:CHAPEL_DAMAGE_ROOMS);
  const eligible=(Array.isArray(takes)?takes:[]).filter(take=>allowed.has(take?.roomId)&&CHAPEL_DAMAGE_ROOMS.includes(take.roomId)
    &&short(take.id)&&interval(take)&&takeHasUsableWork(take)&&!take.continuous&&!take.authored&&!take.debug);
  const count=new Map();for(const take of eligible)count.set(take.roomId,(count.get(take.roomId)||0)+1);
  eligible.sort((a,b)=>(count.get(a.roomId)>1)-(count.get(b.roomId)>1)||(b.startSeconds-a.startSeconds)||(Number(b.ordinal)-Number(a.ordinal))||a.id.localeCompare(b.id));
  const take=eligible[0];return take?{takeId:take.id,roomId:take.roomId,ordinal:Number(take.ordinal)||0,startSeconds:take.startSeconds,endSeconds:take.endSeconds}:null;
}
// Short ramps separate deliberate dropouts from unscheduled clicks. The same
// damage ID yields the same audible gaps after replay and save/reload.
export function tapeDamageEnvelope(take){
  const damage=normalizeTapeDamage(take?.damage,take);if(!damage)return[];
  const duration=Math.max(.01,take.endSeconds-take.startSeconds),points=[{at:0,gain:1}];
  const period=3.1+(damage.seed%11)/20,step=Math.max(period,duration/120);
  for(let start=Math.min(1.15,duration*.14),index=0;start<duration-.08;start+=step,index++){
    const length=Math.min(step*(.40+((damage.seed+index*7)%13)/40),duration-start-.02);
    if(length<=.025)break;
    const low=(index%3===0)?.001:.025,returned=.38+((damage.seed+index)%9)/25;
    points.push({at:start,gain:index===0?1:returned},{at:start+.014,gain:low},
      {at:start+length,gain:low},{at:Math.min(duration,start+length+.018),gain:returned});
  }
  points.push({at:duration,gain:0});return points;
}
export function tapeDamageGainAt(take,seconds){
  const points=tapeDamageEnvelope(take);if(!points.length)return 1;
  const at=Math.max(0,Number(seconds)||0);
  for(let index=1;index<points.length;index++)if(at<=points[index].at){
    const a=points[index-1],b=points[index],p=(at-a.at)/Math.max(.000001,b.at-a.at);return a.gain+(b.gain-a.gain)*Math.max(0,Math.min(1,p));
  }
  return points.at(-1).gain;
}
