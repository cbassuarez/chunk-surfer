import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {INSTITUTION_OCCUPATION_MESHES as meshes,INSTITUTION_OCCUPATION_PROPS as props,FACULTY_OFFICE_WORKSTATIONS} from '../src/data/institution-occupation.js';
import {buildInstitutionOccupation} from '../tools/chunk_surfer/institution-occupation-geometry.mjs';
import {CONSERVATORY_PROPS as existing,PROP_MESH as existingMeshes} from '../src/data/conservatory-props.js';
import {PROP_BOUNDS,MESH_SURFACE} from '../src/data/generated/prop-geometry.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {YARD_SERVICE_RANGES} from '../src/data/exterior-district.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {wallContactAt} from '../src/world/wall-contact.js';
import {propWallPose} from '../src/world/prop-wall-pose.js';

// Imported furniture lives in the acquisition pack, not the procedural pack.
const acquisitionStats=JSON.parse(fs.readFileSync(new URL('../public/assets/conservatory-acquisitions.stats.json',import.meta.url),'utf8'));
const hostBounds=name=>PROP_BOUNDS[name]||acquisitionStats.meshes[name]?.bounds;

const MAT=Object.fromEntries(['dark','wood','black','steel','ivory','brass','cloth','paper','stone','plaster','poolBlue','agedWhite','roofGlass','navy'].map((name,i)=>[name,i]));
const built=new Map();
const add=(m,kind,points,triangles,material)=>{m.parts.push({kind,points,triangles,material});};
const corners=(c,s,yaw=0,pitch=0)=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>{
  const a=x*s[0]/2,b=y*s[1]/2,d=z*s[2]/2,
    ty=b*Math.cos(pitch)-d*Math.sin(pitch),tz=b*Math.sin(pitch)+d*Math.cos(pitch);
  return[c[0]+a*Math.cos(yaw)-tz*Math.sin(yaw),c[1]+ty,c[2]+a*Math.sin(yaw)+tz*Math.cos(yaw)];
})));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
const result=buildInstitutionOccupation({MAT,
  mesh(name){assert.ok(!built.has(name));const m={name,parts:[]};built.set(name,m);return m;},
  addBox(m,c,s,material,yaw=0,pitch=0){add(m,'box',corners(c,s,yaw,pitch),12,material);},
  addBeam(m,a,b,w,material){
    assert.ok(Math.hypot(...sub(b,a))>1e-7,'zero-length beam');
    const u=unit(sub(b,a)),v=unit(cross(u,Math.abs(u[1])<.9?[0,1,0]:[1,0,0])),t=cross(v,u);
    const points=[a,b].flatMap(p=>[-1,1].flatMap(s=>[-1,1].map(q=>p.map((x,i)=>x+v[i]*s*w/2+t[i]*q*w/2))));
    add(m,'beam',points,12,material);
  },
  addCylinder(m,c,r,h,material,sides=12){add(m,'cylinder',corners(c,[r*2,h,r*2]),sides*4,material);},
  addEllipsoid(m,c,r,material,lat=8,lon=12){add(m,'ellipsoid',corners(c,r.map(v=>v*2)),lat*lon*2,material);},
  addQuad(m,a,b,c,d,material){
    assert.ok(Math.hypot(...cross(sub(b,a),sub(c,a)))>1e-9,'degenerate first quad triangle');
    assert.ok(Math.hypot(...cross(sub(c,a),sub(d,a)))>1e-9,'degenerate second quad triangle');
    add(m,'quad',[a,b,c,d],2,material);
  },
});
const measured=Object.fromEntries([...built].map(([name,m])=>{
  const pts=m.parts.flatMap(p=>p.points);return[name,{min:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i])))}];
}));

