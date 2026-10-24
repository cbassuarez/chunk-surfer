import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ACADEMIC_ROOF_PROPS} from '../src/data/academic-roof.js';
import {BASEBOARDS} from '../src/data/generated/prop-geometry.js';
import {CELL,MATERIAL} from '../src/data/floorplan/legend.js';
import {wallFaces} from '../src/world/wall-contact.js';
import {baseboardFaceHasPhysicalHost,baseboardWallRuns,baseboardWallRunsDigest,baseboardPhysicalNormal,physicalWallFaceHasHost} from '../src/world/baseboard-hosting.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const faces=wallFaces(FP),face=(x,y,nx,ny)=>{
  const found=faces.find(c=>c.x===x&&c.y===y&&c.nx===nx&&c.ny===ny);
  assert.ok(found,`logical face ${x},${y} normal${nx},${ny} must exercise the original failure`);return found;
};
const slice=FP.physicalRenderPlanFor(29,551.5);
const cell=(x,z)=>{const i=(z-slice.originY)*slice.w+x-slice.originX;
  return{solid:slice.solid[i],floor:slice.floor[i],ceil:slice.ceil[i]};};

test('the actual academic landing seam is air on both sides and cannot carry a floor strip',()=>{
  const before=cell(129,72),after=cell(129,73);
  assert.equal(before.solid,0);assert.equal(after.solid,0);
  assert.ok(before.floor<10&&before.ceil>10.115);
  // Both cells are inside the main stairwell since stair revision 4: the grid
  // there is air to the roof and the landing is the stair GLB's, so the seam
  // is air on both sides at every height, not a grid floor at 10 m.
  assert.ok(after.floor<10&&after.ceil>10.115);
  // Native33010/c49: run868 produced box85, a6m line at worldz36.5.
  for(let x=300;x<311;x++)assert.equal(baseboardFaceHasPhysicalHost(FP,face(x,128,0,1)),false,
    `landing north edge ${x},128 is an authored-space join, not a wall`);
  assert.equal(baseboardFaceHasPhysicalHost(FP,face(311,128,0,1)),true,'retain the far-right corner where the neighbour is a real vertical host');
});

test('overlapping room and stair-landing sides do not invent skirting, while the true rear wall survives',()=>{
  // Run867's west edge overlaps the open academic loggia. The academic
  // room's own south logical boundary (run1652, packed box206) also lies in
  // the landing's physical air and must not form a second inner rectangle.
  assert.equal(baseboardFaceHasPhysicalHost(FP,face(300,129,1,0)),false);
  assert.equal(baseboardFaceHasPhysicalHost(FP,face(29,557,0,-1)),false);
  // Run912 is not entirely phantom: at physicalz81 the next volume ends at
  //9.75m, so its ceiling step is a real vertical host for the10m landing.
  const rearInside=cell(129,80),rearOutside=cell(129,81);
  assert.equal(rearInside.floor,10);assert.ok(rearInside.ceil>10.115);
  assert.ok(rearOutside.ceil<10);
  assert.equal(baseboardFaceHasPhysicalHost(FP,face(302,135,0,-1)),true);
});

test('filtering splits only unsupported faces and preserves real wall coverage in every render group',()=>{
  const runs=baseboardWallRuns(FP),all=runs.flatMap(run=>run.cells);
  assert.ok(!all.some(c=>c.x===302&&c.y===128&&c.nx===0&&c.ny===1));
  assert.ok(!all.some(c=>c.x===29&&c.y===557&&c.nx===0&&c.ny===-1));
  assert.ok(all.some(c=>c.x===302&&c.y===135&&c.nx===0&&c.ny===-1));
  const groups=new Map();
  for(const run of runs)groups.set(run.renderGroup,(groups.get(run.renderGroup)||0)+run.cells.length);
  for(const group of ['ground','hall','basement','upper','academic','tower','cathedral','academicRoof'])
    assert.ok(groups.get(group)>0,`${group}: retain real wall/step skirting`);
});

test('freshness includes the physical mapping that positions the supported strips',()=>{
  const c=face(302,135,0,-1),runs=[{...c,axis:'x',along:135,from:302,to:303,cells:[c]}];
  const moved={...FP,logicalToPhysical(x,y){const at=FP.logicalToPhysical(x,y);return{...at,x:at.x+2};}};
  assert.notEqual(baseboardWallRunsDigest(runs,FP),baseboardWallRunsDigest(runs,moved));
});

