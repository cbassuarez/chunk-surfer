import test from'node:test';import assert from'node:assert/strict';
import*as FP from'../src/world/floorplan.js';import*as P from'../src/game/props.js';
import{conservatory as C}from'../src/data/floorplan/conservatory.js';import{CONSERVATORY_PROPS}from'../src/data/conservatory-props.js';import{CELL}from'../src/data/floorplan/legend.js';
import{packedPropMeshes,placedMesh,segmentHitsTriangle as hit}from'./helpers/packed-prop-mesh.mjs';
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});P.propsInit(FP);
const rendered=P.renderInstances({inscriptions:false}),byId=new Map(rendered.map(p=>[p.id,p])),pack=packedPropMeshes(),model=id=>{const p=byId.get(id);assert.ok(p,'retained visible instance '+id);return placedMesh(p,pack.mesh(p.mesh));};
const disjoint=(a,b)=>a.min.some((v,i)=>v>=b.max[i]-1e-7||a.max[i]<=b.min[i]+1e-7);
const crosses=(a,b)=>a.triangles.some(t=>b.triangles.some(q=>[0,1,2].some(i=>hit(t[i],t[(i+1)%3],q)||hit(q[i],q[(i+1)%3],t))));
const probe=(x,z,{floor=-4,group='basement'}={})=>{const l=FP.logicalAtPhysical((x-.25)/CELL,(z-.25)/CELL,{group,floor});assert.ok(l,'physical approach exists');assert.equal(l.renderGroup,group);for(const[dx,dz]of[[0,0],[-.2,0],[.2,0],[0,-.2],[0,.2]]){const rx=l.x+dx/CELL,ry=l.y+dz/CELL;assert.equal(FP.isSolid(rx,ry),false);assert.equal(FP.isCollisionOnly(rx,ry),false);assert.equal(P.propCanOccupy(rx,ry),true);assert.ok(Math.abs(FP.floorAt(rx,ry)-floor)<1e-5);}};

test('the actual old stairs pierce the switchgear body; a full-width forward shift also pierces a tape rack',()=>{
 const local=pack.mesh('plant_grated_steps'),old=placedMesh({...byId.get('spur-substation-steps'),x:22,z:34.5,scaleX:1},local);
 assert.ok(crosses(old,model('spur-substation-mcc')),'the long diagonal rail crosses the cabinet between its endpoints');
 const full=placedMesh({...byId.get('spur-substation-steps'),x:21.5,z:35.25,scaleX:1},local);
 assert.ok(crosses(full,model('legacy-tape-rack-west-a')),'the regression rejects the tempting full-width relocation');
});

test('the compact existing steps clear the MCC and adjacent equipment while retaining all declared working fronts',()=>{
 const s=model('spur-substation-steps'),m=model('spur-substation-mcc'),rack=model('legacy-tape-rack-west-a'),idf=model('spur-substation-idf'),patch=model('legacy-patchbay-north');
 assert.equal(s.bounds.max[0]-s.bounds.min[0],1.5);assert.equal(byId.get(s.id).yaw,0);assert.equal(byId.get(s.id).y,-4);
 for(const id of['spur-substation-mcc','spur-substation-idf','legacy-tape-rack-west-a','legacy-tape-rack-west-b','legacy-patchbay-north','legacy-transfer-console'])assert.ok(disjoint(s.bounds,model(id).bounds),'no actual packed-volume overlap with '+id);
 assert.ok(s.bounds.min[2]-m.bounds.max[2]>.034,'furthest actual projecting MCC control housing stays clear');
 assert.ok(s.bounds.min[0]-rack.bounds.max[0]>=.9,'west rack retains its entire 0.9 m front');
 assert.ok(patch.bounds.min[0]-s.bounds.max[0]>=.9,'patchbay retains its entire 0.9 m front');
 assert.ok(idf.bounds.min[2]-s.bounds.max[2]>=.9,'IDF retains its entire 0.9 m front');
 for(const [x,z]of[[24.75,36.75],[24,36.75],[23.25,36.75],[22.4,36.75],[21.2,36.75],[21.2,35.8]])probe(x,z);
});

