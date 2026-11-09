import test from 'node:test';import assert from 'node:assert/strict';
import {compileAtriumAccess} from '../tools/chunk_surfer/audit-atrium-access.mjs';
import * as PROPS from '../src/game/props.js';import * as FP from '../src/world/floorplan.js';
import {packedPropMeshes,placedMesh} from './helpers/packed-prop-mesh.mjs';
import {HALL_STAGE_SERVICE_STAIR as S,hallServiceTreadHeight} from '../src/data/atrium-circulation.js';
import {GARDEN_LAYOUTS} from '../src/game/garden-drift.js';

compileAtriumAccess();const pack=packedPropMeshes();
const draw=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
const placed=(id,extra={})=>{const p=draw.get(id);assert.ok(p,`live instance ${id}`);return placedMesh({...p,...extra},pack.mesh(p.mesh));};

test('the installed WC shell keeps all fittings in one compact room frame',()=>{
  const mesh=pack.mesh('amenity_public_core_shell');
  for(const[x,y,z]of mesh.vertices){
    assert.ok(x>=-3.51&&x<=3.51&&z>=-1.76&&z<=1.76,
      'a switched coordinate frame must not throw a fitted service15m outside the enclosure');
    assert.ok(y>=-.001&&y<=3.501);
  }
  const wc=placed('amenity-public-core-shell').bounds;
  assert.ok(wc.min[0]>=74.99&&wc.max[0]<=78.51&&wc.min[2]>=4.99&&wc.max[2]<=12.01);
});

test('the final packed geometry clears the protected cross aisle, including every garden pose',()=>{
  const aisle={min:[75.05,0,12.05],max:[96.95,1.8,13.95]};
  const disjoint=b=>b.min.some((v,i)=>v>=aisle.max[i]||b.max[i]<=aisle.min[i]);
  for(const id of['amenity-public-core-shell','atrium-public-bench-west','foyer-cart-1',
    'amenity-public-drinking-fountain','occupation-arrival-cloak-rail','box-office-shelf','foh-bin']){
    assert.ok(disjoint(placed(id).bounds),`${id}: visible fabric must clear the body aisle even if it is nonblocking`);
  }
  const base=draw.get('academic-garden-planter-west');
  for(const layout of GARDEN_LAYOUTS){const pose=layout.poses[base.id];
    assert.ok(disjoint(placed(base.id,{x:base.x+pose.dx,z:base.z+pose.dz,yaw:base.yaw+pose.dyaw}).bounds),layout.id);
  }
});

test('the installed service run has a real support plane on every compiled tread',()=>{
  const m=placed(S.id),tops=m.triangles.filter(t=>Math.max(...t.map(p=>p[1]))-Math.min(...t.map(p=>p[1]))<1e-7);
  for(let i=0;i<8;i++){
    const x=100+i*.5+.25,z=10.75,h=hallServiceTreadHeight(i);
    const support=tops.some(t=>Math.abs(t[0][1]-h)<1e-6
      &&x>=Math.min(...t.map(p=>p[0]))-1e-6&&x<=Math.max(...t.map(p=>p[0]))+1e-6
      &&z>=Math.min(...t.map(p=>p[2]))-1e-6&&z<=Math.max(...t.map(p=>p[2]))+1e-6);
    assert.ok(support,`packed step${i} must support the actual body floor`);
    assert.ok(Math.abs(FP.floorAt(200+i,21)-h)<1e-6);
  }
});
