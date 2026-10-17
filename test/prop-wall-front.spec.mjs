import assert from 'node:assert/strict';
import { propWallPose } from '../src/world/prop-wall-pose.js';
import { yawFromNormal } from '../src/world/wall-contact.js';
import { PROP_MESH,CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';

const bounds = { min: [-.4, 0, -.08], max: [.3, 1, .05] };
const vectors = { '+z':[0,1], '-z':[0,-1], '+x':[1,0], '-x':[-1,0] };
for (const [frontAxis,[fx,fz]] of Object.entries(vectors)) {
  for (const [nx,ny] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    const contact = { nx, ny, yaw:yawFromNormal(nx,ny),
      planeX:nx ? 10 : null, planeY:ny ? 12 : null, cell:{x:9,y:11} };
    const prop = { id:'printed-sign',frontAxis,scale:3,scaleX:2,scaleZ:.5 };
    const pose = propWallPose(prop,bounds,contact);
    const c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
    assert.ok(Math.abs(c*fx-s*fz-nx)<1e-9&&Math.abs(s*fx+c*fz-ny)<1e-9,
      `${frontAxis} does not face room normal ${nx},${ny}`);
    const rearLocal = fx ? [fx>0?bounds.min[0]:bounds.max[0],0] : [0,fz>0?bounds.min[2]:bounds.max[2]];
    const rx=c*rearLocal[0]*2*3-s*rearLocal[1]*.5*3;
    const rz=s*rearLocal[0]*2*3+c*rearLocal[1]*.5*3;
    if(nx)assert.ok(Math.abs(pose.x*.5+rx-contact.planeX*.5)<1e-9,'rear X plane floats or is buried');
    if(ny)assert.ok(Math.abs(pose.y*.5+rz-contact.planeY*.5)<1e-9,'rear Z plane floats or is buried');
    assert.deepEqual(propWallPose(prop,bounds,contact),pose,'wall pose is not idempotent');
  }
}
const contact={nx:0,ny:-1,yaw:-Math.PI,planeX:null,planeY:30,cell:{x:124,y:29}};
const oldPose=propWallPose({},bounds,contact);
assert.equal(oldPose.yaw,-Math.PI,'undeclared +Z fixtures must retain their yaw');
assert.equal(oldPose.backExtent,.08,'undeclared +Z fixtures must retain their rear extent');
assert.throws(()=>propWallPose({id:'bad',frontAxis:'sideways'},bounds,contact),/invalid frontAxis/);
for(const mesh of ['scene_dock_sign_services','scene_dock_sign_foh','notice_board','rekey_ledger','hymn_board','academic_blackboard','door_stencil'])assert.equal(PROP_MESH[mesh].frontAxis,'-z',`${mesh} loses its authored front`);
for(const mesh of ['chapel_key_cabinet','tower_plaque','public_exit_sign','atrium_formal_banner'])assert.equal(PROP_MESH[mesh].frontAxis??'+z','+z',`${mesh} is a +Z control`);
for(const[n,x,y]of[[1,43,21],[2,28,21],[3,15,19],[5,12,25]]){
  const mesh=`door_stencil_b${n}`,prop=CONSERVATORY_PROPS.find(p=>p.id===`b${n}-stencil`);
  assert.equal(prop.mesh,mesh,'each existing B-code must select its own exact-copy face');
  assert.equal(PROP_MESH[mesh].frontAxis,'-z');
  assert.deepEqual([prop.x,prop.y,prop.yaw],[x,y,Math.PI/2],'copy correction must retain authored placement');
}
console.log('prop wall front specs passed');