test('stored desktop slabs no longer cross and retain a clear 0.9 m aisle between them',()=>{
 const one=model('academic-store-desk-1'),two=model('academic-store-desk-2');
 const old=placedMesh({...byId.get(two.id),x:69.5,z:20.5},pack.mesh('school_desk'));
 assert.ok(crosses(one,old));assert.ok(disjoint(one.bounds,two.bounds));assert.ok(one.bounds.min[0]-two.bounds.max[0]>=.9);
 assert.ok(two.bounds.min[2]-model('academic-store-files-3').bounds.max[2]>=.9,'the moved desk leaves the existing filing-bank drawers accessible');
 for(const z of[20.5,20.75,21,21.25,21.5])probe(68.5,z,{floor:10,group:'academic'});
});

test('the south-wall MCC clears the heating banks and retains a full-height unobstructed 0.9 m work face',()=>{
 const m=model('plant-mcc-east');assert.equal(byId.get(m.id).yaw,0);assert.ok(Math.abs(m.bounds.max[2]-35)<1e-5);
 const old=placedMesh({...byId.get(m.id),x:39.81,z:28.5,yaw:-Math.PI/2},pack.mesh('plant_mcc_bank'));
 assert.ok(crosses(old,model('plant-pipe-east-bank-north')),'the old heating-bank/body intersection is real');
 const front={min:[m.bounds.min[0],-4,m.bounds.min[2]-.9],max:[m.bounds.max[0],m.bounds.max[1],m.bounds.min[2]]};
 for(const id of['plant-pipe-east-bank-north','plant-pipe-east-bank-south','plant-pipe-east-valve','plant-pump-south','plant-calorifier-south','plant-rack-1']){const b=model(id).bounds;assert.ok(disjoint(m.bounds,b),'cabinet clears '+id);assert.ok(disjoint(front,b),'0.9m work face clears '+id);}
 const pump=model('plant-pump-south');assert.ok(disjoint(pump.bounds,model('plant-calorifier-south').bounds));
 for(const[x,z]of[[37.5,32.5],[37.5,33.9],[36.5,33.9],[38.5,33.9],[38.75,32.5]])probe(x,z);
});

test('all repaired objects remain passive; the heating-header action, inspection reach and connected pipe banks are retained',()=>{
 for(const id of['spur-substation-steps','academic-store-desk-2','plant-mcc-east','plant-pump-south']){const p=CONSERVATORY_PROPS.find(p=>p.id===id);assert.equal(p.interactive,false);assert.equal(p.action,undefined);assert.equal(p.keyId,undefined);}
 const h=CONSERVATORY_PROPS.find(p=>p.id==='plant-heating-header');assert.equal(h.action,'plant-header-valve');assert.deepEqual(h.inspectAt,{x:33,y:37.45});
 assert.deepEqual(['plant-pipe-east-bank-north','plant-pipe-east-bank-south'].map(id=>{const p=CONSERVATORY_PROPS.find(p=>p.id===id);return[p.x,p.y,p.yaw,p.elevation];}),[[39.5,29,-Math.PI/2,1.55],[39.5,31.7,-Math.PI/2,1.55]]);
});

function horizontalSupport(mesh,x,z,maxY){
 let y=-Infinity;for(const[a,b,c]of mesh.triangles){if(Math.max(a[1],b[1],c[1])-Math.min(a[1],b[1],c[1])>1e-6||a[1]>maxY+1e-6)continue;
  const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)y=Math.max(y,a[1]);
 }return y;
}

