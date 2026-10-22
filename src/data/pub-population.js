// The Lyric's company uses the same row-metre contract as its real furniture.
// A seated body's root remains on the floor; the character pose owns the bend
// at the hips, knees and ankles and the contact with its named seat.
import {EXTERIOR_PUB,pubWorldFromLocal} from './exterior-pub.js';

function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
}
const actor=(id,name,role,mesh,rowX,rowZ,yaw,extra={})=>{
  const world=pubWorldFromLocal({x:rowX,z:rowZ});
  return{id,name,role,mesh,x:world.x,y:world.z,z:world.z,yaw,
    local:{x:rowX,z:rowZ},coordinateSpace:'district-world-metres',
    floor:EXTERIOR_PUB.floor+.012,location:'The Lyric',renderGroups:['ground'],...extra};
};
const seated=(id,name,role,mesh,x,z,yaw,seatId,seatHeight,extra={})=>actor(
  id,name,role,mesh,x,z,yaw,{posture:'seated',seatId,seatHeight,...extra},
);
export const PUB_ACTORS=freeze([
  actor('pub-bartender-iona','Iona Reed','bartender','pub_bartender_iona',-4.74,-20.70,0,{
    posture:'standing',stationId:'pub-backbar',actionSet:['polish-glass','listen'],label:'the bartender',action:'pub-bartender',
  }),
  actor('vigil-denise-okafor','Denise Okafor','archive volunteer','vigil_denise_okafor',-2.65,-26.35,0,{
    posture:'standing',migrated:true,previousPlace:{x:17.6,y:27,yaw:1.50},
    cluster:'pub-snug',actionSet:['photos-sort','weight-shift'],label:'the woman with the photograph sleeves',
    parts:[{id:'photos',mesh:'vigil_part_denise_photos'}],approachLocal:{x:-1.25,z:-26.35},
  }),
  seated('vigil-malcolm-vey','Malcolm Vey','campaign regular','vigil_malcolm_vey',-2.55,-21.35,Math.PI,
    'pub-bar-stool-1',.8325,{
      migrated:true,previousPlace:{x:2.22,y:52.53,yaw:1.35},
      cluster:'pub-bar',actionSet:['map-fold','weight-shift'],label:'the man with the folded map',
      parts:[{id:'map',mesh:'vigil_part_malcolm_map'}],approachLocal:{x:-1.25,z:-21.35},
    }),
  seated('pub-patron-mavis','Mavis Bell','retired bus conductor','pub_patron_mavis',-4.79,-30.20,0,'pub-snug-back-banquette',.515,{
    tableId:'pub-snug-table-0',label:'the woman with the bus badge',actionSet:['cup-turn','listen'],
  }),
  seated('pub-patron-ed','Ed Mercer','shift worker','pub_patron_ed',-3.12,-30.20,Math.PI,'pub-snug-chair-0',.4925,{
    tableId:'pub-snug-table-0',label:'the man in the work jacket',actionSet:['cup-rest','listen'],
  }),
  seated('pub-patron-bert','Bert Hales','domino player','pub_patron_bert',-4.79,-28.80,0,'pub-snug-back-banquette',.515,{
    tableId:'pub-snug-table-1',label:'the man considering his dominoes',actionSet:['domino-consider','listen'],
  }),
  seated('pub-patron-farah','Farah Nouri','domino player','pub_patron_farah',-3.12,-28.80,Math.PI,'pub-snug-chair-1',.4925,{
    tableId:'pub-snug-table-1',label:'the woman waiting for a move',actionSet:['domino-wait','listen'],
  }),
  seated('pub-patron-nell','Nell Sayer','off-duty nurse','pub_patron_nell',-4.79,-27.40,0,'pub-snug-back-banquette',.515,{
    tableId:'pub-snug-table-2',label:'the woman with the folded cardigan',actionSet:['hands-rest','listen'],
  }),
  seated('pub-patron-arthur','Arthur Pike','regular','pub_patron_arthur',-2.55,-19.30,Math.PI,'pub-bar-stool-2',.8325,{
    label:'the regular at the end of the bar',actionSet:['cup-rest','listen'],
  }),
]);
export const PUB_NEW_ACTORS=freeze(PUB_ACTORS.filter(actor=>!actor.migrated));
export const PUB_MIGRATIONS=freeze(Object.fromEntries(PUB_ACTORS.filter(actor=>actor.migrated).map(actor=>[actor.id,actor])));
const byId=new Map(PUB_ACTORS.map(actor=>[actor.id,actor]));
export const pubActor=id=>byId.get(String(id||''))||null;
export const pubMigration=id=>PUB_MIGRATIONS[String(id||'')]||null;
// Seated bodies inherit their seat's existing collision. This avoids a second
// broad standing envelope expanding a fitted stool into the public aisle.
export const PUB_MESHES=freeze(Object.fromEntries(PUB_NEW_ACTORS.map(actor=>[actor.mesh,{
  w:.68,d:1.02,h:actor.posture==='seated'?1.65:1.78,blocks:false,
}])));
// Every patron can be addressed from the public side without walking through
// a table or the counter. The standing woman's documents keep their old action.
export function pubApproach(actor){
  const local=actor.approachLocal||{x:-1.25,z:actor.local.z};
  const world=pubWorldFromLocal(local);return{x:world.x,y:world.z};
}
export function pubFacePoint(actor){
  return{x:actor.x+Math.sin(actor.yaw)*.30,y:actor.y-Math.cos(actor.yaw)*.30};
}
// The service tray sits on the public edge of the real counter. Its interaction
// and hand-off take place from the public aisle beside the east entrance.
export const PUB_SERVICE_TRAY=freeze({
  id:'pub-service-tray',mesh:'pub_service_tray_loaded',local:{x:-3.19,z:-22.50},
  ...(()=>{const at=pubWorldFromLocal({x:-3.19,z:-22.50});return{x:at.x,y:at.z,z:at.z};})(),
  floor:EXTERIOR_PUB.floor,elevation:1.14,
  inspectAt:(()=>{const at=pubWorldFromLocal({x:-2.65,z:-22.50});return{x:at.x,y:at.z};})(),
  approach:(()=>{const at=pubWorldFromLocal({x:-1.25,z:-22.50});return{x:at.x,y:at.z};})(),
});
