import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestWindowArchitecture,createSourceRestWindowArchitectureComposer,sourceRestWindowProject,
  sourceRestWindowArchitectureSeam,sourceRestWindowOffAxisProjection,SOURCE_REST_WINDOW_ARCHITECTURE_LIMITS as LIMITS} from '../src/render/source-rest-window-architecture.js';
import {sourceRestApertureFrame} from '../src/render/source-rest-aperture-frame.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {validateWindowArchitecturePacket} from '../src/render/window-media-architecture.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';

const notes={duration:716.4,notes:[{id:'actual-detected-note',onset:159.8,duration:.8,midi:67,velocity:.8,confidence:1}]};
const viewport={width:1280,height:720,tanHalfFov:.95};
function actual(index=1,{time=160,degradation=.3,look=null,view=viewport}={}){
  const seat=SOURCE_REST_SEATS[index],state={...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{
    seatId:seat.id,mode:'seated',progress:1,degradation,musicTime:time,musicSignal:.4,musicRevoicing:{electronic:.35},look:look||seat.view}},
    world=sourceContinuationRenderFrame(state,{noteScore:notes,couperinNoteScore:notes,viewportAspect:view.width/view.height,viewportTanHalfFov:view.tanHalfFov});
  return{state,world,frame:sourceRestApertureFrame(world,state,{viewport:view})};
}
const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`),dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),
  sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const layout={mainRect:{x:340,y:100,width:1280,height:720},panes:[
  {surfaceId:'rest:source',rect:{x:52,y:270,width:288,height:192}},
  {surfaceId:'rest:answer',rect:{x:1620,y:170,width:288,height:192}}]};
const foreground=pane=>pane.layers.find(layer=>layer.id==='registered-foreground');

test('the two panes share immutable, whitelisted production topology and exact final case transforms',()=>{
  for(let index=0;index<2;index++){
    const {frame,world}=actual(index),packet=sourceRestWindowArchitecture(frame,{layout});
    assert.ok(validateWindowArchitecturePacket(packet).ok);assert.equal(packet.version,1);assert.equal(packet.sourceSeconds,160);
    assert.equal(packet.panes.length,2);assert.ok(packet.meshes.length<=LIMITS.meshes);assert.ok(packet.diagnostics.triangles<=LIMITS.triangles);
    assert.equal(packet.diagnostics.newWorldGeometry,false);assert.equal(packet.diagnostics.independentClock,false);assert.equal(packet.diagnostics.rasterReadback,false);
    for(const mesh of packet.meshes){assert.ok(Object.isFrozen(mesh)&&Object.isFrozen(mesh.p)&&Object.isFrozen(mesh.i));}
    for(const pane of packet.panes){
      assert.equal(pane.layers.length,2);assert.ok(Object.isFrozen(pane.layers));assert.equal(pane.view.registeredForeground,true);
      assert.equal(pane.layers.reduce((sum,layer)=>sum+layer.instances.length,0),frame.geometry.length*2);
      for(const row of foreground(pane).instances){
        const original=world.props.find(p=>p.id===row.id);assert.ok(original&&!original.portalDestination&&!original.restBody);
        assert.deepEqual(row.matrix,Array.from(original.matrix));assert.ok(Object.isFrozen(row.matrix));
      }
    }
    if(index===1){
      assert.equal(packet.meshes.length,21);assert.equal(packet.diagnostics.triangles,14336);
      assert.equal(foreground(packet.panes[0]).instances.filter(p=>p.role==='strings').length,6);
      assert.equal(foreground(packet.panes[0]).instances.filter(p=>p.role==='lid').length,3);
    }else assert.equal(packet.panes[0].view.upRelation,'incompatible');
    const again=sourceRestWindowArchitecture(frame,{layout});assert.equal(again.meshRevision,packet.meshRevision);
    for(let n=0;n<packet.meshes.length;n++)assert.equal(again.meshes[n],packet.meshes[n],'no repeated geometry copy/hash per pose');
  }
});

test('off-axis panes match the authoritative main NDC at every aspect, including beyond both main edges',()=>{
  for(const aspect of[3/4,16/9,21/9]){
    const {frame}=actual(1,{view:{width:aspect*900,height:900,tanHalfFov:.72}}),packet=sourceRestWindowArchitecture(frame,{layout}),
      {eye,basis}=frame;
    for(const pane of packet.panes){
      const c=pane.camera,rect=layout.panes.find(p=>p.surfaceId===pane.surfaceId).rect;
      assert.ok(pane.surfaceId==='rest:source'?c.crop.x<0:c.crop.x>=1);
      for(const [right,up,depth]of[[-7,-2,8],[3,2,4],[0,0,6]]){
        const point=eye.map((v,k)=>v+basis.right[k]*right+basis.up[k]*up+basis.forward[k]*depth),q=sourceRestWindowProject(point,c),
          mainX=(right/(depth*.72*aspect)+1)/2,mainY=(1-up/(depth*.72))/2;
        near(q.mainX,mainX);near(q.mainY,mainY);
        near(rect.x+q.x*rect.width,layout.mainRect.x+mainX*layout.mainRect.width,'same desktop x');
        near(rect.y+q.y*rect.height,layout.mainRect.y+mainY*layout.mainRect.height,'same desktop y');
        const m=c.matrix,ndcX=(m[0]*right-m[8]*depth)/depth,ndcY=(m[5]*up-m[9]*depth)/depth;
        near((ndcX+1)/2,q.x,'actual GPU projection x');near((1-ndcY)/2,q.y,'actual GPU projection y');
      }
    }
  }
  assert.equal(sourceRestWindowOffAxisProjection({tanHalfFov:0}),null);
});

test('an unobstructed actual architectural string crosses the main/pane seam and remains registered while looking',()=>{
  const {frame}=actual(),seam=sourceRestWindowArchitectureSeam(frame);assert.ok(seam&&seam.occlusionChecked);
  assert.match(seam.meshId,/strings-acoustic/);near(seam.main.x,0);assert.ok(seam.main.y>.2&&seam.main.y<.6);
  const joined={mainRect:layout.mainRect,panes:[
    {surfaceId:'rest:source',rect:{x:layout.mainRect.x-288,y:layout.mainRect.y+seam.main.y*720-96,width:288,height:192}},layout.panes[1]]};
  for(const delta of[0,.22,-.18]){
    const seat=SOURCE_REST_SEATS[1],now=actual(1,{look:{yaw:seat.view.yaw+delta,pitch:seat.view.pitch+.03*delta}}),
      packet=sourceRestWindowArchitecture(now.frame,{layout:joined}),pane=packet.panes[0],q=sourceRestWindowProject(seam.point,pane.camera),r=joined.panes[0].rect;
    assert.ok(foreground(pane).instances.some(p=>p.id===seam.sourceId));
    near(r.x+q.x*r.width,joined.mainRect.x+q.mainX*joined.mainRect.width);
    near(r.y+q.y*r.height,joined.mainRect.y+q.mainY*joined.mainRect.height);
    if(!delta){near(q.x,1);near(q.y,.5);}
  }
});

function segmentHit(a,b,t){
  const ray=sub(b,a),ab=sub(t[1],t[0]),ac=sub(t[2],t[0]),h=cross(ray,ac),det=dot(ab,h);if(Math.abs(det)<1e-10)return false;
  const inv=1/det,s=sub(a,t[0]),u=dot(s,h)*inv;if(u<0||u>1)return false;const q=cross(s,ab),v=dot(ray,q)*inv;if(v<0||u+v>1)return false;
  const along=dot(ac,q)*inv;return along>1e-5&&along<1-1e-5;
}
function worldTriangles(item,mesh){
  const p=[];for(let k=0;k<mesh.p.length;k+=3)p.push(transform(item.matrix,mesh.p.slice(k,k+3)));
  const out=[];for(let k=0;k<mesh.i.length;k+=3)out.push([p[mesh.i[k]],p[mesh.i[k+1]],p[mesh.i[k+2]]]);return out;
}
test('actual case and lining ribs occlude actual string surfaces in the pane, instead of behaving like a film overlay',()=>{
  // This measured overlap frames the two specific case/rib sightlines inside
  // the retained, full-depth seam strip, not outside the rendered crop.
  const overlap={...layout,panes:[{surfaceId:'rest:source',rect:{x:layout.mainRect.x+.112*1280,y:layout.mainRect.y+.05*720,width:288,height:192}},layout.panes[1]]};
  const {frame}=actual(),packet=sourceRestWindowArchitecture(frame,{layout:overlap}),pane=packet.panes[0],rows=foreground(pane).instances,
    meshes=new Map(packet.meshes.map(g=>[g.id,g])),strings=rows.find(g=>/strings-acoustic-low$/.test(g.meshId)),
    stringTriangles=worldTriangles(strings,meshes.get(strings.meshId)),
    caseTriangles=rows.filter(g=>g.role==='case').flatMap(g=>worldTriangles(g,meshes.get(g.meshId))),
    ribTriangles=rows.filter(g=>g.role==='lining').flatMap(g=>worldTriangles(g,meshes.get(g.meshId)));
  let caseOcclusion=false,ribOcclusion=false;
  for(const t of stringTriangles.slice(0,512)){
    const point=[0,1,2].map(k=>t.reduce((sum,p)=>sum+p[k],0)/3);
    const q=sourceRestWindowProject(point,pane.camera),clip=foreground(pane).clip;
    if(!q||q.x<clip.x||q.x>clip.x+clip.width||q.y<0||q.y>1)continue;
    caseOcclusion ||=caseTriangles.some(triangle=>segmentHit(pane.camera.eye,point,triangle));
    ribOcclusion ||=ribTriangles.some(triangle=>segmentHit(pane.camera.eye,point,triangle));
    if(caseOcclusion&&ribOcclusion)break;
  }
  assert.ok(caseOcclusion,'case bearing/cheek is in front of a real string point');assert.ok(ribOcclusion,'real lining/rib is in front of a real string point');
  const clear=sourceRestWindowArchitectureSeam(frame);assert.ok(clear,'not every string is hidden');
  assert.ok(![...caseTriangles,...ribTriangles].some(triangle=>segmentHit(pane.camera.eye,clear.point,triangle)));
});

test('the impossible cut preserves a useful real-view span and marks its hard edge without substituting geometry',()=>{
  const {frame}=actual(),packet=sourceRestWindowArchitecture(frame,{layout}),pane=packet.panes[0],layer=foreground(pane);
  near(layer.clip.x,.86);near(layer.clip.width,.14);assert.equal(layer.clip.edge,'left');
  near(layer.clip.edgeWidth,.018);near(layer.clip.edgeShade,.38);
  assert.ok(layer.clip.width*layout.panes[0].rect.width>=40,'a useful physical span of true view remains beyond the shared edge');
  assert.equal(pane.view.architecturalCut,true);near(pane.view.registeredSpan,.14);near(pane.view.mainSeam,1);
  assert.equal(foreground(packet.panes[1]).clip,undefined,'the clear right-hand view retains all real depth');
  assert.deepEqual(layer.camera.eye,frame.eye);assert.deepEqual(layer.camera.basis,frame.basis);
  assert.deepEqual(layer.instances.map(p=>p.matrix),frame.geometry.map(p=>p.matrix));
  assert.equal(pane.layers[0].camera.crop.x,0);assert.equal(pane.layers[0].camera.crop.width,1);
  const overlapping={...layout,panes:[{surfaceId:'rest:source',rect:{x:layout.mainRect.x-288*.35,y:layout.panes[0].rect.y,width:288,height:192}},layout.panes[1]]},
    measured=sourceRestWindowArchitecture(frame,{layout:overlapping}).panes[0],clip=foreground(measured).clip;
  near(measured.view.mainSeam,.35);near(clip.x,.21);near(clip.width,.42);assert.equal(clip.edge,'both');
  assert.ok(clip.x<measured.view.mainSeam&&clip.x+clip.width>measured.view.mainSeam,
    'native65%-overlap main edge is inside the registered strip, not inside the foreign view');
});

test('last-intact retention freezes only prior canonical matrices while live camera and foreground keep moving',()=>{
  const composer=createSourceRestWindowArchitectureComposer(),first=actual(0,{degradation:.30,time:160}).frame,
    intact=actual(0,{degradation:.40,time:180}).frame,late=actual(0,{degradation:.68,time:450}).frame;
  composer.compose(first,{layout});composer.compose(intact,{layout});const packet=composer.compose(late,{layout});
  assert.ok(packet.diagnostics.retained);assert.equal(packet.sourceSeconds,450);assert.equal(packet.panes[1].view.referenceSeconds,180);
  assert.equal(packet.panes[1].view.kind,'last-intact-chamber');
  for(const row of packet.panes[1].layers[0].instances)assert.deepEqual(row.matrix,intact.geometry.find(g=>g.id===row.id).matrix);
  for(const row of foreground(packet.panes[1]).instances)assert.deepEqual(row.matrix,late.geometry.find(g=>g.id===row.id).matrix);
  assert.deepEqual(packet.panes[1].camera.eye,late.eye);assert.deepEqual(packet.panes[1].camera.basis,late.basis);
  const fromReload=createSourceRestWindowArchitectureComposer().compose(late,{layout});
  assert.equal(fromReload.diagnostics.retained,false);assert.equal(fromReload.panes[1].view.kind,'current-chamber','late reload does not invent an intact historical view');
  composer.reset();assert.deepEqual(composer.snapshot(),{phase:null,retainedSeconds:null,sourceSeconds:null,meshRevision:null});
  const other=composer.compose(actual(1,{time:30}).frame,{layout});assert.equal(other.phase,'catch');assert.equal(other.diagnostics.retained,false);
});

test('moving film remains a source-clock background behind both complete architectural layers',()=>{
  const {frame}=actual(),plain=sourceRestWindowArchitecture(frame,{layout}),
    filmed=sourceRestWindowArchitecture(frame,{layout,filmBySurface:{'rest:answer':{assetId:'clouds',mediaTime:321.5}}});
  assert.ok(validateWindowArchitecturePacket(filmed).ok);assert.equal(filmed.panes[1].background.assetId,'clouds');assert.equal(filmed.panes[1].background.mediaTime,321.5);
  assert.equal(filmed.panes[1].background.layer,'background');assert.equal(filmed.panes[1].background.occluded,true);
  assert.deepEqual(filmed.panes.map(p=>p.layers),plain.panes.map(p=>p.layers));assert.equal(filmed.meshRevision,plain.meshRevision);
  assert.equal(sourceRestWindowArchitecture(frame,{filmBySurface:{'rest:answer':'https://outside.test/new.mp4'}}).panes[1].background,undefined);
});

test('invalid geometry, camera, duplicate identities and terminal presentation cannot cross the upload boundary',()=>{
  const {frame}=actual();
  for(const bad of [null,{...frame,phase:'ellery'},{...frame,degradation:.96},{...frame,eye:[NaN,0,0]},
    {...frame,geometry:[...frame.geometry,frame.geometry[0]]},
    {...frame,geometry:[{...frame.geometry[0],mesh:'whole-world',p:[0,0,0],i:[0,0,0]}]},
    {...frame,geometry:[{...frame.geometry[0],p:[...frame.geometry[0].p]}]},
    {...frame,geometry:Array.from({length:25},(_,n)=>({...frame.geometry[0],id:'invented-'+n}))}])assert.equal(sourceRestWindowArchitecture(bad),null);
});
