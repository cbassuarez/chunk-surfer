import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buildExteriorNeighbourhood,NEIGHBOURHOOD_MATERIALS} from '../tools/chunk_surfer/exterior-neighborhood-geometry.mjs';
import {EXTERIOR_NEIGHBOURHOOD as C,EXTERIOR_FRONTAGE_REVISION,exteriorDeedWindowLit} from '../src/data/exterior-frontages.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

function build(){
  const shapes=[],materials=[],meshes=[],api={materials,mesh:name=>{const m={name};meshes.push(m);return m;}};
  for(const kind of['Box','Beam','Cylinder','Quad'])api['add'+kind]=(m,...args)=>shapes.push({mesh:m.name,kind:kind.toLowerCase(),args});
  const reports=buildExteriorNeighbourhood(api);return{reports,shapes,materials,meshes};
}
const contains=(part,p,epsilon=1e-7)=>part.kind==='box'&&p.every((v,k)=>Math.abs(v-part.center[k])<part.size[k]/2-epsilon);
const out=build();
const pack=parseGlb(fs.readFileSync(new URL('../public/assets/exterior-frontages.glb',import.meta.url)));
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/exterior-frontages.stats.json',import.meta.url)));
const read=(index)=>{const a=pack.json.accessors[index],v=pack.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE'}[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>pack.bin[method](start+i*stride+k*size)));};

test('separate replacement owns exactly the three ordinary row roles and closed courts',()=>{
  assert.deepEqual(out.meshes.map(m=>m.name),[...C.rows.map(r=>r.mesh),C.court.mesh]);
  assert.deepEqual(pack.json.meshes.map(m=>m.name),out.meshes.map(m=>m.name));
  for(const forbidden of['district_civic_frontage','exterior_pub_frontage','exterior_pub_interior','yard_van','opening_street_frontage'])assert.equal(pack.json.meshes.some(m=>m.name===forbidden),false);
  assert.ok(out.reports.slice(0,3).every(r=>r.deeds.length===8));
  assert.ok(out.reports.flatMap(r=>r.deeds).every(d=>d.windows>0),'every existing occupied deed has actual windows');
});

test('masonry has true four-light apertures ahead of the room backing, including court returns',()=>{
  for(const r of out.reports)for(const w of r.windows){
    const right=[-w.normal[2],0,w.normal[0]],own=r.parts.filter(p=>p.id.startsWith(w.id+'-'));
    const back=own.find(p=>p.id===w.id+'-room-back'),jamb=own.find(p=>p.id===w.id+'-jamb-1');
    assert.ok(back&&jamb);
    assert.ok(Math.abs(jamb.center[0]-back.center[0])>.75,'aperture retains real geometry depth');
    for(const yy of[-.20,.20])for(const zz of[-.20,.20]){
      const p=w.center.map((v,k)=>v-w.normal[k]*.12+right[k]*w.width*zz+(k===1?w.height*yy:0));
      assert.equal(r.parts.some(part=>contains(part,p)),false,`${r.mesh}:${w.id} has no front-wall slab across a light`);
    }
    assert.ok(own.some(p=>p.id.endsWith('-sill'))&&own.some(p=>p.id.endsWith('-lintel')));
  }
});

test('occupied rooms have sparse physical lamps and objects behind sashes; no front glow card',()=>{
  for(const r of out.reports){
    assert.ok(r.windows.some(w=>w.lit)&&r.windows.some(w=>!w.lit));
    for(const w of r.windows){
      const own=r.parts.filter(p=>p.id.startsWith(w.id+'-')),emission=own.filter(p=>['litRoom','bulb'].includes(p.material));
      assert.equal(emission.length>0,w.lit);
      if(w.lit){
        assert.ok(own.some(p=>p.id.endsWith('-lamp-shade')));
        assert.ok(own.some(p=>p.id.endsWith('-room-shelf')));
        for(const p of emission){
          const outward=p.center.map((v,k)=>v-w.center[k]).reduce((n,v,k)=>n+v*w.normal[k],0);
          assert.ok(outward<=-.35,'luminous room stock stays behind the physical window reveal');
        }
      }
      const rails=own.filter(p=>/mullion|meeting-rail/.test(p.id));
      assert.ok(rails.every(p=>Math.min(...p.size)>=.055-1e-7),'joinery has area at the final sample scale');
    }
  }
  assert.equal(Object.values(NEIGHBOURHOOD_MATERIALS).some(m=>m.alphaMode==='BLEND'),false);
});

test('early closure is confined to ground commerce while upstairs remains occupied',()=>{
  const terrace=out.reports.find(r=>r.mesh==='district_terrace_frontage'),workshop=out.reports.find(r=>r.mesh==='district_workshop_frontage');
  for(const r of[terrace,workshop])for(const deed of r.deeds.filter(d=>d.closedEarly)){
    assert.ok(r.notices.some(n=>n.deed===deed.deed));
    assert.ok(r.parts.some(p=>p.id.startsWith(`deed-${deed.deed}-`)&&/closed-shutter-leaf|shop-closed-blind/.test(p.id)));
    if(deed.kind==='closed-shop-with-flat'){
      assert.ok(r.windows.some(w=>w.id.startsWith(`deed-${deed.deed}-`)&&w.lit&&w.center[1]>3.5));
      assert.equal(r.windows.find(w=>w.id===`deed-${deed.deed}-closed-shop-display`).lit,false);
    }
  }
  for(const deed of C.earlyClosureDeeds)for(const bay of[0,1])assert.equal(exteriorDeedWindowLit('terrace',deed,0,bay),false);
  assert.ok(terrace.notices.every(n=>n.lines.join(' ').includes('FOR THE VIGIL')));
});

test('original passage mouth and all court centre walks remain genuinely open',()=>{
  const passage=out.reports.find(r=>r.mesh==='district_passage_frontage');
  for(const y of[.5,1.7,3,5.9])for(const x of[-5.0,-2.7,-.1,.2])for(const z of[1.5,4,6.5])assert.equal(passage.parts.some(p=>contains(p,[x,y,z])),false,'no added bridge window or full mass plugs the existing court');
  const court=out.reports.find(r=>r.mesh===C.court.mesh);
  for(const y of[.5,1.7])for(const x of[-3.9,0,3.9])for(const z of[.3,4,8,12,15.4])assert.equal(court.parts.some(p=>contains(p,[x,y,z])),false,'court recesses stay in solid lots behind the original side walls');
  assert.ok(court.parts.some(p=>p.id==='court-end-occupied-end-masonry'));
});

test('new facade stock stays within the old street projection and original row parcel',()=>{
  for(const r of out.reports.slice(0,3))for(const p of r.parts){
    if(p.kind!=='box'||p.id.startsWith('street-'))continue;
    const top=p.center[1]+p.size[1]/2,bottom=p.center[1]-p.size[1]/2;
    assert.ok(p.center[0]+p.size[0]/2<=C.maximumProjection+1e-7,`${p.id} narrows the pavement`);
    assert.ok(p.center[2]-p.size[2]/2>=-32-1e-7&&p.center[2]+p.size[2]/2<=32+1e-7);
    if(bottom<1.7&&top>.45)assert.ok(p.center[0]+p.size[0]/2<=.32+1e-7,'no extra eye/body-height projection beyond the existing envelope');
  }
});

test('actual exported geometry has finite unit normals, nondegenerate triangles and metre UVs',()=>{
  let total=0;
  for(const m of pack.json.meshes)for(const p of m.primitives){
    const positions=read(p.attributes.POSITION),normals=read(p.attributes.NORMAL),uvs=read(p.attributes.TEXCOORD_0),indices=read(p.indices).flat();
    assert.equal(positions.length,normals.length);assert.equal(positions.length,uvs.length);
    assert.ok([...positions.flat(),...uvs.flat()].every(Number.isFinite));
    for(const n of normals)assert.ok(Math.abs(Math.hypot(...n)-1)<2e-6,'normal is normalized');
    for(let i=0;i<indices.length;i+=3){
      const[a,b,c]=indices.slice(i,i+3).map(j=>positions[j]),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);
      assert.ok(area>1e-10,`${m.name}: nonzero triangle area`);
    }
    total+=indices.length/3;
  }
  assert.equal(total,stats.totalTriangles);assert.ok(total<=C.maximumPackTriangles);assert.ok(stats.bytes<=C.maximumPackBytes);
  assert.ok(pack.json.images.length===3,'one shared paper print, normal and ORM atlas');
  assert.ok(pack.json.materials.every(m=>!m.alphaMode||m.alphaMode==='OPAQUE'));
  assert.ok(pack.json.materials.filter(m=>m.name.startsWith('physical print:')).every(m=>m.extras.printedSurface.emission==='none'&&m.extras.printedSurface.coverage==='baseColorAlpha'));
});

test('build receipt binds the exact source, font and output bytes',()=>{
  const root=new URL('../',import.meta.url),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(stats.revision,EXTERIOR_FRONTAGE_REVISION);
  assert.equal(stats.sha256,sha(fs.readFileSync(new URL('../public/assets/exterior-frontages.glb',import.meta.url))));
  for(const[file,digest]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL(file,root))),digest,`${file} must be rebuilt`);
  const print=JSON.parse(fs.readFileSync(new URL('../public/assets/exterior-frontage-lettering/atlas-manifest.json',import.meta.url)));
  assert.ok(print.entries.every(e=>e.metrics.font==='NimbusSans-Bold.otf'&&e.metrics.fontSha256?.length===64));
  assert.ok(print.entries.every(e=>e.finish.profile==='paper-print'));
  assert.ok(stats.pending.includes('native final-dither movement inspection'),'source proof never silently signs off perception');
});

test('shape authoring is deterministic and reuses its material table',()=>{
  assert.deepEqual(build(),out);
  assert.equal(new Set(out.materials.map(m=>m.name)).size,out.materials.length);
});