test('every occupation assembly has bounded real geometry and reuses the shared materials',()=>{
  assert.deepEqual([...built.keys()].sort(),Object.keys(meshes).sort());
  assert.equal(result.newMaterials,0);
  for(const[name,m]of built){
    const b=measured[name],spec=meshes[name];
    assert.ok(m.parts.length>=5,`${name} lacks an assembled construction`);
    // Open pigeonholes and cut rectangular chalk/reeds are rectangular by
    // construction. Handles, vessels, wheels and cases need curved/open form.
    if(['occupation_cleaning_cupboard','occupation_maintenance_shelf','occupation_cloak_rail','occupation_arrival_book','occupation_umbrella_contents','occupation_desk_phone','occupation_key_hooks','occupation_wall_clock','occupation_instrument_dolly','occupation_case_cradle','occupation_water_shelf','occupation_string_tools','occupation_baths_rainwater_completion'].includes(name))assert.ok(m.parts.some(p=>p.kind!=='box'),`${name} has no modelled curved/open detail`);
    assert.ok(m.parts.every(p=>Object.values(MAT).includes(p.material)),`${name} invented material`);
    assert.ok(b.min.concat(b.max).every(Number.isFinite));
    assert.ok(b.min[0]>=-spec.w/2-1e-6&&b.max[0]<=spec.w/2+1e-6,`${name} width ${b.min[0]}..${b.max[0]}`);
    assert.ok(b.min[2]>=-spec.d/2-1e-6&&b.max[2]<=spec.d/2+1e-6,`${name} depth ${b.min[2]}..${b.max[2]}`);
    assert.ok(b.min[1]>=-.01&&b.max[1]<=spec.h+1e-6,`${name} height ${b.min[1]}..${b.max[1]}`);
    assert.ok(m.parts.reduce((n,p)=>n+p.triangles,0)<4500,`${name} geometry budget`);
  }
  for(const name of ['occupation_cleaning_cupboard','occupation_maintenance_shelf','occupation_cloak_rail','occupation_instrument_dolly','occupation_case_cradle'])assert.equal(meshes[name].blocks,true,`${name} must block its honest footprint`);
});

// Compile once. All checks below use the real current plan and its physical
// embedding, rather than a separately drawn surrogate room layout.
let compiled=false;
const specFor=p=>({...existingMeshes[p.mesh],...meshes[p.mesh],...p});
const plan=()=>{
  if(!compiled){FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});compiled=true;}
  return {size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
};
const pose=p=>{
  const rx=Math.round(p.x*2),ry=Math.round(p.y*2),at=FP.logicalToPhysical(rx,ry);
  const contact=p.mount==='wall'?wallContactAt(plan(),rx+.5,ry+.5,{prefer:p.mountNormal}):null;
  const mount=contact?propWallPose(specFor(p),measured[p.mesh]||hostBounds(p.mesh),contact):null;
  return {rx,ry,at,contact,x:mount?.x!==null&&mount?.x!==undefined?at.x/2+(mount.x-rx)/2:at.x/2+(p.renderOffsetX||0),
    z:mount?.y!==null&&mount?.y!==undefined?at.z/2+(mount.y-ry)/2:at.z/2+(p.renderOffsetZ||0),yaw:mount?.yaw??p.yaw};
};

