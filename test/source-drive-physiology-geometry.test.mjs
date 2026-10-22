import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCharacterAsset} from '../src/render/character-asset.js';
import {makeCutLandscape,CUT_THORAX_CHAMBERS} from '../src/game/source-drive/cut/landscape-scene.js';
import {COSTAL_GLAND_ANCHORS,costalPointPose,costalNeckPoint} from '../src/game/source-drive/cut/costal-geometry.js';
import {roadSurfaceAt} from '../src/game/source-drive/road.js';
const bytes=readFileSync(new URL('../public/assets/source-drive/cut/cut-landscape.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)),metrics=JSON.parse(readFileSync(new URL('../artifacts/source-drive-study/physiology/asset-metrics.json',import.meta.url))),names=['tension','shear','breath','recoil'];
const pose=(p,v,w)=>{const q=Array.from(p.positions.slice(v*3,v*3+3));p.targets.forEach((t,k)=>{for(let c=0;c<3;c++)q[c]+=t.positions[v*3+c]*w[k];});return q;};
const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const scene=(time=8,far=930,evolution={reveal:1,ribcage:1,wave:1})=>makeCutLandscape({z:-829,furthest:far,programTime:time},evolution);

test('the actual bone and axial palette carry broad differential breathing and a stronger one-sided wince',()=>{
 for(const name of['cut_thoracic_bone','cut_sternum']){const row=metrics.meshes.find(m=>m.name===name);assert.ok(row.morphMax[0]>.45&&row.morphMax[0]<.65);assert.ok(row.morphMax[1]>.5&&row.morphMax[1]<.7);assert.ok(row.morphMax[3]>.2);}
 const bone=asset.entries.find(e=>e.name==='cut_thoracic_bone');let left=0,right=0,nl=0,nr=0,fixed=0;for(const p of bone.primitives)for(let v=0;v<p.vertexCount;v++){const full=pose(p,v,[0,0,1,0]),d=Array.from(p.targets[1].positions.slice(v*3,v*3+3));if(full[1]>12){if(full[0]<-4){left+=Math.hypot(...d);nl++;}if(full[0]>4){right+=Math.hypot(...d);nr++;}}if(full[1]<1.2){for(const t of p.targets)assert.ok(Math.hypot(...t.positions.slice(v*3,v*3+3))<1e-8);fixed++;}}
 assert.ok(left/nl>(right/nr)*3);assert.ok(fixed>250);
});

test('CPU gland registration is the same structural field as the actual exported bone vertices',()=>{
 const bone=asset.entries.find(e=>e.name==='cut_thoracic_bone'),w={tension:.43,shear:.75,breath:.62,recoil:.32};let checked=0;
 for(const p of bone.primitives)for(let v=0;v<p.vertexCount;v+=3){const full=pose(p,v,[0,0,1,0]),side=Math.sign(p.positions[v*3]),expected=costalPointPose(full,w,side),actual=pose(p,v,names.map(n=>w[n]));assert.ok(Math.hypot(...actual.map((x,k)=>x-expected[k]))<.00001);checked++;}assert.ok(checked>1000);
});

test('local glands and viscous necks have fixed contacts, opaque wet materials and outward volume normals',()=>{
 for(const name of['cut_costal_glands','cut_costal_secretions']){const row=metrics.meshes.find(m=>m.name===name);assert.ok(row.fixedVertices>20);assert.ok(row.triangles>600);}
 const drop=asset.entries.find(e=>e.name==='cut_costal_drop');for(const p of drop.primitives)for(let v=0;v<p.vertexCount;v++){const q=Array.from(p.positions.slice(v*3,v*3+3)),n=Array.from(p.normals.slice(v*3,v*3+3));assert.ok(q.reduce((s,x,k)=>s+x*n[k],0)>0,'pear-drop normals face outward');}
 // Test built cross sections, not authoring radius constants: at an ordinary
 // twenty-metre approach these must span more than twelve horizontal pixels
 // on the native1280-wide/tan-half-FOV.65 projection before final sampling.
 const neck=asset.entries.find(e=>e.name==='cut_costal_secretions');
 for(const y of[-.70,-.82,-.96]){const section=[];for(const p of neck.primitives)for(let i=0;i<p.indices.length;i+=3){const tri=Array.from(p.indices.slice(i,i+3),v=>Array.from(p.positions.slice(v*3,v*3+3)));for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3];if((a[1]-y)*(b[1]-y)>0||Math.abs(a[1]-b[1])<1e-8)continue;const t=(y-a[1])/(b[1]-a[1]);if(t>=0&&t<=1)section.push(a.map((v,c)=>v+(b[c]-v)*t));}}assert.ok(section.length>12);for(const axis of[0,2]){const width=Math.max(...section.map(p=>p[axis]))-Math.min(...section.map(p=>p[axis]));assert.ok(width>.28,'the main neck has physical substance in both projected axes');assert.ok(width/20*1280/(2*.65)>12,'the neck exceeds the intended approach sampling width');}}
 const dropBounds=metrics.meshes.find(m=>m.name==='cut_costal_drop').bounds,extent=dropBounds.max.map((v,k)=>v-dropBounds.min[k]);assert.ok(extent[0]>.58&&extent[1]>1.09&&extent[2]>.48,'heavy globs remain large in the exported asset');
 const len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len));for(const name of['cut landscape gland','cut landscape secretion']){const m=doc.materials.find(m=>m.name===name);assert.equal(m.alphaMode??'OPAQUE','OPAQUE');assert.equal(m.extras.cutTissue,true);assert.equal(m.extras.studyLocalFinish,true);assert.ok(m.pbrMetallicRoughness.roughnessFactor<.7);assert.ok(m.pbrMetallicRoughness.baseColorFactor.every(v=>v>=0&&v<=1));assert.ok(!m.emissiveFactor||m.emissiveFactor.every(v=>v===0));}
});

