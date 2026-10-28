// The existing neighbourhood, in each row's original local metre frame.
// This pack replaces only the ordinary closed deeds and court masonry. The
// The stationer's separate row variant opens one existing ground-floor deed;
// the Lyric and all other deeds retain their original identities.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const EXTERIOR_FRONTAGE_REVISION='yorkshire-trades-2';
export const EXTERIOR_FRONTAGE_PACK='/assets/exterior-frontages.glb';
export const EXTERIOR_NEIGHBOURHOOD=freeze({
  deedWidth:8,count:8,front:0,wallDepth:.34,roomDepth:.78,
  maximumProjection:.32,maximumOverheadProjection:1.0,minimumAwningClearance:2.45,
  maximumPackTriangles:46000,maximumPackBytes:5500000,maximumPrintPages:4,maximumPrintBaseLevelBytes:14000000,
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
// Existing ground-floor deeds. Shop fit-outs replace domestic sash stock;
// deed3 of the terrace remains the separately fitted Stationers source deed.
export const EXTERIOR_TRADE_DEEDS=freeze({
  terrace:[{deed:0,display:'books',trade:'BOOKSELLER & STATIONER',paint:'green',awning:'deployed'},
    {deed:1,display:'cloth',trade:'TAILOR & DRAPER',paint:'wood',awning:'rolled'},
    {deed:2,display:'bottles',trade:'DISPENSING CHEMIST',paint:'green',awning:'rolled'},
    {deed:4,display:'vessels',trade:'CHINA & GLASS',paint:'wood',awning:'rolled'},
    {deed:5,display:'flowers',trade:'FLORIST & SEEDSMAN',paint:'green',awning:'rolled'},
    {deed:6,display:'clocks',trade:'WATCHMAKER & JEWELLER',paint:'wood',awning:'rolled'}],
  passage:[{deed:0,display:'provisions',trade:'BAKER & CONFECTIONER',paint:'wood',awning:'rolled'},
    {deed:1,display:'cloth',trade:'LINEN & HABERDASHERY',paint:'green',awning:'rolled'},
    {deed:2,display:'tools',trade:'IRONMONGER',paint:'wood',awning:'deployed'},
    {deed:5,display:'frames',trade:'FRAMES & RESTORATION',paint:'wood',awning:'rolled'},
    {deed:6,display:'books',trade:'OLD & NEW BOOKS',paint:'green',awning:'rolled'},
    {deed:7,display:'provisions',trade:'FAMILY GROCER',paint:'wood',awning:'rolled'}],
  workshop:[{deed:3,display:'frames',trade:'FRAMING & GILDING',paint:'wood',awning:'rolled'},
    {deed:4,display:'clocks',trade:'CLOCK REPAIRS',paint:'green',awning:'rolled'},
    {deed:7,display:'print',trade:'LETTERPRESS & PRINT',paint:'wood',awning:'rolled'}],
});
const row=(id,kind,x,z,yaw,names,workshops=[])=>({id,kind,mesh:`${id.replaceAll('-','_')}_trade`,physical:{x,z,yaw},
  shops:EXTERIOR_TRADE_DEEDS[kind].map((slot,i)=>({...slot,name:names[i]})),workshops});
// Names belong to placed rows, not to the reusable building body. Nine light
// print meshes provide local identity without cloning nine complete streets.
export const EXTERIOR_FRONTAGE_DRESSING=freeze([
  row('district-west-row-a','passage',-15.05,20,0,['HARGREAVES','DAWSON & DAUGHTER','J. BURTON','MARSHALL','M. FLETCHER','P. BELL']),
  row('district-west-row-b','workshop',-15.30,82,0,['ROYLE & SON','H. PICKERING','WARD PRINTWORKS'],['SUTCLIFFE JOINERY','DENTON ENGINEERING','HOLT UPHOLSTERY','MILLS COACHWORKS','NORTH GARAGE']),
  row('district-east-row-a','passage',143.05,20,Math.PI,['MORLEY','HUDSON & CO.','CARTER & SON','BROWNE','L. ARMITAGE','DOBSON']),
  row('district-east-row-b','workshop',143.05,82,Math.PI,['CROFT FRAMING','C. HEMSWORTH','EASTERN PRESS'],['WOOLLEY JOINERY','BATHS MOTOR WORKS','CROWN UPHOLSTERY','WHARF ENGINEERING','EAST GARAGE']),
  row('district-north-row-a','terrace',18,-15.05,Math.PI/2,['WALKER & PEEL','H. BIRTLES','R. ASQUITH','BROOK & SON','ELM FLORIST','V. HALL']),
  row('district-north-row-b','passage',82,-15.05,Math.PI/2,['M. THORNTON','HOLT & SISTER','J. WINTER','BELL & SON','WEST RIDING BOOKS','F. DIXON']),
  row('district-north-row-c','terrace',138,-15.05,Math.PI/2,['THE READING ROOM','ELLIOTT & CO.','H. FARRAR','RIDGEWAY CHINA','FERN & ROOT','J. INGHAM']),
  row('district-south-row-b','passage',82,107.05,-Math.PI/2,['HARRISON','WAKEFIELD LINEN','T. LISTER','TOWN FRAMERS','R. NAYLOR','LEONARD & CO.']),
  row('district-south-row-c','workshop',138,107.05,-Math.PI/2,['SOUTHERN FRAMERS','A. KENDALL','MERCURY PRINT'],['G. DENHAM JOINERY','SOUTH MOTOR WORKS','WILTON UPHOLSTERY','KIRK ENGINEERING','RAILWAY GARAGE']),
]);
const description={books:'Bound volumes stand behind a worn timber window; a single reading lamp has been left on.',cloth:'Folded cloth and paper patterns occupy the old display. The painted joinery has been repaired rather than replaced.',bottles:'Labelled bottles and a small dispensing cabinet sit well back from the street.',vessels:'Cup-and-saucer sets are spaced on stepped shelves. A few older pieces remain behind the newer stock.',flowers:'Seed packets, clay pots and dried stems share a shut florist’s window.',clocks:'Clock faces and watch cases are arranged behind a deep sash. The shop is shut; its flat is a different household.',provisions:'Loaves, tins and paper-wrapped provisions have been left in the window after closing.',tools:'Hand tools hang above small wooden bins; the ironmonger’s canopy is still out in the rain.',frames:'Nested picture frames and a small mitre bench give the narrow display its trade.',print:'Paper reams, a hand-fed press and type trays occupy the old shop bay.'};
export const EXTERIOR_FRONTAGE_INSPECTABLES=freeze(EXTERIOR_FRONTAGE_DRESSING.flatMap(r=>r.shops.map(s=>{
  const z=-28+s.deed*8,c=Math.cos(r.physical.yaw),sn=Math.sin(r.physical.yaw);
  return{id:`${r.id}-trade-${s.deed}`,rowId:r.id,deed:s.deed,label:s.name,trade:s.trade,
    physical:{x:r.physical.x+c*.60-sn*z,y:r.physical.z+sn*.60+c*z},
    mountNormal:{nx:c,ny:sn},text:`${s.name} · ${s.trade}. ${description[s.display]}`};
})));
export function exteriorDeedWindowLit(kind,deed,floor,bay){
  if(floor===0&&EXTERIOR_NEIGHBOURHOOD.earlyClosureDeeds.includes(deed))return false;
  return ((deed*5+floor*3+bay+(kind==='workshop'?2:0))%7)<2;
}
export function exteriorDeedClosedEarly(kind,deed){
  return kind!=='passage'&&EXTERIOR_NEIGHBOURHOOD.earlyClosureDeeds.includes(deed);
}
