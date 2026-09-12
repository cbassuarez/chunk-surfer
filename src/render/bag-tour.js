// The field-case tour lives OUTSIDE the instrument. Its leaders terminate at
// the same rectangles that handle input, never at approximate painted props.
import { uiFill, uiLine, uiStrokeRect, uiText, uiWrap } from './ui.js';
import { bagPanelBounds } from './bag-layout.js';
import { drawLampButton } from './presentation.js';
import { activeInputPromptDevice, inputPromptLabel } from '../game/bindings.js';
import { PATCH_COLORS } from './patchbay-material.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(Math.max(a,b),v));
const box=value=>value&&({x:value.x,y:value.y,w:value.w,h:value.h});
const center=rect=>({x:rect.x+rect.w/2,y:rect.y+rect.h/2});
const valid=rect=>rect&&[rect.x,rect.y,rect.w,rect.h].every(Number.isFinite)&&rect.w>0&&rect.h>0;

export function bagGuideFrame({size={},outer=null,guide=null}={}){
  if(!guide)return{outer:outer||bagPanelBounds(size),rail:null,side:null};
  // Render-only mechanism tests do not initialize the canvas. Give their
  // ordinary hit registration a real virtual viewport, not zero-size targets.
  const cols=size.cols>0?size.cols:144,rows=size.rows>0?size.rows:40;
  const margin=cols>=60?2:1,gap=cols>=60?3:1.5;
  const railW=cols>=105?28:clamp(Math.floor(cols*.28),Math.min(12,cols*.3),24);
  const w=Math.min(100,Math.max(8,cols-margin*2-gap-railW)),h=Math.min(38,Math.max(5,rows-3));
  const start=Math.max(margin,(cols-(w+railW+gap))/2),y=Math.max(1,(rows-h)/2);
  return{outer:{x:start+railW+gap,y,w,h},rail:{x:start,y:y+.3,w:railW,h:h-.6},side:'left'};
}

function tourContent(guide,hasOutput,controller){
  const step=String(guide.step||''),kind=guide.kind||'action',section=guide.sectionId||guide.section;
  if(kind==='section')return section==='skills'
    ?{number:1,title:'Open Skills',body:'Press the green SKILLS selector. Check your patch leads before heading downstairs.',key:controller?inputPromptLabel('tabNext'):'4',verb:'OPEN SKILLS',color:'#acd88c'}
    :{number:3,title:'Open the map',body:'Press the blue MAP selector. Give the location indicator a destination.',key:controller?inputPromptLabel('tabNext'):'2',verb:'OPEN MAP',color:'#8bbfdf'};
  if(kind==='skills'){
    const zero=guide.continueEnabled!==false&&!hasOutput;
    return{number:2,title:zero?'Check the patch bay':hasOutput?'Your patch is live':'Patch your kit',
      body:zero?'No spare leads this shift. Each colored input is a skill. Patching it adds an output; found leads can be reused here.'
        :hasOutput?'This OUT socket can feed the next matching input. Pull a plug back to SPARES to reconfigure. Unused leads can stay spare.'
          :controller?'Choose an available input with the directional controls. Press Confirm to patch it; matching colors show the channel.'
            :'Drag a lead from SEND into a matching colored IN socket. Start with any available first-row skill.',
      key:controller?inputPromptLabel('confirm'):'ENTER',verb:controller?'PATCH / PULL':'PATCH · SPACE PULL',color:'#e5bc68'};
  }
  if(kind==='close')return{number:5,title:'Follow your bearing',body:'B3 is marked. Close the case, take the inner door, and follow the HUD route down the basement stair.',key:inputPromptLabel('bag'),verb:'CLOSE CASE',color:'#8bbfdf'};
  if(guide.action==='mark')return{number:4,title:'Mark Studio B3',body:'Studio B3 is selected on the basement floor. Press SET TARGET to mark it. Then follow your HUD bearing downstairs.',key:controller?inputPromptLabel('confirm'):'ENTER',verb:'SET B3 TARGET',color:'#8bbfdf'};
  return{number:null,title:guide.title||'Check the case',body:guide.why||'',key:inputPromptLabel(guide.action||'confirm'),verb:'CONTINUE',color:'#e5bc68',step};
}

