import {uiSize} from '../render/ui.js';
import {drawVanWorkbench,vanWorkbenchLayout,vanWorkbenchOptionStatus} from '../render/van-workbench-view.js';
import {normalizeFieldKit} from './field-kit.js';
import {cancelControlScope} from './control-feedback.js';
import {uiCue,UI_CUE} from '../audio/ui-cues.js';
import {createVanWorkbenchStage} from '../render/van-workbench-stage.js';

export const VAN_WORKBENCH_SCENE='van-workbench';
// An offered, already-filled case; optional changes live on the physical
// objects. Only an explicit named action can cross the persistence boundary.
export function makeVanWorkbenchScene({getState=()=>({}),onChooseDifficulty=()=>{},onRetrySave=()=>false,
  onKitChange=()=>{},onInspect=()=>{},onInspectWitness=()=>{},onSpannerChoice=()=>{},onReadNotes=()=>{},onContinue=()=>{},onClose=()=>{},stageFactory=createVanWorkbenchStage}={}){
  const stage=stageFactory();
  let selection=null,focusId='van:continue',layout=null,lastSize=null,time=0,closed=false,pending=false,saveFailure=false,generation=0,settled=Promise.resolve();
  const sound=cue=>uiCue(cue,{scope:'van',profile:'van'});
  const state=()=>{const s=getState()||{};return{...s,fieldKit:normalizeFieldKit(s.fieldKit)};};
  const clear=()=>cancelControlScope('van:');
  function refresh(size=null){
    if(state().saveError)saveFailure=true;
    const measured=uiSize();lastSize=size||(measured.cols>0?measured:lastSize)||measured;
    layout=vanWorkbenchLayout(lastSize,state(),selection?.group||'headphones',stage.targets(),{selection,pending,saveFailure});
    if(!layout.regions.some(r=>r.id===focusId))focusId=saveFailure?'van:retry':selection?'van:apply':'van:continue';return layout;
  }
  function perform(action){
    if(closed||pending||saveFailure)return false;
    pending=true;clear();const token=++generation;
    const finish=result=>{
      if(closed||token!==generation)return false;pending=false;
      if(result===false||result?.ok===false){saveFailure=true;focusId='van:retry';sound(UI_CUE.DENIED);refresh();return false;}
      saveFailure=false;sound(UI_CUE.FIT);refresh();return true;
    };
    try{const result=action();settled=result&&typeof result.then==='function'?Promise.resolve(result).then(finish,()=>finish(false)):Promise.resolve(finish(result));}
    catch{settled=Promise.resolve(finish(false));}return true;
  }
  function retry(){if(pending||closed)return false;saveFailure=false;return perform(onRetrySave);}
  function select(r){
    if(!r)return false;const s=state();
    if(r.group){selection={key:r.key,group:r.group,optionId:r.optionId,item:r.item,label:r.label};}
    else if(r.key==='recorder'){selection={key:'recorder',group:'buttons',optionId:s.fieldKit.cosmetics.buttons,item:'recorder',customizing:true,label:'FIELD RECORDER'};}
    else{selection={key:r.key,item:r.item,label:r.label};}
    focusId=selection.group||['spanner','difficulty'].includes(r.key)?'van:apply':'van:inspect';sound(UI_CUE.PAGE);refresh();return true;
  }
  function customize(group){
    if(!selection)return false;selection={...selection,group,optionId:state().fieldKit.cosmetics[group],customizing:true};
    focusId='van:apply';refresh();sound(UI_CUE.PAGE);return true;
  }
  function inspect(r=null){
    if(pending)return false;clear();const s=selection;
    if(s?.group==='faceplate'&&s.optionId==='witness'){
      const availability=vanWorkbenchOptionStatus(state(),'faceplate','witness');if(!availability.visible)return false;onInspectWitness(availability);
    }else onInspect(r?.item||s?.item||'field-case');return true;
  }
  function apply(){
    if(!selection)return false;
    if(selection.key==='spanner')return state().spannerTaken?false:perform(()=>onSpannerChoice(true));
    const {group,optionId}=selection,s=state(),availability=vanWorkbenchOptionStatus(s,group,optionId);
    if(!group||!availability.available||layout.considered?.same)return false;
    const kit=normalizeFieldKit(s.fieldKit);if(group in kit.cosmetics)kit.cosmetics[group]=optionId;else kit[group]=optionId;
    return perform(()=>onKitChange(kit,{group,optionId}));
  }
  function dismiss(){selection=null;focusId='van:continue';clear();sound(UI_CUE.BACK);refresh();return true;}
  function back(){if(pending)return true;if(selection)return dismiss();clear();onClose();return true;}
  function activate(r){
    if(!r||closed||pending)return false;
    if(r.kind==='retry')return retry();
    if(saveFailure&&['continue','apply','spanner','difficulty','notes'].includes(r.kind))return false;
    if(r.kind==='object'||r.kind==='order')return select(r);
    if(r.kind==='finish'){selection={...selection,optionId:r.optionId};focusId='van:apply';refresh();sound(UI_CUE.MOVE);return true;}
    if(r.kind==='customize')return customize(r.group);
    if(r.kind==='dismiss')return dismiss();
    if(r.kind==='inspect')return inspect(r);
    if(r.kind==='apply'||r.kind==='spanner')return apply();
    if(r.kind==='difficulty'){if(!state().difficultyLocked){clear();onChooseDifficulty();}return true;}
    if(r.kind==='notes'){clear();onReadNotes();return true;}
    if(r.kind==='close'){clear();onClose();return true;}
    if(r.kind==='continue')return perform(onContinue);
    return false;
  }
  function navigable(){return layout.keyboardRegions.filter(r=>r.enabled!==false||r.focusable);}
  function move(dx,dy){
    refresh();const regions=navigable(),current=layout.regions.find(r=>r.id===focusId)||regions[0];if(!current)return;
    const cx=current.x+current.w/2,cy=current.y+current.h/2;
    const choices=regions.filter(r=>r.id!==current.id).map(r=>{const x=r.x+r.w/2-cx,y=r.y+r.h/2-cy,p=dx?x*dx:y*dy;return{r,p,score:p+Math.abs(dx?y:x)*2};}).filter(r=>r.p>.1).sort((a,b)=>a.score-b.score);
    if(choices[0]){focusId=choices[0].r.id;sound(UI_CUE.MOVE);}
  }
  const scene={id:VAN_WORKBENCH_SCENE,blocksInput:true,blocksWorld:true,allowsLook:false,handlesEscape:true,suppressesHud:true,worldPresentation:'visible',lookProfile:'calm',
    enter(){closed=false;selection=null;focusId='van:continue';refresh();},
    update(dt){time+=Math.max(0,Number(dt)||0);},resume(){clear();stage.resume();refresh();},suspend(){clear();stage.suspend();},
    exit(){closed=true;generation++;clear();stage.dispose();},
    key(e={}){
      if(closed)return false;const key=String(e.key||'').toLowerCase(),control=e.controllerAction;
      if(e.repeat&&(['enter',' ','escape','i'].includes(key)||['confirm','back'].includes(control)))return true;
      if(key==='escape'||control==='back')return back();if(pending)return true;refresh();
      const dirs={arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1],move_left:[-1,0],move_right:[1,0],move_up:[0,-1],move_down:[0,1]};
      if(dirs[control||key]){move(...dirs[control||key]);return true;}
      if(key==='tab'||['tabNext','tabPrev'].includes(control)){
        const regions=navigable(),at=regions.findIndex(r=>r.id===focusId),backward=e.shiftKey||control==='tabPrev';
        if(regions.length)focusId=regions[(at+(backward?-1:1)+regions.length)%regions.length].id;sound(UI_CUE.MOVE);return true;}
      if(key==='enter'||key===' '||control==='confirm'){activate(layout.regions.find(r=>r.id===focusId));return true;}
      if(key==='i'){inspect(layout.regions.find(r=>r.id===focusId));return true;}return true;
    },
    keyup(){return true;},
    pointer(e={}){
      if(closed)return false;if(['pointercancel','lostpointercapture'].includes(e.type)){clear();return true;}if(pending)return true;refresh();
      const r=[...layout.regions].reverse().find(r=>e.cellX>=r.x&&e.cellX<r.x+r.w&&e.cellY>=r.y&&e.cellY<r.y+r.h);
      if(e.type==='pointermove'&&r)focusId=r.id;
      if(e.type==='pointerdown'&&(e.button??e.originalEvent?.button??0)===0)activate(r);return true;
    },
    render(size=uiSize()){lastSize=size;layout=drawVanWorkbench({state:state(),selection,focusId,pending,saveFailure,now:time},size,stage);},
    debugState(){refresh(lastSize);return{state:state(),mode:'bench',selection,selectedGroup:selection?.group,consideredOptionId:selection?.optionId,focusId,pending,saveFailure,ready:!pending&&!saveFailure,layout,hitRegions:layout.regions,stage:stage.snapshot()};},
    snapshot(){return scene.debugState();},
    whenSettled(){return settled;},
  };return scene;
}
