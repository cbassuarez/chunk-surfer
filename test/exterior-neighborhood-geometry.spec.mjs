import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buildExteriorNeighbourhood,NEIGHBOURHOOD_MATERIALS} from '../tools/chunk_surfer/exterior-neighborhood-geometry.mjs';
import {EXTERIOR_NEIGHBOURHOOD as C,EXTERIOR_FRONTAGE_REVISION,EXTERIOR_TRADE_DEEDS,EXTERIOR_FRONTAGE_DRESSING,EXTERIOR_FRONTAGE_INSPECTABLES,exteriorDeedWindowLit} from '../src/data/exterior-frontages.js';
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

test('separate replacement owns reusable row bodies, closed courts and only lightweight row identity meshes',()=>{
  assert.deepEqual(out.meshes.map(m=>m.name),[...C.rows.map(r=>r.mesh),C.court.mesh,...EXTERIOR_FRONTAGE_DRESSING.map(r=>r.mesh)]);
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
    if(!r.windows.length)continue;
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
    const overhead=p.id.includes('awning-')&&bottom>=C.minimumAwningClearance;
    assert.ok(p.center[0]+p.size[0]/2<=(overhead?C.maximumOverheadProjection:C.maximumProjection)+1e-7,`${p.id} narrows the pavement`);
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
  assert.ok(pack.json.images.length%3===0&&pack.json.images.length<=C.maximumPrintPages*3,'bounded shared albedo, normal and ORM atlas pages');
  assert.ok(stats.textureBaseLevelBytes<=C.maximumPrintBaseLevelBytes,'paint textures retain an explicit memory ceiling');
  assert.ok(pack.json.materials.every(m=>!m.alphaMode||m.alphaMode==='OPAQUE'));
  assert.ok(pack.json.materials.filter(m=>m.name.startsWith('physical print:')).every(m=>m.extras.printedSurface.emission==='none'&&m.extras.printedSurface.coverage==='baseColorAlpha'));
});

test('build receipt binds the exact source, font and output bytes',()=>{
  const root=new URL('../',import.meta.url),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(stats.revision,EXTERIOR_FRONTAGE_REVISION);
  assert.equal(stats.sha256,sha(fs.readFileSync(new URL('../public/assets/exterior-frontages.glb',import.meta.url))));
  for(const[file,digest]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL(file,root))),digest,`${file} must be rebuilt`);
  const print=JSON.parse(fs.readFileSync(new URL('../public/assets/exterior-frontage-lettering/atlas-manifest.json',import.meta.url)));
  assert.ok(print.entries.every(e=>['NimbusSans-Bold.otf','NimbusRoman-Bold.otf'].includes(e.metrics.font)&&e.metrics.fontSha256?.length===64));
  assert.ok(print.entries.every(e=>['paper-print','enamel'].includes(e.finish.profile)));
  assert.ok(stats.pending.includes('native final-dither movement inspection'),'source proof never silently signs off perception');
});

test('selected commercial deeds replace ground-floor stock with separate flat/shop doors and particular displays',()=>{
  for(const row of C.rows){
    const r=out.reports.find(r=>r.mesh===row.mesh);
    assert.equal(r.trades.length,EXTERIOR_TRADE_DEEDS[row.kind].length);
    for(const t of r.trades){
      const own=r.parts.filter(p=>p.id.startsWith(`deed-${t.deed}-`));
      for(const id of['shop-stall-riser','shop-fascia','flat-closed-door','shop-closed-door','shop-riser-repaired-board'])assert.ok(own.some(p=>p.id.endsWith(id)),`${row.kind}:${t.deed} has ${id}`);
      assert.ok(r.windows.some(w=>w.id.startsWith(`deed-${t.deed}-`)&&w.width>=4.3&&w.trade===t.display));
      if(!t.closed)assert.ok(own.some(p=>p.id.includes(`shop-stock-${t.display}-`)),`${t.display} has material contents, not a trade name on empty glazing`);
      assert.equal(own.some(p=>/sash-0-/.test(p.id)),false,'old domestic ground-floor sash stock is replaced');
    }
    assert.ok(r.deeds.some(d=>d.kind==='house'||d.kind==='workshop'),'ordinary uses remain beside commerce');
  }
  assert.equal(EXTERIOR_TRADE_DEEDS.terrace.some(s=>s.deed===3),false,'the separately fitted Stationers deed remains untouched');
  assert.equal(EXTERIOR_TRADE_DEEDS.passage.some(s=>s.deed===4),false,'the existing court mouth never becomes a shop');
});

test('awnings are supported overhead and former pavement column feet are removed',()=>{
  const clear=C.minimumAwningClearance;
  for(const r of out.reports.slice(0,3)){
    assert.equal(r.parts.some(p=>p.id.startsWith('street-lamp-post-')),false,'no column foot narrows the clear route');
    const heads=r.parts.filter(p=>p.id.startsWith('street-lamp-head-'));
    assert.equal(heads.length,4);assert.ok(heads.every(p=>p.center[0]===1.10&&p.center[1]===5.80));
    for(const t of r.trades.filter(t=>t.awning==='deployed')){
      const own=r.parts.filter(p=>p.id.startsWith(`deed-${t.deed}-awning-`));
      assert.ok(own.some(p=>p.id.endsWith('fixing-arm--1'))&&own.some(p=>p.id.endsWith('fixing-arm-1')));
      for(const p of own.filter(p=>p.kind==='quad')){const[a,b,c]=p.points,u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),ny=u[2]*v[0]-u[0]*v[2];assert.ok(p.id.endsWith('-top')?ny>0:ny<0,'canvas top and underside face their actual lighting sides');}
      for(const p of own){const points=p.points??(p.kind==='beam'?[p.a,p.b]:[p.center.map((v,k)=>v-p.size[k]/2),p.center.map((v,k)=>v+p.size[k]/2)]);for(const q of points){assert.ok(q[1]>=clear,'no low canvas or bracket crosses the head path');assert.ok(q[0]<=C.maximumOverheadProjection);}}
    }
  }
});

test('placed rows have different named trades on real fascias without duplicating building bodies',()=>{
  const prints=out.reports.slice(4).flatMap(r=>r.prints);
  assert.equal(EXTERIOR_FRONTAGE_DRESSING.length,9);
  assert.equal(new Set(prints.map(p=>p.lines[0])).size,prints.length,'business names belong to distinct placed neighbours');
  assert.ok(out.reports.slice(4).every(r=>r.triangles<=60&&r.windows.length===0&&r.deeds.length===0),'row names do not clone complete buildings');
  for(const row of EXTERIOR_FRONTAGE_DRESSING){
    assert.equal(row.id==='district-south-row-a',false,'the finished pub and six south shops have no replacement signs');
    const r=out.reports.find(r=>r.mesh===row.mesh);
    assert.equal(r.prints.length,row.shops.length+row.workshops.length);
    assert.ok(r.prints.every(p=>p.center[0]>.19||p.id.includes('workshop')),'paint faces sit just ahead of their carriers');
    assert.equal(EXTERIOR_FRONTAGE_INSPECTABLES.filter(i=>i.rowId===row.id).length,row.shops.length);
  }
  assert.ok(EXTERIOR_FRONTAGE_INSPECTABLES.every(i=>i.text.includes(i.trade)&&i.mountNormal&&Number.isFinite(i.physical.x+i.physical.y)));
});

test('shape authoring is deterministic and reuses its material table',()=>{
  assert.deepEqual(build(),out);
  assert.equal(new Set(out.materials.map(m=>m.name)).size,out.materials.length);
});
