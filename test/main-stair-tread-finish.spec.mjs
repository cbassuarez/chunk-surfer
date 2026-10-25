import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { MAIN_STAIR_GEOMETRY as S } from '../src/data/main-stair-geometry.js';
import { MAIN_STAIR_TREAD_FINISH as F } from '../src/data/main-stair-tread-finish.js';
import { propMaterialFactors } from '../src/render/prop-material-contract.js';

const bytes=fs.readFileSync(new URL('../public/assets/conservatory-main-stair.glb',import.meta.url));
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/conservatory-main-stair.stats.json',import.meta.url)));
const credits=JSON.parse(fs.readFileSync(new URL('../public/assets/conservatory-main-stair.credits.json',import.meta.url)));
const length=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+length)),bin=28+length;
const read=index=>{
  const a=g.accessors[index],v=g.bufferViews[a.bufferView],width={VEC2:2,VEC3:3,SCALAR:1}[a.type],offset=bin+(v.byteOffset||0)+(a.byteOffset||0);
  const method=a.componentType===5126?'readFloatLE':'readUInt32LE';
  return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>bytes[method](offset+(i*width+k)*4)));
};
const primitives=g.meshes[0].primitives.map(p=>({name:g.materials[p.material].name,
  positions:read(p.attributes.POSITION),normals:read(p.attributes.NORMAL),uvs:read(p.attributes.TEXCOORD_0),indices:read(p.indices).flat()}));
const finish=stats.design.treadFinish;
const near=(points,p)=>points.some(q=>q.every((value,k)=>Math.abs(value-p[k])<.00001));

test('all fifty-eight original tread stations receive real profiles without changing the navigation contract',()=>{
  assert.equal(stats.design.geometryRevision,4);assert.equal(stats.design.finishRevision,4);
  assert.equal(finish.revision,F.revision);assert.equal(finish.treads.length,58);
  assert.equal(finish.walkingSurfaceChanged,false);assert.equal(finish.coplanarRiserOverlays,0);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../src/data/main-stair-geometry.js',import.meta.url))).digest('hex'),
    'e5594ac5681c0b55afa49cf2b7c2f2f74d852b4d3b3e36b1a60370e6ac50d0d3','the shared analytic navigation source is byte-identical');
  let index=0;
  for(const flight of S.flights)for(let step=0;step<flight.rises;step++,index++){
    const t=finish.treads[index],expected=flight.fromH+(flight.toH-flight.fromH)*step/flight.rises;
    assert.equal(t.flight,flight.id);assert.ok(Math.abs(t.topM-expected)<1e-10);
    assert.ok(Math.abs(t.startDeg-(flight.theta0+flight.sweep*step/flight.rises)*180/Math.PI)<1e-9);
    assert.ok(Math.abs(t.endDeg-(flight.theta0+flight.sweep*(step+1)/flight.rises)*180/Math.PI)<1e-9);
    assert.equal(t.profile[0].y,t.topM);assert.equal(t.profile[0].offsetM,0);
    assert.equal(t.profile.at(-1).offsetM,0,'the lower toe joins the original preceding tread');
    assert.ok(t.profile.length>=10,'the riser is no longer one vertical rectangular face');
    assert.ok(t.profile.some(p=>p.offsetM>=.018));
  }
});

test('the packed mesh contains each molded riser section and the bronze edge physically turns down',()=>{
  const ivory=primitives.find(p=>p.name==='molded ivory riser stone').positions;
  const bronze=primitives.find(p=>p.name==='aged brass').positions;
  for(const t of finish.treads)for(const r of[S.innerRadiusM,S.outerRadiusM]){
    for(const p of t.profile){
      const angle=t.startDeg*Math.PI/180+p.offsetM/r,point=[Math.sin(angle)*r,p.y,-Math.cos(angle)*r];
      const points=t.topM-p.y<=F.bronzeTurnDownM+1e-8?bronze:ivory;
      // The top and 8mm turn-down are shared with the neighboring stone band.
      assert.ok(near(points,point)||near(ivory,point),`missing physical profile ${t.flight}@${t.topM}: ${JSON.stringify(point)}`);
    }
  }
  assert.ok(bronze.some((p,i)=>Math.abs(primitives.find(q=>q.name==='aged brass').normals[i][1])<.9),
    'metal is visible on a real downturned edge as well as the flat top inlay');
});