test('occupation anchors survive the actual plan and wall fixtures face their named rooms',()=>{
  plan();
  assert.equal(new Set(props.map(p=>p.id)).size,props.length);
  for(const p of props){
    const integrated=existing.filter(old=>old.id===p.id);
    assert.ok(integrated.length<=1,`${p.id} duplicates a prior object`);
    if(integrated.length)assert.equal(integrated[0],p,`${p.id} must retain one data owner after integration`);
    const a=pose(p);
    assert.ok(!FP.isSolid(a.rx,a.ry),`${p.id} lies in masonry and would silently disappear`);
    assert.ok(!FP.doorAt(a.rx,a.ry),`${p.id} lies on a door threshold`);
    if(p.mount==='wall'){
      assert.ok(a.contact,`${p.id} names no real wall`);
      assert.equal(a.contact.nx,p.mountNormal.nx,`${p.id} wrong wall normal X`);
      assert.equal(a.contact.ny,p.mountNormal.ny,`${p.id} wrong wall normal Z`);
      assert.ok(Math.abs(-Math.sin(a.yaw)-a.contact.nx)<1e-9&&Math.abs(Math.cos(a.yaw)-a.contact.ny)<1e-9,`${p.id} faces out of its room`);
      assert.ok(specFor(p).d<=.18,`${p.id} projects into the route`);
    }
    if(p.mesh==='occupation_service_glands'){
      const range=YARD_SERVICE_RANGES.find(r=>r.id==='yard-baths-plant');
      assert.equal(p.physicalSupport.y,range.physical.y-range.d/2,'attachment names the actual service facade');
      assert.ok(Math.abs(a.x-p.physicalSupport.x)<.001);
      assert.ok(Math.abs(a.z-measured[p.mesh].min[2]-p.physicalSupport.y)<.001,'the rotated back plate meets the real mesh facade');
      assert.ok(Math.abs(a.yaw-Math.PI)<.001,'service hardware faces the yard');
    }
    const spec=specFor(p);
    if(spec.blocks){
      for(const point of corners([p.x,0,p.y],[spec.w*(p.scale||1),.1,spec.d*(p.scale||1)],p.yaw)){
        assert.ok(!FP.isSolid(Math.floor(point[0]*2),Math.floor(point[2]*2)),`${p.id} blocker footprint crosses masonry`);
      }
      assert.ok(['basement','ground','upper'].includes(a.at.renderGroup)||(a.at.renderGroup==='academic'&&p.facultyOffice),`${p.id} unexpected blocking furniture in the academic circulation`);
    }
  }
});

test('open water vessels have outward walls, upward rims and inward visible interiors',()=>{
  const quads=built.get('occupation_water_shelf').parts.filter(p=>p.kind==='quad');
  assert.equal(quads.length,36);
  const normal=q=>cross(sub(q.points[1],q.points[0]),sub(q.points[2],q.points[0]));
  for(let i=0;i<quads.length;i+=3){
    const outer=quads[i],rim=quads[i+1],inner=quads[i+2];
    const radial=q=>[q.points[0][0]-.055,0,q.points[0][2]-.005];
    const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
    assert.ok(dot(normal(outer),radial(outer))>0,'outer shell would be culled from outside');
    assert.ok(normal(rim)[1]>0,'rim would disappear when looking down');
    assert.ok(dot(normal(inner),radial(inner))<0,'interior would disappear through its open top');
  }
});

test('store maintenance fronts face a clear working approach instead of the west masonry without changing obstacle envelopes',()=>{
  plan();PROPS.propsInit(FP);
  for(const id of['occupation-store-cleaning','occupation-store-tools']){
    const p=props.find(p=>p.id===id),a=pose(p),spec=meshes[p.mesh],packed=PROP_BOUNDS[p.mesh];
    assert.ok(packed,`${id} has measured packed geometry`);
    // Both constructions put working shelves/handles at local+Z and the back
    // panel or cross-brace at local-Z. The packed extremes must retain that
    // actual section before testing which physical side can be approached.
    assert.ok(packed.min[2]<-.15&&packed.max[2]>.15,`${id} retains its front/back construction`);
    assert.ok(Math.abs(packed.max[2]-measured[p.mesh].max[2])<.003,`${id} packed working-front extent agrees with its source`);
    const front={x:-Math.sin(a.yaw),z:Math.cos(a.yaw)};
    for(const distance of[.6,1,1.4]){
      const x=a.x+front.x*distance,z=a.z+front.z*distance,rx=x*2-.5,ry=z*2-.5;
      assert.ok(!FP.isSolid(rx,ry),`${id} working approach crosses masonry at ${distance}m`);
      assert.ok(PROPS.propCanOccupy(rx,ry),`${id} working approach is blocked by actual furniture at ${distance}m`);
    }
    assert.ok(FP.isSolid((a.x-front.x)*2-.5,(a.z-front.z)*2-.5),`${id} regression reconstructs the formerly wall-facing approach`);
    const box=yaw=>{
      const points=corners([p.x,0,p.y],[spec.w,.1,spec.d],yaw);
      return {min:[0,2].map(i=>Math.min(...points.map(v=>v[i]))),max:[0,2].map(i=>Math.max(...points.map(v=>v[i])))};
    };
    const current=box(p.yaw),prior=box(p.yaw+Math.PI);
    for(const end of['min','max'])for(let axis=0;axis<2;axis++)assert.ok(Math.abs(current[end][axis]-prior[end][axis])<1e-9,
      `${id} must keep the existing symmetric body envelope and circulation`);
  }
});

