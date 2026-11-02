import * as scenes from './scenes.js';
import {uiSize,uiCellMetrics} from '../render/ui.js';
import {consumeNotice,resolveNotice} from '../progression/notifications.js';
import {achievementDefinition,achievementCompletion} from '../progression/achievements.js';
import {achievementEarnedReason} from '../data/achievement-presentation.js';
import {getMeta} from './save.js';
import {achievementNoticeLayout,drawAchievementNotice} from '../render/achievement-deck.js';
import {hardwareMotionReduced} from '../render/hardware-material.js';
import * as AUDIO from '../audio/story-audio.js';

/** Passive presentation only. The host owns quiet/safe timing; a new hold
 * removes the whole surface and freezes its clock without consuming/replaying. */
export function makeAchievementNoticeScene({notice,duration=null,isHeld=()=>false}={}){
 const resolved=resolveNotice(notice),definition=achievementDefinition(notice?.achievementId);
 const reason=achievementEarnedReason(notice?.achievementId)||resolved?.body||'';
 const lifetime=Number.isFinite(duration)&&duration>0?duration:Math.min(7.5,Math.max(5.2,3.4+(String(resolved?.title||'').length+reason.length)/24));
 let self=null,t=0,done=false,announcement=null,announced=false;
 const held=()=>!!isHeld();
 function announce(){
  if(announced||!resolved||held()||typeof document==='undefined')return;
  announced=true;announcement=document.createElement('div');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');
  Object.assign(announcement.style,{position:'fixed',width:'1px',height:'1px',overflow:'hidden',clipPath:'inset(50%)'});
  announcement.textContent=`Achievement unlocked. ${resolved.title}. ${reason}`;document.body.appendChild(announcement);
 }
 function finish(){if(done)return;done=true;consumeNotice(notice.id);scenes.remove(self);}
 self={
  id:`achievement-notice:${notice.id}`,overlay:true,blocksInput:false,blocksWorld:false,
  enter(){if(!held())AUDIO.menuConfirm?.();announce();},
  exit(){announcement?.remove();announcement=null;},
  update(dt){if(done||held())return;announce();t+=Math.max(0,Number(dt)||0);if(t>=lifetime)finish();},
  key(){return false;},
  view(){return{held:held(),elapsed:t,duration:lifetime,done,title:resolved?.title||'',reason};},
  render(){
   if(done||!resolved||held())return;
   const geometry=achievementNoticeLayout({...uiSize(),...uiCellMetrics(),title:resolved.title,reason});
   const reduced=hardwareMotionReduced(),attack=reduced?.12:.20,release=reduced?.16:.32;
   const alpha=Math.max(0,Math.min(1,t/attack,(lifetime-t)/release));
   const entrance=Math.min(1,t/attack);
   if(!reduced)geometry.y+=(1-entrance)**2*.35;
   const completion=achievementCompletion(getMeta());
   drawAchievementNotice(geometry,{title:resolved.title,reason,completed:completion.completed,total:completion.total,
    icon:definition?.icon||notice.achievementId,alpha});
  },
 };
 return self;
}
