// The inhabited commercial row opposite Ellery. These are existing closed
// deeds, not new destinations. A shop's closing does not switch off its flats.
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
export const PLAZA_SHOPFRONTS=freeze([
  {deed:0,id:'bindery',name:'THE BINDERY',display:'bindery',lit:true,closedForVigil:false},
  {deed:1,id:'instrument-repair',name:'INSTRUMENT REPAIRS',display:'instruments',lit:true,closedForVigil:false},
  {deed:2,id:'secondhand-books',name:'SECONDHAND BOOKS',display:'books',lit:false,closedForVigil:true},
  {deed:3,id:'music-scores',name:'MUSIC & SCORES',display:'scores',lit:true,closedForVigil:false},
  {deed:4,id:'florist',name:'FLOWERS',display:'flowers',lit:true,closedForVigil:false},
  {deed:5,id:'tailor',name:'TAILOR & ALTERATIONS',display:'tailor',lit:false,closedForVigil:true},
  {deed:6,id:'tea-rooms',name:'TEA ROOMS',display:'tea',lit:true,closedForVigil:false},
  {deed:7,id:'printer',name:'PRINT & COPY',display:'print',lit:false,closedForVigil:false},
]);
export const PLAZA_SHOP_CLOSURE=freeze({lines:['CLOSED EARLY','FOR THE VIGIL'],reason:'Existing district vigil; commerce closed, upstairs occupation independent.'});