test('small teaching and administrative props sit on existing support surfaces',()=>{
  plan();
  const phone=props.find(p=>p.id==='occupation-academic-phone');
  const index=existing.find(p=>p.id==='academic-roof-effects-index');
  assert.ok(index,'the existing quest index is part of the production schedule');
  assert.ok(Math.hypot(phone.x-index.x,phone.y-index.y)>1,'new administration equipment leaves the existing quest index unobscured');
  for(const p of props.filter(p=>p.on||p.supportingProp)){
    const host=existing.find(h=>h.id===(p.on||p.supportingProp));
    assert.ok(host,`${p.id} has no actual host`);
    const top=p.on?MESH_SURFACE[host.mesh]*(host.scale||1)+(host.elevation||0):hostBounds(host.mesh).max[1]*(host.scale||1)+(host.elevation||0);
    assert.ok(Number.isFinite(top));
    if(p.supportingProp)assert.ok(Math.abs(p.elevation-top)<.003,`${p.id} floats over/buries into its host`);
    // The academic drawing is physically translated. Compare both objects in
    // the same rendered frame; a logical host versus a physical child reports
    // a fifty-metre overhang even when their authored positions agree.
    const hostAt=FP.logicalToPhysical(Math.round(host.x*2),Math.round(host.y*2));
    const hostX=hostAt.x/2+(host.renderOffsetX||0),hostZ=hostAt.z/2+(host.renderOffsetZ||0);
    const c=Math.cos(-host.yaw),s=Math.sin(-host.yaw),b=hostBounds(host.mesh);
    const a=pose(p);
    const spec=specFor(p);
    for(const point of corners([0,0,0],[spec.w*(p.scale||1),.01,spec.d*(p.scale||1)],p.yaw)){
      const dx=a.x+point[0]-hostX,dz=a.z+point[2]-hostZ,lx=dx*c-dz*s,lz=dx*s+dz*c;
      assert.ok(lx>=b.min[0]*(host.scale||1)-.01&&lx<=b.max[0]*(host.scale||1)+.01&&lz>=b.min[2]*(host.scale||1)-.01&&lz<=b.max[2]*(host.scale||1)+.01,`${p.id} footprint overhangs ${host.id}`);
    }
  }
  const umbrellas=props.find(p=>p.containingProp),bin=existing.find(p=>p.id===umbrellas.containingProp);
  assert.deepEqual([umbrellas.x,umbrellas.y],[Math.round(bin.x*2)/2,Math.round(bin.y*2)/2]);
});

