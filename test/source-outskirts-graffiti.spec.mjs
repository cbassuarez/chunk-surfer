import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sourceOutskirtsGraffitiInstances } from '../src/game/source-outskirts-graffiti.js';

test('paint exists only on rendered, appropriate Source wall and bus parents', () => {
  const matrix=Array.from({length:16},(_,i)=>i+.25);
  const source={matrix,zone:9,sourceStructure:'outskirts'};
  const parents=[
    {...source,id:'r7-boundary-west-1',mesh:'outskirts_boundary_wall_6'},
    {...source,id:'r7-boundary-west-2',mesh:'outskirts_boundary_wall_6'},
    {...source,id:'r7-boundary-east-1',mesh:'outskirts_boundary_rail_6'},
    {...source,id:'r0-bus',mesh:'outskirts_bus'},
    {...source,id:'r7-bus',mesh:'outskirts_bus_passage',outskirtsFoldVisibility:.4},
    {...source,id:'missing-bus',matrix:null,mesh:'outskirts_bus'},
    {...source,id:'other-bus',sourceStructure:'other',mesh:'outskirts_bus'},
  ];
  const marks=sourceOutskirtsGraffitiInstances(parents);
  assert.deepEqual(marks.map(p=>p.id),['r7-boundary-west-1:paint','r0-bus:paint','r7-bus:paint']);
  assert.deepEqual(marks.map(p=>p.mesh),['source_outskirts_wall_graffiti','source_outskirts_bus_graffiti','source_outskirts_bus_graffiti']);
  assert.ok(marks.every(p=>p.matrix===matrix&&p.zone===9&&p.noShadow&&!p.structural));
  assert.equal(marks[2].outskirtsFoldVisibility,.4);
  assert.deepEqual(sourceOutskirtsGraffitiInstances([]),[]);
});

test('original CC0 masked art stays fitted to real wall and vehicle enamel', async () => {
  const bytes=await readFile(new URL('../public/assets/source-outskirts-graffiti.glb',import.meta.url));
  const doc=await new NodeIO().readBinary(bytes);
  const root=doc.getRoot(), meshes=root.listMeshes();
  assert.deepEqual(meshes.map(m=>m.getName()).sort(),['source_outskirts_bus_graffiti','source_outskirts_wall_graffiti']);
  const sourceManifest=JSON.parse(await readFile(new URL('../assets/source-graffiti/unikumpu/manifest.json',import.meta.url),'utf8'));
  const credits=JSON.parse(await readFile(new URL('../public/assets/source-outskirts-graffiti.credits.json',import.meta.url),'utf8'));
  assert.equal(credits.creator,'unikumpu');assert.equal(credits.license,'CC0 1.0');
  const digest=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(credits.sha256,digest(bytes));
  assert.deepEqual(new Set(credits.images.map(i=>i.file)),new Set(['Decal_Graffiti_valha.png','Decal_Graffiti_dephy.png','Decal_Graffiti_RANDOM.png']));
  for(const mesh of meshes){
    let triangles=0;
    for(const p of mesh.listPrimitives()){
      assert.ok(p.getAttribute('NORMAL'),'the production renderer requires normals');
      assert.equal(p.getMaterial().getAlphaMode(),'MASK');
      assert.ok(Math.abs(p.getMaterial().getAlphaCutoff()-.15)<1e-6);
      const texture=p.getMaterial().getBaseColorTexture(),entry=sourceManifest.files.find(item=>item.filename===texture.getName());
      assert.ok(entry,`art source ${texture.getName()} is documented`);
      assert.deepEqual(entry.alpha_extrema,[0,255],'art includes transparent ground and fully opaque pigment');
      assert.equal(digest(texture.getImage()),entry.sha256,'embedded PNG is the original art, not a traced imitation');
      assert.ok(p.getAttribute('TEXCOORD_0'));
      const pos=p.getAttribute('POSITION').getArray(), normals=p.getAttribute('NORMAL').getArray(), indices=p.getIndices().getArray();
      triangles+=indices.length/3;
      assert.equal(normals.length,pos.length);
      for(let i=0;i<pos.length;i+=3){
        const x=pos[i],y=pos[i+1],z=pos[i+2];
        assert.ok(Math.abs(Math.abs(x)-(mesh.getName().includes('bus')?1.257:.167))<.003);
        if(mesh.getName().includes('bus')){
          assert.ok(y>.70&&y<1.48&&z>-2.5&&z<2.5,'clear of windows, mouldings, wheels and doors');
        }else assert.ok(y>.30&&y<1.36&&Math.abs(z)<.84,'wall tag remains between piers and stone caps');
        assert.equal(normals[i],Math.sign(x));
      }
      const uv=p.getAttribute('TEXCOORD_0').getArray(),side=Math.sign(pos[0]);
      assert.deepEqual([...uv],[0,0,1,0,1,1,0,1]);
      assert.ok((pos[2]-pos[5])*side>0,'reader-left and right stay correctly oriented on both sides');
      assert.ok(pos[1]>pos[7],'UV top lies above bottom');
    }
    assert.ok(triangles>=2&&triangles<=4,'one masked face per supported flank');
  }
});