test('a full-width fitting query detects an intermediate recess and a narrow vertical opening',()=>{
  const w=8,h=6,solid=new Uint8Array(w*h),floor=new Float32Array(w*h).fill(10),ceil=new Float32Array(w*h).fill(14),flags=new Uint8Array(w*h);
  for(let x=0;x<w;x++)solid[2*w+x]=1;
  const mock={isSolid:()=>false,logicalToPhysical:(x,y)=>({x,z:y}),
    physicalRenderPlanFor:()=>({w,h,originX:0,originY:0,solid,floor,ceil,flags})};
  const face={x:3,y:3,nx:0,ny:1,floor:10};
  const section={bottom:10.001,height:2,halfWidthCells:1.9};
  assert.equal(physicalWallFaceHasHost(mock,face,section),true);
  solid[2*w+2]=0;
  assert.equal(physicalWallFaceHasHost(mock,face,section),false,'a quarter-span opening must not hide between endpoints and centre');
  solid[2*w+2]=1;solid[2*w+3]=0;floor[2*w+3]=11;ceil[2*w+3]=11.1;
  assert.equal(physicalWallFaceHasHost(mock,face,section),false,'a narrow opening anywhere within the requested height interrupts its backing');
  assert.equal(physicalWallFaceHasHost(mock,face,{bottom:11.11,height:.4}),true,'the solid header above that opening still supports a smaller fixture');
});

test('the preserved mesh-owned roof perimeter has actual packed skirting in its existing masonry curbs',()=>{
  const source=readFileSync(new URL('../tools/chunk_surfer/academic-roof-geometry.mjs',import.meta.url),'utf8');
  const marker=source.indexOf('[[11.5,0,0],[1,0,27]]'),start=source.lastIndexOf('for(const[c,size]of[',marker),end=source.indexOf('// The old terrace',marker);
  assert.ok(start>=0&&end>start);
  const curbs=[];
  new Function('addBox','m','roofBrick','roofStone','roofQuietIron',source.slice(start,end))(
    (_m,center,size,material)=>{if(material==='curb')curbs.push({center,size});},{},'curb','coping','rail');
  assert.equal(curbs.length,5,'retain the existing north bridge opening and the four perimeter sides');
  const roof=ACADEMIC_ROOF_PROPS.find(p=>p.id==='academic-roof-structure'),at=FP.logicalToPhysical(roof.x*2,roof.y*2);
  const boxes=curbs.map(({center,size})=>({min:center.map((v,k)=>v-size[k]/2+[at.x*.5,at.y,at.z*.5][k]),max:center.map((v,k)=>v+size[k]/2+[at.x*.5,at.y,at.z*.5][k])}));
  const packed=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),length=packed.readUInt32LE(12),gltf=JSON.parse(packed.subarray(20,20+length));
  const anchor=BASEBOARDS.academicRoof.anchor,origin=FP.logicalToPhysical(anchor.x,anchor.y),mesh=gltf.meshes.find(m=>m.name===BASEBOARDS.academicRoof.mesh);
  let contacts=0;
  for(const primitive of mesh.primitives){const accessor=gltf.accessors[primitive.attributes.POSITION],view=gltf.bufferViews[accessor.bufferView],offset=length+28+(view.byteOffset||0)+(accessor.byteOffset||0);
    for(let i=0;i<accessor.count;i++){
      const point=[0,1,2].map(k=>packed.readFloatLE(offset+i*(view.byteStride||12)+k*4)+[origin.x*.5,origin.y,origin.z*.5][k]);
      if(boxes.some(box=>point.every((v,k)=>v>=box.min[k]-.001&&v<=box.max[k]+.001)))contacts++;
    }
  }
  assert.ok(contacts>=24,'the exception retains construction with a measured packed-mesh curb contact, not a logical void');
});

test('the real baseboard factory omits the native floor-crossing strips and retains the actual rear-wall strip',()=>{
  const source=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const BASEBOARD ='),end=source.indexOf('// Canonical mineral eyes',start),shapes=new Map();
  const anchors=new Function('FP','conservatory','baseboardWallRuns','baseboardWallRunsDigest','baseboardPhysicalNormal','crypto','MATERIAL','MAT','CELL','mesh','addBox','console',`${source.slice(start,end)};return baseboardAnchors;`)(
    {...FP,compile(){}},conservatory,baseboardWallRuns,baseboardWallRunsDigest,baseboardPhysicalNormal,crypto,MATERIAL,
    new Proxy({},{get:(_,key)=>key}),CELL,name=>{shapes.set(name,[]);return{name};},
    (mesh,center,size)=>shapes.get(mesh.name).push({center,size}),{log(){}},
  );
  const anchor=anchors.academic.anchor,at=FP.logicalToPhysical(anchor.x,anchor.y),translation=[at.x*CELL,at.y,at.z*CELL];
  const boxes=shapes.get(anchors.academic.mesh).map(({center,size})=>({min:center.map((v,k)=>v-size[k]/2+translation[k]),max:center.map((v,k)=>v+size[k]/2+translation[k])}));
  const covers=point=>boxes.some(box=>point.every((v,k)=>v>=box.min[k]-.0001&&v<=box.max[k]+.0001));
  assert.equal(covers([64.75,10.0575,36.5175]),false,'old packed box85 crossed open floor in front of the radiator');
  assert.equal(covers([63.5175,10.0575,38.5]),false,'old packed box84 followed an open landing seam');
  assert.equal(covers([64.75,10.0575,38.9825]),false,'old packed box206 followed the second logical boundary inside the same physical air');
  assert.equal(covers([64.75,10.0575,40.4825]),true,'old packed box99 has an actual wall and must survive');
});
