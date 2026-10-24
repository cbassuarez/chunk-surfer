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
 return{tasks,complete,total:tasks.length,packedCount:packed.length,next:tasks.find(task=>!task.done)||null,ready:complete===tasks.length};
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
