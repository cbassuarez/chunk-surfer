import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENING_CINEMATIC_ASSETS, shouldStageOpeningCinematic, openingCinematicLighting,
  openingCinematicStaticProps, openingCinematicActors, openingCinematicGate,
  prepareOpeningCinematicAssets,
} from '../src/render/opening-cinematic-staging.js';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function samePose(a,b,label='pose',seen=new WeakMap()){
  if(typeof a==='number'){assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-10,label+' changed while presentation time was held');return;}
  if(a&&typeof a==='object'){
    assert.ok(b&&typeof b==='object',label+' shape');if(seen.get(a)===b)return;seen.set(a,b);assert.deepEqual(Object.keys(a),Object.keys(b),label+' fields');
    for(const key of Object.keys(a))samePose(a[key],b[key],label+'.'+key,seen);return;
  }
  assert.equal(a,b,label);
}

function poseDelta(a,b){if(typeof a==='number')return Math.abs(a-b);if(!a||typeof a!=='object')return 0;return Math.max(0,...Object.keys(a).map(k=>poseDelta(a[k],b[k])));}
const frame=(sourcePlanId,extra={})=>({sourcePlanId,eye:[43.4,1.7,30],performanceSeconds:4.3,lens:{focalLengthMm:27,sensorHeightMm:12.445,apertureFNumber:4,focusDistanceM:4,maxBlurPx:12},...extra});
function assetRenderer({missingBase=false,failOnce=false,omitMesh=false}={}){
  const catalog=new Set(missingBase?['unrelated-resident-mesh']:OPENING_CINEMATIC_ASSETS.filter(p=>p.base).flatMap(p=>p.meshes));
  const calls=[];let failed=false;
  const load=async(url,character)=>{
    calls.push({url,character});const pack=OPENING_CINEMATIC_ASSETS.find(p=>p.url===url);assert.ok(pack,'only declared native packs may be loaded');assert.equal(pack.character,character);
    if(failOnce&&!failed){failed=true;throw Error('pack unavailable');}
    for(const mesh of pack.meshes)if(!(omitMesh&&mesh==='door_leaf_bay_goods'))catalog.add(mesh);
  };
  return{calls,catalog,propMeshCatalog:()=>[...catalog],addPropPack:url=>load(url,false),addCharacterPack:url=>load(url,true)};
}

test('staging ownership is restricted to the seven approved setups and never follows the player home',()=>{
  for(let i=1;i<=7;i++)assert.equal(shouldStageOpeningCinematic(frame('R0'+i)),true);
  for(const value of[null,{},frame('R08'),frame('R01',{nativeReturn:true}),frame('R01',{stage:'return'}),frame('R01',{staging:{enabled:false}}),frame('R01',{stagingEnabled:false}),{shotId:'pub-evening'}])assert.equal(shouldStageOpeningCinematic(value),false);
  const context=frozen({ambientIntensity:.17,bounce:{intensity:.2}}),lights=frozen([{id:'ordinary',intensity:1,color:[1,1,1]}]),instances=frozen([{id:'unrelated-gameplay-prop',matrix:[...identity]}]);
  const returned=frame('R08',{lightingOverride:{ambientIntensity:99}}),light=openingCinematicLighting(returned,{ordinaryContext:context,ordinaryLights:lights});
  assert.equal(light.active,false);assert.equal(light.context,context);assert.equal(light.lights,lights);assert.equal(openingCinematicStaticProps(returned,instances),instances);assert.deepEqual(openingCinematicActors(returned),[]);
});

test('the active gate preserves the2:1 composition at different viewports, then clears bars and cinematic lens together',()=>{
  for(const[width,height]of[[960,480],[1280,720],[1440,900],[1920,800],[600,900]]){
    const f=frame('R01'),before=JSON.stringify(f),g=openingCinematicGate(f,{width,height}),r=g.activeRect;
    assert.equal(g.active,true);close(r.width/r.height,2);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width&&r.y+r.height<=height);
    close(g.bars.reduce((sum,b)=>sum+b.width*b.height,0)+r.width*r.height,width*height);
    close(g.lens.sensorHeightMm*r.height/height,12.445);assert.equal(g.lens.focalLengthMm,f.lens.focalLengthMm);assert.equal(JSON.stringify(f),before);
    const returned=openingCinematicGate(frame('R08'),{width,height});assert.equal(returned.active,false);assert.deepEqual(returned.activeRect,{x:0,y:0,width,height});assert.deepEqual(returned.bars,[]);assert.equal(returned.lens,null);
  }
});

