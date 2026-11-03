import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestPlaceStudy,sourceRestVista,sourceRestRouteComposition,SOURCE_REST_TREATMENTS} from '../src/game/source-rest-place.js';
import {SOURCE_REST_ROUTE_GROUPS} from '../src/data/source-rest-route-composition.js';
import {SOURCE_REST_ALCOVE} from '../src/data/source-rest-alcove.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {sourceContinuationMeshPayload,sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {continuationSupportAt,continuationChartSurfaces,continuationSurfaceContains,continuationSurfaceY} from '../src/data/source-continuation.js';
import {continuationFreeBody} from '../src/game/source-continuation-physics.js';

test('the widened northern turn has body clearance on both sides and full footprint support',()=>{
  const alcove=SOURCE_REST_ALCOVE,s={phase:alcove.phase,chartId:alcove.chartId,feet:alcove.feet};
  assert.ok(Math.abs(alcove.entrance.maxZ-alcove.entrance.minZ-.90)<1e-9);
  assert.equal(alcove.entrance.centreZ,(alcove.entrance.minZ+alcove.entrance.maxZ)/2);
  // A real .22m-radius body plus .10m comfort allowance clears the turn.
  // Requiring support under that complete footprint catches edge overhangs
  // that a centre-point-only route test would miss.
  for(let i=0;i<=30;i++){
    const x=.05+(.83-.05)*i/30,z=alcove.entrance.centreZ;
    assert.equal(continuationSupportAt(x,z,s,{margin:.32})?.id,'wrong-upper-refuge');
    assert.ok(continuationFreeBody({x,z,feet:s.feet},s,{radius:.32}));
  }
});

test('the three stairs and landing details batch real supported tread edges without drawing false routes',()=>{
  const route=sourceRestRouteComposition(),models=sourceRestGeometryLibrary();
  assert.equal(route.parts.length,4,'fifty details use four scene instances');
  assert.equal(SOURCE_REST_ROUTE_GROUPS.reduce((n,g)=>n+g.pieces.length,0),50);
  assert.equal(route.beats.length,6);
  for(const group of SOURCE_REST_ROUTE_GROUPS){
    assert.equal(models[group.mesh].i.length/3,group.pieces.length*12);
    assert.equal(models[group.mesh].emissive,undefined,'the route uses material wear rather than glowing markers');
    for(const p of group.pieces){
      const s={phase:'wrong-return',chartId:0,feet:group.anchor.y+p.y-.006},authored=continuationChartSurfaces(s).find(v=>v.id===p.supportId);
      assert.ok(authored,p.id);
      for(const dx of[-p.sx/2,p.sx/2])for(const dz of[-p.sz/2,p.sz/2]){
        const x=group.anchor.x+p.x+dx,z=group.anchor.z+p.z+dz;
        assert.ok(continuationSurfaceContains(authored,x,z),p.id);
        assert.ok(Math.abs(continuationSurfaceY(authored,x,z)-s.feet)<1e-8,p.id);
        // A landing can overlap the highest tread. Either real descriptor
        // may win support priority, but its elevation must be the same.
        assert.ok(Math.abs(continuationSupportAt(x,z,s)?.y-s.feet)<1e-8,p.id);
      }
    }
  }
  assert.deepEqual(sourceRestRouteComposition({phase:'catch',chartId:0}),{parts:[],beats:[]});
  assert.deepEqual(sourceRestRouteComposition({phase:'wrong-return',chartId:1}),{parts:[],beats:[]});
});

