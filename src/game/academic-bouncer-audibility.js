// Social lines are local to actual rendered bodies. This policy owns no clock,
// audio, input, save state or floorplan mutation.
const finitePoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const sameFloor=(a,b)=>Math.abs(a.y-b.y)<=.55;
const point=p=>({x:p.x,y:p.y,z:p.z});

export function academicBouncerSocialAudible(event,{listener,actors,clearSegment}={}){
  if(!finitePoint(listener)||!Array.isArray(actors)||typeof clearSegment!=='function'
      ||!Array.isArray(event?.lines)||!event.lines.length)return false;
  const ids=[...new Set(event.lines.map(line=>line?.actorId))];
  if(ids.some(id=>typeof id!=='string'||!id))return false;
  const speakers=[];
  for(const id of ids){
    const matches=actors.filter(actor=>actor?.id===id);
    if(matches.length!==1||matches[0].visible===false||!finitePoint(matches[0]))return false;
    speakers.push(point(matches[0]));
  }
  const clear=(a,b)=>{try{return clearSegment(a,b)===true;}catch{return false;}};
  for(const speaker of speakers)if(!sameFloor(listener,speaker)||distance(listener,speaker)>8
      ||!clear(point(listener),speaker))return false;
  for(let i=0;i<speakers.length;i++)for(let j=i+1;j<speakers.length;j++){
    if(!sameFloor(speakers[i],speakers[j])||distance(speakers[i],speakers[j])>8
        ||!clear(speakers[i],speakers[j]))return false;
  }
  return true;
}

// The physical stair replaces some academic spans with synthetic logical -1
// spans. Derive the academic inverse from a real runtime anchor rather than
// interpreting that open air as an out-of-bounds solid. Raw academic metadata
// must still round-trip exactly; an unknown sample always refuses audibility.
export function academicBouncerSegmentClear(FP,from,to,{cellSize=.5,anchor,group='academic'}={}){
  if(!finitePoint(from)||!finitePoint(to)||!Number.isFinite(cellSize)||cellSize<=0
      ||typeof FP?.physicalSpanData!=='function'||typeof FP?.logicalToPhysical!=='function'
      ||typeof FP?.isSolid!=='function'||typeof FP?.hasFlag!=='function'
      ||!Number.isFinite(FP?.F?.CLOSED))return false;
  let origin=null;
  if(Number.isFinite(anchor?.x)&&Number.isFinite(anchor?.y)){
    const p=FP.logicalToPhysical(anchor.x,anchor.y);
    if(Number.isFinite(p?.x)&&Number.isFinite(p?.z)&&Number.isFinite(p?.y)
        &&p.renderGroup===group&&!p.arcId&&!p.flightId&&!FP.isSolid(anchor.x,anchor.y))origin=p;
  }
  const floor=origin?.y??from.y;
  if(Math.abs(from.y-floor)>.55||Math.abs(to.y-floor)>.55)return false;
  const spans=FP.physicalSpanData()?.cells;
  if(!(spans instanceof Map))return false;
  const samples=Math.max(1,Math.ceil(distance(from,to)/.1));
  for(let index=0;index<=samples;index++){
    const t=index/samples,px=(from.x+(to.x-from.x)*t)/cellSize,pz=(from.z+(to.z-from.z)*t)/cellSize;
    const list=spans.get(`${Math.floor(px)},${Math.floor(pz)}`)||[];
    const span=list.find(s=>s?.renderGroup===group&&Number.isFinite(s.floor)&&Math.abs(s.floor-floor)<=.55
      &&Number.isFinite(s.logicalX)&&Number.isFinite(s.logicalY)&&s.logicalX>=0&&s.logicalY>=0);
    let x,y;
    if(span){x=span.logicalX+px-Math.floor(px);y=span.logicalY+pz-Math.floor(pz);}
    else if(origin){
      x=anchor.x+px-origin.x;y=anchor.y+pz-origin.z;
      if(FP.isSolid(x,y))return false;
      const check=FP.logicalToPhysical(x,y);
      if(check?.renderGroup!==group||Math.abs(check.y-floor)>.55||check.arcId||check.flightId
          ||Math.hypot(check.x-px,check.z-pz)>.001)return false;
    }else return false;
    if(FP.isSolid(x,y)||FP.hasFlag(x,y,FP.F.CLOSED))return false;
  }
  return true;
}