test('closed service-door staging preserves source matrices and door state without admitting invented geometry',()=>{
  const leaf=frozen({id:'door-leaf:dock-grey-exterior:0',mesh:'door_leaf_bay_goods',matrix:[...identity.slice(0,12),56.7,0,10.25,1],doorId:'dock-grey-exterior',openFraction:0,destination:'existing-dock'});
  const existing=frozen([{id:'yard-former-stables',mesh:'yard_stable_range',matrix:[...identity]},{id:'ordinary-unrelated-prop',mesh:'chair',matrix:[...identity]}]);
  const source=frozen(frame('R04',{additionalInstances:[leaf,{id:'unapproved-new-door',mesh:'door_leaf_bay_goods',matrix:[...identity]}]})),before=JSON.stringify({source,existing});
  const staged=openingCinematicStaticProps(source,existing);assert.equal(staged.length,2);assert.ok(staged.some(p=>p.id==='yard-former-stables'));assert.ok(!staged.some(p=>p.id==='unapproved-new-door'));
  const door=staged.find(p=>p.id===leaf.id);assert.deepEqual(door.matrix,leaf.matrix);assert.notEqual(door.matrix,leaf.matrix,'presentation copies cannot mutate the saved source marks');assert.equal(door.openFraction,0);assert.equal(door.destination,'existing-dock');assert.equal(JSON.stringify({source,existing}),before);
});

test('existing actors and held objects share the paused presentation clock without a new page-turn cue',()=>{
  const pub=frame('R01'),first=openingCinematicActors(pub),again=openingCinematicActors(pub),later=openingCinematicActors({...pub,performanceSeconds:6.6});
  assert.ok(first.length>7);samePose(first,again);assert.equal(new Set(first.map(p=>p.id)).size,first.length);
  const iona=first.find(p=>p.id==='pub-bartender-iona'),laterIona=later.find(p=>p.id===iona.id);assert.ok(iona.character);assert.deepEqual([iona.x,iona.y,iona.z],[laterIona.x,laterIona.y,laterIona.z]);assert.ok(poseDelta(iona.character.joints,laterIona.character.joints)>1e-4,'native articulation must change beyond floating-point noise when authored time advances');
  const vigil=openingCinematicActors(frame('R02'));assert.ok(vigil.some(p=>p.id==='vigil-ruth-mallory'));assert.ok(vigil.some(p=>p.id==='vigil-part-ruth-mallory-binder'));samePose(vigil,openingCinematicActors(frame('R02')),'vigil pose');
  assert.deepEqual(openingCinematicActors(frame('R05')),[],'the empty room is not populated by a new explanatory actor');
});

test('shot lighting has bounded native slots and cannot mutate ordinary lighting or frozen plan marks',()=>{
  const ordinaryContext=frozen({ambientIntensity:.3}),ordinaryLights=frozen([{id:'ordinary',color:[1,1,1],intensity:1}]);
  const f=frozen(frame('R04',{lightingOverride:{ambientIntensity:.08,bounceIntensity:.06,replaceProposalLights:[{name:'existing-canopy-position',positionM:[55.2,4.1,7.5],color:[1,.74,.42],powerWProxy:51.6,sizeM:.875}]}})),before=JSON.stringify({f,ordinaryContext,ordinaryLights});
  const result=openingCinematicLighting(f,{ordinaryContext,ordinaryLights});assert.equal(result.active,true);assert.ok(result.lights.length>0&&result.lights.length<=8);assert.ok(result.lights.some(l=>l.id==='existing-canopy-position'));assert.equal(result.context.ambientIntensity,.08);assert.equal(result.context.bounce.intensity,.06);assert.equal(JSON.stringify({f,ordinaryContext,ordinaryLights}),before);
  for(const l of result.lights)assert.ok([l.x,l.y,l.z,l.intensity,l.radius,...l.color].every(Number.isFinite));
});

