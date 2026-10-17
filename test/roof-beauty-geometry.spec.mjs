import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAcademicRoof } from '../tools/chunk_surfer/academic-roof-geometry.mjs';
import { buildAcademicRoofDressing } from '../tools/chunk_surfer/academic-roof-dressing.mjs';
import { ACADEMIC_ROOF } from '../src/data/academic-roof.js';
import { ACADEMIC_ROOF_DRESSING_MESHES, ACADEMIC_ROOF_DRESSING_PROPS } from '../src/data/academic-roof-dressing.js';

// Inspect the authored shapes before the shared GLB build. A furnishing must
// fit its runtime blocker, and a flat weather mesh must not smuggle in a chair.
const materials=Array.from({length:34},(_,i)=>({name:`base-${i}`}));
const MAT={dark:0,wood:1,black:2,steel:3,ivory:4,brass:5,cloth:6,cone:7,paper:8,
  portrait:9,stone:10,plaster:11,bronze:12,soil:13,deadLeaf:14,poolBlue:15,poolMint:16,
  agedWhite:17,safetyRed:18,roofGlass:19,vfd:20,warmWindow:21,brickRed:22,brickDark:23};
const meshes=new Map();
const api={materials,MAT,mesh(name){const m={name,shapes:[]};meshes.set(name,m);return m;}};
for(const kind of ['Box','Beam','Ellipsoid','Cylinder','Quad'])
  api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
buildAcademicRoof(api);buildAcademicRoofDressing(api);
const shapeMaterial=shape=>shape.kind==='Quad'?shape.args[4]
  :shape.kind==='Beam'?shape.args[3]:shape.args[2];
const ownersOf=predicate=>[...meshes.values()].filter(m=>m.shapes.some(s=>predicate(materials[shapeMaterial(s)])));

test('weathered roof ink is confined to architectural roof surfaces',()=>{
  const owners=ownersOf(m=>m?.extras?.roofRole==='weathered-surface').map(m=>m.name);
  assert.ok(owners.includes('academic_roof_structure'));
  assert.ok(owners.includes('academic_roof_weatherwork'));
  assert.ok(!owners.some(name=>name.includes('ren')||name.includes('service_stair')||name.includes('gate')),
    'Ren, the accepted escape, and the gallery leaf retain their own exposure');
  const glass=meshes.get('academic_roof_glazing').shapes.filter(s=>shapeMaterial(s)===MAT.roofGlass);
  assert.equal(glass.length,30,'the supported glazing field remains intact');
  assert.equal(materials[MAT.roofGlass].extras?.roofRole,undefined,'glass does not become weathered opaque zinc');
  const stairMaterial=materials.findIndex(m=>m.name==='subdued fire escape iron');
  const roofMaterial=materials.findIndex(m=>m.name==='roof charcoal bronze and iron');
  assert.ok(stairMaterial>=0&&roofMaterial>=0&&stairMaterial!==roofMaterial);
  assert.equal(materials[roofMaterial].extras.fireEscapeRole,'quiet-metal');
});

test('the stored rehearsal furniture fits its own real blocker and avoids the glass and quest route',()=>{
  const mesh=meshes.get('academic_roof_rehearsal_rest');
  const spec=ACADEMIC_ROOF_DRESSING_MESHES[mesh.name];
  const prop=ACADEMIC_ROOF_DRESSING_PROPS.find(p=>p.mesh===mesh.name);
  assert.equal(prop.blocks,true);assert.equal(spec.blocks,true);assert.equal(prop.interactive,false);
  const points=[];
  for(const {kind,args} of mesh.shapes){
    if(kind==='Box'){
      const[c,size,,yaw=0,pitch=0]=args;
      for(const x of[-size[0]/2,size[0]/2])for(const y of[-size[1]/2,size[1]/2])for(const z of[-size[2]/2,size[2]/2]){
        const yy=y*Math.cos(pitch)-z*Math.sin(pitch),zz=y*Math.sin(pitch)+z*Math.cos(pitch);
        points.push([c[0]+x*Math.cos(yaw)-zz*Math.sin(yaw),c[1]+yy,c[2]+x*Math.sin(yaw)+zz*Math.cos(yaw)]);
      }
    }else if(kind==='Beam'){
      // A conservative envelope encloses the square beam at any direction.
      const[a,b,w]=args;
      for(const p of[a,b])for(const dx of[-w/Math.SQRT2,w/Math.SQRT2])
        for(const dy of[-w/Math.SQRT2,w/Math.SQRT2])for(const dz of[-w/Math.SQRT2,w/Math.SQRT2])
          points.push([p[0]+dx,p[1]+dy,p[2]+dz]);
    }else assert.fail(`Unexpected furniture primitive ${kind}`);
  }
  assert.ok(points.length>80);
  for(const[x,y,z]of points){
    assert.ok(Math.abs(x)<=spec.w/2,`furniture x=${x} fits collision width`);
    assert.ok(Math.abs(z)<=spec.d/2,`furniture z=${z} fits collision depth`);
    assert.ok(y>=0&&y<=spec.h,`furniture height=${y} fits its declared height`);
  }
  const occupied={x0:prop.x-spec.w/2-.2,x1:prop.x+spec.w/2+.2,
    y0:prop.y-spec.d/2-.2,y1:prop.y+spec.d/2+.2};
  const glass=ACADEMIC_ROOF.glass;
  assert.ok(occupied.x0>=glass.x1||occupied.y0>=glass.y1||occupied.x1<=glass.x0||occupied.y1<=glass.y0);
  for(const name of['entry','ren','seal','sitWest','sitEast','ladderTop']){
    const p=ACADEMIC_ROOF[name];
    assert.ok(p.x<occupied.x0||p.x>occupied.x1||p.y<occupied.y0||p.y>occupied.y1,`${name} remains clear`);
  }
  assert.ok(296-occupied.y1>2,'more than two metres of continuous south loop remain beyond the furniture');
});

test('roof rain catches are upward-facing and stay off supported glass',()=>{
  const weather=meshes.get('academic_roof_weatherwork');
  const catches=weather.shapes.filter(s=>s.kind==='Quad');
  assert.equal(catches.length,3);
  for(const {args:[a,b,c,d]} of catches){
    const normalY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    assert.ok(normalY>0,'culling must preserve water patches when seen from above');
    assert.ok([a,b,c,d].every(([x,,z])=>x<-6.25||x>4.25||z<-7.75||z>5.75),
      'runoff patches stay on roof zinc outside the lantern curbs');
  }
  for(const{kind,args}of weather.shapes){
    if(kind==='Box')assert.ok(args[0][1]+args[1][1]/2<=.08,'weatherwork remains genuinely flat');
  }
});