test('closed cheek fascias stay below tread tops and within the existing spare stair envelope',()=>{
  assert.equal(finish.cheeks.length,4,'each run has one continuous inner and outer fascia');
  assert.equal(F.cheek.maximumProjectionM,.039);
  assert.ok(F.cheek.aboveSoffitM+F.cheek.halfHeightM<S.slabDepthM);
  for(const cheek of finish.cheeks){
    assert.equal(cheek.points,121);
    const nearestRadius=cheek.side>0?S.outerRadiusM:S.innerRadiusM;
    assert.ok(Math.abs(cheek.radius-nearestRadius)-F.cheek.radialHalfWidthM<0,'the profile is genuinely bonded into its concrete backing');
    assert.ok(cheek.side>0?cheek.radius+F.cheek.radialHalfWidthM<S.collisionOuterRadiusM:
      cheek.radius-F.cheek.radialHalfWidthM>S.innerRadiusM-.05,'no molding enters the walking ribbon or closes the well');
  }
});

test('stone, concrete, ivory and bronze have embedded mipmapped PBR channels accepted by the real prop loader',async()=>{
  const textured=g.materials.filter(m=>m.pbrMetallicRoughness.baseColorTexture);
  assert.equal(textured.length,4);assert.equal(g.images.length,12);
  assert.ok(g.materials.every(m=>!m.doubleSided||m.name==='opal glass'));
  assert.ok(g.samplers.every(s=>s.minFilter===9987&&s.wrapS===10497&&s.wrapT===10497));
  for(const material of textured){
    assert.equal(material.extras.materialFactors,'gltf');
    assert.doesNotThrow(()=>propMaterialFactors({roughness:material.pbrMetallicRoughness.roughnessFactor,
      metallic:material.pbrMetallicRoughness.metallicFactor,hasOrm:true,semantics:material.extras.materialFactors}));
    assert.ok(material.normalTexture);assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.equal(material.emissiveFactor,undefined,'retained stone and metal have no invented emission');
  }
  for(const image of g.images){
    const v=g.bufferViews[image.bufferView],png=bytes.subarray(bin+v.byteOffset,bin+v.byteOffset+v.byteLength),meta=await sharp(png).metadata();
    assert.equal(image.mimeType,'image/png');assert.ok(meta.width>=64&&meta.width<=256);assert.equal(meta.height,meta.width);
    const row=finish.channels.find(r=>image.name===`main-stair-${({ 'warm terrazzo':'terrazzo','cast concrete':'concrete','aged brass':'brass','molded ivory riser stone':'riser' })[r.material]}-${r.channel}`);
    assert.ok(row);assert.equal(crypto.createHash('sha256').update(png).digest('hex'),row.sha256);
  }
  assert.ok(finish.textureMipBytes<1.65*1024*1024);
  assert.equal(credits.pack.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.ok(bytes.length<1851504);assert.ok(stats.totalTriangles<=50000);
});

test('textured tread and riser surfaces have actual physical UV variation rather than a zero coordinate',()=>{
  for(const p of primitives.filter(p=>['warm terrazzo','cast concrete','aged brass','molded ivory riser stone'].includes(p.name))){
    assert.ok(p.uvs.every(uv=>uv.every(Number.isFinite)));
    const us=p.uvs.map(uv=>uv[0]),vs=p.uvs.map(uv=>uv[1]);
    assert.ok(Math.max(...us)-Math.min(...us)>.5,`${p.name} U has physical scale`);
    assert.ok(Math.max(...vs)-Math.min(...vs)>.5,`${p.name} V has physical scale`);
    let flat=0;
    for(let i=0;i<p.indices.length;i+=3){
      const[a,b,c]=p.indices.slice(i,i+3).map(index=>p.uvs[index]);
      const area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
      if(area<1e-10)flat++;
    }
    assert.ok(flat/p.indices.length*3<.01,`${p.name} does not collapse a texture onto its vertical faces (${flat} triangles)`);
  }
});
