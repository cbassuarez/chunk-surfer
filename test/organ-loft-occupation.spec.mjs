import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {wallContactAt} from '../src/world/wall-contact.js';

// Execute only the real case factory, with geometry collectors. A copied box
// would miss the actual pipes being on the opposite face of the backbox.
const source=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
const factory=source.match(/\{\n  const m=mesh\('tower_organ_case'\);[\s\S]*?\n\}/)?.[0];
assert.ok(factory,'the production organ-case factory must be measured');
const shapes=[];
new Function('mesh','addBox','addCylinder','MAT',factory)(
  name=>({name}),
  (_m,center,size,material)=>shapes.push({kind:'box',center,size,material}),
  (_m,center,radius,height,material)=>shapes.push({kind:'cylinder',center,size:[radius*2,height,radius*2],material}),
  {dark:'backbox',steel:'pipe',wood:'carving'},
);
const corners=(bounds)=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[
  bounds[x<0?'min':'max'][0],bounds[y<0?'min':'max'][1],bounds[z<0?'min':'max'][2],
])));
const shapeBounds=shape=>({min:shape.center.map((v,i)=>v-shape.size[i]/2),max:shape.center.map((v,i)=>v+shape.size[i]/2)});
const measured={min:[0,1,2].map(axis=>Math.min(...shapes.map(s=>shapeBounds(s).min[axis]))),
  max:[0,1,2].map(axis=>Math.max(...shapes.map(s=>shapeBounds(s).max[axis])))};
const authored=CONSERVATORY_PROPS.find(p=>p.id==='tower-organ-case');
const consoleProp=CONSERVATORY_PROPS.find(p=>p.id==='tower-organ-console');
const transform=(point,at)=>{const c=Math.cos(at.yaw),s=Math.sin(at.yaw);return[at.x+point[0]*c-point[2]*s,point[1],at.y+point[0]*s+point[2]*c];};
// Use the renderer's actual instance matrix composer, including per-axis scale,
// rather than allowing a test-only transform to claim a ceiling fit.
const rendererSource=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const matrixFactory=rendererSource.slice(rendererSource.indexOf('function identity(){'),rendererSource.indexOf('function perspective(aspect)'));
assert.ok(matrixFactory.includes('function modelMatrix('));
const modelMatrix=new Function(`${matrixFactory};return modelMatrix;`)();
const matrixPoint=(point,m)=>[0,1,2].map(axis=>m[axis]*point[0]+m[4+axis]*point[1]+m[8+axis]*point[2]+m[12+axis]);
let compiled=false;
const plan=()=>{
  if(!compiled){FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});PROPS.propsInit(FP);compiled=true;}
  return{size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
};

test('actual packed organ pipes face the console instead of exposing the solid backbox',()=>{
  const packed=PROP_BOUNDS[authored.mesh];
  for(const end of['min','max'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(measured[end][axis]-packed[end][axis])<.002,
    'factory and packed case bounds disagree');
  const back=shapes.find(s=>s.material==='backbox'),pipes=shapes.filter(s=>s.material==='pipe');
  assert.equal(pipes.length,27,'the existing pipe rank must be retained');
  assert.ok(pipes.every(pipe=>pipe.center[2]<shapeBounds(back).min[2]),'the real display rank defines the local-Z front');
  const front={x:Math.sin(authored.yaw),y:-Math.cos(authored.yaw)},towardConsole={x:consoleProp.x-authored.x,y:consoleProp.y-authored.y};
  assert.ok(front.x*towardConsole.x+front.y*towardConsole.y>2,'the decorated front must face the playable console side');
  const worldBack=transform(back.center,authored);
  for(const pipe of pipes){
    const worldPipe=transform(pipe.center,authored);
    assert.ok(worldPipe[2]>worldBack[2],'the solid backbox occludes the pipe rank from the console');
  }
});

test('the reversed asymmetric case stays clear of the real physical wall and retains body/console access',()=>{
  const reader=plan(),runtime=PROPS.propById(authored.id),draw=PROPS.renderInstances({inscriptions:false}).find(p=>p.id===authored.id);
  assert.equal(CONSERVATORY_PROPS.filter(p=>p.id==='tower-organ-case').length,1);
  assert.equal(CONSERVATORY_PROPS.filter(p=>p.id==='tower-organ-console').length,1);
  const contact=wallContactAt(reader,runtime.rx+.5,runtime.ry+.5,{prefer:{nx:0,ny:1}});
  assert.ok(contact,'the north wall must remain real construction');
  const cell=FP.logicalToPhysical(contact.cell.x,contact.cell.y),wallZ=(cell.z+contact.planeY-contact.cell.y)/2;
  const renderedCorners=corners(PROP_BOUNDS[authored.mesh]).map(point=>matrixPoint(point,modelMatrix(draw)));
  assert.ok(Math.abs(Math.min(...renderedCorners.map(p=>p[2]))-wallZ-.30)<1e-5,'the asymmetric back penetrates or drifts from its .30m wall clearance');
  const floor=FP.floorAt(runtime.rx,runtime.ry),ceil=FP.ceilAt(runtime.rx,runtime.ry);
  assert.ok(Math.abs(draw.scaleY-.9)<1e-9,'the instance must carry the supported per-axis height fit');
  assert.ok(Math.abs(Math.min(...renderedCorners.map(p=>p[1]))-floor)<1e-5,'the case must stay on its original floor');
  assert.ok(ceil-Math.max(...renderedCorners.map(p=>p[1]))>.05,'the real packed crown must clear the compiled loft ceiling by at least5cm');
  assert.ok(Math.abs(Math.max(...renderedCorners.map(p=>p[0]))-Math.min(...renderedCorners.map(p=>p[0]))-5.8)<1e-5,'height fitting must preserve the case width');
  for(const point of corners(PROP_BOUNDS[authored.mesh]).map(p=>transform(p,authored))){
    assert.ok(!FP.isSolid(Math.floor(point[0]*2),Math.floor(point[2]*2)),'case footprint crosses real loft masonry');
  }
  const spec=PROP_MESH[authored.mesh],bodyBounds={min:[-spec.w/2,0,-spec.d/2],max:[spec.w/2,0,spec.d/2]};
  const extent=yaw=>{const points=corners(bodyBounds).map(p=>transform(p,{...authored,yaw}));return[0,2].flatMap(axis=>[Math.min(...points.map(p=>p[axis])),Math.max(...points.map(p=>p[axis]))]);};
  const before=extent(0),after=extent(authored.yaw);
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(before[i]-after[i])<1e-9,'the facing correction must preserve the body obstacle envelope');
  const route=[{x:100,y:151.5},{x:100,y:155.5},{x:96.5,y:155.5},{x:94,y:156}];
  for(let segment=1;segment<route.length;segment++){
    const a=route[segment-1],b=route[segment],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.15);
    for(let i=0;i<=steps;i++){
      const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps,rx=x*2-.5,ry=y*2-.5;
      assert.ok(!FP.isSolid(rx,ry),'console approach enters masonry');
      assert.ok(Math.abs(FP.floorAt(rx,ry)-8.6)<1e-5,'console approach leaves the actual loft floor');
      assert.ok(PROPS.propCanOccupy(rx,ry),`console approach obstructed at ${x},${y}`);
    }
  }
  assert.equal(PROPS.propCanOccupy(authored.x*2-.5,authored.y*2-.5),false,'the case remains an honest body obstacle');
  assert.equal(PROPS.propCanOccupy(consoleProp.x*2-.5,consoleProp.y*2-.5),false,'the console remains an honest body obstacle');
});