test('box-office papers sit wholly on the actual counter and all four grounded queue posts clear its grille',()=>{
 const counter=model('box-office-counter');for(const id of['box-office-program-stack','box-office-unsold-roll','box-office-cash-terminal']){
  const m=model(id);assert.equal(crosses(m,counter),false,id+' clears actual grille bars');
  for(const x of[m.bounds.min[0],m.bounds.max[0]])for(const z of[m.bounds.min[2],m.bounds.max[2]])assert.ok(Math.abs(horizontalSupport(counter,x,z,m.bounds.min[1])-m.bounds.min[1])<1e-5,'every paper corner has actual counter support');
 }
 const facade=model('bay-west-elevation');assert.equal(crosses(counter,facade),false,'the complete counter clears the retained low plinth');
 const q=[1,2,3,4].map(i=>model('box-office-queue-'+i));for(const p of q){assert.equal(crosses(p,counter),false);assert.equal(crosses(p,facade),false);assert.ok(Math.abs(p.bounds.min[1])<1e-6);}
 for(const[a,b]of[[q[0],q[2]],[q[1],q[3]]]){assert.ok(a.bounds.max[0]>=b.bounds.min[0]);assert.ok(a.bounds.max[0]-b.bounds.min[0]<.003,'only the joined rope caps meet');
  const joint=[88.42,.78,byId.get(a.id).z];for(const p of[a,b])assert.ok(Math.min(...p.vertices.map(v=>Math.hypot(...v.map((v,i)=>v-joint[i]))))<.04,'both actual rope caps meet at the same joint');}
 assert.ok(q[1].bounds.min[2]-q[0].bounds.max[2]>=.9,'parallel rows retain the clear queue aisle');
 for(const x of[87.75,88,88.5,88.75,88.9])probe(x,10.5,{floor:0,group:'ground'});probe(90.65,10.5,{floor:0,group:'ground'});
 assert.ok(91-counter.bounds.max[0]>=.9,'actual staff lane before the retained physical office wall');
});

test('the retained waiting pew clears the façade plinth and keeps the adjacent door approach open',()=>{
 const p=model('atrium-public-bench-west'),facade=model('bay-west-elevation'),old=placedMesh({...byId.get(p.id),z:9.5},pack.mesh('pew'));
 assert.ok(crosses(old,facade));assert.equal(crosses(p,facade),false);assert.ok(Math.abs(p.bounds.min[1])<1e-8);
 for(const[x,z]of[[77,10.5],[77,11.5],[77,12.75],[76.5,12.75]])probe(x,z,{floor:0,group:'ground'});
});

test('both playable hall instruments clear the built choir tiers and portal, remain on the actual flat stage and keep reachable approaches',()=>{
 const structure=model('hall-structure');for(const id of['hall-grand-1','hall-timpani-1']){
  const p=byId.get(id),m=model(id),old=placedMesh({...p,x:id==='hall-timpani-1'?121:p.x,z:8},pack.mesh(p.mesh));
  assert.ok(crosses(old,structure),'old instrument really crosses the built tiers');assert.equal(crosses(m,structure),false,'new instrument clears actual tiers and portal');assert.equal(p.y,-1.5);
  for(const x of[m.bounds.min[0]+.03,m.bounds.max[0]-.03])for(const z of[m.bounds.min[2]+.03,m.bounds.max[2]-.03]){const l=FP.logicalAtPhysical((x-.25)/CELL,(z-.25)/CELL,{group:'hall',floor:-1.5});assert.equal(l?.renderGroup,'hall');assert.equal(l.floor,-1.5);}
 }
 assert.ok(disjoint(model('hall-timpani-1').bounds,model('hall-timpani-2').bounds));
 for(const[x,z]of[[113,8.3],[114.5,8.5],[116,8.5],[118,8.5],[120.5,8.5],[120.5,9]])probe(x,z,{floor:-1.5,group:'hall'});
 for(const[id,x,z]of[['hall-grand-1',113,8.3],['hall-timpani-1',120.5,9]]){const l=FP.logicalAtPhysical((x-.25)/CELL,(z-.25)/CELL,{group:'hall',floor:-1.5}),p=P.propById(id),mx=(l.x+.5)*CELL,mz=(l.y+.5)*CELL;assert.ok(Math.hypot(p.interactionX-mx,p.interactionY-mz)<2,'unchanged action remains within ordinary reach');assert.equal(p.interaction,'play');assert.ok(p.sampleFamily,'playable instrument retains its sample family');}
});

test('the retained dock check form sits on the actual seventy-millimetre deck instead of passing through it',()=>{
 const p=model('dock-level-check-box'),deck=model('bay-getin-sightline');assert.ok(Math.abs(p.bounds.min[1]-.07)<1e-6);
 for(const[x,z]of[[65,10],[64.5,10],[65.5,10],[65,9.5],[65,10.5]])assert.ok(Math.abs(horizontalSupport(deck,x,z,p.bounds.min[1])-p.bounds.min[1])<1e-6);
 const old=placedMesh({...byId.get(p.id),y:.018},pack.mesh('tower_rope_mat'));assert.ok(crosses(old,deck));
});