test('gland and neck instances follow the real attachment and report the exact outlet',()=>{
 const s=scene();assert.ok(s.diagnostics.physiology.glandSites.length>=6);assert.deepEqual(metrics.physiology.glandAnchors,COSTAL_GLAND_ANCHORS);
 for(const site of s.diagnostics.physiology.glandSites){const neck=s.props.find(p=>p.id===site.id+'-neck'),gland=s.props.find(p=>p.id===site.id+'-gland');assert.deepEqual(neck.matrix,gland.matrix);const p=costalNeckPoint(metrics.physiology.neck.outlet,neck.character.morphs),world=transform(neck.matrix,p);assert.ok(Math.hypot(...world.map((x,k)=>x-site.world[k]))<1e-8);const ground=roadSurfaceAt(site.attachment[0]-32,site.attachment[2]-32).height,aboveGround=site.attachment[1]-ground;assert.ok(aboveGround>2&&aboveGround<6.5,'glands sit at low readable attachments');}
});

test('the visible sequence swells, extends, releases and deposits beyond the road while unrevealed biology stays dormant',()=>{
 const phases=new Set();let drops=0,residues=0,attachedDrops=0;
 for(let time=1;time<=30;time+=.25){const s=scene(time);for(const site of s.diagnostics.physiology.glandSites)phases.add(site.phase);for(const p of s.props.filter(p=>p.mesh==='cut_costal_drop')){const r=roadSurfaceAt(p.matrix[12]-32,p.matrix[14]-32);assert.ok(Math.abs(r.offset)>(r.offset<0?r.leftWidth:r.rightWidth)+.5,'released secretion stays beyond the actual pavement');for(const primitive of asset.entries.find(e=>e.name==='cut_costal_drop').primitives)for(let v=0;v<primitive.vertexCount;v++){const world=transform(p.matrix,Array.from(primitive.positions.slice(v*3,v*3+3))),edge=roadSurfaceAt(world[0]-32,world[2]-32);assert.ok(Math.abs(edge.offset)>(edge.offset<0?edge.leftWidth:edge.rightWidth)+.4,'the entire enlarged glob/deposit stays off the pavement');}if(p.id.endsWith('-drop')){drops++;const site=s.diagnostics.physiology.glandSites.find(x=>p.id===x.id+'-drop');if(site.fall===0){const cap=transform(p.matrix,[0,.55,0]);assert.ok(Math.hypot(...cap.map((x,k)=>x-site.world[k]))<1e-8,'the enlarged glob cap meets its actual neck while it grows');attachedDrops++;}}if(p.id.endsWith('-residue'))residues++;}}
 for(const phase of['swell','neck','release','residue'])assert.ok(phases.has(phase),phase);assert.ok(drops>0&&residues>0&&attachedDrops>0);
 const dormant=scene(13,500,{reveal:.2,ribcage:0,wave:.5});assert.equal(dormant.props.some(p=>p.mesh==='cut_costal_drop'),false);for(const site of dormant.diagnostics.physiology.glandSites){assert.equal(site.bead,0);assert.equal(site.extension,0);assert.equal(site.drop,0);assert.equal(site.residue,0);}
});

test('pause/reload and reverse reproduce biology exactly without altering fixed root placements',()=>{
 const a=scene(12),b=scene(12);assert.deepEqual(a,b);const reversed=makeCutLandscape({z:-850,furthest:930,programTime:12},{reveal:1,ribcage:1,wave:1});for(const p of a.props.filter(p=>p.id.endsWith('-gland')||p.id.endsWith('-neck')||p.mesh==='cut_thoracic_bone')){const other=reversed.props.find(x=>x.id===p.id);if(other)assert.deepEqual(other,p);}assert.equal(CUT_THORAX_CHAMBERS.length,6);
});