test('fitted joinery preserves the western sky, musical field and water view through the actual opening',()=>{
  const place=sourceRestPlaceStudy(),models=sourceRestGeometryLibrary(),eye=place.views.seated.eye,seat=SOURCE_REST_SEATS[0];
  const hits=(end,min,max)=>{
    let near=0,far=1;
    for(let k=0;k<3;k++){
      const d=end[k]-eye[k];
      if(Math.abs(d)<1e-9){if(eye[k]<min[k]||eye[k]>max[k])return false;continue;}
      let a=(min[k]-eye[k])/d,b=(max[k]-eye[k])/d;if(a>b)[a,b]=[b,a];
      near=Math.max(near,a);far=Math.min(far,b);if(far<near)return false;
    }
    return far>1e-5&&near<1-1e-5;
  };
  const rays=[[-30,seat.feet-4.2,seat.z],[-60,seat.feet+1.23,seat.z],
    ...[-14,0,14].map(z=>[-45,seat.feet+7,seat.z+z]),[-65,seat.feet+18,seat.z]];
  for(const part of place.parts.filter(p=>!p.routeComposition)){
    const mesh=models[part.mesh.replace(/^source-continuation-/, '')],points=[];
    assert.ok(mesh,part.id);
    for(let i=0;i<mesh.p.length;i+=3){
      const x=mesh.p[i]*part.sx,z=mesh.p[i+2]*part.sz,c=Math.cos(part.yaw),s=Math.sin(part.yaw);
      points.push([part.x+x*c+z*s,part.y+mesh.p[i+1]*part.sy,part.z-x*s+z*c]);
    }
    const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
    for(const ray of rays)assert.equal(hits(ray,min,max),false,`${part.id} masks a composed view ray`);
  }
});

test('three spatial treatments have genuinely different mass and the selected loggia fits existing support',()=>{
  const views=SOURCE_REST_TREATMENTS.map(t=>sourceRestPlaceStudy(t.id));
  assert.equal(new Set(views.map(v=>v.parts.length)).size,3);
  assert.ok(views[0].parts.some(p=>p.id.startsWith('ceiling-panel')));
  assert.ok(views[1].parts.some(p=>p.id==='bay-soundboard'));
  assert.ok(views[2].parts.some(p=>p.id==='tidal-cap'));
  const seat=SOURCE_REST_SEATS[0],s={...seat,status:'active'};
  for(const part of views[0].parts.filter(p=>p.id.startsWith('floor-')||p.id.startsWith('loggia-post-'))){
    for(const dx of[-part.sx/2,part.sx/2])for(const dz of[-part.sz/2,part.sz/2])assert.ok(continuationSupportAt(part.x+dx,part.z+dz,s),part.id);
  }
  assert.ok(sourceRestVista(0).every(p=>p.y<seat.feet-1),'the garden remains visibly below the supported route');
});

test('bespoke furniture has bevelled upholstered geometry and clears the supported seated eye',()=>{
  const models=sourceRestGeometryLibrary(),seat=SOURCE_REST_SEATS[0];
  for(const name of ['rest-settle-frame','rest-settle-cloth','rest-settle-piping']){
    const data=sourceContinuationMeshPayload({...models[name],name:'source-continuation-'+name,kind:'detail'});
    assert.ok(data.triangles>40,name);assert.ok(data.positions.every(Number.isFinite));
    assert.ok(data.bounds.max[1]<1.04,`${name}: body and eye do not clip`);
    for(let i=0;i<data.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...data.normals.slice(i,i+3))-1)<1e-5);
  }
  const s={...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{seatId:seat.id,progress:1,look:seat.view}};
  const frame=sourceContinuationRenderFrame(s);
  assert.ok(frame.props.some(p=>p.mesh.endsWith('rest-settle-cloth')));
  assert.ok(frame.props.some(p=>p.restVista));assert.ok(frame.props.filter(p=>p.restTreatment==='loggia').length>30);
  assert.ok(!frame.props.some(p=>p.mesh.endsWith('rest-vista-arch')),'the actual window and real Source architecture replace the floating arches');
  assert.ok(frame.lights.length<=8,'local diffuse lighting respects the native light budget');
  assert.ok(frame.counts.props<=760,'aperture echoes stay within the inclusive native instance budget');
});
