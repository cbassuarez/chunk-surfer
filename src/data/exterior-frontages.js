// The existing neighbourhood, in each row's original local metre frame.
// This pack replaces only the ordinary closed deeds and court masonry. The
// The stationer's separate row variant opens one existing ground-floor deed;
// the Lyric and all other deeds retain their original identities.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXTERIOR_FRONTAGE_REVISION='inhabited-frontages-1';
export const EXTERIOR_FRONTAGE_PACK='/assets/exterior-frontages.glb';
export const EXTERIOR_NEIGHBOURHOOD=freeze({
  deedWidth:8,count:8,front:0,wallDepth:.34,roomDepth:.78,
  maximumProjection:.32,maximumPackTriangles:46000,maximumPackBytes:5500000,
  rows:[
    {mesh:'district_terrace_frontage',kind:'terrace',depth:5.4,heights:[11.2,11.2,12.4,12.4,10.8,10.8,13,13]},
    {mesh:'district_workshop_frontage',kind:'workshop',depth:6.8,heights:[7.2,7.2,8.6,11.2,11.2,7.8,8.4,10.4]},
    {mesh:'district_passage_frontage',kind:'passage',depth:5.4,heights:[11.2,11.2,12.4,12.4,10.8,10.8,13,13],openDeed:4},
  ],
  // Closure belongs to commerce downstairs; a light upstairs can still be on.
  // No extra explorable interior, quest, or falsely operable door is promised.
  earlyClosureDeeds:[1,5],
  notices:[
    {id:'neighbourhood-early-closure',lines:['CLOSED EARLY','FOR THE VIGIL','BACK TOMORROW'],widthM:.32,heightM:.42,capHeightM:.034},
  ],
  court:{mesh:'district_court_walls',length:16,halfWidth:4.45,leftHeight:9.2,rightHeight:7.8,windowZ:[2.5,6.7,10.9]},
});
export function exteriorDeedWindowLit(kind,deed,floor,bay){
  if(floor===0&&EXTERIOR_NEIGHBOURHOOD.earlyClosureDeeds.includes(deed))return false;
  return ((deed*5+floor*3+bay+(kind==='workshop'?2:0))%7)<2;
}
export function exteriorDeedClosedEarly(kind,deed){
  return kind!=='passage'&&EXTERIOR_NEIGHBOURHOOD.earlyClosureDeeds.includes(deed);
}
