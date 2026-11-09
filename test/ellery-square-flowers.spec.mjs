import test from 'node:test';
import assert from 'node:assert/strict';
import {ELLERY_SQUARE_PLANTINGS,ELLERY_SQUARE_PROPS,ellerySquareGlyphAt,squareLogicalAt} from '../src/data/ellery-square.js';
import {ELLERY_FLORA_MESHES,FLORA_PARTS} from '../src/data/ellery-flora.js';
import {floraGeometry,FLORA_MESH_NAMES} from '../src/render/flora-models.js';

test('chrysanthemums and daisies are planted in all four lawn quarters, clear of gates and the cross paths',()=>{
  for(const species of['chrysanthemum','daisy']){
    const plants=ELLERY_SQUARE_PLANTINGS.filter(p=>p.species===species);
    assert.ok(plants.length>0);
    const quarters=new Set(plants.map(p=>`${p.x<86?'west':'east'}-${p.z<-36?'north':'south'}`));
    assert.equal(quarters.size,4);
    for(const plant of plants){
      const footprint=ELLERY_FLORA_MESHES[plant.mesh],radius=Math.hypot(footprint.w,footprint.d)/2*plant.scale;
      for(const dx of[-radius,0,radius])for(const dz of[-radius,0,radius])
        assert.equal(ellerySquareGlyphAt(Math.floor(plant.x+dx),Math.floor(plant.z+dz)),'g',`${plant.id} stays off the paved route`);
      const logical=squareLogicalAt(plant.x,plant.z),base=ELLERY_SQUARE_PROPS.find(p=>p.id===plant.id);
      assert.equal(base.x,logical.x);assert.equal(base.y,logical.y);assert.equal(base.blocks,false);
      for(const[k,part]of FLORA_PARTS[plant.mesh].entries()){
        const flower=ELLERY_SQUARE_PROPS.find(p=>p.id===`${plant.id}-flower-${k}`);
        assert.equal(flower.mesh,part.mesh);assert.equal(flower.blocks,false);
        assert.ok(flower.emissive[3]<=.55,'border flowers do not become a second line of lamps');
      }
    }
  }
});

test('new chrysanthemum geometry fits its navigation footprint and is available to the ordinary flora renderer',()=>{
  const geometry=floraGeometry();
  for(const name of['vegetation_chrysanthemum_clump','vegetation_chrysanthemum_clump_flowers']){
    assert.ok(FLORA_MESH_NAMES.includes(name));
    const part=geometry.find(p=>p.name===name),box=ELLERY_FLORA_MESHES[name];assert.ok(part?.i.length>0);
    for(let i=0;i<part.p.length;i+=3){
      const[x,y,z]=part.p.slice(i,i+3);assert.ok([x,y,z].every(Number.isFinite));
      assert.ok(Math.abs(x)<box.w/2&&Math.abs(z)<box.d/2&&y>=0&&y<box.h,`${name} physical bounds`);
    }
  }
  assert.equal(new Set(geometry.map(g=>g.name)).size,geometry.length);
});
