// One reactive fault field, bound to Source II's existing closing passage.
// The saved closure owns its state, movement, collision and recovery. This
// helper derives presentation/charge from that same body without another clock.
export const SOURCE_CHUNK_FAULT = Object.freeze({
  approachRadius:6,touchRadius:.65,chargeBoost:5,
  minY:8.4,maxY:11.4,minZ:-14,maxZ:-10,rows:3,columns:4,
});
const unit=n=>Math.max(0,Math.min(1,Number(n)||0));
const finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
const activeMode=mode=>['primed','warning','closing'].includes(mode);

export function sourceChunkFaultResponse(state={}){
  const c=state.closure||{},frontX=finite(c.frontX,16.5);
  if(!activeMode(c.mode)||state.phase!=='wrong-return'||(state.chartId??0)!==0
    ||finite(state.feet)+1.9<=SOURCE_CHUNK_FAULT.minY||finite(state.feet)>=SOURCE_CHUNK_FAULT.maxY)
    return{amount:0,touching:false,distance:Infinity};
  const dz=Math.max(SOURCE_CHUNK_FAULT.minZ-finite(state.z),0,finite(state.z)-SOURCE_CHUNK_FAULT.maxZ),
    distance=Math.hypot(finite(state.x)-frontX,dz),
    t=unit((SOURCE_CHUNK_FAULT.approachRadius-distance)/(SOURCE_CHUNK_FAULT.approachRadius-SOURCE_CHUNK_FAULT.touchRadius));
  return{amount:t*t*(3-2*t),touching:distance<=SOURCE_CHUNK_FAULT.touchRadius,distance};
}

export function sourceChunkFaultFrame(state={}, {reducedMotion=false}={}){
  const c=state.closure||{},active=activeMode(c.mode)&&state.status!=='completed',response=sourceChunkFaultResponse(state),
    frontX=finite(c.frontX,16.5),pieces=[];
  if(active){
    const height=(SOURCE_CHUNK_FAULT.maxY-SOURCE_CHUNK_FAULT.minY)/SOURCE_CHUNK_FAULT.rows,
      width=(SOURCE_CHUNK_FAULT.maxZ-SOURCE_CHUNK_FAULT.minZ)/SOURCE_CHUNK_FAULT.columns,
      // Held angular splits, driven by the approaching body rather than time.
      split=reducedMotion?0:Math.floor(response.amount*4);
    for(let row=0;row<SOURCE_CHUNK_FAULT.rows;row++)for(let column=0;column<SOURCE_CHUNK_FAULT.columns;column++)for(const side of[-1,1]){
      const index=row*SOURCE_CHUNK_FAULT.columns+column,
        tear=reducedMotion?0:((index+split)%3-1)*.018*response.amount;
      pieces.push({id:`source-ii-chunk-fault:${row}:${column}:${side}`,palette:index%4,
        x:frontX+side*(.155+Math.abs(tear)),y:SOURCE_CHUNK_FAULT.minY+(row+.5)*height,
        z:SOURCE_CHUNK_FAULT.minZ+(column+.5)*width+tear,
        sx:.05,sy:height-.065,sz:width-.065,chartId:0,region:'wrong-return'});
    }
  }
  return{active,stage:c.mode||'dormant',frontX,proximity:response.amount,touching:response.touching,
    collisionActive:c.mode==='closing',pieces};
}
