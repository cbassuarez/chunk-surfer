import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory,CONSERVATORY_LANDINGS,CONSERVATORY_FLIGHTS} from '../src/data/floorplan/conservatory.js';
import {FACILITY_SPACES} from '../src/data/building-map.js';
import {LANDING_FITTINGS,CORRIDOR_LETTERING_FACES} from '../src/data/corridor-lettering.js';
import {corridorDressing} from '../src/world/corridor-dressing.js';
import {corridorInscriptionsForHosts} from '../src/data/world-inscriptions.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const placed=PROPS.propsInit(FP),hosts=PROPS.renderInstances({inscriptions:false});
const actualHosts=new Map(hosts.map(host=>[host.id,host]));
const generated=corridorDressing(FP,{doors:FP.doorState(),landings:CONSERVATORY_LANDINGS,flights:CONSERVATORY_FLIGHTS});
const expectedHosts=generated.filter(host=>host.mesh==='door_stencil'||Object.keys(LANDING_FITTINGS).some(key=>'landing-'+key.split('/')[1]===host.id));
const inscriptions=corridorInscriptionsForHosts(hosts),rendered=PROPS.renderInstances();
assert.equal(new Set(inscriptions.map(record=>record.id)).size,inscriptions.length);
assert.deepEqual(new Set(inscriptions.map(record=>record.hostId)),new Set(expectedHosts.map(host=>host.id)),
  'Only existing generated room plates and the four authored landing fittings receive copy');
assert.equal(inscriptions.filter(record=>record.provenance.kind==='landing').length,4);
assert.deepEqual(corridorInscriptionsForHosts([]),[]);
assert.deepEqual(corridorInscriptionsForHosts([{id:'plate-never-named',mesh:'door_stencil'}]),[]);
assert.deepEqual(corridorInscriptionsForHosts([{id:'plate-practice-west-1',mesh:'replacement-host'}]),[]);
for(const record of inscriptions){
  const host=actualHosts.get(record.hostId),placement=placed.find(p=>p.id===record.hostId);
  assert.ok(host&&placement,record.id+' requires a real surviving host');
  assert.equal(record.hostMesh,host.mesh);assert.equal(placement.frontAxis,'-z');
  assert.deepEqual(record.readerRight,[-1,0,0]);assert.deepEqual(record.up,[0,1,0]);
  assert.ok(Math.abs(Math.sin(host.yaw)-placement.wallContact.nx)<1e-9&&
    Math.abs(-Math.cos(host.yaw)-placement.wallContact.ny)<1e-9,record.id+' manufactured face points into the corridor');
  assert.equal(record.lines.join('').replace(/\s/g,''),record.copy.replace(/\s/g,''),'Line fitting must preserve all copy');
  const attached=rendered.filter(p=>p.letteringId===record.id);assert.equal(attached.length,1);
  for(const key of ['x','y','z','yaw','scale','zone','structural'])assert.equal(attached[0][key],host[key],record.id+' changed host '+key);
  if(record.provenance.kind==='corridor-door'){
    const space=FACILITY_SPACES.find(space=>space.doorIds?.includes(record.provenance.doorId));
    assert.equal(record.copy,space.label,'Door aliases must retain the first recorded owner');
    assert.equal(record.provenance.spaceId,space.id);
    assert.ok(record.widthM<=.46&&record.heightM<=.32&&record.center[2]<-.0175,
      'Room copy stays seated on the existing small plate front');
  }else{
    const specification=Object.entries(LANDING_FITTINGS).find(([key])=>'landing-'+key.split('/')[1]===host.id)[1];
    assert.equal(record.copy,specification.label);assert.equal(placement.elevation,2.2);
    assert.ok(CORRIDOR_LETTERING_FACES.landing.panelSize[0]<=2.4,'Centered panel must fit between the original lamps');
    assert.equal(record.center[0],0,'Landing name belongs between the lamps, not below the right lamp');
  }
}
// This alias is deliberately not one of the placed plates. The pure label
// resolver still has to obey the same first-owner rule when passed such a host.
assert.equal(corridorInscriptionsForHosts([{id:'plate-b1-lift-hatch',mesh:'door_stencil'}])[0].copy,'STUDIO B1');
assert.equal(corridorInscriptionsForHosts([{id:'plate-practice-east-4',mesh:'door_stencil'}])[0].copy,'PRACTICE ROOM 8');
const hidden=hosts.filter(host=>!host.id.startsWith('plate-')&&!host.id.startsWith('landing-'));
assert.equal(PROPS.attachInscriptions(hidden).filter(p=>p.letteringId&&inscriptions.some(i=>i.id===p.letteringId)).length,0,
  'Hidden or other-floor hosts cannot leave corridor lettering floating behind');
console.log(JSON.stringify({kind:'corridor-lettering',surfaces:inscriptions.length,ids:inscriptions.map(record=>record.id),
  exactFirstOwnerCopy:true,negativeZFront:true,hostTransformPreserved:true,ghostLabels:false}));