test('both actual faculty offices have supported work settings and a clear door-to-chair route',()=>{
  plan();PROPS.propsInit(FP);
  const renderedById=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
  for(const office of FACULTY_OFFICE_WORKSTATIONS){
    const setting=props.filter(p=>p.facultyOffice===office.id);
    assert.deepEqual(setting.map(p=>p.facultyWorkRole).sort(),['chair','desk','lamp','papers','phone']);
    assert.ok(setting.every(p=>p.roomId===office.roomId));
    const desk=setting.find(p=>p.facultyWorkRole==='desk'),chair=setting.find(p=>p.facultyWorkRole==='chair');
    const deskInstance=PROPS.propById(desk.id),deskRendered=renderedById.get(desk.id);
    assert.equal(deskInstance.floor,10,`${office.id} desk is outside its real academic room`);
    assert.equal(deskInstance.renderGroup,'academic');
    assert.equal(deskInstance.blocks,true,'the workdesk must have an honest body obstacle');
    assert.equal(PROPS.propById(chair.id).blocks,true,'the chair must retain its occupied footprint');
    const top=MESH_SURFACE[desk.mesh]*desk.scale;
    assert.ok(top>=.70&&top<=.76,'faculty desk has a usable writing height');
    const deskBounds=hostBounds(desk.mesh);
    for(const p of setting.filter(p=>p.on)){
      const runtime=PROPS.propById(p.id),draw=renderedById.get(p.id),b=hostBounds(p.mesh);
      assert.equal(p.on,desk.id);
      assert.ok(Math.abs(runtime.elevation-top)<1e-9,`${p.id} is not supported by the real writing surface`);
      assert.ok(b,`${p.id} needs measured mesh extents`);
      for(const x of[b.min[0],b.max[0]])for(const z of[b.min[2],b.max[2]]){
        const c=Math.cos(draw.yaw),s=Math.sin(draw.yaw),dx=draw.x+x*c-z*s-deskRendered.x,dz=draw.z+x*s+z*c-deskRendered.z;
        assert.ok(dx>=deskBounds.min[0]*desk.scale&&dx<=deskBounds.max[0]*desk.scale&&dz>=deskBounds.min[2]*desk.scale&&dz<=deskBounds.max[2]*desk.scale,`${p.id} overhangs its desktop`);
      }
    }
    assert.equal(chair.yaw,0,'the chair back must face away from the desk');
    assert.ok(chair.y>desk.y,'the seat belongs on the working side');
    FP.setDoorOpen(office.doorId,true);
    const doorX=office.x*2+1;
    for(let ry=537;ry<540;ry++){
      assert.equal(FP.canStep(doorX,ry,doorX,ry+1,{keys:new Set(['academic-core'])}).ok,true,
        `${office.id} faculty doorway must admit an ordinary keyed arrival`);
    }
    // Sample the whole ordinary route, not just an empty destination: from
    // inside the actual office door, round the east desk end, behind the chair.
    const route=[{x:office.x+.5,y:270.5},{x:office.x+1.5,y:271.5},{x:office.x+1.5,y:275},{x:office.x,y:275}];
    for(let segment=1;segment<route.length;segment++){
      const a=route[segment-1],b=route[segment],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.12);
      for(let i=0;i<=steps;i++){
        const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps,rx=x*2-.5,ry=y*2-.5;
        assert.ok(!FP.isSolid(rx,ry),`${office.id} faculty approach enters masonry`);
        assert.equal(FP.floorAt(rx,ry),10,`${office.id} faculty approach leaves its floor`);
        assert.ok(PROPS.propCanOccupy(rx,ry),`${office.id} faculty approach is obstructed at ${x},${y}`);
      }
    }
    assert.equal(PROPS.propCanOccupy(desk.x*2-.5,desk.y*2-.5),false,'the route test must detect a desk placed across it');
  }
});

test('exterior drainage completes the existing baths pipe at its actual eaves',()=>{
  plan();
  const p=props.find(p=>p.mesh==='occupation_baths_rainwater_completion'),a=pose(p),range=YARD_SERVICE_RANGES.find(r=>r.id==='yard-baths-plant');
  assert.ok(Math.abs(a.x-(range.physical.x+range.w/2-.35))<1e-9);
  assert.ok(Math.abs(a.z-(range.physical.y-range.d/2-.17))<1e-9);
  assert.equal(p.physicalSupport.eaves,range.height);
  assert.ok(Math.abs(measured[p.mesh].max[1]-range.height)<.05);
  // No duplicate full-height cylinder: only collars and the short hopper are new.
  assert.ok(built.get(p.mesh).parts.filter(part=>part.kind==='cylinder').every(part=>part.points.every(v=>v[1]>6.9)));
});

test('the reference record separates source observations from Ellery invention',()=>{
  const record=JSON.parse(fs.readFileSync(new URL('../artifacts/building-completion/references.json',import.meta.url),'utf8'));
  assert.ok(record.sources.length>=4&&record.sources.length<=6);
  assert.ok(record.sources.every(s=>s.url.startsWith('https://')&&s.verifiedFacts.length&&s.designInferences.length));
  assert.ok(record.boundaries.length>=3&&record.inventionsAndAssumptions.length>=3);
});
