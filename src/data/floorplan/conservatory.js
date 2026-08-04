// THE CONSERVATORY. Condemned, powered down, days from demolition.
//
// Four logical drawings, compiled into one Euclidean physical volume. Logical
// cells remain unique for saves, sound paths and mutation; physicalOrigin puts
// their air spans above/below one another for the renderer.
//
//   sub-basement  (left, -4m)    the dance wing: B3 · B2 · B1 · room 5 · the
//                                prop store · the plant room · two locked
//                                service rooms · the bricked lift shaft
//   ground        (top right)    loading dock · foyer · concert hall · the natatorium
//   upper         (+4.8m)              the practice wing · the vaulted chapel
//   academic      (+10m)       locked instruction rooms · offices · atrium crown
//
// You carry the standard keyring. It does not open everything. The building has
// changed since it was working, and again since the last recordist walked it:
// the old staff door onto the concert hall is bricked up, and the chapel is
// locked with a replacement key retained by front of house.
//
import { F, ZONE } from './legend.js';
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
  const w=27,h=24,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    // One outer room envelope. The W rectangle is a surface/material change,
    // not a second lowered collision room; natatoriumProfile flattens it to
    // the deck so the renderer cannot build inner walls around it.
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'T';
    if(y===0&&x===14)c='+';
    // Five metres of dry lead-in lets the room reveal itself before the pool.
    // A narrower 12 x 16m basin reads longitudinally instead of swallowing the
    // hall as soon as the lobby leaf opens.
    if(x>=8&&x<=19&&y>=6&&y<=21)c='W';        // world x78..89, y33..48
    row+=c;
  }out.push(row);}return out;
}
function natatoriumProfile(_x,_y,cell){
  if(cell.solid||(cell.flags&F.DOOR))return null;
  // Collision and sector traversal own one continuous room volume. Encoding a
  // pitched roof as stepped per-cell ceiling heights makes every height change
  // a visible header in the DDA renderer, so keep this envelope continuous.
  // `W` historically sat 1.6m lower than the deck. In the height-field
  // renderer that becomes a complete rectangular wall shell, trapping a
  // smaller "natatorium" inside the room. Keep its wet-tile identity but make
  // the playable surface continuous; water/lanes provide the pool image.
  // The academic crown begins at 10m over this physical footprint. Stop the
  // pool hall below that slab; the old 11.2m envelope literally intersected
  // its walls and models, producing the nested room visible from the deck.
  return{floor:cell.zone===ZONE.natatorium&&cell.floor<0?0:cell.floor,ceil:9.5,flags:cell.flags&~F.STAIR};
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
function frontAtriumProfile(x,y,cell){
  if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
  // The garden remains the full-height centre of the old atrium. Everywhere
  // else receives the underside of the academic crown with a half-metre
  // structural gap before the 10m floor above.
  const gardenVoid=x>=5&&x<=14&&y>=5&&y<=17;
  return{ceil:gardenVoid?17:9.5};
}

export const ACADEMIC_ORIGIN=Object.freeze({x:0,y:240});
export const ACADEMIC_PHYSICAL_ORIGIN=Object.freeze({x:50,y:0});
export const ACADEMIC_BASE=10;
// The LOCKED ones. (13,244) is not here any more: that leaf is the lobby's
// corridor door, and the lobby is how you get round this floor.
export const ACADEMIC_CLASSROOM_DOORS=Object.freeze([
  {x:9,y:244},{x:9,y:251},{x:13,y:251},
  {x:9,y:258},{x:13,y:258},{x:9,y:264},{x:13,y:264},
]);
export const ACADEMIC_ENTRY=Object.freeze({x:8,y:275});
export const ACADEMIC_BREACH=Object.freeze({x:17,y:267});

function academicFloorRows(){
  const w=48,h=40,inside=(x,y)=>
    (x>=0&&x<=22&&y>=0&&y<=28)||
    (x>=23&&x<=47&&y>=2&&y<=28)||
    (x>=0&&x<=12&&y>=29&&y<=39)||
    (x>=8&&x<=25&&y>=27&&y<=39);
  const rows=[];
  for(let y=0;y<h;y++){
    let row='';
    for(let x=0;x<w;x++){
      if(!inside(x,y)){row+=' ';continue;}
      const edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!inside(x+dx,y+dy));
      let c=edge?'#':'Q';

      // Seven locked classrooms and a lobby, either side of the academic core.
      //
      // The floor used to be a corridor that dead-ended at the north wall with
      // eight locked doors off it and no way round — you walked up, you walked
      // back. Now it is a circuit:
      //
      //   gallery → lobby → core → south corridor → gallery
      //
      // The gallery itself is untouched. The only cut into it is one door in its
      // outer west wall, five metres from the nearest plinth.
      if(y>=1&&y<=27&&(x===9||x===13))c='#';
      if([7,14,21,27].includes(y)&&((x>=1&&x<=8)||(x>=14&&x<=21)))c='#';
      if([4,11,18,24].includes(y)&&(x===9||x===13))c='+';
      if(x===22&&y>=1&&y<=26)c='#';
      if(y===27&&x>=14&&x<=21)c=(x===17||x===18)?'Q':'#';
      // ...and the north-east room is not a classroom any more. It is the LOBBY:
      // one room given over to circulation, with a door straight through into the
      // gallery's west aisle. That single opening is what turns the core corridor
      // from a spine with a dead end at each end into a circuit. Everything else
      // up here stays locked, because locked instruction rooms are the point of
      // this floor — the complaint was that you could not get ANYWHERE, not that
      // you could not get in.
      if(x===22&&y===4)c='+';

      // Two locked faculty rooms sit beside an open reception and a stripped
      // office. The open suite is the ordinary route to the breach.
      if(y===29&&x>=0&&x<=12)c='#';
      if(y===29&&(x===3||x===9))c='+';
      if(x===6&&y>=30&&y<=38)c='#';
      if(x===19&&y>=30&&y<=38)c=y===33?'Q':'#';
      if(x===8&&y>=35&&y<=37)c='Q';
      if(x>=5&&x<=7&&y>=35&&y<=38)c=' ';

      // No authored cell occupies the centre. Collision sees an edge; the
      // academic render slice sees the garden volume ten metres below.
      if(x>=29&&x<=38&&y>=8&&y<=20)c=' ';
      row+=c;
    }
    rows.push(row);
  }
  return rows;
}
function academicProfile(x,y,cell){
  if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
  const crown=x>=23&&x<=47&&y>=2&&y<=28;
  return{ceil:crown?17:14.5};
}
function practiceWingRows(){
  // THE SPINE IS ON THE STAIR'S AXIS. The wing sits five metres further west than
  // it used to (origin x51, not x56) and reaches five metres further east, so its
  // corridor — local x9-11 — lands on authored x60-62: exactly the shaft the main
  // stair climbs. Come up from the ground floor and the corridor is dead ahead
  // down the middle of the wing, rather than five metres off your left shoulder.
  //
  // Nothing inside here moved in LOCAL terms. The whole change is the origin, plus
  // the east rooms now running to the new east wall (twelve metres instead of
  // seven) which is what the ensemble room in the room tone always implied.
  const w=26,h=34,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'P';
    // A four-metre arrival hall receives both stairs and continues east to the
    // chapel bridge. The eight teaching rooms begin beyond its south wall, so
    // neither stair nor chapel circulation ever borrows a classroom.
    const roomBand=y>=4&&y<h-1;
    if((x===8||x===12)&&roomBand){
      c=[7,14,21,28].includes(y)?'+':'#';
    }
    if([4,11,18,25,32].includes(y)&&(x<9||x>11))c='#';
    // The mouth in the north wall carries BOTH stairs: the main shaft at authored
    // x60-62 and the academic flight's foot beside it at x63-65. Cut it any
    // narrower and the third floor stops being reachable.
    if(y===0&&x>=9&&x<=14)c='P';
    if(x===w-1&&y===3)c='+';           // thick-wall throat to upper bridge
    if(x===w-1&&y===16)c='+';          // string-room door to side passage
    row+=c;
  }out.push(row);}return out;
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
  {id:'front_atrium',replace:true,layer:'ground',space:'front_atrium',renderGroup:'ground',origin:{x:74,y:3},physicalOrigin:{x:74,y:3},base:0,rows:frontAtriumRows(),profile:frontAtriumProfile},
  // The dock and the replacement atrium each own one metre of this old thick
  // wall. Author both cells as one single-leaf throat; leaf count remains
  // explicit in the door schedule.
  {id:'dock_foyer_threshold',replace:true,layer:'ground',space:'front_atrium',renderGroup:'ground',origin:{x:73,y:13},physicalOrigin:{x:73,y:13},base:0,rows:['++']},
  {id:'natatorium',replace:true,layer:'ground',space:'natatorium',renderGroup:'ground',origin:{x:70,y:27},physicalOrigin:{x:70,y:27},base:0,rows:natatoriumRows(),profile:natatoriumProfile},
  {id:'hall_box_office_link',replace:true,layer:'ground',space:'front_atrium',renderGroup:'hall',origin:{x:94,y:24},physicalOrigin:{x:94,y:24},base:0,rows:['FFFFHH','FFFFHH','FFFFHH']},
  {id:'hall_orchestra',replace:true,layer:'ground',space:'hall',renderGroup:'hall',origin:{x:98,y:4},physicalOrigin:{x:98,y:4},base:0,rows:hallGroundRows(),profile:hallGroundProfile},
  {id:'hall_lower_balcony',layer:'hall_lower',space:'hall',renderGroup:'hall',origin:{x:0,y:40},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('L')},
  {id:'hall_upper_balcony',layer:'hall_upper',space:'hall',renderGroup:'hall',origin:{x:0,y:82},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('U')},
  {id:'galleria_lower_stair',physicalReplace:true,layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:32,y:40},physicalOrigin:{x:99,y:20},base:0,rows:galleriaStairRows(1),stairs:[{from:{x:33,y:41},to:{x:33,y:51},fromH:-.74,toH:4,width:2,head:2.6,zone:'hall',material:'woodVelvet'}]},
  {id:'galleria_upper_stair',physicalReplace:true,layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:40,y:40},physicalOrigin:{x:122,y:20},base:0,rows:galleriaStairRows(4),stairs:[{from:{x:44,y:51},to:{x:44,y:41},fromH:4,toH:7.5,width:2,head:2.6,zone:'hall',material:'woodVelvet'}]},
  {id:'practice_wing',replace:true,layer:'upper',space:'practice',renderGroup:'upper',origin:{x:51,y:52},physicalOrigin:{x:51,y:52},base:4.8,rows:practiceWingRows()},
  {id:'upper_atrium_bridge',replace:true,layer:'upper',space:'upper_atrium',renderGroup:'upper',origin:{x:77,y:53},physicalOrigin:{x:77,y:53},base:4.8,rows:upperAtriumBridgeRows()},
  // The academic flight is visible immediately from the practice landing. It
  // reverses beside the original upper stair, then meets the south end of the
  // third-floor bridge without borrowing a classroom or hiding behind a seam.
  // The academic flight is visible immediately from the practice landing. It
  // reverses beside the original upper stair, then meets the south end of the
  // third-floor bridge without borrowing a classroom or hiding behind a seam.
  //
  // The foot now stands IN the arrival hall's north edge rather than three metres
  // out behind its back wall, so coming up the main stair the third-floor flight is
  // beside you and in view instead of through the mouth at your shoulder.
  //
  // The trick is that logical and physical are decoupled here. Its LOGICAL cells
  // stay outside the wing — they must, because a connector's redirect only fires
  // where an ordinary step is blocked, and inside the hall you would simply walk
  // across the seam and never take it. Only the PHYSICAL placement moved south,
  // two metres, and `physicalReplace` lets those treads own the hall's air where
  // they now overlap it (see writeStairCell).
  {id:'academic_stair',physicalReplace:true,layer:'academic_stair',space:'academic_stair',renderGroup:'academic',origin:{x:52,y:180},physicalOrigin:{x:63,y:38},base:4.8,rows:Array.from({length:18},()=> ' '.repeat(6)),stairs:[{
    id:'main-academic-stair',zone:'stair',material:'serviceConcrete',head:3.4,
    flights:[{
      id:'return-flight',from:{x:52,y:194},to:{x:52,y:184},
      physicalFrom:{x:63,z:51},physicalTo:{x:63,z:41},
      fromH:4.8,toH:10,width:3,rises:26,groupFrom:'upper',groupTo:'academic',
    }],
    landings:[
      {id:'practice-return',at:{x:52,y:194},size:{x:3,y:3},physicalAt:{x:63,z:51},height:4.8,renderGroup:'upper'},
      {id:'academic-landing',at:{x:52,y:181},size:{x:3,y:3},physicalAt:{x:63,z:38},height:10,renderGroup:'academic'},
    ],
  }]},
  {id:'academic_floor',layer:'academic',space:'academic',renderGroup:'academic',origin:ACADEMIC_ORIGIN,physicalOrigin:ACADEMIC_PHYSICAL_ORIGIN,base:ACADEMIC_BASE,rows:academicFloorRows(),profile:academicProfile},
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
  height: 300,
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
    // Existing save addresses remain untouched; these seams enter the appended
    // academic stair and then the third-floor bridge at identical elevations.
    //
    // DO NOT PUT `span` ON THESE. It was tried, to fix the reported "you get
    // locked into paths" bug — the third floor's foot landing stands inside the
    // second-floor hall, invisible, and a single-cell seam leaves its whole
    // perimeter wall except one half-metre tile. Widening the seam does raise
    // the ways in from 1 to 50. It also makes the return journey IMPOSSIBLE:
    // measured, 3F->ground went from reachable in 2146 cells to unreachable.
    //
    // The reason is structural. A redirect fires on any successful step ONTO a
    // seam cell, so once a seam covers an area rather than a junction, ordinary
    // movement inside that area throws you onto the other logical island, where
    // the next step is a wall. One cell works precisely because it is the only
    // one. The real fix is to stop needing a hidden landing at all — see the
    // spiral rebuild, which replaces this stair with one continuous run.
    {from:{x:63,y:52},to:{x:53,y:196}},
    {from:{x:53,y:181},to:{x:13,y:278}},
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
        // ── the dance wing ────────────────────────────────────────────────
        // Studio B3 (the take) at the dead-end end, then B2 and B1 east of it
        // along the north side of the service corridor. The prop store is the
        // room at the far west, opposite the stair. South of the corridor:
        // Room 5, then the spur, then the plant room. The spur is a two-metre
        // passage with two locked doors and a bricked lift shaft at the end.
        //
        // Generated from a rectangle declaration; if you move a room, move its
        // props (conservatory-props.js) and PLANT_RIG_CELL with it.
        '',
        '',
        '',
        '',
        '',
        '     ###################################',
        '     #BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK#',
        '######BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK# #####',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK# #ooo#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK# #ooo#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK# #ooo#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK####+######',
        '#VVVV#BBBBBBBBBBBBBBBBBBB+KKKKKKKKKKKKK#KKKKKKKKK#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK#KKKKKKKKK#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK#KKKKKKKKK#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK#KKKKKKKKK#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKKKKKKKKK#KKKKKKKKK#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKK########KKKKKKKKK#',
        '#VVVV#BBBBBBBBBBBBBBBBBBB#KKKKKK#      #KKKKKKKKK#',
        '#VVVV##########.##########KKKKKK#      #KKKKKKKKK#',
        '#VVVV#         .         #KKKKKK#      #KKKKKKKKK#',
        '##+############.############+##############+######',
        '#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;#',
        '#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;#',
        '#;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;#',
        '############+#############;;;####################',
        '       #KKKKKKKKKKKKKKKK##;;;#MMMMMMMMMMM#',
        '       #KKKKKKKKKKKKKKKK##;;;#MMMMMMMMMM##',
        '       #KKKKKKKKKKKKKKKK##;;;#MMMMMMMMMM##',
        '       #KKKKKKKKKKKKKKKK##;;;#MMMMMMMMMM##',
        '       #KKKKKKKKKKKKKKKK##;;;+MMMMMMMMMM##',
        '       #KKKKKKKKKKKKKKKK##;;;#MMMMMMMMMM##',
        '       #KKKKKKKKKKKKKKKK##;;;#MMMMMMMMMMM#',
        '       ###################;;;#MMMMMMMMMMM#',
        '                  #MMMMMM#;;;#MMMMMMMMMMM#',
        '                  #MMMMMM#;;;#############',
        '                  #MMMMMM+;;;#JJJJJJ#',
        '                  #MMMMMM#;;;+JJJJJJ#',
        '                  ############JJJJJJ#',
        '                             ########',
      ],
    },
    {
      // ── ground ─────────────────────────────────────────────────────────────
      id:'ground',layer:'ground',space:'ground',renderGroup:'ground',origin: { x: 50, y: 0 }, physicalOrigin:{x:50,y:0},base: 0,
      rows: [
        '',
        '',
        '',
        '       ########+######## ################# ###################',
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
        '         ##,##           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTWWWWWWWWWWWTTTT#',
        '         #,,,#           #TTTTTTTTTTTTTTTTTTT#',
        '         #,,,#           #TTTTTTTTTTTTTTTTTTT#',
        '         #,,,#           #####################',
      ],
      stairs: [],
    },
    {
      // ── upper, four metres up ──────────────────────────────────────────────
      id:'upper',layer:'upper',space:'upper',renderGroup:'upper',origin: { x: 50, y: 44 }, physicalOrigin:{x:50,y:44},base: 4.8,
      rows: [
        '         #,,,#',
        '         #,,,#',
        '         #,,,#',
        '         #,,,#',
        '         #,,,#',
        '         #,,,#',
        '         #,,,#',
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
        '',
        '',
      ],
      stairs: [
        // Both principal stairs own their complete flights and three-metre
        // landings. No endpoint inherits a neighbouring room's identity.
        {
          id:'main-basement-stair',zone:'stair',material:'serviceConcrete',
          layer:'main_stair',space:'basement_stair',renderGroup:'ground',head:3.2,
          flights:[{
            id:'west-flight',from:{x:57,y:22},to:{x:47,y:22},
            physicalFrom:{x:57,y:22},physicalTo:{x:47,y:22},physicalWidthSign:-1,
            fromH:0,toH:-4,width:3,rises:20,groupFrom:'ground',groupTo:'basement',
          }],
          landings:[
            {id:'ground-landing',at:{x:57,y:22},size:{x:3,y:3},physicalAt:{x:57,y:22},height:0,space:'basement_stair',renderGroup:'ground'},
            {id:'b3-landing',at:{x:45,y:22},size:{x:3,y:3},physicalAt:{x:45,y:22},height:-4,space:'basement_stair',renderGroup:'basement'},
          ],
        },
        {
          id:'main-upper-stair',zone:'stair',material:'serviceConcrete',
          layer:'main_stair',space:'upper_stair',renderGroup:'upper',head:3.4,
          flights:[{
            id:'shaft-flight',from:{x:60,y:41},to:{x:60,y:52},
            physicalFrom:{x:60,y:41},physicalTo:{x:60,y:52},physicalWidthSign:-1,
            fromH:0,toH:4.8,width:3,rises:22,groupFrom:'ground',groupTo:'upper',
          }],
          landings:[
            {id:'ground-vestibule',at:{x:60,y:38},size:{x:3,y:3},physicalAt:{x:60,y:38},height:0,space:'upper_stair',renderGroup:'ground'},
            {id:'practice-landing',at:{x:60,y:52},size:{x:3,y:3},physicalAt:{x:60,y:52},height:4.8,space:'upper_stair',renderGroup:'upper'},
          ],
        },
      ],
    },
    ...EUCLIDEAN_ADDITIONS,
  ],
};
