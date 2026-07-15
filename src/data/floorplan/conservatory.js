// THE CONSERVATORY. Condemned, powered down, days from demolition.
//
// Three logical drawings, compiled into one Euclidean physical volume. Logical
// cells remain unique for saves, sound paths and mutation; physicalOrigin puts
// their air spans above/below one another for the renderer.
//
//   sub-basement  (left, -4m)    studio B3 · the plant room · the dead lift shaft
//   ground        (top right)    loading dock · foyer · concert hall · the natatorium
//   upper         (+4.8m)              the practice wing · the vaulted chapel
//
// You carry the standard keyring. It does not open everything. The building has
// changed since it was working, and again since the last recordist walked it:
// the old staff door onto the concert hall is bricked up, and the chapel is
// locked with a replacement key retained by front of house.
//
import { F } from './legend.js';
import { CONSERVATORY_DOORS } from '../conservatory-doors.js';

// The engine holds no geometry — edit these maps freely. To find a building
// that has quietly sealed itself:
//
//   node tools/chunk_surfer/tests/floorplan.mjs --plan=conservatory --map

function hallGroundRows(){
  const w=30,h=38,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'H';
    if(y>0&&y<8&&x>0&&x<w-1)c='S';
    if(y>=8&&y<=31&&(x<=4||x>=25)&&x>0&&x<w-1)c='h';
    if(y>=32&&y<h-1&&x>0&&x<w-1)c='r';
    if(x===0&&(y===7||y===20||y===21||y===32))c='+';
    row+=c;
  }out.push(row);}return out;
}
function hallGroundProfile(x,y,cell){
  if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
  if(y<=7)return{floor:-2.5,ceil:15.5,flags:cell.flags&~F.STAIR};
  if(y>=32)return{floor:2.5,ceil:3.8,flags:cell.flags&~F.STAIR};
  // Eleven half-metre terraces align with the accepted seating bowl. Only the
  // centre and side aisles are stairs; seats are blocked by their authored
  // collision mask and never turn the whole hall into one enormous stair.
  const terrace=Math.min(11,Math.floor((y-8)/2));
  const floor=-2.5+terrace*.44;
  const aisle=(x>=1&&x<=4)||(x>=13&&x<=16)||(x>=25&&x<=28);
  return{floor,ceil:(x<=4||x>=25)?3.8:15.5,flags:aisle?(cell.flags|F.STAIR):(cell.flags&~F.STAIR)};
}
function balconyRows(glyph){
  const w=30,h=38,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=' ';
    if(x===0||x===w-1||y===0||y===h-1)c='#';
    else if((y>=8&&y<=35&&(x<=4||x>=25))||y>=32)c=glyph;
    row+=c;
  }out.push(row);}return out;
}
function chapelRows(){
  const w=14,h=36,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':(y<9?'N':'C');
    // C-17 opens the narthex. The second screen is a separate scripted gate.
    if(y===0&&(x===6||x===7))c='+';
    if(y===9)c=(x>=5&&x<=8)?'C':'#';
    row+=c;
  }out.push(row);}return out;
}
function chapelProfile(x,y,cell){
  if(cell.solid||(cell.flags&F.DOOR))return null;
  // The west gallery and tower floor form a real ceiling over the back of the
  // nave. The vault opens to full height beyond the organ-loft projection.
  if(y>=9&&y<=23)return{ceil:8.45};
  return y>=31?{floor:5.1,ceil:17.8}:null; // a single climbable chancel step
}
function doglegStairRows(w=14,h=5){return Array.from({length:h},()=> '#'.repeat(w));}
function towerRoomRows(w=18,h=16,{ringing=false,chamber=false}={}){
  const out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'G';
    if(ringing&&x===w-1&&y===5)c='+';   // locked belfry stair leaf
    if(ringing&&x===w-1&&y===9)c='G';   // open seam from narthex stair
    if(chamber&&x===w-1&&y===8)c='+';   // protected chamber vestibule
    if(chamber&&x===w-1&&y===13)c='+';  // east descent turret after stand
    row+=c;
  }out.push(row);}return out;
}
function organLoftRows(){
  const w=14,h=8,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'G';
    // A corner aperture only meets the room diagonally. Put both seams on the
    // east wall so ordinary orthogonal movement reaches the stair landings.
    if(y===1&&x===w-1)c='G';
    if(y===h-1&&x===w-2)c='+';
    row+=c;
  }out.push(row);}return out;
}
function bellChamberProfile(x,y,cell){return cell.solid?null:{ceil:22.0};}
function natatoriumRows(){
  const w=27,h=22,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'T';
    if(y===0&&x===14)c='+';                    // dry-to-wet lobby
    if(x>=6&&x<=21&&y>=8&&y<=16)c='W';       // 16 × 9 m drained basin
    // Enclosed pump room at the south-east; its service leaf is deliberately
    // not part of the playable route.
    if(x>=22&&y>=16)c=(x===22||y===16||x===26||y===21)?'#':'T';
    row+=c;
  }out.push(row);}return out;
}
function frontAtriumRows(){
  const w=24,h=25,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'A';
    if(y===0&&(x===4||x===5))c='+';    // public glazed entrance pair
    if(x===0&&y===10)c='+';
    if(x===w-1&&y===10)c='x';          // old staff door, visibly bricked
    if(y===h-1&&x===11)c='+';
    // Enclosed front-of-house office. The public sees the counter; the staff
    // room itself is entered through the master-key leaf on its west wall.
    if(x>=15&&y>=14&&y<=20)c=(x===15||x===w-1||y===14||y===20)?'#':'F';
    if(x===15&&y===17)c='+';
    // Acoustic lobby into the hall's rear cross aisle.
    if(x>=16&&y>=21&&y<=23)c='F';
    if(x===w-1&&(y===21||y===22))c='+';
    row+=c;
  }out.push(row);}return out;
}
function practiceWingRows(){
  const w=21,h=30,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'P';
    // Conventional double-loaded suite: a three-metre corridor, four enclosed
    // rooms on each side, and one single acoustic leaf per room. Horizontal
    // party walls remain solid all the way to the corridor; rooms never bleed
    // into a showroom or into their neighbours.
    if((x===8||x===12)&&y>0&&y<h-1){
      const bay=y%7;c=bay===4?'+':'#';
    }
    if((y===7||y===14||y===21||y===28)&&(x<9||x>11))c='#';
    if(y===0&&x>=4&&x<=11)c='P';       // stair landing and short vestibule
    if(x===w-1&&y===3)c='+';           // thick-wall throat to upper bridge
    if(x===w-1&&y===16)c='+';          // string-room door to side passage
    row+=c;
  }out.push(row);}return out;
}
function poolAtriumLinkRows(){
  return [
    'AAAAA',
    'AAAAA',
    'TTTTT',
    'TTTTT',
  ];
}
function upperAtriumBridgeRows(){
  const w=24,h=5,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(y===0||y===h-1)?'#':'A';
    if(y===h-1&&(x===15||x===16))c='+';
    if(x===0||x===w-1)c=y===2?'+':'#';
    row+=c;
  }out.push(row);}return out;
}
function galleriaStairRows(x0){const out=[];for(let y=0;y<13;y++){let row='';for(let x=0;x<8;x++)row+=(y>0&&y<12&&x>=x0&&x<x0+2)?'/':' ';out.push(row);}return out;}
const EUCLIDEAN_ADDITIONS=[
  {id:'front_atrium',replace:true,layer:'ground',space:'front_atrium',renderGroup:'ground',origin:{x:74,y:3},physicalOrigin:{x:74,y:3},base:0,rows:frontAtriumRows()},
  // The dock and the replacement atrium each own one metre of this old thick
  // wall. Author both cells as one single-leaf throat; leaf count remains
  // explicit in the door schedule.
  {id:'dock_foyer_threshold',replace:true,layer:'ground',space:'front_atrium',renderGroup:'ground',origin:{x:73,y:13},physicalOrigin:{x:73,y:13},base:0,rows:['++']},
  {id:'pool_atrium_link',replace:true,layer:'ground',space:'front_atrium',renderGroup:'ground',origin:{x:83,y:25},physicalOrigin:{x:83,y:25},base:0,rows:['AAAAA','AAAAA']},
  {id:'natatorium',replace:true,layer:'ground',space:'natatorium',renderGroup:'ground',origin:{x:70,y:27},physicalOrigin:{x:70,y:27},base:0,rows:natatoriumRows(),stairs:[
    {from:{x:84,y:33},to:{x:84,y:37},fromH:0,toH:-1.6,width:3,ceil:9.5,zone:'natatorium',material:'poolTile'},
  ]},
  {id:'hall_box_office_link',replace:true,layer:'ground',space:'front_atrium',renderGroup:'hall',origin:{x:94,y:24},physicalOrigin:{x:94,y:24},base:0,rows:['FFFFHH','FFFFHH','FFFFHH']},
  {id:'hall_orchestra',replace:true,layer:'ground',space:'hall',renderGroup:'hall',origin:{x:98,y:4},physicalOrigin:{x:98,y:4},base:0,rows:hallGroundRows(),profile:hallGroundProfile},
  {id:'hall_lower_balcony',layer:'hall_lower',space:'hall',renderGroup:'hall',origin:{x:0,y:40},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('L')},
  {id:'hall_upper_balcony',layer:'hall_upper',space:'hall',renderGroup:'hall',origin:{x:0,y:82},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('U')},
  {id:'galleria_lower_stair',physicalReplace:true,layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:32,y:40},physicalOrigin:{x:99,y:20},base:0,rows:galleriaStairRows(1),stairs:[{from:{x:33,y:41},to:{x:33,y:51},fromH:-.74,toH:4,width:2,head:2.6,zone:'hall',material:'woodVelvet'}]},
  {id:'galleria_upper_stair',physicalReplace:true,layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:40,y:40},physicalOrigin:{x:122,y:20},base:0,rows:galleriaStairRows(4),stairs:[{from:{x:44,y:51},to:{x:44,y:41},fromH:4,toH:7.5,width:2,head:2.6,zone:'hall',material:'woodVelvet'}]},
  {id:'practice_wing',replace:true,layer:'upper',space:'practice',renderGroup:'upper',origin:{x:56,y:52},physicalOrigin:{x:56,y:52},base:4.8,rows:practiceWingRows()},
  {id:'upper_atrium_bridge',replace:true,layer:'upper',space:'upper_atrium',renderGroup:'upper',origin:{x:77,y:53},physicalOrigin:{x:77,y:53},base:4.8,rows:upperAtriumBridgeRows()},
  // First seal the entire legacy chapel footprint. The new chapel is the
  // only module allowed to reopen cells inside it.
  {id:'chapel_legacy_seal',replace:true,layer:'upper',space:'chapel_shell',renderGroup:'upper',origin:{x:81,y:58},physicalOrigin:{x:81,y:58},base:4.8,rows:Array.from({length:36},()=> '#'.repeat(30))},
  {id:'chapel_nave',replace:true,layer:'upper',space:'chapel',renderGroup:'upper',origin:{x:86,y:58},physicalOrigin:{x:86,y:58},base:4.8,rows:chapelRows(),profile:chapelProfile},
  // The tower is one Euclidean route. Each U stair owns an explicit turret
  // footprint and only meets a room at an authored level seam. No inferred
  // endpoints and no physicalReplace overlays are used here.
  {id:'tower_access_lower',layer:'tower_stair_lower',space:'stair_turret',renderGroup:'tower',origin:{x:0,y:150},physicalOrigin:{x:99,y:61},base:4.8,rows:doglegStairRows(),stairs:[{
    id:'tower-access-lower',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:2,y:151},to:{x:7,y:151},physicalFrom:{x:101,z:62},physicalTo:{x:106,z:62},fromH:4.8,toH:6.7,width:1.5,rises:10},
      {id:'flight-2',from:{x:7,y:154},to:{x:2,y:154},physicalFrom:{x:106,z:65},physicalTo:{x:101,z:65},fromH:6.7,toH:8.6,width:1.5,rises:10},
    ],
    landings:[
      {id:'narthex',at:{x:0,y:151},size:{x:3,y:2},physicalAt:{x:99,z:62},height:4.8},
      {id:'turn',at:{x:7,y:151},size:{x:3,y:4},physicalAt:{x:106,z:62},height:6.7},
      {id:'ringing',at:{x:0,y:154},size:{x:3,y:1},physicalAt:{x:99,z:65},height:8.6},
    ],
  }]},
  {id:'tower_ringing_room',layer:'tower_ringing',space:'ringing_room',renderGroup:'tower',origin:{x:16,y:150},physicalOrigin:{x:81,y:56},base:8.6,rows:towerRoomRows(18,16,{ringing:true})},
  {id:'tower_access_upper',layer:'tower_stair_upper',space:'stair_turret',renderGroup:'tower',origin:{x:36,y:150},physicalOrigin:{x:99,y:61},base:8.6,rows:doglegStairRows(),stairs:[{
    id:'tower-access-upper',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:38,y:151},to:{x:44,y:151},physicalFrom:{x:101,z:61},physicalTo:{x:107,z:61},fromH:8.6,toH:10.9,width:1.5,rises:12},
      {id:'flight-2',from:{x:44,y:154},to:{x:38,y:154},physicalFrom:{x:107,z:64},physicalTo:{x:101,z:64},fromH:10.9,toH:13.2,width:1.5,rises:12},
    ],
    landings:[
      {id:'ringing',at:{x:36,y:151},size:{x:3,y:2},physicalAt:{x:99,z:61},height:8.6},
      {id:'turn',at:{x:44,y:151},size:{x:3,y:4},physicalAt:{x:107,z:61},height:10.9},
      {id:'belfry',at:{x:36,y:154},size:{x:3,y:1},physicalAt:{x:99,z:64},height:13.2},
    ],
  }]},
  {id:'tower_bell_chamber',layer:'tower_chamber',space:'bell_chamber',renderGroup:'tower',origin:{x:52,y:150},physicalOrigin:{x:81,y:56},base:13.2,rows:towerRoomRows(18,16,{chamber:true}),profile:bellChamberProfile},
  {id:'tower_escape_upper',layer:'tower_stair_escape_upper',space:'stair_turret',renderGroup:'tower',origin:{x:72,y:150},physicalOrigin:{x:99,y:68},base:8.6,rows:doglegStairRows(),stairs:[{
    id:'tower-escape-upper',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:74,y:151},to:{x:80,y:151},physicalFrom:{x:101,z:69},physicalTo:{x:107,z:69},fromH:13.2,toH:10.9,width:1.5,rises:12},
      {id:'flight-2',from:{x:80,y:154},to:{x:74,y:154},physicalFrom:{x:107,z:72},physicalTo:{x:101,z:72},fromH:10.9,toH:8.6,width:1.5,rises:12},
    ],
    landings:[
      {id:'belfry',at:{x:72,y:151},size:{x:3,y:2},physicalAt:{x:99,z:69},height:13.2},
      {id:'turn',at:{x:80,y:151},size:{x:3,y:4},physicalAt:{x:107,z:69},height:10.9},
      {id:'loft',at:{x:72,y:154},size:{x:3,y:1},physicalAt:{x:99,z:73},height:8.6},
    ],
  }]},
  {id:'tower_organ_loft',layer:'tower_loft',space:'organ_loft',renderGroup:'tower',origin:{x:88,y:150},physicalOrigin:{x:85,y:72},base:8.6,rows:organLoftRows()},
  {id:'tower_escape_lower',layer:'tower_stair_escape_lower',space:'stair_turret',renderGroup:'tower',origin:{x:104,y:150},physicalOrigin:{x:99,y:79},base:4.8,rows:doglegStairRows(),stairs:[{
    id:'tower-escape-lower',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:106,y:151},to:{x:111,y:151},physicalFrom:{x:101,z:80},physicalTo:{x:106,z:80},fromH:8.6,toH:6.7,width:1.5,rises:10},
      {id:'flight-2',from:{x:111,y:154},to:{x:106,y:154},physicalFrom:{x:106,z:83},physicalTo:{x:101,z:83},fromH:6.7,toH:4.8,width:1.5,rises:10},
    ],
    landings:[
      {id:'loft',at:{x:104,y:151},size:{x:3,y:2},physicalAt:{x:98,z:79},height:8.6},
      {id:'turn',at:{x:111,y:151},size:{x:3,y:4},physicalAt:{x:106,z:80},height:6.7},
      {id:'nave',at:{x:104,y:154},size:{x:3,y:1},physicalAt:{x:99,z:82},height:4.8},
    ],
  }]},
];