export function bagGuideCalloutLayout({size={},outer,layout,guide,regions=[],patchLayout=null,selectedSkillId=null,patchDrag=null,frame=null}={}){
  if(!guide)return{continueRegion:null,callouts:[],targets:[]};
  const fitted=frame||bagGuideFrame({size,outer,guide}),panel=fitted.outer,rail=fitted.rail;
  const find=id=>regions.find(region=>region.id===id);
  const nodes=patchLayout?.nodes||[],outputs=nodes.filter(node=>node.output);
  const controller=activeInputPromptDevice()==='controller';
  const copy=tourContent(guide,outputs.length>0,controller),targets=[];
  const add=(id,fallback,color=copy.color,label='')=>{
    const rect=box(find(id)||fallback);
    if(valid(rect))targets.push({id,rect,color,label});
  };
  const kind=guide.kind||'action';
  if(kind==='section')add(`bag:tab:${guide.sectionId||guide.section}`);
  else if(kind==='skills'){
    const selected=nodes.find(node=>node.id===selectedSkillId);
    if(outputs.length){
      const installed=selected?.output?selected:outputs[0];
      add(`bag:patch:${installed.output.id}`,installed.output.hit,PATCH_COLORS[installed.branch]);
    }else if(guide.continueEnabled!==false){
      add('bag:patch:return',patchLayout?.returnZone);
    }else{
      const branch=patchDrag?.from?.branch||patchDrag?.branch||patchDrag?.source?.branch||selected?.branch;
      const node=nodes.find(node=>node.branch===branch&&node.entry.enabled)||nodes.find(node=>node.entry.enabled)||nodes[0];
      const source=patchLayout?.sources?.find(socket=>socket.branch===node?.branch);
      if(source)add(`bag:patch:${source.id}`,source.hit,PATCH_COLORS[source.branch]);
      if(node)add(`bag:patch:${node.input.id}`,node.input.hit,PATCH_COLORS[node.branch]);
    }
  }else if(kind==='close')add('bag:close');
  else if(guide.action==='mark')add('bag:map:set-target');
  else{
    const entry=guide.entryId||guide.entry;
    const target=find(`bag:action:${guide.action}`)||find(`bag:sheet:${entry}`)||find(`bag:item:${entry}`)
      ||regions.find(region=>region.kind==='bag-sheet');
    if(target)add(target.id);
  }
  if(!targets.length&&layout?.tabs)add('bag:tour:module',layout.tabs);
  const primary=targets[0],target=primary?.rect||panel;
  const width=rail.w,wrapW=Math.max(8,Math.floor(width-3));
  if(width<25){
    // Accessibility scaling spends width on larger glyphs, not on cropped
    // instructions. Keep the same lesson with fewer words in its side rail.
    if(kind==='section')copy.body=(guide.sectionId||guide.section)==='skills'?'Open the green SKILLS selector to check your patch leads.':'Open the blue MAP selector to set your destination.';
    else if(kind==='skills')copy.body=outputs.length?'OUT feeds the next matching IN. Return plugs to SPARES to reconfigure.'
      :guide.continueEnabled!==false?'No leads this shift. Inputs are skills; patched skills gain outputs.'
        :controller?'Choose an input. Confirm patches it. Match the channel colors.':'Drag SEND to a matching IN. Start with an available first-row skill.';
    else if(kind==='close')copy.body='Close the case. Inner door, basement stair, then follow the HUD bearing to B3.';
    else if(guide.action==='mark')copy.body='Set Studio B3 as your target. The HUD bearing will guide you downstairs.';
  }
  const titleRows=uiWrap(copy.title.toUpperCase(),wrapW),bodyRows=uiWrap(copy.body,wrapW);
  const hasContinue=kind==='skills'&&!!guide.continueLabel;
  const footerRows=hasContinue?[]:uiWrap(`${copy.key} · ${copy.verb}`,wrapW);
  const footerH=footerRows.length*1.05;
  const requestedH=1.7+titleRows.length*1.1+.65+bodyRows.length*1.1+1+footerH+(hasContinue?3.4:0);
  const h=Math.min(rail.h,requestedH),y=clamp(target.y-2,rail.y,rail.y+rail.h-h);
  const rect={x:rail.x,y,w:width,h};
  const bodyY=y+1.7+titleRows.length*1.1+.65;
  const continueRegion=hasContinue?{x:rect.x+1,y:rect.y+rect.h-3,w:rect.w-2,h:2.2}:null;
  // Long high-scale text uses smaller leading, never ellipsis or an overlap.
  const bodyEnd=(continueRegion?continueRegion.y-.45:rect.y+rect.h-footerH-1);
  const bodyLeading=Math.min(1.1,Math.max(.5,(bodyEnd-bodyY)/Math.max(1,bodyRows.length)));
  const leader=(to,id=null)=>{
    const end=center(to),start={x:rect.x+rect.w,y:clamp(end.y,rect.y+1,rect.y+rect.h-1)},elbow=panel.x-1.2;
    // SET remains a labelled button even in the dense two-row console. Its
    // guide touches the cap edge; only small patch jacks use a center point.
    if(id==='bag:map:set-target'||to.w>=8&&to.h>=2){
      const cap={x:end.x,y:to.y};
      return[start,{x:elbow,y:start.y},{x:elbow,y:to.y-.5},{x:cap.x,y:to.y-.5},cap];
    }
    // One-row captions contain ink across their whole width. Touch the edge
    // of the highlight instead of striking through the label with a leader.
    if(to.w>=8)return[start,{x:elbow,y:start.y},{x:elbow,y:end.y},{x:to.x,y:end.y}];
    return[start,{x:elbow,y:start.y},{x:elbow,y:end.y},end];
  };
  return{outer:panel,rail,continueRegion,targets,callouts:[{rect,...copy,titleRows,bodyRows,bodyY,bodyLeading,footerRows,
    targetId:primary?.id||null,targetRect:primary?.rect||null,leaderPoints:leader(target,primary?.id),
    leaders:targets.map(value=>({targetId:value.id,points:leader(value.rect,value.id),color:value.color}))}]};
}

