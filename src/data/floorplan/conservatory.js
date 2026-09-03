// THE CONSERVATORY. Condemned, powered down, days from demolition.
//
// Four logical drawings, compiled into one Euclidean physical volume. Logical
// cells remain unique for saves, sound paths and mutation; physicalOrigin puts
// their air spans above/below one another for the renderer.
//
//   sub-basement  (left, -4m)    the dance wing: B3 · B2 · B1 · room 5 · the
//                                prop store · the plant room · two locked
//                                service rooms · the bricked lift shaft
//   ground        (top right)    the loading bay · Scene Dock · foyer · concert
//                                hall · the natatorium
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
import {
  CHURCH_BOUNDS, CHURCH_LEVELS, churchGroundRows,
  churchDoorAt, churchRoomAt, churchVolumeAt, churchWallAt,
} from '../st-brendans.js';
import {
  DISTRICT_BOUNDS,
  DISTRICT_LOGICAL_ORIGIN,
  buildExteriorDistrictRows,
  districtFacadeHeightAt,
  districtLogicalAt,
  elleryMassingAt,
} from '../exterior-district.js';
import { mainStairFloorplanFlights, mainStairFloorplanLandings } from '../main-stair-geometry.js';

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
    // The rear cross aisle runs between the arms, not under them. The lower
    // balcony's arms come all the way back to this row at 4.00, and drawing the
    // ramp beneath them would put two decks at one height in one volume.
    if(y>=32&&y<h-1&&x>=5&&x<=24)c='r';
    // and the strips the arms come back over are left unclaimed, so the arm deck
    // is the only floor in that column rather than a second one under it.
    if(y>=32&&y<h-1&&x>0&&x<w-1&&(x<5||x>24))c=' ';
    if(x===0&&(y===7||y===20||y===21||y===32))c='+';
    row+=c;
  }out.push(row);}return out;
}
// THE STAGE IS A PLATFORM, NOT A PATCH OF FLOOR.
//
// It was authored flat at -2.5 — the same height as the front of the house — so
// there was no stage, only the part of the room the seats point at. The
// hall_structure mesh has always drawn a deck at -2.2, which the player walked
// straight through.
//
// A metre above the front stalls, which is a real platform height and is
// deliberately more than STEP_UP: you cannot wander onto it, and you cannot step
// off the front of it either. Two step bays inside the proscenium opening are
// the way up, and they are the reason the position matters to a take.
const STAGE_FLOOR=-1.5;
function hallStageRows(){
  const w=30,h=38,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++)row+=(y>=1&&y<=7&&x>=1&&x<=w-2)?'S':' ';out.push(row);}
  return out;
}
function hallStageProfile(x,y,cell){
  if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
  // Downstage left and right, inside the opening (authored x106-108, x117-119).
  // Three risers of a third of a metre carry -2.5 up to -1.5.
  const bay=(x>=8&&x<=10)||(x>=19&&x<=21);
  if(bay&&y===7)return{floor:-2.16,ceil:15.5,flags:cell.flags|F.STAIR};
  if(bay&&y===6)return{floor:-1.83,ceil:15.5,flags:cell.flags|F.STAIR};
  return{floor:STAGE_FLOOR,ceil:15.5,flags:cell.flags&~F.STAIR};
}
const REAR_CROSS_FLOOR=2.5, BALCONY_DECK=4.0, HALL_ROWS=38;
function hallGroundProfile(x,y,cell){
  if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
  if(y<=7)return{floor:-2.5,ceil:15.5,flags:cell.flags&~F.STAIR};
  // ONE RAMP. The rake does not stop at the back row — the rear cross aisle keeps
  // climbing the last metre and a half and ARRIVES at the lower balcony's deck
  // height. The bowl and the circle are one continuous surface, which is why
  // there is no flight anywhere in this room: the risers are the stairs.
  //
  // Its ceiling rises from the old 3.8 — which was the underside of the lower
  // balcony's own rear band, and that band is gone, because this IS that band now
  // (see balconyRows) — but stops at 7.3, under the UPPER balcony's rear deck at
  // 7.5. Opening it to the full house drove this span straight through that deck:
  // 400 physical overlaps.
  if(y>=32){
    const climb=Math.min(1,(y-32)/(HALL_ROWS-2-32));
    return{floor:REAR_CROSS_FLOOR+climb*(BALCONY_DECK-REAR_CROSS_FLOOR),ceil:7.3,flags:cell.flags|F.STAIR};
  }
  // Eleven half-metre terraces align with the accepted seating bowl. Only the
  // centre and side aisles are stairs; seats are blocked by their authored
  // collision mask and never turn the whole hall into one enormous stair.
  const terrace=Math.min(11,Math.floor((y-8)/2));
  const floor=-2.5+terrace*.44;
  const aisle=(x>=1&&x<=4)||(x>=13&&x<=16)||(x>=25&&x<=28);
  // Under the arms the ceiling is the arm's own soffit, so it cascades with it.
  const soffit=(x<=4||x>=25)?balconyCascade(4.0,y)-.2:15.5;
  return{floor,ceil:soffit,flags:aisle?(cell.flags|F.STAIR):(cell.flags&~F.STAIR)};
}
// THE ARMS CASCADE TOWARD THE PLATFORM.
//
// Koerner's side balconies step down in box tiers as they approach the
// platform, rather than running level the length of the room. Ours did run
// level, which is what made them read as two shelves.
//
// The rear keeps its authored height, because that is where the ramp arrives and
// the seam depends on it. Each tier forward drops one BOWL RISER — the same 0.44
// the rake steps by — so the balcony and the stalls are visibly the same
// geometry, and every step stays under STEP_UP so the arm is walkable end to end
// (the upper arm has to carry you to the galleria flight).
//
// The aisle underneath has to come down with it, or the arm's deck sinks through
// its own soffit. hallGroundProfile calls this for exactly that reason.
const BALCONY_STEP=.44, BALCONY_TIERS=5, ARM_REAR_ROW=36;
function balconyCascade(base,localY){
  const tier=Math.min(BALCONY_TIERS-1,Math.max(0,Math.floor((ARM_REAR_ROW-localY)/6)));
  return base-tier*BALCONY_STEP;
}
function balconyProfile(base,clear){
  return (x,y,cell)=>{
    if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
    // Only the arms cascade. A rear band, where one exists, is the flat deck the
    // two arms hang off and must stay level.
    if(!((x<=4||x>=25)&&y>=8&&y<=ARM_REAR_ROW))return null;
    const floor=balconyCascade(base,y);
    return{floor,ceil:floor+clear};
  };
}
// `rear` draws the band across the back of the horseshoe. The LOWER balcony no
// longer has one: the hall's own rear cross aisle climbs to 4.0 and is that band,
// so drawing a second deck at the same height in the same place would be two
// floors in one volume — the exact fault the galleria flight used to have. The
// UPPER balcony keeps its rear, which is the only thing joining its two arms.
function balconyRows(glyph,{rear=true}={}){
  const w=30,h=38,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=' ';
    if(x===0||x===w-1||y===0||y===h-1)c='#';
    else if((y>=8&&y<=36&&(x<=4||x>=25))||(rear&&y>=32))c=glyph;
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
    // One outer room envelope. The W rectangle is the real two-metre basin;
    // its only ordinary transition back to deck height is the stair authored
    // on the level below.
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'T';
    // A municipal bath admitted crowds, school groups and stretchers through a
    // proper glazed pair. Two adjacent glyphs compile as one two-metre portal;
    // the old single fire leaf made the entire public entrance read as a closet.
    if(y===0&&(x===13||x===14))c='+';
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
  // The basin is deliberately a real height-field depression now. Its vertical
  // tile faces are the pool walls; the west access stair supplies the legal
  // walkable transition, so no invisible collision lid is needed.
  //
  // This was flattened to deck height once before, because a real depression
  // rendered as a solid cube — physicalRenderPlanFor dropped the basin cells
  // out of any slice built for the deck and a cell with no span comes back
  // solid. The renderer keeps a room's own spans now whatever their height, so
  // the depression is safe to author honestly. See sameRoom in
  // world/floorplan.js, and the assertions in tests/floorplan.mjs.
  // The academic crown begins at 10m over this physical footprint. Stop the
  // pool hall below that slab; the old 11.2m envelope literally intersected
  // its walls and models, producing the nested room visible from the deck.
  return{floor:cell.floor,ceil:9.5,flags:cell.flags};
}
function frontAtriumRows(){
  const w=24,h=25,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'A';
    if(y===0&&(x===4||x===5))c='+';    // public glazed entrance pair
    if(x===0&&y===10)c='+';
    if(x===w-1&&y===13)c='x';          // old staff door, visibly bricked
    if(y===h-1&&x===11)c='+';
    // Compact entrance-side ticket office. It sits beside the public doors,
    // where a municipal box office belongs, instead of forming a brick choke
    // point immediately in front of the concert-hall portal. The public counter
    // faces west; staff enter through the master-key leaf on the south wall.
    if(x>=17&&y>=3&&y<=10)c=(x===17||x===w-1||y===3||y===10)?'#':'F';
    // THE TICKET WINDOW IS SHUT, AND THE WALL HAS TO SAY SO.
    //
    // These two cells used to be open 'F', on the reasoning that the fitted
    // counter standing in front of them was the barrier. It is not: ticket_counter
    // is 2.8 x 0.75 at scale 0.75, so it covers runtime x180-181 across y16-20 and
    // leaves runtime row 21 clear — a two-metre walk-in from the atrium, past the
    // queue stanchions, straight through where the grille is meant to be. A prop
    // is dressing; the plan is the collision, and the plan said this was a way in.
    //
    // The counter's own text has always described the opposite: "built to keep a
    // queue outside and cash inside. The grille is still locked down." So the
    // frontage is wall now and the counter reads as a shuttered hatch in front of
    // it. Staff still get in the way the sheets say they do — the master-key leaf
    // on the south wall (foh-office) — which is what makes that hint worth
    // printing.
    //
    // Verified: with these sealed, the key cabinet, the rekey ledger and the desk
    // all remain reachable from the atrium. test/box-office.spec.mjs holds both
    // halves of that, because a sealed room is as broken as an open frontage.
    if(y===10&&x===20)c='+';
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
// Pull the whole upper/practice-chapel assembly north as one Euclidean piece.
// Its logical addresses stay untouched, so every room and interaction id is
// stable; only the obsolete fifteen-metre stair feeder disappears.
const UPPER_WING_Z_SHIFT=-9.5;
const upperWingZ=(z)=>z+UPPER_WING_Z_SHIFT;
// The LOCKED ones: four vocal studios and two teaching rooms. The chamber room
// has no leaf (you walk into it), the vestibule pair is unlocked, and the
// south-east room is entered through the breach in its back wall.
//
// This list and the schedule in data/conservatory-doors.js declare the same
// leaves twice. They must move together, and so must the '+' glyphs.
export const ACADEMIC_CLASSROOM_DOORS=Object.freeze([
  {x:7,y:251},{x:7,y:256},{x:7,y:261},{x:7,y:265},
  {x:11,y:253},{x:11,y:260},
]);
export const ACADEMIC_ENTRY=Object.freeze({x:13,y:277});
export const ACADEMIC_BREACH=Object.freeze({x:17,y:267});

export const MAIN_STAIR_LAYOUT=Object.freeze({
  revision:2,
  groundHall:Object.freeze({x:138,y:26}),
  groundLanding:Object.freeze({x:139,y:29}),
  lowerStart:Object.freeze({x:134,y:50}),
  upperLanding:Object.freeze({x:154,y:74}),
  practiceMouth:Object.freeze({x:63,y:53}),
  upperStart:Object.freeze({x:134,y:65}),
  academicLanding:Object.freeze({x:13,y:277}),
});

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

      // A VOCAL FLOOR, NOT A LATTICE OF CELLS.
      //
      // This was eight identical 8x6 rooms in a perfect 2x4 grid off a 3-metre
      // corridor that ran twenty-seven metres to a blank north wall. Two
      // constant wall columns, one constant list of cross-walls, one constant
      // list of door rows — and the dressing matched, seven desks and a board
      // in every room with `room%2` deciding piano or cabinet. It read as a
      // table because it was one.
      //
      // What a conservatory's upper floor actually is: vocal studies, a small
      // chamber room, vaults and frescos. The four upright pianos were already
      // up here, one per pair of rooms; they are studio uprights and nobody had
      // said so.
      //
      //   THE CORRIDOR ARRIVES SOMEWHERE. Its head is the chamber room now, so
      //   the walk from the stair ends in the best room on the floor instead of
      //   at masonry. The gallery is reached THROUGH it, by way of a vestibule,
      //   which makes the chamber the hinge of the circuit rather than leaving
      //   the old lobby as a room that was only ever a landing.
      //
      //   THE TWO SIDES STOP MATCHING. Six metres of studio west, ten metres of
      //   teaching east — the same asymmetry the practice wing uses, and for the
      //   same reason: a double-loaded corridor with equal banks is a drawing
      //   convention, not a building.
      //
      // Everything but the chamber room and its vestibule stays locked behind
      // wired glass. That was always the point of this floor; the complaint was
      // that the walk delivered nothing, not that the rooms were shut.

      // The chamber room (x1-16) and the gallery vestibule (x18-21) fill the
      // north band. The corridor opens into the chamber, so there is no leaf
      // between the walk and its destination.
      if(y>=1&&y<=8&&x===17)c='#';
      if(y===4&&x===17)c='+';
      if(y===9&&x>=1&&x<=21)c='#';
      if(y===9&&x>=8&&x<=10)c='Q';

      // The corridor, three metres, x8-10.
      if(y>=10&&y<=27&&(x===7||x===11))c='#';

      // WEST: four vocal studios, 6m deep, of unequal depth — 4, 4, 3, 3. A
      // studio is a piano, a stand and two people; it does not want to be the
      // same room as a theory class.
      if([14,19,23].includes(y)&&x>=1&&x<=6)c='#';
      if([11,16,21,25].includes(y)&&x===7)c='+';
      if(y===27&&x>=1&&x<=6)c='#';

      // EAST: ten metres deep. One large theory room bent around a service
      // chase, a shallow store, and the room the breach opens into.
      if([18,22].includes(y)&&x>=12&&x<=21)c='#';
      if([13,20].includes(y)&&x===11)c='+';
      // The chase. No door and nothing behind it — its whole job is to stop the
      // theory room being another rectangle.
      if(x>=12&&x<=13&&y>=10&&y<=12)c='#';

      if(x===22&&y>=1&&y<=26)c='#';
      // The one cut into the gallery, five metres from the nearest plinth. It
      // is the vestibule's door now rather than the old lobby's.
      if(x===22&&y===4)c='+';
      // THE BREACH. The south-east room opens to the south corridor through two
      // metres of missing wall. Its corridor door is gone: a locked leaf on the
      // front of a room you can walk into the back of was the floor's plainest
      // piece of nonsense.
      if(y===27&&x>=12&&x<=21)c=(x===17||x===18)?'Q':'#';

      // Two locked faculty rooms sit beside an open reception and a stripped
      // office. The open suite is the ordinary route to the breach.
      if(y===29&&x>=0&&x<=12)c='#';
      if(y===29&&(x===3||x===9))c='+';
      if(x===6&&y>=30&&y<=38)c='#';
      if(x===19&&y>=30&&y<=38)c=y===33?'Q':'#';
      if(x===8&&y>=35&&y<=37)c='Q';
      // Stair clearance, not a mistake: academic_stair_loggia replaces this
      // footprint and carves the hero flight's cylinder out of it.
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
// VAULTS, IN BAYS, ON THE RIB LINES.
//
// This returned two flat numbers for a whole floor. The gallery got seven
// metres and everything else four and a half, which is why the corridor and the
// rooms read as one undifferentiated slab of air.
//
// A stepped ceiling is the honest way to author a vault here. The natatorium
// note above warns that per-cell ceiling steps show as visible headers in the
// DDA renderer — and that is exactly right, which is why the steps land on the
// BAY DIVISIONS, where a transverse rib belongs. The renderer's one limitation
// and the architecture agree: a groin-vaulted corridor IS a row of bays with a
// rib between each pair.
const ACADEMIC_BAY_RIBS=Object.freeze([14,19,23]);   // the studio cross-walls
function academicVault(y,ribs,crown,springing){
  // A rib row, or the cell either side of one, sits at the springing; the
  // middle of a bay carries the crown.
  return ribs.some((rib)=>Math.abs(y-rib)<=1)?springing:crown;
}
function academicProfile(x,y,cell){
  if(cell.solid||(cell.flags&(F.DOOR|F.BRICKED)))return null;
  const crown=x>=23&&x<=47&&y>=2&&y<=28;
  if(crown)return{ceil:17};
  // THE CHAMBER ROOM. Seven metres, vaulted across its width in three bays, so
  // it stands with the gallery rather than with the studios it is reached
  // through. It is the only room up here with the height to carry a fresco.
  if(x>=1&&x<=16&&y>=1&&y<=8){
    return{ceil:academicVault(x,[6,11],17,15.6)};
  }
  // The vestibule is deliberately low, so the chamber reads as a volume you
  // leave and the gallery as one you enter.
  if(x>=18&&x<=21&&y>=1&&y<=8)return{ceil:14.2};
  // The corridor, vaulted on the studios' own rhythm. Low — you are under the
  // building's services here, and the dark is the point.
  if(x>=8&&x<=10&&y>=9&&y<=27){
    return{ceil:academicVault(y,ACADEMIC_BAY_RIBS,14.6,13.6)};
  }
  // Studios and teaching rooms keep a flat ceiling. Small rooms have flat
  // ceilings; pretending otherwise would make the vault meaningless.
  return{ceil:14.5};
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
function groundStairHallRows(){
  // One room, not an L-shaped collision maze. The narrow north arm replaces the
  // obsolete stem; the broader south bay clears the whole six-metre coil plus a
  // one-metre construction margin. Blank corners become the adjoining rooms'
  // ordinary masonry, safely outside the stair and its landing apron.
  const out=[];
  for(let y=0;y<15;y++){
    let row='';
    for(let x=0;x<12;x++){
      const approach=y<=7&&x>=3&&x<=9;
      const stairBay=y>=7&&x>=2&&x<=10;
      row+=approach||stairBay?',':' ';
    }
    out.push(row);
  }
  return out;
}
function groundStairHallProfile(x,y,cell){
  if(cell.solid)return null;
  const px=57+x+.5,pz=25+y+.5;
  const insideHero=Math.hypot(px-63,pz-36)<=3.35;
  const onLanding=px>=56.5&&px<=63.25&&pz>=32.5&&pz<=37.5;
  if(insideHero&&!onLanding)return{ceil:4.55,collisionOnly:true,zone:ZONE.stair,flags:cell.flags&~F.MUTABLE};
  return{ceil:4.55,zone:ZONE.stair,flags:cell.flags&~F.MUTABLE};
}
function upperStairHallRows(){
  // The practice wing is brought up to the stair bay, so U1 is an actual room:
  // landing, upward continuation, practice threshold and chapel route are all
  // visible within eight metres. There is no feeder corridor behind it.
  return Array.from({length:9},()=>','.repeat(12));
}
function upperStairHallProfile(x,y,cell){
  if(cell.solid)return null;
  const px=60+x+.5,pz=33.5+y+.5;
  const insideHero=Math.hypot(px-63,pz-36)<=3.35;
  const onLanding=px>=62&&px<=69&&pz>=32.5&&pz<=37.5;
  if(insideHero&&!onLanding)return{ceil:9.75,collisionOnly:true,zone:ZONE.stair,flags:cell.flags&~F.MUTABLE};
  return{ceil:9.75,zone:ZONE.stair,flags:cell.flags&~F.MUTABLE};
}

function academicStairLoggiaProfile(x,y,cell){
  const profile=academicProfile(x,y,cell)||{};
  if(cell.solid)return profile;
  const px=54+x+.5,pz=34+y+.5;
  const insideHero=Math.hypot(px-63,pz-36)<=3.35;
  const onLanding=px>=63&&px<=70&&pz>=36&&pz<=41;
  if(insideHero&&!onLanding)return{...profile,collisionOnly:true,zone:ZONE.stair,flags:cell.flags&~F.MUTABLE};
  return profile;
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


// THE YARD, WHICH IS SCENERY AND NOT A ROOM.
//
// The loading bay's apron is drawn into the ground level itself (its first seven
// columns, which were empty). This is everything WEST of the bay mouth: the wet
// yard the lorry reversed across, and it exists for one reason — a ray leaving
// the bay has to have somewhere to go. Undrawn cells are rock, and rock beside a
// sky cell is drawn to the 90m ceiling r3d gives sky, so a bay with nothing
// outside it is a bay facing a black cliff. Drawn ground lets the ray run to the
// plan edge and become sky, and the distant valley is meshes past that edge.
//
// It is never walked. Its east edge is the retaining wall (`w`), a 1.20m rise
// canStep refuses, so the bay's open face is a view and not a way out. Its
// LOGICAL address is parked in the empty band at y200 because the sub-basement
// owns every logical cell west of x50; only the physical embedding is out here.
// Nothing walks between the two, so this needs no connector.
// Big, because a ray that leaves the yard's edge does not find sky — it finds
// the undrawn cells inside the plan's bounding box, which are rock, and rock
// beside a sky cell is drawn to the 90m ceiling r3d gives sky. At sixteen rows
// the first look south-west out of the bay hit a black slab eight metres away.
// The sub-basement tops out at -0.40m and the yard sits at grade, so this can
// run the full depth of the building's footprint without meeting anything.
//
// SEVENTY-FOUR WAS NOT THE FULL DEPTH. The ground slice is 256x186 runtime cells
// from physical (0,0) — 128m by 93m — and every cell north of the yard's old
// last row was undrawn, which is to say rock, which is to say a ninety-metre
// black cliff standing across the whole northern horizon sixty-six metres out,
// with no building behind it. It was the second of the two slabs that ate this
// sky; F.WALLED on the yard glyphs (legend.js) is the first. 93 runs the drawn
// ground to the edge of the slice, where the ray leaves the plan and becomes
// weather. Measure the slice before changing this — if the building grows north,
// this grows with it or the cliff comes back.
const YARD_W=50,YARD_H=93;
// THE ROOFLINE.
//
// A WALLED sky cell's ceiling is the height every solid neighbour is drawn UP TO
// (see the wall test in r3d.js: when the next cell is solid the wall spans the
// CURRENT cell's floor to its ceiling). So these numbers are not headroom over a
// yard nobody's head goes near — they are the top edge of the conservatory, read
// off whichever yard cell the ray is standing in when it meets the building.
//
// Banded along the yard's depth, so the elevation has a silhouette instead of an
// extrusion. The mouth band matches `parapet` in the west elevation mesh
// (tools/chunk_surfer/build-props.mjs) exactly; move one and move the other.
function yardCeilAt(ry){
  return elleryMassingAt(ry).height;
}
// The head of the basement stair breaks grade at +0.50m and stands in the middle
// of all this. Lay the kerb glyph over it rather than leaving a hole: at 0.80m
// it clears the stair's span, it is under the 1.0m slice window so it still
// draws, and a low block in a yard reads as exactly what it is.
const YARD_STAIR_HEAD={x0:13,x1:17,y0:18,y1:21};
// ── the park ────────────────────────────────────────────────────────────────
// The south-west quarter of the yard was fifty metres of wet tarmac with
// nothing on it. It is a municipal park now: lawn, two crossing paths, and a
// fountain at the crossing with the night's rain standing in it.
//
// The north edge is y22 and not further up for two reasons that happen to
// agree. YARD_STAIR_HEAD sits at x13-17, y18-21 — a 0.80m kerb that clears the
// basement stair's grade break behind it, structural, and not something to lay
// a lawn over. And `yard-fence-west` runs out at z22.2, so starting here lets
// the fence be the park's north-east boundary instead of a thing standing in it.
const YARD_PARK={x0:1,x1:19,y0:22,y1:50};
const YARD_PARK_SPINE=10;          // the north-south path, and the way in
const YARD_PARK_CROSS=36;          // the east-west path
// The fountain, at the crossing. The glyph is not decoration: `n` is wetTile in
// `dock`, and that zone-and-material pair is the ADDRESS the water body is found
// by (game/water-bodies.js). Widening the basin widens the water.
//
// IT IS AN OCTAGON, BECAUSE THE FOUNTAIN IS. This used to be a 7x7 RECTANGLE
// under a round kerb, so the wet tile — and with it the water surface, which the
// shader masks by material — ran out past the stone in four square corners and
// sat on the lawn. The kerb the mesh builds is an eight-sided ring at R=3.30
// with its flats on the cardinals (build-props.mjs, park_fountain); rasterised
// at 3.2m on a one-metre grid that is rows of 3/5/7/7/7/5/3, which is the same
// octagon. The corners it gives back become lawn, so the grass now runs right up
// to the coping.
const YARD_PARK_BASIN_CENTRE={x:10.5,y:36.5};
const YARD_PARK_BASIN_R=3.2;
const YARD_PARK_BASIN={x0:7,x1:13,y0:33,y1:39};
const inYardParkBasin=(x,y)=>Math.hypot(
  x+.5-YARD_PARK_BASIN_CENTRE.x,
  y+.5-YARD_PARK_BASIN_CENTRE.y,
)<=YARD_PARK_BASIN_R;
// ── st brendan's ────────────────────────────────────────────────────────────
// The church on the tarmac past the park. Its plan lives in data/st-brendans.js
// because the elevation mesh is built from the same manifest — a mesh modelled
// against a remembered plan drifts off it the first time a transept moves, and
// a church whose walls and whose mesh disagree is one you can see through.
function churchGlyphAt(x,y){
  const volume=churchVolumeAt(x,y);
  if(volume)return volume==='crossing'?'X':volume==='nave'?'Z':volume==='choir'?'z':'c';
  // A door takes the height of the room behind it rather than punching a 3.4m
  // hole through a thirteen-metre wall.
  if(churchDoorAt(x,y))return '+';
  if(churchWallAt(x,y))return '#';
  return null;
}
const CATHEDRAL_GROUND_ORIGIN={x:120,y:180};
const CATHEDRAL_LOFT_ORIGIN={x:150,y:240};
const CATHEDRAL_BELFRY_ORIGIN={x:180,y:240};
const cathedralGroundLogical=(x,y)=>({
  x:CATHEDRAL_GROUND_ORIGIN.x+x-CHURCH_BOUNDS.x0,
  y:CATHEDRAL_GROUND_ORIGIN.y+y-CHURCH_BOUNDS.y0,
});
const cathedralLoftLogical=(x,y)=>({x:CATHEDRAL_LOFT_ORIGIN.x+x-10,y:CATHEDRAL_LOFT_ORIGIN.y+y-57});
const cathedralBelfryLogical=(x,y)=>({x:CATHEDRAL_BELFRY_ORIGIN.x+x-10,y:CATHEDRAL_BELFRY_ORIGIN.y+y-71});
function cathedralLoftRows(){
  const out=[];
  for(let y=57;y<=82;y+=1){let row='';for(let x=10;x<=22;x+=1){
    const organ=x>=11&&x<=19&&y>=57&&y<=61;
    const north=x<=11&&y>=59&&y<=75;
    const south=x>=21&&y>=59&&y<=82;
    const crossing=y>=71&&y<=75;
    row+=organ||north||south||crossing?'l':' ';
  }out.push(row);}return out;
}
function cathedralBelfryRows(){
  const out=[];
  for(let y=71;y<=75;y+=1){let row='';for(let x=10;x<=21;x+=1){
    const chamber=x>=13&&x<=19;
    const passage=y===72;
    row+=chamber||passage?'b':' ';
  }out.push(row);}return out;
}
function cathedralTurret(id,from,to,center,fromH,toH,groupFrom,groupTo){
  return{id,zone:'church',material:'chapelStone',head:2.15,flights:[{
    id:'spiral',from,to,fromH,toH,width:.5,rises:24,groupFrom,groupTo,
    arc:{center:{x:center.x,z:center.y},rInner:.32,rOuter:1.48,rWalk:1.1,
      theta0:0,sweep:Math.PI*2,snapEndpoints:true},
  }],landings:[
    {id:'foot',at:from,size:{x:.5,y:.5},physicalAt:{x:center.x-.5,z:center.y-1.5},height:fromH,renderGroup:groupFrom},
    {id:'head',at:to,size:{x:.5,y:.5},physicalAt:{x:center.x-.5,z:center.y-1.5},height:toH,renderGroup:groupTo},
  ]};
}
// THE OUTSIDE OF IT IS NOT AUTHORED HERE, AND CANNOT BE.
//
// The yard's roofline trick (see YARD_ROOFLINE) raises a WALLED sky cell's
// ceiling so the building beside it is drawn to a real height. That works for
// Ellery because Ellery is raymarched from the yard. It cannot work here:
// physicalRenderPlanFor gives an exterior observer a slice with no solid
// geometry at all — outdoors, this game draws buildings from authored meshes,
// which is what conservatory_west_elevation is. Raising the yard's ceiling
// around the church would raise it around nothing.
//
// So the church is REAL INSIDE and needs an elevation mesh to be seen from the
// tarmac. Its footprint keeps its floor in the exterior slice so the ground
// stays continuous in the meantime; see the ZONE.church note in
// world/floorplan.js.
// The opening itself, in yard-local rows: the bay's three walls stand at y3 and
// y12, so this is the clear width a lorry backs through.
const YARD_MOUTH={y0:3,y1:12};
// THE DOCK FACE.
//
// A loading dock stands a few feet over its yard — that drop is most of what
// makes one read as a dock rather than as a door onto a car park. It cannot run
// the whole yard: the sub-basement's dance wing tops out at -0.40m and sits
// directly under everything past about twelve metres out, so a uniformly sunken
// yard intersects it.
//
// It does not have to. The only place the drop is ever seen is the first few
// metres, where there is nothing beneath at all (the free strip at x46..49) and
// the lift shaft beside it is already capped at -1.0. So the yard is cut down
// hard at the dock face and ramped back up to grade before it reaches the wing —
// which is what a real yard does anyway, since a lorry has to get out of it.
// It is also bounded across the yard, not only along it. Past the bay's own
// walls the dance wing comes back up under everything, so the cut is kept inside
// the band the mouth can actually see — and the walls, which are solid to 5.5m,
// hide both ends of it.
const YARD_DROP=-0.85, YARD_DROP_FROM=45, YARD_RAMP_TO=38;
const YARD_DROP_BAND={y0:2,y1:11};
// THE DOCK STEPS. A lorry uses the face; a person uses these.
//
// The 0.85m drop at the dock face is the whole reason the bay reads as a dock
// rather than as a door onto a car park, so it stays — but 0.85m is nearly twice
// STEP_UP (0.45), which means until now the apron and the yard were two places
// with no way between them. That was fine while the yard was scenery. It is not
// fine now that the gate, the hedge and the man in the booth are things you walk
// to.
//
// One half-metre lane at the far end of a nine-metre loading face was not a
// route. It was a keyhole: the obvious straight walk met the 0.85m dock rise,
// while the only legal crossing hid against the north return wall. Keep the
// raised lorry face in the middle, but cut two proper pedestrian flights into
// its ends. The south flight lines up with the goods doors; the north flight
// gives the bay a second honest way on and off instead of a single failure
// point.
//
// Four shallow risers remain inside STEP_UP. The bays are deliberately broad
// enough for head-relative/diagonal movement and are paired with directional
// edge portals below, so crossing a flight never rewrites the player's logical
// address merely because they walked along the apron.
const YARD_STEP_RUN={x0:46,x1:49};
const YARD_STEP_BAYS=Object.freeze([
  Object.freeze({id:'north',y0:4,y1:5}),
  Object.freeze({id:'goods',y0:9,y1:11}),
]);
const yardStepBayAt=(y)=>YARD_STEP_BAYS.find((bay)=>y>=bay.y0&&y<=bay.y1)||null;
function yardFloorAt(x,y){
  if(y<YARD_DROP_BAND.y0||y>YARD_DROP_BAND.y1) return 0;
  if(yardStepBayAt(y)&&x>=YARD_STEP_RUN.x0&&x<=YARD_STEP_RUN.x1){
    const rise=(x-YARD_STEP_RUN.x0+1)/(YARD_STEP_RUN.x1-YARD_STEP_RUN.x0+2);
    return YARD_DROP*(1-rise);
  }
  if(x>=YARD_DROP_FROM) return YARD_DROP;
  if(x<=YARD_RAMP_TO) return 0;
  return YARD_DROP*((x-YARD_RAMP_TO)/(YARD_DROP_FROM-YARD_RAMP_TO));
}
function yardProfile(rx,ry,cell){
  if(cell.solid) return null;
  // EVERY yard cell now carries a ceiling, because every yard cell is the height
  // of whatever building stands beside it (see YARD_ROOFLINE). This used to
  // return null for all but the sunken band, which was fine while the ceiling
  // was decorative and is not fine now that it is the roofline.
  // ABSOLUTE, not headroom. The old line was `ceil: cell.ceil + floor`, which is
  // right for a room whose ceiling follows its floor down; a parapet does not get
  // lower because the tarmac in front of it was cut away for a lorry.
  const ceil=yardCeilAt(ry);
  // Kerbs (the outer bound and the stair head) keep their authored floor; they
  // are clearing real spans and must not be dragged down with the yard.
  if(cell.floor!==0) return {ceil};
  return {floor:yardFloorAt(rx,ry),ceil};
}
function cathedralGroundProfile(_rx,ry,cell){
  return cell.zone===ZONE.dock?{ceil:yardCeilAt(CHURCH_BOUNDS.y0+ry)}:null;
}
function yardRows(){
  const out=[];
  for(let y=0;y<YARD_H;y++){
    let row='';
    for(let x=0;x<YARD_W;x++){
      // NO LIP ACROSS THE BAY MOUTH. The kerb ran the whole east edge, put there
      // to stop the player walking off the apron — and it was doing nothing,
      // because the yard is a separate logical island with no connector to the
      // apron, so an ordinary step west is already refused. All it did was draw
      // a step across the one view in the game.
      //
      // It stays everywhere else along that edge, where it is never seen and is
      // doing real work: the main basement stair breaks grade at +0.20m behind
      // it, and at 0.80m the kerb clears that span.
      const mouth=y>=YARD_MOUTH.y0&&y<=YARD_MOUTH.y1;
      const southPerimeterOpening=y===YARD_H-1&&((x>=4&&x<=12)||(x>=34&&x<=42));
      const kerb=(x===YARD_W-1&&!mouth)||(y===YARD_H-1&&!southPerimeterOpening)
        ||(x>=YARD_STAIR_HEAD.x0&&x<=YARD_STAIR_HEAD.x1&&y>=YARD_STAIR_HEAD.y0&&y<=YARD_STAIR_HEAD.y1);
      // Kerb first, always. Everything below is landscaping and none of it is
      // allowed to pave over a rise that is holding a grade break up.
      if(kerb){ row+='w'; continue; }
      // The cathedral has its own logical component, but the yard component
      // still exists beneath the physical replacement. Seal that hidden copy
      // of the footprint so a player on the yard layer cannot walk through the
      // rendered stone while remaining, invisibly, in `loading_bay`. The two
      // exterior threshold cells live just beyond this mask, so an interior
      // player can still emerge into the yard.
      if(churchGlyphAt(x,y)!==null){ row+='#'; continue; }
      const inPark=x>=YARD_PARK.x0&&x<=YARD_PARK.x1&&y>=YARD_PARK.y0&&y<=YARD_PARK.y1;
      if(inPark){
        const basin=inYardParkBasin(x,y);
        // The paths are the same ordinary tarmac as the yard they were cut
        // into — a municipal park is not paved in anything nicer than the road
        // outside it.
        const path=x===YARD_PARK_SPINE||y===YARD_PARK_CROSS;
        row+=basin?'n':path?'Y':'g';
        continue;
      }
      row+='Y';
    }
    out.push(row);
  }
  return out;
}
// The bricked lift shaft is authored `o`, whose generic 8m ceiling puts its head
// four metres ABOVE the ground floor — in open air, in a building that has no
// ground floor over the sub-basement. Nobody could ever see that: r3d draws a
// sky cell to 90m regardless of the authored ceiling, so this number only ever
// reached the physical-span compiler. It reaches the yard now, as a 4m lump of
// solid air standing in the middle of the one view in this game. Stop the shaft
// below grade, where a lift overrun stops.
function basementProfile(_x,_y,cell){
  return (!cell.solid&&(cell.flags&F.SKY))?{ceil:-1.0}:null;
}

function exteriorDistrictProfile(rx,ry,cell){
  if(cell.solid)return null;
  const x=DISTRICT_BOUNDS.x0+rx,y=DISTRICT_BOUNDS.y0+ry;
  return{ceil:districtFacadeHeightAt(x,y)};
}

const EUCLIDEAN_ADDITIONS=[
  // A complete walkable street ring around Ellery. Its logical address sits
  // beyond every existing floor so no save address moves; physicalOrigin is
  // allowed to be negative and the physical slice now carries its own origin.
  {id:'exterior_civic_block',layer:'ground',space:'exterior_civic_block',renderGroup:'ground',
   origin:DISTRICT_LOGICAL_ORIGIN,physicalOrigin:{x:DISTRICT_BOUNDS.x0,y:DISTRICT_BOUNDS.y0},base:0,
   rows:buildExteriorDistrictRows(),profile:exteriorDistrictProfile},
  {id:'loading_bay_yard',layer:'ground',space:'loading_bay',renderGroup:'ground',
   origin:{x:50,y:200},physicalOrigin:{x:0,y:0},base:0,rows:yardRows(),profile:yardProfile},
  // St Brendan's owns its plan instead of borrowing the yard component. The
  // Y cells in the concave corners preserve continuous tarmac while every wall,
  // room and threshold inside the compact envelope has one named owner.
  {id:CHURCH_LEVELS.ground.id,replace:true,physicalReplace:true,layer:'cathedral_ground',
   space:'cathedral_ground',renderGroup:CHURCH_LEVELS.ground.renderGroup,
   origin:CATHEDRAL_GROUND_ORIGIN,physicalOrigin:{x:CHURCH_BOUNDS.x0,y:CHURCH_BOUNDS.y0},base:0,
   rows:churchGroundRows('Y'),profile:cathedralGroundProfile},
  // One exterior cell beyond each one-way leaf gives the crossing somewhere to
  // land before its physical seam hands movement back to the yard component.
  {id:'cathedral_west_threshold',physicalReplace:true,layer:'cathedral_threshold',space:'cathedral_threshold',renderGroup:'ground',
   origin:{x:128,y:179},physicalOrigin:{x:16,y:54},base:0,rows:['Y'],profile:(_x,_y,cell)=>({...cell,ceil:yardCeilAt(54)})},
  {id:'cathedral_south_threshold',physicalReplace:true,layer:'cathedral_threshold',space:'cathedral_threshold',renderGroup:'ground',
   origin:{x:137,y:198},physicalOrigin:{x:25,y:73},base:0,rows:['Y'],profile:(_x,_y,cell)=>({...cell,ceil:yardCeilAt(73)})},
  {id:CHURCH_LEVELS.loft.id,physicalReplace:true,physicalStack:true,layer:'cathedral_loft',
   space:'cathedral_loft',renderGroup:CHURCH_LEVELS.loft.renderGroup,
   origin:CATHEDRAL_LOFT_ORIGIN,physicalOrigin:{x:10,y:57},base:CHURCH_LEVELS.loft.base,
   rows:cathedralLoftRows()},
  {id:CHURCH_LEVELS.belfry.id,physicalReplace:true,physicalStack:true,layer:'cathedral_belfry',
   space:'cathedral_belfry',renderGroup:CHURCH_LEVELS.belfry.renderGroup,
   origin:CATHEDRAL_BELFRY_ORIGIN,physicalOrigin:{x:10,y:71},base:CHURCH_LEVELS.belfry.base,
   rows:cathedralBelfryRows()},
  // Four compact medieval stair turrets form a complete circuit: two ways from
  // the nave to the triforium and two opposing ways between walk and belfry.
  {id:'cathedral_stair_north_lower',physicalReplace:true,physicalStack:true,layer:'cathedral_stair',space:'cathedral_stair',renderGroup:'cathedral',origin:{x:0,y:0},physicalOrigin:{x:0,y:0},base:0,rows:[''],
   stairs:[cathedralTurret('cathedral-north-lower',{x:150,y:300},{x:156,y:300},{x:10.5,y:64.5},0,4.6,'ground','cathedral')]},
  {id:'cathedral_stair_south_lower',physicalReplace:true,physicalStack:true,layer:'cathedral_stair',space:'cathedral_stair',renderGroup:'cathedral',origin:{x:0,y:0},physicalOrigin:{x:0,y:0},base:0,rows:[''],
   stairs:[cathedralTurret('cathedral-south-lower',{x:164,y:300},{x:170,y:300},{x:21.5,y:79.5},0,4.6,'ground','cathedral')]},
  {id:'cathedral_stair_south_upper',physicalReplace:true,physicalStack:true,layer:'cathedral_stair',space:'cathedral_stair',renderGroup:'cathedral',origin:{x:0,y:0},physicalOrigin:{x:0,y:0},base:0,rows:[''],
   stairs:[cathedralTurret('cathedral-south-upper',{x:178,y:300},{x:185,y:300},{x:21.5,y:73.5},4.6,10.2,'cathedral','cathedral')]},
  {id:'cathedral_stair_north_upper',physicalReplace:true,physicalStack:true,layer:'cathedral_stair',space:'cathedral_stair',renderGroup:'cathedral',origin:{x:0,y:0},physicalOrigin:{x:0,y:0},base:0,rows:[''],
   stairs:[cathedralTurret('cathedral-north-upper',{x:192,y:300},{x:199,y:300},{x:10.5,y:73.5},10.2,4.6,'cathedral','cathedral')]},
  {id:'front_atrium',replace:true,layer:'ground',space:'front_atrium',renderGroup:'ground',origin:{x:74,y:3},physicalOrigin:{x:74,y:3},base:0,rows:frontAtriumRows(),profile:frontAtriumProfile},
  // The Scene Dock now reaches the atrium's own wall leaf directly. The former
  // two-cell replacement made a two-metre threshold that read as a twisting
  // vestibule and briefly left the player in unzoned space.
  // NO physicalReplace HERE. The basin is a real depression because the profile
  // hands `cell.floor` through and the west stair supplies the walkable
  // transition — claiming the physical span as well adds nothing (the physical
  // render bytes are identical either way) and makes the pool hall's 0-9.5m
  // volume collide with main_stair_hall's 4.8-9.75m landing along its east
  // edge: 36 cells of overlapping rooms at x142-143, which is what
  // physicalSpanData().overlaps is there to catch.
  {id:'natatorium',replace:true,layer:'ground',space:'natatorium',renderGroup:'ground',origin:{x:70,y:27},physicalOrigin:{x:70,y:27},base:0,rows:natatoriumRows(),profile:natatoriumProfile,
   stairs:[{
     // Five metres, ten 200mm risers, two metres wide. The first tread is flush
     // with the north deck; the last arrives on the -2m basin floor. Width grows
     // east, leaving the west pool wall available for both handrail returns.
     from:{x:78,y:33},to:{x:78,y:37.5},fromH:0,toH:-2,width:2,ceil:9.5,
     zone:'natatorium',material:'wetTile',layer:'ground',space:'natatorium',renderGroup:'ground',
   }]},
  {id:'hall_box_office_link',replace:true,layer:'ground',space:'front_atrium',renderGroup:'hall',origin:{x:94,y:24},physicalOrigin:{x:94,y:24},base:0,rows:['FFFFHH','FFFFHH','FFFFHH']},
  {id:'hall_orchestra',replace:true,layer:'ground',space:'hall',renderGroup:'hall',origin:{x:98,y:4},physicalOrigin:{x:98,y:4},base:0,rows:hallGroundRows(),profile:hallGroundProfile},
  // Declared AFTER the orchestra and with the same origin and physicalOrigin, so
  // it replaces the stage rows in place rather than parking them on another
  // logical island. That identity embedding is what lets ordinary steps carry
  // the player up the bays without a connector — the seam the balconies need
  // exists only because their logical cells live somewhere else entirely.
  {id:'hall_stage',replace:true,layer:'hall_stage',space:'hall',renderGroup:'hall',origin:{x:98,y:4},physicalOrigin:{x:98,y:4},base:0,rows:hallStageRows(),profile:hallStageProfile},
  {id:'hall_lower_balcony',layer:'hall_lower',space:'hall',renderGroup:'hall',origin:{x:0,y:40},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('L',{rear:false}),profile:balconyProfile(4.0,3.3)},
  {id:'hall_upper_balcony',layer:'hall_upper',space:'hall',renderGroup:'hall',origin:{x:0,y:82},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('U'),profile:balconyProfile(7.5,8.0)},
  // galleria_lower_stair is GONE, and nothing replaces it. It climbed -0.74 ->
  // 4.00 through the same rows the west aisle ramps through, two floors in one
  // volume, so the player walked the ramp to their seats and passed through the
  // flight. The rake carries that climb now: the bowl rises, the rear cross aisle
  // keeps rising, and it arrives at the circle. One ramp, horseshoe-shaped, and
  // the risers ARE the stairs.
  // Its ends follow the cascade rather than the old flat decks: it leaves the
  // lower arm at 3.56 (tier 1) and arrives on the upper at 6.18 (tier 3). Leaving
  // them at 4.0/7.5 threw `discontinuous level seam ... 0.97m in height`.
  {id:'galleria_upper_stair',physicalReplace:true,layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:40,y:40},physicalOrigin:{x:122,y:20},base:0,rows:galleriaStairRows(4),stairs:[{from:{x:44,y:51},to:{x:44,y:41},fromH:3.56,toH:6.18,width:2,head:2.6,zone:'hall',material:'woodVelvet'}]},
  {id:'practice_wing',replace:true,physicalReplace:true,physicalStack:true,layer:'upper',space:'practice',renderGroup:'upper',origin:{x:51,y:52},physicalOrigin:{x:51,y:upperWingZ(52)},base:4.8,rows:practiceWingRows()},
  {id:'upper_atrium_bridge',replace:true,physicalReplace:true,physicalStack:true,layer:'upper',space:'upper_atrium',renderGroup:'upper',origin:{x:77,y:53},physicalOrigin:{x:77,y:upperWingZ(53)},base:4.8,rows:upperAtriumBridgeRows()},
  // Retire the one-metre stems in logical space. Their physical footprint is
  // immediately reopened by the broad halls below, but old saves and pathfinding
  // can no longer slip into the obsolete maze behind those halls.
  {id:'ground_stair_stem_retired',replace:true,layer:'ground',space:'ground',renderGroup:'ground',
   origin:{x:58,y:25},physicalOrigin:{x:58,y:25},base:0,rows:Array.from({length:19},()=> '#'.repeat(7))},
  {id:'upper_stair_stem_retired',replace:true,layer:'upper',space:'upper',renderGroup:'upper',
   origin:{x:58,y:44},physicalOrigin:{x:58,y:44},base:4.8,rows:Array.from({length:8},()=> '#'.repeat(7))},

  // Ground/1F is now one axial room off the cross-spine. It is deliberately a
  // separate logical island: the upper landing occupies the same Euclidean
  // footprint, and edge portals join boundaries without turning either landing
  // into a teleport trigger.
  {id:'grand_ground_stair_hall',physicalReplace:true,layer:'main_stair_hall',space:'main_stair_hall',renderGroup:'ground',
   origin:{x:134,y:20},physicalOrigin:{x:57,y:25},base:0,rows:groundStairHallRows(),profile:groundStairHallProfile},

  // Four genuinely curving half-coils make two complete revolutions around a
  // 1.3m open well. Each visible tread now has one collision address, while its
  // Euclidean position is sampled analytically from the same contract as the
  // hero mesh. The surrounding halls remain separate, immutable level modules.
  {id:'main_open_well_stair',layer:'main_stair',space:'main_stair',renderGroup:'upper',
   origin:{x:134,y:48},physicalOrigin:{x:60,y:38},base:0,rows:[''],stairs:[{
    id:'main-open-well',zone:'stair',material:'serviceConcrete',head:3.4,physicalReplace:true,
    flights:mainStairFloorplanFlights(),
    landings:mainStairFloorplanLandings(),
  }]},

  // U1 is a landing room, not a feeder corridor. The six-metre central void is
  // flanked by two independently walkable three-metre galleries; they reunite
  // in the south arrival hall directly against the practice wing.
  {id:'grand_upper_stair_hall',physicalReplace:true,layer:'main_stair_hall',space:'main_stair_hall',renderGroup:'upper',
   origin:{x:146,y:70},physicalOrigin:{x:60,y:33.5},base:4.8,rows:upperStairHallRows(),profile:upperStairHallProfile},
  {id:'academic_floor',layer:'academic',space:'academic',renderGroup:'academic',origin:ACADEMIC_ORIGIN,physicalOrigin:ACADEMIC_PHYSICAL_ORIGIN,base:ACADEMIC_BASE,rows:academicFloorRows(),profile:academicProfile},
  // The top flight now arrives in a nine-metre-wide loggia. Opening the former
  // reception partition provides west and east choices without touching either
  // locked faculty room or any classroom bank.
  {id:'academic_stair_loggia',replace:true,layer:'academic',space:'academic',renderGroup:'academic',
   origin:{x:4,y:274},physicalOrigin:{x:54,y:34},base:ACADEMIC_BASE,rows:Array.from({length:6},()=> 'Q'.repeat(10)),profile:academicStairLoggiaProfile},
  // First seal the entire legacy chapel footprint. The new chapel is the
  // only module allowed to reopen cells inside it.
  {id:'chapel_legacy_seal',replace:true,layer:'upper',space:'chapel_shell',renderGroup:'upper',origin:{x:81,y:58},physicalOrigin:{x:81,y:upperWingZ(58)},base:4.8,rows:Array.from({length:36},()=> '#'.repeat(30))},
  {id:'chapel_nave',replace:true,physicalReplace:true,physicalStack:true,layer:'upper',space:'chapel',renderGroup:'upper',origin:{x:86,y:58},physicalOrigin:{x:86,y:upperWingZ(58)},base:4.8,rows:chapelRows(),profile:chapelProfile},
  // The tower is one Euclidean route. Each U stair owns an explicit turret
  // footprint and only meets a room at an authored level seam. No inferred
  // endpoints and no physicalReplace overlays are used here.
  {id:'tower_access_lower',physicalReplace:true,physicalStack:true,layer:'tower_stair_lower',space:'stair_turret',renderGroup:'tower',origin:{x:0,y:150},physicalOrigin:{x:99,y:upperWingZ(61)},base:4.8,rows:doglegStairRows(),stairs:[{
    id:'tower-access-lower',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:2,y:151},to:{x:7,y:151},physicalFrom:{x:101,z:upperWingZ(62)},physicalTo:{x:106,z:upperWingZ(62)},fromH:4.8,toH:6.7,width:1.5,rises:10},
      {id:'flight-2',from:{x:7,y:154},to:{x:2,y:154},physicalFrom:{x:106,z:upperWingZ(65)},physicalTo:{x:101,z:upperWingZ(65)},fromH:6.7,toH:8.6,width:1.5,rises:10},
    ],
    landings:[
      {id:'narthex',at:{x:0,y:151},size:{x:3,y:2},physicalAt:{x:99,z:upperWingZ(62)},height:4.8},
      {id:'turn',at:{x:7,y:151},size:{x:3,y:4},physicalAt:{x:106,z:upperWingZ(62)},height:6.7},
      {id:'ringing',at:{x:0,y:154},size:{x:3,y:1},physicalAt:{x:99,z:upperWingZ(65)},height:8.6},
    ],
  }]},
  {id:'tower_ringing_room',physicalReplace:true,physicalStack:true,layer:'tower_ringing',space:'ringing_room',renderGroup:'tower',origin:{x:16,y:150},physicalOrigin:{x:81,y:upperWingZ(56)},base:8.6,rows:towerRoomRows(18,16,{ringing:true})},
  {id:'tower_access_upper',physicalReplace:true,physicalStack:true,layer:'tower_stair_upper',space:'stair_turret',renderGroup:'tower',origin:{x:36,y:150},physicalOrigin:{x:99,y:upperWingZ(61)},base:8.6,rows:doglegStairRows(),stairs:[{
    id:'tower-access-upper',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:38,y:151},to:{x:44,y:151},physicalFrom:{x:101,z:upperWingZ(61)},physicalTo:{x:107,z:upperWingZ(61)},fromH:8.6,toH:10.9,width:1.5,rises:12},
      {id:'flight-2',from:{x:44,y:154},to:{x:38,y:154},physicalFrom:{x:107,z:upperWingZ(64)},physicalTo:{x:101,z:upperWingZ(64)},fromH:10.9,toH:13.2,width:1.5,rises:12},
    ],
    landings:[
      {id:'ringing',at:{x:36,y:151},size:{x:3,y:2},physicalAt:{x:99,z:upperWingZ(61)},height:8.6},
      {id:'turn',at:{x:44,y:151},size:{x:3,y:4},physicalAt:{x:107,z:upperWingZ(61)},height:10.9},
      {id:'belfry',at:{x:36,y:154},size:{x:3,y:1},physicalAt:{x:99,z:upperWingZ(64)},height:13.2},
    ],
  }]},
  {id:'tower_bell_chamber',physicalReplace:true,physicalStack:true,layer:'tower_chamber',space:'bell_chamber',renderGroup:'tower',origin:{x:52,y:150},physicalOrigin:{x:81,y:upperWingZ(56)},base:13.2,rows:towerRoomRows(18,16,{chamber:true}),profile:bellChamberProfile},
  {id:'tower_escape_upper',physicalReplace:true,physicalStack:true,layer:'tower_stair_escape_upper',space:'stair_turret',renderGroup:'tower',origin:{x:72,y:150},physicalOrigin:{x:99,y:upperWingZ(68)},base:8.6,rows:doglegStairRows(),stairs:[{
    id:'tower-escape-upper',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:74,y:151},to:{x:80,y:151},physicalFrom:{x:101,z:upperWingZ(69)},physicalTo:{x:107,z:upperWingZ(69)},fromH:13.2,toH:10.9,width:1.5,rises:12},
      {id:'flight-2',from:{x:80,y:154},to:{x:74,y:154},physicalFrom:{x:107,z:upperWingZ(72)},physicalTo:{x:101,z:upperWingZ(72)},fromH:10.9,toH:8.6,width:1.5,rises:12},
    ],
    landings:[
      {id:'belfry',at:{x:72,y:151},size:{x:3,y:2},physicalAt:{x:99,z:upperWingZ(69)},height:13.2},
      {id:'turn',at:{x:80,y:151},size:{x:3,y:4},physicalAt:{x:107,z:upperWingZ(69)},height:10.9},
      {id:'loft',at:{x:72,y:154},size:{x:3,y:1},physicalAt:{x:99,z:upperWingZ(73)},height:8.6},
    ],
  }]},
  {id:'tower_organ_loft',physicalReplace:true,physicalStack:true,layer:'tower_loft',space:'organ_loft',renderGroup:'tower',origin:{x:88,y:150},physicalOrigin:{x:85,y:upperWingZ(72)},base:8.6,rows:organLoftRows()},
  {id:'tower_escape_lower',physicalReplace:true,physicalStack:true,layer:'tower_stair_escape_lower',space:'stair_turret',renderGroup:'tower',origin:{x:104,y:150},physicalOrigin:{x:99,y:upperWingZ(79)},base:4.8,rows:doglegStairRows(),stairs:[{
    id:'tower-escape-lower',zone:'bellTower',material:'chapelStone',head:2.35,
    flights:[
      {id:'flight-1',from:{x:106,y:151},to:{x:111,y:151},physicalFrom:{x:101,z:upperWingZ(80)},physicalTo:{x:106,z:upperWingZ(80)},fromH:8.6,toH:6.7,width:1.5,rises:10},
      {id:'flight-2',from:{x:111,y:154},to:{x:106,y:154},physicalFrom:{x:106,z:upperWingZ(83)},physicalTo:{x:101,z:upperWingZ(83)},fromH:6.7,toH:4.8,width:1.5,rises:10},
    ],
    landings:[
      {id:'loft',at:{x:104,y:151},size:{x:3,y:2},physicalAt:{x:98,z:upperWingZ(79)},height:8.6},
      {id:'turn',at:{x:111,y:151},size:{x:3,y:4},physicalAt:{x:106,z:upperWingZ(80)},height:6.7},
      {id:'nave',at:{x:104,y:154},size:{x:3,y:1},physicalAt:{x:99,z:upperWingZ(82)},height:4.8},
    ],
  }]},
];

