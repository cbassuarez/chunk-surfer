import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {BUILDING_WINDOWS} from '../src/data/building-windows.js';
import {shouldHideCrossEnvelopeProp,isLoadingBaySightlineProp} from '../src/game/prop-visibility.js';
import {applyInstitutionPosters,INSTITUTION_POSTER_SITES} from '../src/data/institution-poster-sites.js';

FP.compile(conservatory.levels,conservatory);
PROPS.propsInit(FP);
const hosts=PROPS.renderInstances({group:'ground',inscriptions:false});
const window=BUILDING_WINDOWS.find(w=>w.id==='W3-foyer-north');

test('actual outdoor submissions contain no indoor wall displays, including courtyard-zoned holders and W3 views',()=>{
  const displays=hosts.filter(p=>['notice_board','portrait_frame'].includes(p.mesh)&&!isLoadingBaySightlineProp(p));
  assert.ok(displays.length>35,'exercise real generated corridor holders as well as authored paintings');
  assert.ok(displays.some(p=>p.id==='deadend-ground-painting'&&p.zone===ZONE.civicCourt),'the real converted wall carries an outdoor anchor');
  for(const observerZone of [ZONE.street,ZONE.civicCourt,ZONE.serviceYard,ZONE.dock]){
    for(const exteriorWindow of [null,window]){
      const visible=hosts.filter(p=>!shouldHideCrossEnvelopeProp(p,{observerZone,exteriorWindow}));
      assert.deepEqual(visible.filter(p=>displays.includes(p)).map(p=>p.id),[]);
      assert.ok(visible.some(p=>p.id==='ellery-actual-public-front'),'the real exterior front remains');
      assert.ok(visible.some(p=>p.id==='district-north-row-a'),'shop front architecture remains');
      assert.ok(visible.some(p=>p.id==='bay-apron-route-board'),'the actual open-apron board retains its existing exception');
      assert.equal(applyInstitutionPosters(visible,{group:'ground',observerZone}).some(p=>p.posterSiteId),false,
        'post-filter independent papers cannot reappear outdoors');
    }
  }
});

test('indoor paintings and the full existing publicity set remain available in their own storeys',()=>{
  for(const id of ['foyer-portrait-titian','foyer-portrait-greco','deadend-ground-painting','box-office-notice-board']){
    const p=hosts.find(p=>p.id===id);assert.ok(p,id);
    assert.equal(shouldHideCrossEnvelopeProp(p,{observerZone:ZONE.foyer}),false,id+' retains its interior presentation');
  }
  const rendered=[];
  for(const group of ['ground','upper','academic','basement'])rendered.push(...applyInstitutionPosters(
    PROPS.renderInstances({group,inscriptions:false}),{group,observerZone:ZONE.foyer}));
  for(const site of INSTITUTION_POSTER_SITES)assert.ok(rendered.some(p=>p.posterSiteId===site.id),site.id+' retains authored art');
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/applyInstitutionPosters\(fitted,\{group,observerZone:FP\.zoneAt\(observer\.x,observer\.y\)\}\)/,
    'production passes actual observer authority to the post-filter paper additions');
});

test('the removed outdoor holder cannot leave a ghost inspection prompt while an indoor portrait remains inspectable',()=>{
  for(const [id,x,y,wanted]of[
    ['corridor-fixture-ground-x5-150',75,1,null],
    ['foyer-portrait-titian',80.5,5.5,'foyer-portrait-titian'],
  ]){
    const p=PROPS.propById(id),rx=x*2,ry=y*2;assert.ok(p,id);
    assert.equal(FP.isSolid(rx,ry),false);assert.equal(PROPS.propCanOccupy(rx,ry),true,'a real body can occupy the approach');
    const mx=(rx+.5)*.5,mz=(ry+.5)*.5,dx=p.interactionX-mx,dz=p.interactionY-mz;
    const yaw=Math.atan2(dx,-dz),pitch=Math.atan2(p.floor+(p.elevation||0)+(p.h||.55)*.5-(FP.floorAt(rx,ry)+1.58),Math.hypot(dx,dz));
    assert.equal(PROPS.pickProp(rx,ry,0,3.2,{yaw,pitch})?.id??null,wanted);
  }
});
