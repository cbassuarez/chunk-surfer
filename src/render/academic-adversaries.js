// The encounter owns its phase and every root/height value. This renderer
// samples the retained four-faced body once; it never owns a threat clock.
import {heldNoteParts,heldNotePose} from './conservatory-adversary-performance.js';
import {uiSize,uiText,uiWrap} from './ui.js';
import {machinePanelBody,withMachinePanel} from './presentation.js';

const wound=heldNoteParts({phase:'reveal',elapsed:0})[0];
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function academicAdversaryParts(frame,{reducedMotion=false}={}){
  if(!frame?.visible||!finitePoint(frame.at)||!finitePoint(frame.anchorAt)
      ||![frame.height,frame.pitch,frame.yaw,frame.scale].every(Number.isFinite)
      ||frame.scale<=0)return[];
  // Secondary articulation may settle, but the essential warning/strike lift
  // and anchored root keep exactly the same geometry in reduced motion.
  const pose=heldNotePose({...frame,...(reducedMotion?{clipTime:0,wheelAngle:0}:null)});
  const common={at:{...frame.at},anchorAt:{...frame.anchorAt},height:frame.height,
    pitch:frame.pitch,yaw:frame.yaw,scale:frame.scale,shadow:true,character:pose,
    academicAdversaryActor:'held-note',threatActive:frame.threatActive===true};
  return[
    {...wound,id:'academic-held-ceiling-wound',at:{...wound.at},anchorAt:{...frame.anchorAt},
      academicAdversaryActor:'held-note',threatActive:false},
    {id:'academic-held-body',mesh:'held_note_body',...common},
    {id:'academic-held-faces',mesh:'held_note_faces',...common},
    {id:'academic-held-anatomy',mesh:'held_note_anatomy',...common},
  ];
}

// A cue occupies no scene/input lease. The same wrapped lines determine its
// measured panel and its painting, including the lower-rim safety row.
export function academicAdversaryCueLayout(view,{cols,rows}={}){
  const cue=view?.cue;
  if(!cue||cue.visible===false||!cue.text||!Number.isFinite(cols)||!Number.isFinite(rows)
      ||cols<24||rows<14)return null;
  const width=Math.min(76,cols-4),x=Math.floor((cols-width)/2);
  const footer=String(cue.footer||'');
  const probe=machinePanelBody(0,0,width,100,{footer}),chromeRows=100-probe.h;
  const content=[];
  const write=(text,cls)=>{
    for(const line of uiWrap(String(text||''),probe.w))content.push({text:line,cls});
  };
  write(cue.text,'ui-counter');
  if(cue.instruction)write(cue.instruction,'ui-amber');
  const remaining=Number.isFinite(cue.remaining)?Math.max(0,cue.remaining):null;
  const state=cue.state||String(view.phase||'').toUpperCase();
  if(state||remaining!==null)write([state,remaining===null?'':`${remaining.toFixed(1)} s`].filter(Boolean).join(' · '),'ui-label');
  // The glass aperture always reserves its lower hardware rim, even without
  // a footer. One logical spare row still clips the final glyph cell by .35.
  const bottomSafetyRows=2,height=Math.min(rows-2,Math.max(8,content.length+chromeRows+bottomSafetyRows));
  const y=Math.max(1,rows-height-1),body=machinePanelBody(x,y,width,height,{footer});
  return{x,y,width,height,body,content,footer,source:String(cue.source||'THIRD FLOOR'),
    bottomSafetyRows,chromeRows,fits:content.length+bottomSafetyRows<=body.h};
}

export function renderAcademicAdversaryCue(view){
  const layout=academicAdversaryCueLayout(view,uiSize());if(!layout)return;
  const {x,y,width,height,footer,source,content}=layout;
  withMachinePanel(x,y,width,height,{label:'MONITOR',source,meter:false,footer},panel=>{
    content.slice(0,panel.h).forEach((line,index)=>{
      if(line.text)uiText(panel.x,panel.y+index,line.text,line.cls,1,panel.w);
    });
  });
  return layout;
}
