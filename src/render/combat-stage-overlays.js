const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export function combatStageOverlayLayout({stage={},panel={},compact=false,group=false,phase='tool'}={}){
  const x=finite(stage.x),y=finite(stage.y),w=Math.max(0,finite(stage.w)),h=Math.max(0,finite(stage.h));
  const top=y+1.1,rows=Math.max(0,Math.floor(h-1.1));
  const stanceW=Math.min(Math.max(0,w-2),Math.max(12,Math.min(26,Math.floor(finite(panel.w,w)*.24))));
  const named=compact||group||h<7.1;
  return Object.freeze({top,rows,spacious:rows>=5,
    intentHeight:rows,
    stance:Object.freeze({x:x+Math.max(0,w-stanceW-1),y:y+.1,w:stanceW,h:1,
      named,visible:h>=1.1&&(!named||phase!=='resolve')})});
}

// A short stage keeps the current read, its actionable plan and the most
// immediate warning. Extra observations remain available on a taller stage.
export function fitBattleStageThoughts(lines=[],capacity=0){
  const count=Math.max(0,Math.floor(finite(capacity))),source=Array.isArray(lines)?lines:[];
  if(source.length<=count)return source.slice();
  if(!count)return[];
  const first=tone=>source.findIndex(line=>line?.tone===tone);
  const last=tone=>{for(let index=source.length-1;index>=0;index--)if(source[index]?.tone===tone)return index;return-1;};
  const read=first('read'),plan=first('plan'),warn=last('warn'),miss=first('miss');
  const selected=new Set();
  const add=index=>{if(index>=0&&selected.size<count)selected.add(index);};
  if(count>=3){add(read);add(plan);add(warn);}
  else{add(warn);add(read);add(plan);}
  add(miss);
  for(const tone of ['read','warn','stance','plan'])source.forEach((line,index)=>{if(line?.tone===tone)add(index);});
  source.forEach((_,index)=>add(index));
  return [...selected].sort((a,b)=>a-b).map(index=>source[index]);
}
