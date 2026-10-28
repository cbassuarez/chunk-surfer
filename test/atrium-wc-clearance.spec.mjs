import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {BUILDING_AMENITY_PROPS,PUBLIC_SANITARY_CORE,PUBLIC_SANITARY_PARTITIONS} from '../src/data/building-amenities.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {segmentHitsTriangle} from './helpers/packed-prop-mesh.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/atrium-wc-radiator-baseline.json',import.meta.url)));
const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
const between=(a,b)=>builder.slice(builder.indexOf(a),builder.indexOf(b));
const sourceMaterials=new Function(between('const materials = [','const MAT = {')+';return materials;')();
const group=(m,mat)=>{if(!m.groups.has(mat))m.groups.set(mat,{positions:[],normals:[],uvs:[],indices:[]});return m.groups.get(mat);};
const primitives=new Function('group','signAssemblies','BUILDING_WINDOW_HOST_ORIGINS',[
  between('function addBox(','function addPlate('),between('function addBeam(','function addQuad('),
  'return {addBox,addBeam};',
].join('\n'))(group,{isCarrier:()=>false},{});
const start=builder.indexOf("const m=mesh('atrium_public_fittings');"),end=builder.indexOf('\n}\n{',start);
assert.ok(start>0&&end>start,'execute the real atrium factory section');
const current=new Function('mesh','MAT','addBox','addBeam',builder.slice(start,end)+';return m;')(
  name=>({name,groups:new Map()}),{dark:0,wood:1,black:2,steel:3,ivory:4,brass:5,agedWhite:17},primitives.addBox,primitives.addBeam);
function triangles(groups){return groups.flatMap(g=>Array.from({length:g.indices.length/3},(_,i)=>({material:g.material,
  vertices:g.indices.slice(i*3,i*3+3).map(index=>({position:g.positions.slice(index*3,index*3+3).map(Math.fround),normal:g.normals.slice(index*3,index*3+3).map(Math.fround),uv:(g.uvs.length?g.uvs.slice(index*2,index*2+2):[0,0]).map(Math.fround)}))})));}
function digest(tris){const bytes=Buffer.alloc(tris.length*100);let offset=0;for(const t of tris){bytes.writeUInt32LE(t.material,offset);offset+=4;for(const v of t.vertices)for(const n of [...v.position,...v.normal,...v.uv]){bytes.writeFloatLE(n,offset);offset+=4;}}return createHash('sha256').update(bytes).digest('hex');}
const produced=[...current.groups].map(([material,g])=>({material,...g})),oldTriangles=triangles(fixture.groups),nowTriangles=triangles(produced);
const removed=t=>t.vertices.every(v=>v.position.every((n,i)=>n>=fixture.obsoleteRadiatorLocalBounds.min[i]-.000002&&n<=fixture.obsoleteRadiatorLocalBounds.max[i]+.000002));
const obsolete=oldTriangles.filter(removed),retained=oldTriangles.filter(t=>!removed(t));
// Read one complete actual pack. Separate JSON and BIN reads can mix two atomic
// installations while another process completes the authorized asset build.
const bytes=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),len=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const access=i=>{const a=gltf.accessors[i],v=gltf.bufferViews[a.bufferView],width={VEC3:3,VEC2:2,SCALAR:1}[a.type],read={5121:['readUInt8',1],5123:['readUInt16LE',2],5125:['readUInt32LE',4],5126:['readFloatLE',4]}[a.componentType];return Array.from({length:a.count},(_,n)=>Array.from({length:width},(_,axis)=>bin[read[0]]((v.byteOffset||0)+(a.byteOffset||0)+n*(v.byteStride||width*read[1])+axis*read[1]))).flat();};
function packed(name){const m=gltf.meshes.find(m=>m.name===name);assert.ok(m,`missing packed ${name}`);const node=gltf.nodes.find(n=>n.mesh===gltf.meshes.indexOf(m));assert.ok(!node.matrix&&!node.translation&&!node.rotation&&!node.scale,'unhandled packed node transform');return m.primitives.map(p=>({material:p.material,positions:access(p.attributes.POSITION),normals:access(p.attributes.NORMAL),uvs:access(p.attributes.TEXCOORD_0),indices:access(p.indices)}));}
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
PROPS.propsInit(FP);const draws=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
const renderer=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const matrix=new Function(renderer.slice(renderer.indexOf('function identity(){'),renderer.indexOf('function perspective(aspect)'))+';return modelMatrix;')();
const transform=(p,m)=>[0,1,2].map(i=>m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]);
const world=(tris,draw)=>{const m=matrix(draw);return tris.map(t=>t.vertices.map(v=>transform(v.position,m)));};
const bounds=tri=>({min:[0,1,2].map(i=>Math.min(...tri.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...tri.map(p=>p[i])))});
const overlaps=(a,b)=>a.min.every((v,i)=>v<=b.max[i]+1e-7&&a.max[i]>=b.min[i]-1e-7);
function crossings(a,b){let n=0;const bb=b.map(t=>({t,b:bounds(t)}));for(const at of a){const box=bounds(at);for(const bt of bb){if(!overlaps(box,bt.b))continue;let crosses=false;for(const[s,t]of[[at,bt.t],[bt.t,at]])for(let i=0;i<3;i++)if(segmentHitsTriangle(s[i],s[(i+1)%3],t))crosses=true;if(crosses)n++;}}return n;}