export function drawBagGuideCallouts(options={}){
  const result=bagGuideCalloutLayout(options),guide=options.guide;
  for(const callout of result.callouts){
    for(const {points,color} of callout.leaders){
      for(let i=1;i<points.length;i++){
        uiLine(points[i-1].x,points[i-1].y,points[i].x,points[i].y,'#030708',1,4);
        uiLine(points[i-1].x,points[i-1].y,points[i].x,points[i].y,color,.94,1.4);
      }
      const end=points.at(-1);uiFill(end.x-.18,end.y-.09,.36,.18,color);
    }
    for(const target of result.targets){
      const r=target.rect;
      uiStrokeRect(r.x-.35,r.y-.2,r.w+.7,r.h+.4,'#020707',1,5);
      uiStrokeRect(r.x-.35,r.y-.2,r.w+.7,r.h+.4,target.color,.95,1.8);
    }
    const r=callout.rect;
    uiFill(r.x,r.y,r.w,r.h,'rgba(7,13,17,.98)');
    uiFill(r.x,r.y,.24,r.h,callout.color);
    uiText(r.x+1.3,r.y+.35,callout.number?`FIELD GUIDE  ${String(callout.number).padStart(2,'0')}`:'FIELD GUIDE','ui-blue',1);
    callout.titleRows.forEach((line,i)=>uiText(r.x+1.3,r.y+1.7+i*1.1,line,'ui-primary',1));
    callout.bodyRows.forEach((line,i)=>uiText(r.x+1.3,callout.bodyY+i*callout.bodyLeading,line,'ui-primary',.98));
    if(!result.continueRegion){
      callout.footerRows.forEach((line,i)=>uiText(r.x+1.3,r.y+r.h-callout.footerRows.length*1.05-.5+i*1.05,line,'ui-amber',1));
    }
    if(options.nudge<.5)uiStrokeRect(r.x,r.y,r.w,r.h,callout.color,1,2);
  }
  if(result.continueRegion){
    const r=result.continueRegion;
    drawLampButton(r.x,r.y,r.w,r.h,{controlId:'bag:guide:continue',legend:guide.continueLabel,
      code:activeInputPromptDevice()==='controller'?inputPromptLabel('tabNext'):'C',color:'green',
      enabled:guide.continueEnabled!==false,lit:guide.continueEnabled!==false,latched:false});
  }
  return result;
}
