// Named regions keep the same combat instrument readable at each supported size.
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const rect=(x,y,w,h)=>Object.freeze({x,y,w:Math.max(0,w),h:Math.max(0,h)});

export function combatHudLayout({panel={},mode='command',sourceActive=false,rosterActive=false,compact=null,desktop=false}={}){
  const x=finite(panel.x),y=finite(panel.y),w=Math.max(36,finite(panel.w,36));
  const h=Math.max(12,finite(panel.h,18));
  const isCompact=desktop||(compact==null?h<28:!!compact),dense=h<22,tight=h<14;
  const gap=tight?.12:dense?.20:isCompact?.45:.55;
  const contentBottom=y+h-(tight?.4:dense?.75:1.45);
  const headerH=dense?2:isCompact?3.15:4.15;
  const header=rect(x,y,w,headerH);
  const enemyGaugeW=Math.min(isCompact?42:49,Math.max(14,w*.43));
  const enemyGauge=rect(x,y+(dense?.15:isCompact?1.05:2),enemyGaugeW,1.8);
  const turnW=isCompact?0:Math.min(12,Math.max(10,Math.floor(w*.11)));
  const turn=rect(x+w-turnW,enemyGauge.y,turnW,1.9);
  const returnX=enemyGauge.x+enemyGauge.w+2;
  const returnMonitor=rect(returnX,enemyGauge.y,Math.max(0,Math.min(20,turn.x-returnX-1.5)),1.8);
  const readoutH=tight?2.4:dense?2.5:3.05;
  const channelH=(sourceActive||rosterActive)&&mode==='command'?(tight?1.2:dense?1.4:isCompact?2.65:3.65):0;
  const tabH=mode==='command'?(tight?1.1:dense?1.2:1.65):0;
  const detailH=tight?.75:dense?.8:isCompact?1.2:1.55;
  const commandMin=tight?2.1:dense?2.3:3.4;
  const bodyNeed=mode==='command'
    ?(channelH?channelH+gap:0)+tabH+gap+commandMin+gap+detailH
    :mode==='arrival'?2:mode==='dialogue'?(dense?3:5):(dense?3.3:5.6);
  const deckNeed=readoutH+gap+bodyNeed;
  const stageY=y+headerH;
  const stageSpace=contentBottom-stageY-gap-deckNeed;
  const stageH=clamp(stageSpace,dense?.65:isCompact?2:5.5,desktop?2.7:isCompact?10:18);
  const stage=rect(x,stageY,w,stageH);
  const deckY=stage.y+stage.h+gap;
  const deck=rect(x,deckY,w,contentBottom-deckY);
  const playerGaugeW=Math.min(isCompact?42:49,Math.max(14,w*.43));
  const playerGauge=rect(x,deckY,playerGaugeW,1.8);
  const resourceX=playerGauge.x+playerGauge.w+(dense?1:2);
  const resourceW=Math.max(0,x+w-resourceX);
  const resources=rect(resourceX,deckY,resourceW,1.8);
  const resourceGap=resourceW>48?.8:.35;
  const usable=Math.max(0,resourceW-resourceGap*3),weights=[.33,.19,.23,.25];
  let cursor=resourceX;
  const resourceCells={};
  ['take','charge','battery','mode'].forEach((id,index)=>{
    const cellW=index===3?resourceX+resourceW-cursor:usable*weights[index];
    resourceCells[id]=rect(cursor,deckY,cellW,1.8);cursor+=cellW+resourceGap;
  });
  const statusY=deckY+(dense?1.9:2.12),statusH=dense?.55:.7;
  const conditionStatus=rect(x,statusY,playerGaugeW,statusH);
  const effects=rect(resourceX,statusY,resourceW,statusH);
  const bodyY=deckY+readoutH+gap;
  const body=rect(x,bodyY,w,contentBottom-bodyY);
  const channels=rect(x,bodyY,w,channelH);
  const tabsY=bodyY+(channelH?channelH+gap:0);
  const tabs=rect(x,tabsY,w,tabH);
  const commandY=tabsY+(tabH?tabH+gap:0);
  const detail=rect(x,Math.max(commandY,contentBottom-detailH),w,detailH);
  const commandAvailable=Math.max(0,detail.y-commandY-gap);
  const carousel=rect(x,commandY,w,commandAvailable);
  const tools=carousel,actions=carousel;
  return Object.freeze({compact:isCompact,dense,desktop,mode,contentBottom,header,enemyGauge,returnMonitor,turn,
    stage,deck,playerGauge,resources,resourceCells:Object.freeze(resourceCells),conditionStatus,effects,
    body,reaction:body,dialogue:body,arrival:body,channels,tabs,tools,actions,carousel,detail});
}
