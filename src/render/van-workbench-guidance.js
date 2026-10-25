import {FIELD_KIT_OPTIONS,normalizeFieldKit} from '../game/field-kit.js';

export const VAN_REQUIRED_GEAR=Object.freeze(['headphones','microphone','recorder','flashlight']);
const gearNames={headphones:'headphones',microphone:'microphone',recorder:'amp',flashlight:'flashlight'};
export function vanWorkbenchProgress(state={}){
 const packed=VAN_REQUIRED_GEAR.filter(id=>state.packedGroups?.includes(id));
 const tasks=[{id:'van:case',label:'Open the field case',done:!!state.bagTaken},
  {id:'van:map',label:'Take the survey map',done:!!state.mapTaken},
  {id:'van:difficulty',label:'Choose and confirm your shift',done:!!state.difficultyConfirmed},
  ...(state.requirePacking?VAN_REQUIRED_GEAR.map(group=>({id:`van:group:${group}`,group,label:`Pack ${gearNames[group]}`,done:!!state.bagTaken&&packed.includes(group)})):[])];
 const complete=tasks.filter(task=>task.done).length;
 const next=!state.bagTaken?tasks[0]:state.requirePacking&&packed.length<4?{id:'van:standard',label:'Pack the balanced kit, or change equipment'}:tasks.find(task=>!task.done)||null;
 return{tasks,complete,total:tasks.length,packedCount:packed.length,next,ready:complete===tasks.length};
}
export function vanWorkbenchOptionPresentation(state={},group,optionId){
 const kit=normalizeFieldKit(state.fieldKit),choices=FIELD_KIT_OPTIONS[group]||FIELD_KIT_OPTIONS.cosmetics[group]||[];
 const currentId=kit[group]||kit.cosmetics[group],option=choices.find(choice=>choice.id===optionId)||choices.find(choice=>choice.id===currentId)||choices[0];
 const current=choices.find(choice=>choice.id===currentId),required=VAN_REQUIRED_GEAR.includes(group);
 const packed=!!state.bagTaken&&(!state.requirePacking||state.packedGroups?.includes(group));
 const same=option?.id===currentId;
 const action=group==='faceplate'&&option?.id==='witness'?'INSPECT':!state.bagTaken?'OPEN CASE':required?(packed?(same?'PACKED':'SWAP'):'PACK'):(same?'FITTED':'FIT');
 const status=required?(packed?(same?'IN YOUR CASE':'PREVIEW · REPLACES PACKED ITEM'):'PREVIEW · CHOOSE ONE TO PACK'):'APPEARANCE ONLY · OPTIONAL';
 return{option,current,currentId,required,packed,same,action,status,
  currentLabel:`${required?(packed?'PACKED':'ON BENCH'):'FITTED'}: ${current?.label||''}`,
  actionHint:!state.bagTaken?'Open the field case to pack or fit equipment.':action==='PACKED'?'This item is already packed. Choose another to swap it.':action==='SWAP'?'Confirm to replace it. The old item returns to the bench.':action==='PACK'?'Confirm to pack this item. The other choices stay here.':action==='INSPECT'?'Inspect the complete WITNESS recorder before fitting.':required?'':'This changes appearance only; your equipment stays the same.'};
}

const metrics=Object.freeze({
 headphones:[['monitorGainScale','Monitor sound'],['surroundingGainScale','Room sound']],
 microphone:[['recordingNoiseScale','Incidental noise'],['takeDurationScale','Take duration']],
 recorder:[['spoilToleranceScale','Overload margin'],['torchDrainScale','Field-cell drain']],
 flashlight:[['flashlightReachScale','Beam reach'],['flashlightConeScale','Beam width'],['flashlightDrainScale','Light-cell drain']],
});
// Compare the actual two options in this family. Browsing never applies these
// values; the saved kit and its packed flags remain the parent's authority.
export function vanWorkbenchComparison(state={},group,optionId){
 const value=vanWorkbenchOptionPresentation(state,group,optionId);
 return (metrics[group]||[]).map(([key,label])=>({key,label,
  current:Math.round((value.current?.effects?.[key]??1)*100),
  preview:Math.round((value.option?.effects?.[key]??1)*100)}));
}
export function vanWorkbenchManifest(state={}){
 const kit=normalizeFieldKit(state.fieldKit);
 return VAN_REQUIRED_GEAR.map(group=>({group,label:gearNames[group].toUpperCase(),
  packed:!!state.bagTaken&&(!state.requirePacking||state.packedGroups?.includes(group)),
  option:FIELD_KIT_OPTIONS[group].find(option=>option.id===kit[group])?.label||'REFERENCE'}));
}
