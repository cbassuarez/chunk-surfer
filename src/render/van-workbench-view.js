// A physical shelf with a contextual fitting strip, not an equipment dashboard.
import { uiDraw,uiWithClip } from './ui.js';
import { drawPrintedText } from './keycap.js';
import { fitLines } from './fit-text.js';
import { FIELD_KIT_OPTIONS, normalizeFieldKit, fieldKitEffects, fieldKitOptionAvailability } from '../game/field-kit.js';
import { vanWorkbenchSelectedObject } from './van-workbench-stage.js';
import { vanKitModel } from '../data/van-kit-models.js';
import { vanWorkbenchProgress,vanWorkbenchOptionPresentation,vanWorkbenchComparison,vanWorkbenchManifest } from './van-workbench-guidance.js';

export const VAN_WORKBENCH_GROUPS = Object.freeze([
  { id: 'headphones', label: 'HEADPHONES', color: 'amber' },
  { id: 'microphone', label: 'MICROPHONE', color: 'blue' },
  { id: 'recorder', label: 'AMP', color: 'red' },
  { id: 'faceplate', label: 'FACEPLATE', color: 'white', cosmetic: true },
  { id: 'buttons', label: 'BUTTONS', color: 'green', cosmetic: true },
  { id: 'vfd', label: 'PHOSPHOR', color: 'blue', cosmetic: true },
  { id: 'flashlight', label: 'FLASHLIGHT', color: 'amber' },
  { id: 'flashlightHousing', label: 'SHELL', color: 'green', cosmetic: true },
]);
export const VAN_PACKING_GROUPS = Object.freeze(['headphones', 'microphone', 'recorder', 'flashlight']);
export function vanWorkbenchOptionStatus(state, group, id) {
  return fieldKitOptionAvailability(state?.fieldKit, group, id, state?.cosmeticMeta);
}
export function vanWorkbenchOptions(group, state = null) {
  const options = FIELD_KIT_OPTIONS[group] || FIELD_KIT_OPTIONS.cosmetics[group] || [];
  return state ? options.filter(option => vanWorkbenchOptionStatus(state, group, option.id).visible) : options;
}
export function vanWorkbenchSelection(kit, group) { return kit[group] || kit.cosmetics?.[group]; }
export function vanWorkbenchReady(state = {}) { return vanWorkbenchRemaining(state).length === 0; }
export function vanWorkbenchRemaining(state = {}) {
  return [!state.bagTaken && 'take the field case', !state.mapTaken && 'take the survey indicator',
    !state.difficultyConfirmed && 'choose your shift',
    ...(state.requirePacking ? VAN_PACKING_GROUPS.filter(group => !state.packedGroups?.includes(group))
      .map(group => `pack ${group === 'recorder' ? 'an amp' : group === 'microphone' ? 'a microphone' : group === 'flashlight' ? 'a flashlight' : 'headphones'}`) : [])].filter(Boolean);
}
export function vanWorkbenchEffectRows(kit) {
  const effects = fieldKitEffects(kit);
  if (Object.values(effects).every(value => value === 1)) return ['REFERENCE SIGNAL PATH / NO MODIFIERS'];
  const delta = value => { const n = Math.round((value - 1) * 100); return `${n > 0 ? '+' : ''}${n}%`; };
  return [`MONITOR ${delta(effects.monitorGainScale)} / OUTSIDE ${delta(effects.surroundingGainScale)}`,
    `NOISE ${delta(effects.recordingNoiseScale)} / TAKE TIME ${delta(effects.takeDurationScale)}`,
    `OVERLOAD ${delta(effects.spoilToleranceScale)} / AMP CELL ${delta(effects.torchDrainScale)}`,
    `BEAM ${delta(effects.flashlightReachScale)} / LIGHT CELL ${delta(effects.flashlightDrainScale)}`];
}
export function groupModelId(group,id,kit={}) {
  if(group==='headphones'||group==='microphone'||group==='flashlight')return `${group}-${id}`;
  if(group==='recorder')return `amp-${id}`;
  if(group==='flashlightHousing')return `flashlight-${kit.flashlight||'reference'}`;
  return 'recorder';
}
export function vanWorkbenchConsidered(state,group,focusId,regions=[],consideredOptionId=null) {
  const focused=regions.find(item=>item.id===focusId);
  return vanWorkbenchOptionPresentation(state,group,focused?.group===group?focused.optionId:consideredOptionId);
}
// Only the object being handled has an action surface. The bench itself is
// the inventory: there is no parallel category list, checklist or review page.
const region=(id,kind,rect,extra={})=>({...rect,...extra,id,kind});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function vanWorkbenchLayout(size={},state={},selectedGroup='headphones',targets={},view={}){
  const cols=Math.max(40,Number(size.cols)||150),rows=Math.max(16,Number(size.rows)||38);
  const compact=cols<85||rows<25,stage={x:0,y:0,w:cols,h:rows},selection=view.selection||null;
  const close=region('van:close','close',{x:1,y:.65,w:compact?8:10,h:1.2},{enabled:true});
  const caseTarget=targets.case;
  const carry=region('van:continue','continue',{x:clamp(caseTarget?caseTarget.x+caseTarget.w/2-8:cols/2-8,1,cols-17),
    y:clamp(caseTarget?caseTarget.y+caseTarget.h+.2:rows-2.3,2,rows-2.1),w:16,h:1.35},{enabled:!view.pending&&!view.saveFailure});
  const physical=Object.entries(targets).flatMap(([key,t])=>{
    if(!(t.w>0&&t.h>0))return[];
    if(key==='case')return[region('van:object:case',selection?'dismiss':'continue',t,{object:true,keyboard:false,enabled:true,label:'FIELD CASE'})];
    if(t.kind==='variant'){
      const availability=vanWorkbenchOptionStatus(state,t.group,t.optionId);if(!availability.visible)return[];
      return[region(`van:object:${key}`,'object',t,{object:true,group:t.group,optionId:t.optionId,item:t.modelId,label:t.label,key,availability,enabled:true})];
    }
    if(key==='difficulty')return[region('van:object:difficulty','order',t,{object:true,key,label:state.difficultyLabel||'CONTRACT',enabled:!state.difficultyLocked,focusable:true})];
    return[region(`van:object:${key}`,'object',t,{object:true,key,item:t.item||key,label:t.label||key.toUpperCase(),enabled:true})];
  });
  let context=null,apply=null,inspect=null,dismiss=null,variants=[],customize=[],comparison=[],considered=null;
  if(selection){
    const group=selection.group;
    considered=group?vanWorkbenchOptionPresentation(state,group,selection.optionId):null;
    comparison=group?vanWorkbenchComparison(state,group,selection.optionId):[];
    const width=Math.min(compact?cols-2:48,cols-2),h=Math.min(rows-4.5,5.8+comparison.length*.62+(selection.customizing?2.3:0));
    const target=targets[selection.key],right=target&&target.x+target.w/2<cols/2;
    context={x:compact?1:right?cols-width-1:1,y:rows-h-1,w:width,h};
    const actionY=context.y+context.h-1.7;
    dismiss=region('van:dismiss','dismiss',{x:context.x+context.w-3.4,y:context.y+.35,w:2.6,h:.95},{enabled:true});
    apply=region('van:apply','apply',{x:context.x+.8,y:actionY,w:context.w*.58-.8,h:1.15},{enabled:!!group&&vanWorkbenchOptionStatus(state,group,selection.optionId).available&&!considered?.same,focusable:true});
    if(group&&considered?.same)apply.enabled=false;
    if(selection.key==='spanner')apply={...apply,kind:'spanner',enabled:!state.spannerTaken,label:'PUT IN CASE'};
    inspect=region('van:inspect','inspect',{x:context.x+context.w*.58+.3,y:actionY,w:context.w*.42-1.1,h:1.15},{item:selection.item||'recorder',enabled:true});
    if(selection.customizing){
      const opts=vanWorkbenchOptions(group,state),gap=.25,w=(context.w-1.6-gap*(opts.length-1))/opts.length;
      variants=opts.map((o,i)=>region(`van:finish:${group}:${o.id}`,'finish',{x:context.x+.8+i*(w+gap),y:context.y+1.5,w,h:1.05},
        {group,optionId:o.id,item:groupModelId(group,o.id,state.fieldKit),label:o.label,enabled:true}));
    }
    const customGroups=selection.item==='recorder'||['buttons','vfd'].includes(group)?['buttons','vfd']:group==='flashlight'||group==='flashlightHousing'?['flashlightHousing']:[];
    customize=customGroups.map((g,i)=>region(`van:customize:${g}`,'customize',{x:context.x+.8+i*11.5,y:context.y+context.h-3,w:11,h:.85},{group:g,enabled:true,label:g==='buttons'?'BUTTONS':g==='vfd'?'GLOW':'SHELL'}));
    if(selection.key==='difficulty'){apply={...apply,kind:'difficulty',enabled:!state.difficultyLocked};inspect={...inspect,kind:'notes'};}
  }
  const retry=region('van:retry','retry',{...(context&&apply?apply:carry)},{enabled:!view.pending});
  const objectRegions=physical.filter(r=>r.keyboard!==false),actions=selection?[...(apply?[apply]:[]),...(inspect?[inspect]:[]),...customize,...variants,...(dismiss?[dismiss]:[])]:[];
  const regions=[...physical,close,...(selection?actions:[]),...(view.saveFailure?[retry]:selection?[]:[carry])];
  return{size:{cols,rows},mode:'bench',compact,stage,stageBank:stage,outer:stage,selection,context,apply,inspect,variants,customize,dismiss,close,continueRegion:carry,retry,physical,
    regions,keyboardRegions:[...(view.saveFailure?[retry]:selection?[]:[carry]),...actions,...objectRegions,close],considered,comparison,
    selectedObject:selection?.key||'case',witness:vanWorkbenchOptionStatus(state,'faceplate','witness')};
}
const ink=(rect,text,{h=.58,color='#e7dfc7',align='left'}={})=>drawPrintedText(rect.x,rect.y,text,{w:rect.w,h,ink:color,align});
function surface(rect,fill='#d4c8a6'){
  uiDraw(({ctx,dpr,cellW,cellH})=>{const x=rect.x*cellW*dpr,y=rect.y*cellH*dpr,w=rect.w*cellW*dpr,h=rect.h*cellH*dpr;
    ctx.shadowColor='#0009';ctx.shadowBlur=12*dpr;ctx.shadowOffsetY=3*dpr;ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle='#494c3e';ctx.lineWidth=dpr;ctx.strokeRect(x+.5*dpr,y+.5*dpr,w-dpr,h-dpr);});
}
function action(rect,label,focused,enabled=true){if(!rect)return;surface(rect,focused?'#e8d6a4':enabled?'#bbc2ac':'#9a9d8c');ink({x:rect.x+.35,y:rect.y+.22,w:rect.w-.7},`${focused?'› ':''}${label}`,{h:.58,color:enabled?'#18241f':'#4b5448'});}
export function drawVanWorkbench(view={},size={},stageRenderer=null){
  const state={...view.state,fieldKit:normalizeFieldKit(view.state?.fieldKit)},selection=view.selection||null;
  let layout=vanWorkbenchLayout(size,state,selection?.group||'headphones',{},view);
  uiDraw(({ctx})=>{ctx.fillStyle='#080e0d';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);});
  stageRenderer?.draw(layout.stage,{state,selected:selection?.key||'case',selectedGroup:selection?.group||null,
    focusId:view.focusId||'',witnessFocused:selection?.optionId==='witness',now:view.now||0});
  layout=vanWorkbenchLayout(size,state,selection?.group||'headphones',stageRenderer?.targets()||{},view);
  // Labels and action verbs stay legible above the shared shader. The entire
  // physical bench, its printed labels and all models are acquired by it.
  action(layout.close,'YARD',view.focusId===layout.close.id);
  const forward=view.saveFailure?layout.retry:layout.continueRegion;
  if(!selection&&!view.saveFailure)action(forward,view.pending?'SAVING…':view.saveFailure?'RETRY SAVE':'TAKE CASE',view.focusId===forward.id,!view.pending);
  if(selection&&layout.context){
    const p=layout.context,c=layout.considered;surface(p);
    const title=selection.key==='difficulty'?`SHIFT / ${state.difficultyLabel||'CONTRACT'}`:c?.option?.label||selection.label||'FIELD RECORDER';
    ink({x:p.x+.8,y:p.y+.5,w:p.w-4.5},title,{h:.72,color:'#1f3029'});
    let y=p.y+(selection.customizing?2.95:1.65);
    if(view.saveFailure){ink({x:p.x+.8,y,w:p.w-1.6},'SAVE FAILED · RETRY TO KEEP THIS CHOICE',{h:.46,color:'#6b3828'});}
    else if(layout.comparison.length){for(const row of layout.comparison){ink({x:p.x+.8,y,w:p.w-1.6},`${row.label.toUpperCase()}   ${row.current}% → ${row.preview}%`,{h:.48,color:row.current===row.preview?'#526052':'#233e32'});y+=.62;}}
    else if(selection.group){const status=vanWorkbenchOptionStatus(state,selection.group,selection.optionId);const text=!status.available?status.reason||'LOCKED':c?.same?(c.required?'IN CASE':'FITTED'):c?.option?.description||'';
      const lines=fitLines(text,Math.floor((p.w-1.6)*1.5),2);lines.forEach((line,i)=>ink({x:p.x+.8,y:y+i*.62,w:p.w-1.6},line,{h:.46,color:'#3e5144'}));}
    for(const r of layout.variants)action(r,r.label,selection.optionId===r.optionId);
    for(const r of layout.customize)action(r,r.label,view.focusId===r.id);
    const cosmetic=VAN_WORKBENCH_GROUPS.find(g=>g.id===selection.group)?.cosmetic;
    action(layout.dismiss,'×',view.focusId==='van:dismiss');
    const label=selection.key==='difficulty'?(state.difficultyLocked?'CONFIRMED':'CHANGE SHIFT'):selection.key==='spanner'?(state.spannerTaken?'IN CASE':'PUT IN CASE'):!selection.group?'':c?.same?(cosmetic?'FITTED':'IN CASE'):cosmetic?'FIT':'SWAP';
    if(!view.saveFailure&&(selection.group||['spanner','difficulty'].includes(selection.key)))action(layout.apply,view.pending?'SAVING…':label,view.focusId==='van:apply',layout.apply.enabled&&!view.pending&&!view.saveFailure);
    action(layout.inspect,selection.key==='difficulty'?'READ NOTES':'EXAMINE',view.focusId==='van:inspect',!view.pending);
  }
  if(view.saveFailure){if(!selection){const p={x:layout.size.cols*.25,y:.65,w:layout.size.cols*.5,h:1.1};surface(p,'#cfa783');ink({x:p.x+.4,y:p.y+.22,w:p.w-.8},'SAVE FAILED',{h:.45,color:'#302720'});}action(layout.retry,view.pending?'SAVING…':'RETRY SAVE',view.focusId==='van:retry',!view.pending);}
  const hovered=layout.physical.find(r=>r.id===view.focusId);
  if(hovered&&!selection){const label=hovered.label||'FIELD CASE',w=Math.min(layout.size.cols-2,Math.max(12,label.length*.64));const p={x:clamp(hovered.x+hovered.w/2-w/2,1,layout.size.cols-w-1),y:clamp(hovered.y-.95,2.2,layout.size.rows-3.7),w,h:.85};surface(p,'#c6cbb7');ink({x:p.x+.3,y:p.y+.13,w:p.w-.6},label,{h:.46,color:'#23362a'});}
  return{...layout,previewFinish:state.fieldKit.cosmetics.faceplate,effects:fieldKitEffects(state.fieldKit)};
}
