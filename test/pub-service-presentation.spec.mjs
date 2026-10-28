import vm from 'node:vm';
import {pubQuestState} from '../src/game/pub-quest.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pubServiceInstances,pubServiceDrinks,PUB_SERVICE_PLACEMENTS} from '../src/render/pub-service-presentation.js';
import {reducePubQuest} from '../src/game/pub-quest.js';
import {PUB_INTERIOR_LAYOUT} from '../src/data/exterior-pub-furnishings.js';
import {PUB_HOSPITALITY_DRESSING} from '../src/data/pub-hospitality.js';

const carrier={eye:{x:30,y:1.70,z:87},yaw:Math.PI/2,pitch:-.4};
test('service transfers the visible load through the actual saved quest in one direction',()=>{
  let flags={};
  const view=()=>pubServiceInstances(flags,{carrier});
  const count=kind=>view().filter(p=>p.mesh===kind).length;
  const act=(action,context)=>{flags=reducePubQuest(flags,action,context).flags;};
  const iona={inPerson:true,actorId:'pub-bartender-iona'};
  assert.equal(count('pub_service_empty_glass'),2);
  assert.equal(count('pub_service_water_glass'),0);
  act('accept',iona);act('take-tray',{atTray:true});
  assert.equal(count('pub_service_tray_loaded'),1);
  assert.equal(count('pub_service_water_glass'),0,'waters are still on the carried tray');
  act('serve-waters',{inPerson:true,actorId:'pub-patron-mavis'});
  assert.equal(count('pub_service_water_glass'),2);
  assert.equal(count('pub_service_tray_loaded'),0);
  assert.equal(count('pub_service_tray_bare'),1);
  act('collect-empties',{inPerson:true,actorId:'pub-patron-farah'});
  assert.equal(count('pub_service_empty_glass'),0,'cleared glasses cannot remain on the table');
  assert.equal(count('pub_service_tray_empty'),1);
  assert.equal(count('pub_service_tray_bare'),0);
  act('return-tray',iona);
  assert.equal(pubQuestState(flags).complete,true);
  assert.equal(view().some(p=>p.id==='pub-carried-service-tray'),false);
  assert.equal(count('pub_service_water_glass'),2,'a completed favor does not take the customers’ water back');
  const saved=JSON.parse(JSON.stringify(flags));
  assert.deepEqual(pubServiceInstances(saved,{carrier}),view(),'reload preserves the exact visible ownership');
  act('collect-empties',{inPerson:true,actorId:'pub-patron-farah'});
  assert.deepEqual(pubServiceInstances(saved,{carrier}),view(),'repeated choices cannot create a second round');
});

test('every table vessel is supported and clears the actual food and lamps',()=>{
  for(const p of PUB_SERVICE_PLACEMENTS){
    const table=PUB_INTERIOR_LAYOUT.furniture.find(f=>f.id===p.tableId);
    assert.equal(table?.kind,'table');
    assert.ok(Math.hypot(p.x-table.x,p.z-table.z)+.047<.47,'whole glass base lies on the circular table');
    for(const d of PUB_HOSPITALITY_DRESSING.filter(d=>d.support===p.tableId))
      assert.ok(Math.hypot(p.x-d.x,p.z-d.z)>.047+d.radius,`${p.id} overlaps ${d.id}`);
  }
});

test('carry follows bodily heading, stays level and never leaks into Source',()=>{
  const flags={'pub.help.accepted':true,'pub.help.trayTaken':true};
  const held=pubServiceInstances(flags,{carrier}).find(p=>p.id==='pub-carried-service-tray');
  assert.ok(Math.abs(held.x-30.53)<1e-9);assert.equal(held.z,87);assert.equal(held.y,1.19);
  assert.equal(held.pitch,undefined);assert.equal(held.roll,undefined);
  assert.deepEqual(pubServiceInstances(flags,{carrier:{...carrier,pitch:1}}),pubServiceInstances(flags,{carrier}));
  assert.equal(pubServiceInstances(flags).some(p=>p.id==='pub-carried-service-tray'),false,'no invalid camera means no stranded tray');
  assert.deepEqual(pubServiceInstances(flags,{source:true,carrier}),[]);
  const upstairs=pubServiceInstances(flags,{carrier,tables:false});
  assert.deepEqual(upstairs.map(p=>p.id),['pub-carried-service-tray'],'carried service remains visible on every ordinary floor');
  const source=readFileSync('src/main.js','utf8'),start=source.indexOf("if(!suppressActors&&!usingSpecialSpace())");
  const main=source.slice(start,start+1100);
  assert.match(main,/if\(!suppressActors&&!usingSpecialSpace\(\)\)\{[\s\S]*?for\(const vessel of pubServiceInstances\(flags,\{carrier:R3\.r3dViewCamera\?\.\(\),drinksByActor,tables:group==='ground'\}\)\)/);
});

test('Mavis receives the same table water as her single animated vessel',()=>{
  const flags={'pub.help.complete':true},drinksByActor=pubServiceDrinks(flags,{timeSec:2});
  assert.equal(drinksByActor['pub-patron-mavis'].kind,'water');
  assert.equal(drinksByActor['pub-patron-mavis'].timeSec,2);
  assert.equal(pubServiceInstances(flags,{drinksByActor}).some(p=>p.id==='pub-water-mavis'),false);
  assert.equal(pubServiceInstances(flags,{drinksByActor}).filter(p=>p.mesh==='pub_service_water_glass').length,1,'Ed keeps his table water alongside his own drink');
  const at=pubServiceInstances(flags).find(p=>p.id==='pub-water-mavis');
  assert.deepEqual(drinksByActor['pub-patron-mavis'].restWorld,[at.x,at.y,at.z]);
  assert.deepEqual(pubServiceDrinks({}),{'pub-patron-mavis':null});
});

test('the production counter restores a bare tray once Iona clears the returned glasses',()=>{
 const source=readFileSync('src/main.js','utf8'),start=source.indexOf('function syncPubQuestProps('),end=source.indexOf('\n}',start)+2;
 assert.ok(start>=0&&end>start);
 let flags={},removed=false;const tray={mesh:null};
 const context={FP:{isLoaded:()=>true},pubQuestState,getSave:()=>({flags}),PUB_TRAY_PROP:'pub-service-tray',PUB_FAVORS:{},refreshWorldProps(){},
  PROPS:{restoreAuthoredProp:()=>{removed=false;return tray},setLooseProp:()=>{removed=true}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 context.syncPubQuestProps({refresh:false});assert.equal(tray.mesh,'pub_service_tray_loaded');
 flags={'pub.help.accepted':true,'pub.help.trayTaken':true};context.syncPubQuestProps({refresh:false});assert.equal(removed,true,'the same tray is not left on the bar while carried');
 flags={'pub.help.complete':true};context.syncPubQuestProps({refresh:false});assert.equal(removed,false);assert.equal(tray.mesh,'pub_service_tray_bare','Iona has put the glasses away, as the visible handover says');
});
