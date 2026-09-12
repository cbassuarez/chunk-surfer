import { uiSize, uiText, uiWrap, uiFill, uiScrim } from './ui.js';
import { withMachinePanel, machinePanelAperture, drawLampButton } from './presentation.js';
import { drawItemPortrait } from './item-portraits.js';
import { fitText } from './fit-text.js';

// The field case's faceplate, glass, portrait and controls, with conversation
// inside its display. There is no separate illustration of the radio.
export function radioSceneLayout({cols=120,rows=38}={},view={}) {
  cols=cols>4?cols:120;rows=rows>4?rows:38;
  const w=Math.min(96,cols-4),x=(cols-w)/2;
  const options=view.pending?.options||[];
  const h=Math.min(rows-2,Math.max(18,12+options.length*2.3));
  const panel={x,y:(rows-h)/2,w,h};
  const aperture=machinePanelAperture(panel.x,panel.y,w,h);
  const body={x:aperture.x+1.5,y:aperture.y+.65,w:aperture.w-3,h:aperture.h-1.3};
  const choices=options.map((choice,index)=>({
    x:body.x,y:body.y+body.h-(options.length-index)*2.3,w:body.w,h:1.9,choice,
  }));
  const bottom=(choices[0]?.y??body.y+body.h)-.6;
  const portrait=body.w>=72&&bottom-body.y>=6
    ?{x:body.x,y:body.y+.5,w:20,h:Math.min(10,bottom-body.y-1)}:null;
  const textX=portrait?portrait.x+portrait.w+2:body.x;
  const textW=body.x+body.w-textX;
  const textY=body.y+1.5;
  return {x:textX,w:textW,panel,portrait,textY,
    textRows:Math.max(1,Math.floor(bottom-textY)),lines:uiWrap(String(view.line?.text||''),textW),
    choices,footerY:panel.y+h-2};
}

export function drawRadioScene(view) {
  const radio=view.radio||{},layout=radioSceneLayout(uiSize(),view);
  const source=['radio','martin'].includes(String(view.who).toLowerCase())?'MARTIN'
    :['me','you'].includes(String(view.who).toLowerCase())?'YOU':'';
  const parts=radio.contact
    ?[{action:'select',label:'CHOOSE'},{action:'confirm',label:'HOLD TO COMMIT'}]
    :[...(view.pending?.options?.length?[{action:'select',label:'CHOOSE'},{action:'confirm',label:'CONFIRM'}]
      :[{action:'continue',label:radio.ready?'CONTINUE':'LISTEN'}]),...(!radio.terminal?[{action:'radio',label:'LOWER'}]:[])];
  const p=layout.panel;
  uiScrim(.5);
  withMachinePanel(p.x,p.y,p.w,p.h,{label:'RADIO',source:'FRONT DESK',footerParts:parts,meter:false},()=>{
    if(layout.portrait){const r=layout.portrait;drawItemPortrait('radio',r.x,r.y,{w:r.w,h:r.h,large:true});}
    const dead=radio.dead||radio.stage==='break'||radio.stage==='after';
    uiText(layout.x,layout.textY-1.4,source|| (dead?'NO CARRIER':'RADIO'),'ui-label',.8);
    const shown=String(view.line?.text||'').slice(0,view.typed??Infinity);
    uiWrap(shown,layout.w).slice(-layout.textRows).forEach((line,index)=>
      uiText(layout.x,layout.textY+index,line,source?'ui-primary':'ui-secondary',1));
    layout.choices.forEach((r,index)=>{
      const selected=view.pending.index===index;
      drawLampButton(r.x,r.y,6,r.h,{legend:String(index+1),color:'amber',lit:selected,
        selected,controlId:radio.controlPrefix?`${radio.controlPrefix}${index}`:null});
      uiWrap(r.choice.text,r.w-8).slice(0,2).forEach((text,line)=>
        uiText(r.x+8,r.y+.15+line*.9,fitText(text,r.w-8),selected?'ui-primary':'ui-secondary',selected?1:.8));
      if(selected&&radio.hold>0)uiFill(r.x+8,r.y+r.h-.15,(r.w-8)*Math.min(1,radio.hold/.65),.1,'#d8b36c');
    });
  });
}