test('remove exactly the obsolete southwest radiator; every other actual atrium triangle/material/normal/UV remains exact',()=>{
  assert.equal(obsolete.length,144,'one steel body, nine fins and two brass feet');
  assert.equal(oldTriangles.length,1020);assert.equal(nowTriangles.length,876);
  assert.equal(retained.length,fixture.retainedTriangleCount);
  assert.equal(digest(nowTriangles),fixture.retainedTriangleBytesSha256,'clock, honour boards, hooks and all three retained radiators must be byte-equivalent after Float32 packing, including signed-zero normals');
  assert.ok(!nowTriangles.some(removed),'no orphan radiator fin or mounting foot may remain inside the approved core');
});

test('actual old radiator crosses the real WC bowl; repaired assembly has no WC triangle crossing',()=>{
  const atrium=draws.get('atrium-public-fittings'),wc=draws.get('amenity-standard-wc');
  assert.deepEqual([atrium.x,atrium.y,atrium.z,atrium.yaw],[85.5,0,15,0]);
  const toilet=world(triangles(packed(wc.mesh)),wc),oldHits=crossings(world(obsolete,atrium),toilet),newHits=crossings(world(nowTriangles,atrium),toilet);
  assert.ok(oldHits>0,'negative control: actual original radiator must reproduce the measured bowl crossing');
  assert.equal(newHits,0,'all remaining atrium component triangles must clear the real scaled WC');
});

test('approved core plan, WC pose, working approach and the nonblocking atrium instance remain intact',()=>{
  const authored=BUILDING_AMENITY_PROPS.find(p=>p.id==='amenity-standard-wc');
  assert.deepEqual([authored.x,authored.y,authored.yaw,authored.scale,authored.blocks],[79.1,26.33,Math.PI,.88,true]);
  assert.deepEqual([PUBLIC_SANITARY_CORE.x0,PUBLIC_SANITARY_CORE.x1,PUBLIC_SANITARY_CORE.y0,PUBLIC_SANITARY_CORE.y1],[75,82,23.5,27]);
  assert.equal(PUBLIC_SANITARY_PARTITIONS.length,9);
  const atrium=CONSERVATORY_PROPS.find(p=>p.id==='atrium-public-fittings');assert.deepEqual([atrium.x,atrium.y,atrium.yaw],[85.5,15,0]);
  assert.equal(atrium.interactive,false);assert.equal(PROP_MESH.atrium_public_fittings.blocks,false);
  for(const door of['public-wc-large','public-wc-standard'])assert.equal(FP.doorState().find(d=>d.id===door).open,true);
  // The existing WC route is tested with the real current compiled floor and
  // prop-body query; removing a decorative radiator must require no plan change.
  for(let y=24.9;y<=25.25;y+=.05)for(const[dx,dz]of[[0,0],[-.2,0],[.2,0],[0,-.2],[0,.2]]){
    const rx=(79.25+dx-.25)*2,ry=(y+dz-.25)*2;
    assert.equal(FP.isSolid(rx,ry),false,`WC approach wall at ${dx},${y+dz}`);
    assert.equal(PROPS.propCanOccupy(rx,ry),true,`WC approach prop at ${dx},${y+dz}`);
  }
});

test('installed actual GLB includes the removal rather than retaining source-only completion',()=>{
  // The baseline records source MAT slots. Atlas packing may reorder material
  // ordinals, so recover those slots through the complete source definitions.
  // Keep the historical baseline and every packed geometry byte unchanged.
  const groups=packed('atrium_public_fittings').map(g=>{
    const material=gltf.materials[g.material],matches=sourceMaterials.map((m,i)=>m.name===material.name?i:-1).filter(i=>i>=0);
    assert.equal(matches.length,1,`unrecognized or ambiguous atrium material ${material.name}`);
    assert.deepEqual(material,sourceMaterials[matches[0]],`${material.name} retains its complete authored surface`);
    return {...g,material:matches[0]};
  });
  const actual=triangles(groups);
  assert.equal(actual.length,nowTriangles.length,'rebake required: installed atrium still contains obsolete sanitary-bay radiator geometry');
  assert.equal(digest(actual),digest(nowTriangles),'installed atrium must match every executed production triangle/material/normal/UV');
});
