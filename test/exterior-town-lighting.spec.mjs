import test from'node:test';import assert from'node:assert/strict';
import{selectExteriorTownLights as select,selectFoyerWindowLights}from'../src/render/exterior-town-lighting.js';
import{resolveLocalLights}from'../src/data/conservatory-lights.js';
import{GLASS_COURT_LIGHTS}from'../src/data/glass-court.js';
import{BUILDING_WINDOWS}from'../src/data/building-windows.js';
import{ZONE}from'../src/data/floorplan/legend.js';
const light=(id,x,z=0,extra={})=>({id,x,y:5.8,z,color:[1,.82,.58],intensity:.73,radius:10.5,...extra});

test('nearby road fittings remain eligible when ordinary/traffic/entrance already fill the twelve slots',()=>{
 const ordinary=Array.from({length:8},(_,i)=>light(`ordinary-${i}`,50+i));
 const traffic=[light('headlight-a',60),light('headlight-b',61)],entrance=[light('entrance-a',62),light('entrance-b',63)];
 const result=select({ordinary,traffic,entrance,road:[light('road-near',2)],origin:{x:0,z:0}});
 assert.equal(result.length,12);assert.equal(result[0].id,'road-near');assert.equal(result.some(l=>l.id==='entrance-b'),false);
});
test('van and two nearest borrowed fixtures are reserved before the combined distance ranking',()=>{
 const van=light('van',90),borrowed=[light('glass-far',70),light('glass-near',20),light('glass-mid',30)];
 const result=select({van,borrowed,ordinary:[light('ordinary',1)],road:[light('road',2)],maxLights:5});
 assert.deepEqual(result.map(l=>l.id),['van','glass-near','glass-mid','ordinary','road']);
 assert.strictEqual(result[0],van);assert.strictEqual(result[1],borrowed[1]);
});
test('small budgets include all reservations and never overflow',()=>{
 const input={van:light('van',99),borrowed:[light('glass-a',10),light('glass-b',11)],road:[light('road',0)]};
 assert.deepEqual(select({...input,maxLights:0}),[]);
 assert.deepEqual(select({...input,maxLights:1}).map(l=>l.id),['van']);
 assert.deepEqual(select({...input,maxLights:2}).map(l=>l.id),['van','glass-a']);
 assert.deepEqual(select({...input,maxLights:3}).map(l=>l.id),['van','glass-a','glass-b']);
});
test('ids are deduplicated across reserved and ordinary sources, with reserved objects authoritative',()=>{
 const van=light('van',3,0,{source:'van'}),borrowed=light('glass',10),ordinary=light('ordinary',1,0,{source:'ordinary'});
 const result=select({van,borrowed:[borrowed,light('glass',0)],ordinary:[light('van',0),light('glass',0),ordinary],road:[light('ordinary',0),light('road',2)]});
 assert.deepEqual(result.map(l=>l.id),['van','glass','ordinary','road']);
 assert.strictEqual(result[0],van);assert.strictEqual(result[1],borrowed);assert.strictEqual(result[2],ordinary);
});
test('more than two borrowed fixture ids cannot leak back through the ordinary candidate list',()=>{
 const a=light('glass-a',1),b=light('glass-b',2),c=light('glass-c',3);
 const result=select({borrowed:[c,b,a],ordinary:[a,b,c,light('street',4)]});
 assert.deepEqual(result.map(l=>l.id),['glass-a','glass-b','street']);
});
test('combined candidates use planar distance and deterministic id ties, not category precedence',()=>{
 const result=select({ordinary:[light('z-last',4,0,{y:.3})],traffic:[light('b-traffic',-4)],entrance:[light('c-entrance',0,4)],road:[light('a-road',0,-4,{y:50})]});
 assert.deepEqual(result.map(l=>l.id),['a-road','b-traffic','c-entrance','z-last']);
 assert.deepEqual(select({road:[light('a',10),light('b',2)],origin:{x:9,z:0}}).map(l=>l.id),['a','b']);
});
test('power, direction, emergency and shading attributes survive by object identity without mutation',()=>{
 const l=light('road',4,2,{intensity:0,circuit:'dead-street',maintained:false,powerMode:'external',emergencyPulse:{rate:3},direction:[0,-1,0],coneOuterCos:.7,penetration:0,castsShadow:true});
 const list=[l],before=JSON.stringify(list);Object.freeze(l.direction);Object.freeze(l.emergencyPulse);Object.freeze(l);Object.freeze(list);
 const result=select({road:list});assert.strictEqual(result[0],l);assert.equal(JSON.stringify(list),before);
 assert.equal(result[0].intensity,0);assert.equal(result[0].maintained,false);
});
test('invalid or absent physical positions do not enter the source budget',()=>{
 const invalid=[null,{},light('',1),light('x',NaN),light('y',1,0,{y:undefined}),light('z',1,Infinity),light('string',1,0,{x:'1'})];
 assert.deepEqual(select({van:{id:'bad'},borrowed:invalid,ordinary:invalid,traffic:invalid,entrance:invalid,road:[...invalid,light('valid',3)]}).map(l=>l.id),['valid']);
 assert.deepEqual(select({ordinary:null,traffic:{},entrance:'bad',borrowed:null,road:null}),[]);
});
test('nonfinite/negative budgets are empty, fractions floor, and the renderer maximum is hard-capped at twelve',()=>{
 const road=Array.from({length:20},(_,i)=>light(`road-${String(i).padStart(2,'0')}`,i));
 for(const maxLights of[NaN,Infinity,-Infinity,-5,'4',null])assert.deepEqual(select({road,maxLights}),[]);
 assert.equal(select({road,maxLights:3.9}).length,3);assert.equal(select({road,maxLights:50}).length,12);
 assert.equal(select({road}).length,12);assert.equal(select({road,maxLights:undefined}).length,12);
});
test('missing/invalid listener coordinates use a stable zero origin without modifying input',()=>{
 const road=[light('far',10),light('near',1)];
 for(const origin of[undefined,null,{}, {x:NaN,z:Infinity}])assert.deepEqual(select({road,origin}).map(l=>l.id),['near','far']);
});