test('asset preparation is shared, uses resident base meshes and verifies every required native pack before ready',async()=>{
  const renderer=assetRenderer(),[a,b]=await Promise.all([prepareOpeningCinematicAssets({propsRenderer:renderer}),prepareOpeningCinematicAssets({propsRenderer:renderer})]);
  assert.equal(a.ready,true);assert.equal(a,b);assert.equal(new Set(renderer.calls.map(c=>c.url)).size,renderer.calls.length);assert.ok(renderer.calls.length>1);assert.ok(renderer.calls.every(c=>!OPENING_CINEMATIC_ASSETS.find(p=>p.url===c.url).base));assert.ok(a.requiredMeshes.every(m=>renderer.catalog.has(m)));
  await prepareOpeningCinematicAssets({propsRenderer:renderer});assert.equal(renderer.calls.length,OPENING_CINEMATIC_ASSETS.filter(p=>!p.base).length,'later readiness checks do not reload resident packs');
});

test('unready base or missing installed meshes cannot silently enter the film; failed preparation can be retried deliberately',async()=>{
  const missing=assetRenderer({missingBase:true});await assert.rejects(prepareOpeningCinematicAssets({propsRenderer:missing}),/base meshes/);assert.equal(missing.calls.length,0);
  const incomplete=assetRenderer({omitMesh:true});await assert.rejects(prepareOpeningCinematicAssets({propsRenderer:incomplete}),/meshes unavailable.*door_leaf_bay_goods/);
  const retry=assetRenderer({failOnce:true});await assert.rejects(prepareOpeningCinematicAssets({propsRenderer:retry}),/asset preparation failed/);const firstCalls=retry.calls.length;assert.equal((await prepareOpeningCinematicAssets({propsRenderer:retry})).ready,true);assert.ok(retry.calls.length>firstCalls);
});


test('the main cinematic path requests unbatched native hosts so approved windows and B3 grilles survive selection',async()=>{
  const [{readFile},FP,PROPS,{conservatory},{CELL,isOutdoorZone},{OPENING_OVERTURE_SHOTS,openingOvertureFrame}]=await Promise.all([
    import('node:fs/promises'),import('../src/world/floorplan.js'),import('../src/game/props.js'),import('../src/data/floorplan/conservatory.js'),import('../src/data/floorplan/legend.js'),import('../src/data/opening-overture.js'),
  ]);
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const call=main.match(/PROPS\.renderInstances\(\{group:renderGroup,inscriptions:false,batchDressing:([^}]+)\}\)/);assert.ok(call,'the actual main prop submission must declare its dressing policy');
  const batchPolicy=Function('shouldStageOpeningCinematic','openingCinematicFrame','isOutdoorZone','FP','observer','return ('+call[1]+');');
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  for(const [sourcePlanId,required]of[['R05',['building-window-unit-W1-chamber-north']],['R06',['architecture-space-studio-b3-control-grille','architecture-target-main_b3-grille']]]){
    const shot=OPENING_OVERTURE_SHOTS.find(s=>s.sourcePlanId===sourcePlanId),f=openingOvertureFrame(shot.start+1),o=f.observer;
    const observer=FP.logicalAtPhysical(o.x/CELL,o.z/CELL,{group:f.renderGroup,floor:f.floorH});assert.ok(observer);
    const batchDressing=batchPolicy(shouldStageOpeningCinematic,()=>f,isOutdoorZone,FP,observer);assert.equal(batchDressing,false,sourcePlanId+' must keep individual native host IDs');
    const hosts=PROPS.renderInstances({group:f.renderGroup,inscriptions:false,batchDressing}),staged=openingCinematicStaticProps(f,hosts),ids=new Set(staged.map(p=>p.id));
    for(const id of required)assert.ok(ids.has(id),id+' must remain available to the approved cinematic allowlist');
    assert.equal(batchPolicy(shouldStageOpeningCinematic,()=>null,isOutdoorZone,FP,observer),true,'ordinary interior gameplay retains its dressing optimization');
  }
});