export const conservatory = {
  width: 132,
  height: 170,
  widenCorridors: true,
  connectors:[
    // Logical seams coincide at identical physical landings. Height changes
    // happen on the ordinary stair cells between them, never in the connector.
    {from:{x:100,y:21},to:{x:33,y:41}},
    {from:{x:33,y:51},to:{x:2,y:67}},
    {from:{x:28,y:67},to:{x:44,y:51}},
    {from:{x:44,y:41},to:{x:28,y:99}},
    {from:{x:98,y:62},to:{x:0,y:151}},
    {from:{x:0,y:154},to:{x:33,y:159}},
    {from:{x:33,y:155},to:{x:36,y:151}},
    {from:{x:36,y:154},to:{x:69,y:158}},
    {from:{x:69,y:163},to:{x:72,y:151}},
    {from:{x:72,y:154},to:{x:101,y:151}},
    {from:{x:100,y:157},to:{x:104,y:151}},
    {from:{x:104,y:154},to:{x:98,y:82}},
  ],
  // Inside the loading dock, service door at your back. A bag, a work order,
  // and a radio that will fail.
  spawn: { x: 65, y: 10 },
  doors: CONSERVATORY_DOORS,
  levels: [
    {
      // ── sub-basement, four metres down ─────────────────────────────────────
      id:'basement',layer:'basement',space:'basement',renderGroup:'basement',origin: { x: 0, y: 0 }, physicalOrigin:{x:0,y:0},base: -4.0,
      rows: [
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
        '     #####################   #############',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMMM#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#####',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#####MMMMMMMMMM##.##',
        '     #BBBBBBBBBBBBBBBBBBB+....MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#####MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#   ######.######.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     ##########.##########        #.#    #.#',
        '              #.#                 #.#    #.#',
        '     ##########.###################.######.#####',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     ###########################################',
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
      ],
    },
    {
      // ── ground ─────────────────────────────────────────────────────────────
      id:'ground',layer:'ground',space:'ground',renderGroup:'ground',origin: { x: 50, y: 0 }, physicalOrigin:{x:50,y:0},base: 0,
      rows: [
        ' ',
        ' ',
        ' ',
        '       ################# ################# ###################',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD.+.FFFFFFFFFFFFFFF.x.HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       ########.######## #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '              #+#        #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '              #.#        ########.######## #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        ' ##############.###########     #.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' ##########,###############     #.#        #HHHHHHHHHHHHHHHHH#',
        '          #,#                   #.#        #HHHHHHHHHHHHHHHHH#',
        '          #,#            ########.##########.#################',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #####################',
      ],
      stairs: [],
    },
    {
      // ── upper, four metres up ──────────────────────────────────────────────
      id:'upper',layer:'upper',space:'upper',renderGroup:'upper',origin: { x: 50, y: 44 }, physicalOrigin:{x:50,y:44},base: 4.8,
      rows: [
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '     ######,####################################',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     ########.#######################+##########',
        '            #.#                     #.#     ###',
        '     ########.############ ##########.#################',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP+,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ########,,##+###+###+## #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #,,,,,,,,,P,,,,,,,,,,,# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ###+###+###+###+###+### #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ####################### #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #############################',
        ' ',
        ' ',
      ],
      stairs: [
        // Stair A: the ground spine down to the basement. 0 → -4.0m, 11 cells.
        { from: { x: 57, y: 22 }, to: { x: 47, y: 22 }, fromH: 0, toH: -4.0, width: 3 },
        // Stair B: the shaft up to the practice wing. 0 → 4.0m, 11 cells.
        { from: { x: 60, y: 41 }, to: { x: 60, y: 52 }, fromH: 0, toH: 4.8, width: 3 },
      ],
    },
    ...EUCLIDEAN_ADDITIONS,
  ],
};