test('an exterior W3 view retains the actual maintained foyer light and one greenhouse fitting with dead house circuits',()=>{
 const window=BUILDING_WINDOWS.find(w=>w.id==='W3-foyer-north');
 const outdoor=resolveLocalLights({group:'ground',zone:ZONE.civicCourt},{liveCircuits:new Set(),glassCourtReady:true,slots:Infinity});
 assert.equal(outdoor.some(l=>l.id==='atrium-main-exit'),false,'negative control: ordinary exterior zone loses the visible room fitting');
 const foyer=resolveLocalLights({group:'ground',zone:ZONE.foyer},{liveCircuits:new Set(),slots:Infinity});
 const borrowed=selectFoyerWindowLights({window,foyer,court:GLASS_COURT_LIGHTS.filter(l=>l.zone===ZONE.glasshouse)});
 assert.equal(borrowed.length,2);assert.equal(borrowed[0].id,'atrium-main-exit');assert.ok(borrowed[0].powered);assert.ok(borrowed[0].maintained);
 assert.equal(borrowed.some(l=>l.kind==='emergency'),false);
 assert.strictEqual(borrowed[0],foyer.find(l=>l.id==='atrium-main-exit'));
 assert.ok(GLASS_COURT_LIGHTS.includes(borrowed[1]));
 assert.deepEqual(selectFoyerWindowLights({window:null,foyer,court:GLASS_COURT_LIGHTS}),[]);
 assert.deepEqual(selectFoyerWindowLights({window:{id:'W4-pool-south'},foyer,court:GLASS_COURT_LIGHTS}),[]);
 assert.equal(select({borrowed,ordinary:Array.from({length:12},(_,i)=>light('near'+i,0))}).length,12);
});
