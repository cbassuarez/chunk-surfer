import {uiFill,uiStrokeRect,uiText} from './ui.js';
import {drawVfdText} from './presentation.js';
import {UI_COLOR} from './palette.js';

export function hallRosterState(snapshot){
  return (snapshot?.members||[]).map(member=>({...member,
    condition:`${member.health}/${member.maxHealth}`,
    activity:member.defeated?'RELEASED':[
      member.acting?'ACTING':null,member.targeted?'TARGET':null,member.parryReady?'PARRY READY':null,
    ].filter(Boolean).join(' · ')||(member.primary?'AIMED AT':'WATCHING'),
    ratio:Math.max(0,Math.min(1,member.health/Math.max(1,member.maxHealth)))}));
}

export function drawHallRoster(snapshot,{x,y,w,h,dense=false}={}){
  const cards=hallRosterState(snapshot),gap=.8,cardW=(w-gap*Math.max(0,cards.length-1))/Math.max(1,cards.length);
  const cardH=Math.max(.8,h-(dense?.15:.75)),rows=[];
  cards.forEach((card,index)=>{
    const left=x+index*(cardW+gap),edge=card.defeated?UI_COLOR.frame:card.acting?UI_COLOR.danger:card.targeted?UI_COLOR.amber:card.parryReady?UI_COLOR.blue:UI_COLOR.frame;
    uiFill(left,y,cardW,cardH,'#080d0b');
    uiStrokeRect(left,y,cardW,cardH,edge,card.targeted||card.acting?.8:.3,card.primary?1.4:1);
    const amount=card.condition,role=card.defeated?'ui-label':card.acting?'ui-danger':'ui-primary';
    if(dense){
      const text=`${index+1} ${amount} ${card.activity}`;
      drawVfdText(left+.35,y+.18,text.slice(0,Math.floor((cardW-.7)/.7)),{scale:.7,role});
    }else{
      const width=Math.max(1,Math.floor(cardW-1));
      uiText(left+.5,y+.12,card.label.slice(0,Math.max(1,width-amount.length-1)),role,card.defeated?.4:.94);
      uiText(left+cardW-amount.length-.5,y+.12,amount,card.defeated?'ui-label':'ui-counter',card.defeated?.4:.94);
      if(cardH>=2.5){
        uiText(left+.5,y+.98,`${card.seat} · ${card.roleLabel}`.slice(0,width),'ui-secondary',.74);
        uiText(left+.5,y+1.85,card.activity.slice(0,width),card.acting?'ui-danger':card.parryReady?'ui-blue':card.targeted?'ui-amber':'ui-secondary',.94);
      }else drawVfdText(left+.5,y+.99,card.activity.slice(0,Math.floor(width/.75)),{scale:.75,role:card.acting?'ui-danger':card.targeted?'ui-amber':'ui-secondary'});
      uiFill(left+.5,y+cardH-.2,cardW-1,.10,'rgba(190,202,186,.10)');
      uiFill(left+.5,y+cardH-.2,(cardW-1)*card.ratio,.10,card.defeated?'#303a32':'#a3b6a0');
    }
    if(!card.defeated)rows.push({id:card.id,x:left,y,w:cardW,h:cardH});
  });
  if(!dense){
    const initiative=(snapshot?.initiative||[]).map(entry=>entry.defeated?'—':entry.active?`▶ ${entry.label}`:entry.label).join('  →  ');
    uiText(x,y+cardH+.18,initiative.slice(0,Math.floor(w)),'ui-blue',.82);
  }
  return rows;
}