export const conservatory = {
  width: 240,
  height: 480,
  layoutRevision: 3,
  positionMigrations:[
    {id:'old-upper-coil',bounds:{x0:62,x1:64,y0:38,y1:47},to:MAIN_STAIR_LAYOUT.upperLanding,floor:4.8},
    {id:'old-lower-coil',bounds:{x0:60,x1:62,y0:38,y1:47},to:MAIN_STAIR_LAYOUT.groundLanding,floor:0},
    {id:'old-practice-gallery',bounds:{x0:58,x1:67,y0:46,y1:53},to:MAIN_STAIR_LAYOUT.upperLanding,floor:4.8},
    {id:'old-upper-stem',bounds:{x0:58,x1:66,y0:44,y1:52},to:MAIN_STAIR_LAYOUT.upperLanding,floor:4.8},
    {id:'old-ground-stem',bounds:{x0:58,x1:66,y0:25,y1:39},to:MAIN_STAIR_LAYOUT.groundHall,floor:0},
    {id:'old-academic-seam',bounds:{x0:12,x1:15,y0:277,y1:280},to:MAIN_STAIR_LAYOUT.academicLanding,floor:10},
    // Revision 3 inserts real low ranges into the previously empty yard. A save
    // made inside one of those footprints returns to the clear arrival spine.
    {id:'yard-former-stables',bounds:{x0:80,x1:92,y0:214,y1:222},to:{x:79,y:207},floor:0},
    {id:'yard-rehearsal-annex',bounds:{x0:82,x1:96,y0:229,y1:239},to:{x:79,y:207},floor:0},
    {id:'yard-baths-plant',bounds:{x0:82.5,x1:95.5,y0:249,y1:261},to:{x:79,y:207},floor:0},
    {id:'yard-covered-stores',bounds:{x0:84,x1:96,y0:270.5,y1:283.5},to:{x:79,y:207},floor:0},
  ],
  widenCorridors: true,
  edgePortals:[
    // The yard and apron are two stable logical components occupying adjacent
    // physical cells. These directional seams own the COMPLETE stair heads,
    // not one lucky half-metre tile. Width is authored metres and expands to
    // four north lanes plus six goods-door lanes at runtime.
    {id:'loading-bay-north-steps',width:2,
     from:{at:{x:50,y:4},along:{x:0,y:1},exit:{x:-1,y:0}},
     to:{at:{x:99.5,y:204},along:{x:0,y:1},exit:{x:1,y:0}}},
    {id:'loading-bay-goods-steps',width:3,
     from:{at:{x:50,y:9},along:{x:0,y:1},exit:{x:-1,y:0}},
     to:{at:{x:99.5,y:209},along:{x:0,y:1},exit:{x:1,y:0}}},
    {id:'ground-spine-to-stair-hall',width:4,
     from:{at:{x:61,y:24.5},along:{x:1,y:0},exit:{x:0,y:1}},
     to:{at:{x:138,y:20},along:{x:1,y:0},exit:{x:0,y:-1}}},
    {id:'ground-hall-to-lower-flight',width:2,
     from:{at:{x:139.5,y:30},along:{x:0,y:-1},exit:{x:1,y:0}},
     to:{at:{x:134,y:50},along:{x:1,y:0},exit:{x:0,y:-1}},tolerance:1.2},
    {id:'lower-half-flight-seam',width:2,
     from:{at:{x:134,y:56.5},along:{x:1,y:0},exit:{x:0,y:1}},
     to:{at:{x:138,y:56.5},along:{x:1,y:0},exit:{x:0,y:1}},tolerance:1.2},
    {id:'lower-flight-to-upper-floor-landing',width:2,
     from:{at:{x:138,y:50},along:{x:1,y:0},exit:{x:0,y:-1}},
     to:{at:{x:150,y:52},along:{x:0,y:-1},exit:{x:-1,y:0}},tolerance:1.2},
    {id:'upper-floor-landing-to-hall',width:4,
     from:{at:{x:155.5,y:50},along:{x:0,y:1},exit:{x:1,y:0}},
     to:{at:{x:154,y:70},along:{x:0,y:1},exit:{x:-1,y:0}}},
    {id:'upper-floor-landing-to-academic-flight',width:2,
     from:{at:{x:151,y:53.5},along:{x:1,y:0},exit:{x:0,y:1}},
     to:{at:{x:134,y:65},along:{x:1,y:0},exit:{x:0,y:1}},tolerance:1.2},
    {id:'upper-landing-to-practice',width:6,
     from:{at:{x:146,y:78.5},along:{x:1,y:0},exit:{x:0,y:1}},
     to:{at:{x:60,y:52},along:{x:1,y:0},exit:{x:0,y:-1}}},
    {id:'upper-half-flight-seam',width:2,
     from:{at:{x:134,y:58},along:{x:1,y:0},exit:{x:0,y:-1}},
     to:{at:{x:138,y:58},along:{x:1,y:0},exit:{x:0,y:-1}},tolerance:1.2},
    {id:'academic-flight-to-floor-landing',width:2,
     from:{at:{x:138,y:65},along:{x:1,y:0},exit:{x:0,y:1}},
     to:{at:{x:150,y:64},along:{x:1,y:0},exit:{x:0,y:-1}},tolerance:1.5},
    {id:'academic-floor-landing-to-loggia',width:2,
     from:{at:{x:150,y:64},along:{x:0,y:1},exit:{x:-1,y:0}},
     to:{at:{x:13.5,y:276.5},along:{x:0,y:1},exit:{x:1,y:0}}},
  ],
  connectors:[
    // Logical seams coincide at identical physical landings. Height changes
    // happen on the ordinary stair cells between them, never in the connector.
    // THE RAMP MEETS THE CIRCLE. The rear cross aisle climbs to 4.00 and the
    // lower balcony's arms reach back to the same row, so each junction is one
    // physical cell at one height — no flight, no level change in the seam.
    {from:{x:103,y:40},to:{x:4,y:76}},
    {from:{x:122,y:40},to:{x:25,y:76}},
    {from:{x:28,y:67},to:{x:44,y:51}},
    {from:{x:44,y:41},to:{x:28,y:99}},
    // THE CHAPEL STAIR CHAIN. One authored cell each, until now.
    //
    // Every landing these seams open onto is three cells wide — narthex, turn,
    // ringing, belfry, loft, all `size:{x:3,...}` in the stairs descriptors
    // above — but the seams themselves were single cells, so of a three-cell
    // landing face exactly one cell connected. Standing in a twelve-wide nave,
    // the way up to the ringing room, the bell chamber and the organ loft was
    // one unmarked cell against a blank east wall, and finding it was luck.
    //
    // `span:{y:1}` widens each seam to the full width of the landing behind it
    // and no further — the registerConnector candidate filter still requires
    // physical adjacency (planar <= 1.01), so a larger span buys nothing and is
    // not a way to paper over a misplaced level. Measured: seam entry cells
    // across the building 572 -> 621, reachability unchanged at 75,720, every
    // tower room still fully reachable.
    //
    // THE NAVE WALL MUST STAY SOLID. The redirect fires as you step INTO the
    // last open cell; open the wall behind it and the player walks past instead,
    // registerConnector re-picks its pair, and the whole chain collapses —
    // measured, tower_access_lower fell to 3% and every room above it to 0%.
    // So the stair is signed with props on that wall, never carved into it.
    {from:{x:98,y:62},to:{x:0,y:151},span:{y:1}},
    {from:{x:0,y:154},to:{x:33,y:159},span:{y:1}},
    {from:{x:33,y:155},to:{x:36,y:151},span:{y:1}},
    {from:{x:36,y:154},to:{x:69,y:158},span:{y:1}},
    {from:{x:69,y:163},to:{x:72,y:151},span:{y:1}},
    {from:{x:72,y:154},to:{x:101,y:151},span:{y:1}},
    {from:{x:100,y:157},to:{x:104,y:151},span:{y:1}},
    {from:{x:104,y:154},to:{x:98,y:82},span:{y:1}},
    // St Brendan's vertical circuit. Every seam is the same Euclidean cell at
    // the same height; only the stable logical address changes.
    {from:cathedralGroundLogical(10,63),to:{x:150,y:300}},
    {from:{x:156,y:300},to:cathedralLoftLogical(10,63)},
    {from:cathedralGroundLogical(21,78),to:{x:164,y:300}},
    {from:{x:170,y:300},to:cathedralLoftLogical(21,78)},
    {from:cathedralLoftLogical(21,72),to:{x:178,y:300}},
    {from:{x:185,y:300},to:cathedralBelfryLogical(21,72)},
    {from:cathedralBelfryLogical(10,72),to:{x:192,y:300}},
    {from:{x:199,y:300},to:cathedralLoftLogical(10,72)},
    {from:{x:128,y:179},to:{x:66,y:254}},
    {from:{x:137,y:198},to:{x:75,y:273}},
    // The old yard keeps every logical address. Three broad seams join its west,
    // north and south edges to the new perimeter ring at the same physical
    // pavement, making the full block optional without putting redirects across
    // the direct van-to-door route.
    {from:{x:50,y:204},to:districtLogicalAt(-1,4),span:{y:8}},
    {from:{x:54,y:200},to:districtLogicalAt(4,-1),span:{x:10}},
    {from:{x:54,y:292},to:districtLogicalAt(4,93),span:{x:8}},
  ],
  // ON THE ROAD, OUTSIDE THE GATE. He has parked and he is walking in.
  //
  // This was the apron, in front of the grey door, which is where the old cold
  // open dropped him after narrating the walk he never took. The walk is the
  // game's now: road, lodge, gate, yard, dock steps, apron, door. Authored yard
  // coordinates — the yard's logical address is origin (50,200) plus its local
  // cell, so this is physical (12,7), out on the carriageway.
  // Five metres further back than it was, so his own van is a VAN in the opening
  // frame and not a wall of chevrons two metres off his shoulder. The usable
  // stretch of carriageway is bounded east by yard-fence-west at physical x20,
  // so there is nowhere to put the van except in front of him — which means the
  // room has to come from moving him, not it.
  spawn: { x: 57, y: 207 },
  // FACING THE WAY HE WALKS.
  //
  // faceOpenDirection picks whichever neighbour is open, which out on fifty
  // metres of tarmac is a coin toss — the fade came up on his back half the time,
  // looking west at a road going nowhere. He is standing at the open doors of his
  // own van (yard-van, parked just west of here) with the gate, the lodge's lit
  // window and the building all in front of him. Facing 1 is east, measured.
  spawnFacing: 1,
  // WHERE THE GREY DOOR IS REACHED FROM, WHICH IS NO LONGER WHERE HE SPAWNS.
  //
  // FP.spawn() used to mean three things at once: the start, the mutation home
  // anchor, and the inversion ending's "grey door" waypoint. Moving the start
  // outdoors quietly broke the third — it would have pointed the escape run at a
  // spot on the apron, through a door that is masonry by then, with the drift
  // calibration measured against a room the player is no longer in. The two
  // meanings are separate now: this is the get-in side of the grey door.
  greyDoorApproach: { x: 65, y: 10 },
  doors: CONSERVATORY_DOORS,
  levels: [
    {
      // ── sub-basement, four metres down ─────────────────────────────────────
      id:'basement',layer:'basement',space:'basement',renderGroup:'basement',origin: { x: 0, y: 0 }, physicalOrigin:{x:0,y:0},base: -4.0,
      profile: basementProfile,
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
        // The old tank annex is part of the plant chamber again. Three lower
        // grating cells cut through the former south wall; J retains its 400mm
        // drop, so geometry can show the short service steps without inventing
        // another locked room or connector.
        '                  #MMMMMM#;;;###JJJ#######',
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
        '######################## ################# ###################',
        'DDDDDDD#IIIIIIIIIIIII### #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        'DDDDDDD#IIIIIIIIIIIIII## #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        'DDDDDDD#IIIIIIIIIIIIIII# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        'DDDDDDD#IIIIIIIIIIIIIII# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        'DDDDDDD#IIIIIIIIIIIIIII# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        'DDDDDDD+IIIIIIIIIIIIIII# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        'DDDDDDD+IIIIIIIIIIIIIII###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        'DDDDDDD+IIIIIIIIIIIIIII.+.FFFFFFFFFFFFFFF.x.HHHHHHHHHHHHHHHHH#',
        '########IIIIIIIIIIIIIII###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #IIIIIIIIIIIIIIII #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #IIIIIIIIIIIIIII# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #######++######## #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '             #...#       #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '             #...#       ########.######## #HHHHHHHHHHHHHHHHH#',
        '             #...#              #.#        #HHHHHHHHHHHHHHHHH#',
        '             #...#              #.#        #HHHHHHHHHHHHHHHHH#',
        '             #...#              #.#        #HHHHHHHHHHHHHHHHH#',
        ' #############...##########     #.#        #HHHHHHHHHHHHHHHHH#',
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
      ],
    },
    ...EUCLIDEAN_ADDITIONS,
  ],
};
