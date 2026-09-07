// Physical objects share a GLB, an authored camera fit, and two ASCII stills.
// Map, document-navigation and skill symbols retain their own drawing systems.
const item=(id,scale)=>Object.freeze({id,model:`assets/items/${id}.glb`,small:`assets/items/${id}-192.webp`,large:`assets/items/${id}-512.webp`,scale});
export const ITEM_PORTRAITS=Object.freeze({
  recorder:item('recorder',4.2),interface:item('interface',4.1),radio:item('radio',4.0),
  light:item('light',4.3),'tuning-fork':item('tuning-fork',4.5),coffee:item('coffee',3.25),
  badge:item('badge',3.3),keyring:item('keyring',3.55),'chapel-key':item('chapel-key',3.45),
  'plant-spanner':item('plant-spanner',3.6),'marble-eyes':item('marble-eyes',4.1),'sheet-music':item('sheet-music',3.6),
});
const ALIASES=Object.freeze({torch:'light',rig:'interface',fork:'tuning-fork',spanner:'plant-spanner',bust:'marble-eyes','key-c17':'chapel-key','standard-keyring':'keyring','recorder-headphones':'recorder','recorder-+-headphones':'recorder','the-guards-coffee':'coffee'});
export function itemPortrait(value){const id=typeof value==='object'?(value?.sourceId||value?.id||value?.icon):value;return ITEM_PORTRAITS[id]||ITEM_PORTRAITS[ALIASES[id]]||null;}
export const ITEM_ASCII_OPTIONS=Object.freeze({
  manual:true,ascii:true,colored:true,cellSize:5,cellAspect:.66,
  charset:' .,:;-=+*ox%#@',contrast:1.32,edgeContrast:2.2,exposure:1.15,
  background:'',highlight:'#c5bd96',environmentIntensity:2,roughness:-1,
  floatIntensity:0,rotationIntensity:0,autoRotate:false,orbit:false,zoom:false,
  fov:35,cameraDistance:6,yOffset:0,
});
