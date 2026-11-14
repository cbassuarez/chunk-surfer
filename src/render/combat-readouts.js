import {uiDraw,uiText} from './ui.js';
import {drawPrintedText} from './keycap.js';
import {playerCondition} from '../game/player-condition.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
export function combatReadoutState(state={}){
  const condition=playerCondition({composure:state.composure,ceiling:state.maxComposure,
    baseline:Math.max(Number(state.maxComposure)||1,40),injuries:Number(state.injuries)||0,combat:true});
  const names={steady:'COMPOSED',strained:'STRAINED',shaken:'SHAKEN',depleted:'DEPLETED',unavailable:'UNAVAILABLE'};
  const injuries=condition.injuries||0;
  const effects=[state.ringing?'RINGING':null,state.tempo?'TEMPO OPEN':null,state.exposedBonus>0?'RESIDUE READY':null].filter(Boolean);
  const charge=clamp(Math.floor(state.charge),0,Math.max(0,Math.floor(state.maxCharge)||3));
  return {condition,status:condition.available?`${names[condition.strainStatus]} · ${injuries} ${injuries===1?'INJURY':'INJURIES'}`:'CONDITION UNAVAILABLE',
    effects,effectText:effects.join(' · '),
    cells:{take:{label:'TAKE',value:state.take?.label||'EMPTY',role:state.take?'ui-blue':'ui-secondary'},
      charge:{label:'CHARGE',value:`${charge}/${Math.max(0,Math.floor(state.maxCharge)||3)}`,role:charge?'ui-counter':'ui-secondary'},
      battery:{label:'TORCH',value:state.tools?.torch===false?'ABSENT':`${Math.round(clamp(state.battery,0,1)*100)}%`,role:state.battery<=.15?'ui-danger':'ui-amber'},
      mode:{label:'SNR',value:String(state.snr||'SIGNAL').toUpperCase(),role:'ui-amber'}}};
}
export function drawCombatReadouts(layout,state){
  const view=combatReadoutState(state);
  for(const[id,cell]of Object.entries(layout.resourceCells)){
    const item=view.cells[id];if(!item||cell.w<2)continue;
    uiDraw(({ctx,dpr,cellW,cellH})=>{
      const x=cell.x*cellW*dpr,y=cell.y*cellH*dpr,w=cell.w*cellW*dpr,h=cell.h*cellH*dpr;
      ctx.save();ctx.fillStyle='#080d0b';ctx.fillRect(x,y,w,h);
      ctx.strokeStyle='#303a32';ctx.lineWidth=Math.max(1,dpr);ctx.strokeRect(x+.5*dpr,y+.5*dpr,w-dpr,h-dpr);ctx.restore();
    });
    drawPrintedText(cell.x+.35,cell.y+.08,item.label,{w:cell.w-.7,h:.48,ink:'#b7bdae',darkPanel:true});
    const value=id==='mode'&&cell.w<7.7?({SIGNAL:'SIG',SILENCE:'SIL'}[item.value]||item.value):item.value;
    uiText(cell.x+.35,cell.y+.72,String(value),item.role,.95,Math.max(1,Math.floor(cell.w-.7)));
  }
  const status=layout.conditionStatus;
  drawPrintedText(status.x,status.y,view.status,{w:status.w,h:status.h,
    ink:view.condition.strainRatio>=.75?'#e4b5a1':'#cbd0bc',darkPanel:true});
  const effect=layout.effects;
  if(view.effectText)drawPrintedText(effect.x,effect.y,view.effectText,{w:effect.w,h:effect.h,
    ink:state.ringing?'#e4b5a1':'#c9d9c1',darkPanel:true});
  return view;
}
