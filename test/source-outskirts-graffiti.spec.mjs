import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { readFile } from 'node:fs/promises';
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

test('built marks are normalled paint strokes fitted to real wall and vehicle enamel', async () => {
  const bytes=await readFile(new URL('../public/assets/source-outskirts-graffiti.glb',import.meta.url));
  const doc=await new NodeIO().readBinary(bytes);
  const root=doc.getRoot(), meshes=root.listMeshes();
  assert.deepEqual(meshes.map(m=>m.getName()).sort(),['source_outskirts_bus_graffiti','source_outskirts_wall_graffiti']);
  for(const mesh of meshes){
    let triangles=0;
    for(const p of mesh.listPrimitives()){
      assert.ok(p.getAttribute('NORMAL'),'the production renderer requires normals');
      assert.equal(p.getMaterial().getAlphaMode(),'OPAQUE');
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
    }
    assert.ok(triangles>20&&triangles<500,'separate thin strokes, with bounded geometry');
  }
});
