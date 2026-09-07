// Persisted bridge from the opening rehearsal to the first real room. The
// world gate ends when the case closes; the bearing lesson ends at Studio B3.
export const SETUP_HANDOFF = Object.freeze({
  started:'setup.case.started', opened:'setup.case.opened', skillsOpened:'setup.case.skills-opened',
  skillsDone:'setup.case.skills-done', mapOpened:'setup.case.map-opened',
  closed:'setup.case.closed', arrived:'setup.case.arrived',
});
const F=SETUP_HANDOFF;

export function beginSetupHandoff(flags={}) {
  return flags[F.started] ? flags : {...flags,[F.started]:true};
}

export function recoverSetupHandoff(flags={}, {atGetIn=false,hasRealTake=false}={}) {
  if(flags[F.started] || !atGetIn || hasRealTake || !flags['bag.taken'] || !flags['setup.levels'] || !flags['combat.trained']) return flags;
  return beginSetupHandoff(flags);
}

export function setupHandoffStage(flags={}, {markedRoom=null}={}) {
  if(!flags[F.started])return 'idle';
  if(flags[F.arrived])return 'done';
  if(!flags[F.opened])return 'open-bag';
  if(!flags[F.skillsOpened])return 'skills-tab';
  if(!flags[F.skillsDone])return 'skills';
  if(!flags[F.mapOpened])return 'map-tab';
  if(markedRoom!=='main_b3'||!flags['setup.waypoint'])return 'mark';
  if(!flags[F.closed])return 'close';
  return 'follow';
}

export function setupSkillsReady(build={}) {
  // Zero-lead shifts inspect the same rack without receiving imaginary stock.
  return build.pinsEarned===0 || (Array.isArray(build.techniques)&&build.techniques.length>0);
}

export function advanceSetupHandoff(flags={}, event={}, context={}) {
  const stage=setupHandoffStage(flags,context);
  const next={...flags};
  if(stage==='open-bag'&&event.type==='bag-opened')next[F.opened]=true;
  if(stage==='skills-tab'&&event.type==='section-selected'&&event.sectionId==='skills')next[F.skillsOpened]=true;
  if(stage==='skills'&&event.type==='continue'&&setupSkillsReady(context.workingBuild))next[F.skillsDone]=true;
  if(stage==='map-tab'&&event.type==='section-selected'&&event.sectionId==='map')next[F.mapOpened]=true;
  if(stage==='close'&&event.type==='close')next[F.closed]=true;
  if(stage==='follow'&&event.type==='arrived'&&context.atStudio===true)next[F.arrived]=true;
  return Object.keys(next).some(key=>next[key]!==flags[key])?next:flags;
}

export function setupCanLeave(flags={}, {hasRealTake=false}={}) {
  if(hasRealTake)return true; // Do not replay opening gates in a progressed legacy run.
  if(!flags['setup.levels']||!flags['combat.trained']||!flags['setup.waypoint'])return false;
  return !flags[F.started] || !!(flags[F.skillsDone]&&flags[F.closed]);
}

export function setupHandoffGuide(flags={}, context={}) {
  const stage=setupHandoffStage(flags,context),base={surface:'bag',step:`case:${stage}`,allowClose:false};
  switch(stage){
    case 'skills-tab':return {...base,kind:'section',section:'skills',title:'OPEN SKILLS',why:'THE REHEARSAL IS OVER. PRESS THE GREEN SKILLS BUTTON TO CHECK YOUR PATCH LEADS.'};
    case 'skills':{
      const build=context.workingBuild||{},ready=setupSkillsReady(build);
      return {...base,kind:'skills',section:'skills',action:'confirm',title:build.pinsEarned===0?'CHECK THE PATCH BAY':'PATCH YOUR KIT',
        why:build.pinsEarned===0
          ?'THIS SHIFT STARTS WITH NO SPARE LEADS. COLORED INPUTS ARE SKILLS; PATCHED SKILLS GAIN OUTPUTS. FOUND LEADS CAN BE REUSED HERE.'
          :ready?'PATCHED. ITS OUTPUT CAN FEED THE NEXT MATCHING INPUT. RETURN A PLUG TO SPARES TO CHANGE YOUR BUILD; YOU MAY KEEP UNUSED LEADS.'
            :'DRAG A COLORED SEND SOCKET TO A MATCHING INPUT. START WITH ANY AVAILABLE SKILL. A LEAD IS REUSABLE, NOT SPENT FOREVER.',
        continueLabel:'CONTINUE TO MAP',continueEnabled:ready};
    }
    case 'map-tab':return {...base,kind:'section',section:'map',title:'OPEN THE MAP',why:'PRESS THE BLUE MAP BUTTON. NEXT, GIVE THE LOCATION INDICATOR A DESTINATION.'};
    case 'mark':return {...base,kind:'action',section:'map',entry:'room:main_b3',action:'mark',title:'MARK STUDIO B3',
      why:'STUDIO B3 IS ON THE BASEMENT FLOOR. MARK THIS ROOM: THE HUD BEARING WILL GUIDE YOU THERE. THE GET IN IS NOT STUDIO B3.'};
    case 'close':return {...base,kind:'close',section:'map',allowClose:true,action:'bag',title:'CLOSE THE CASE AND FOLLOW THE BEARING',
      why:'STUDIO B3 IS MARKED. CLOSE THE BAG, LEAVE THROUGH THE INNER DOOR, AND FOLLOW THE HUD ROUTE DOWN THE BASEMENT STAIR.'};
    default:return null;
  }
}

export function setupHandoffObjective(flags={},context={}) {
  const stage=setupHandoffStage(flags,context);
  return ({'open-bag':'OPEN YOUR FIELD CASE','skills-tab':'OPEN SKILLS',skills:'PATCH YOUR KIT','map-tab':'OPEN THE MAP',mark:'MARK STUDIO B3',close:'CLOSE THE CASE',follow:'FOLLOW THE BEARING TO STUDIO B3'})[stage]||null;
}
