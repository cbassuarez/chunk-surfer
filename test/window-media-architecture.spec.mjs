import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOW_ARCHITECTURE_LIMITS as LIMITS,
  validateWindowArchitecturePacket,
  windowArchitectureCatalogue,
  windowArchitectureCameraMatrices,
  createWindowMediaArchitecture,
} from '../src/render/window-media-architecture.js';

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const translated=x=>{const m=identity();m[12]=x;return m;};
const mesh=()=>({id:'rest-note-cube-core',p:[-1,-1,0,1,-1,0,0,1,0],i:[0,1,2],base:[.4,.3,.2,1]});
const camera=()=>({eye:[0,0,5],basis:{right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},
  projection:{tanHalfFov:.6,aspect:1.5,near:.03,far:100},crop:{x:0,y:0,width:1,height:1}});
const instance=(x=0,id='source:core')=>({id,meshId:'rest-note-cube-core',matrix:translated(x),base:[.4,.3,.2,1],role:'core'});
const packet=(patch={})=>({version:1,phase:'wrong-return',meshRevision:'source-society:1',sourceSeconds:160,
  meshes:[mesh()],panes:[{surfaceId:'rest:source',camera:camera(),instances:[instance()]}],...patch});
const pose=(x,sourceSeconds=160)=>packet({sourceSeconds,meshes:undefined,panes:[{surfaceId:'rest:source',camera:camera(),instances:[instance(x)]}]});
const row=pane=>(pane.layers?.[0]?.instances||pane.instances)[0];
const view=pane=>pane.layers?.[0]?.camera||pane.camera;
const near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} should equal ${b}`);
const sameDisplayedPose=(actual,expected)=>{
  near(actual.sourceSeconds,expected.sourceSeconds);row(actual).matrix.forEach((v,k)=>near(v,row(expected).matrix[k]));
  const a=view(actual),b=view(expected);a.eye.forEach((v,k)=>near(v,b.eye[k]));for(const name of['right','up','forward'])a.basis[name].forEach((v,k)=>near(v,b.basis[name][k]));
  for(const key of['projection','crop'])for(const name of Object.keys(b[key]))near(a[key][name],b[key][name]);
};
const rejected=value=>assert.equal(validateWindowArchitecturePacket(value).ok,false);

function fixture(options={}){
  let time=0;const player=createWindowMediaArchitecture({now:()=>time,...options});
  return{player,at:value=>{time=value;}};
}
function fakeGl(){
  let serial=0;const calls=[],created=[],deleted=[];
  const gl={};
  for(const [index,name]of['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','ELEMENT_ARRAY_BUFFER','STATIC_DRAW','FLOAT','TEXTURE3','TEXTURE_2D','DEPTH_TEST','BLEND','CULL_FACE','LEQUAL','DEPTH_BUFFER_BIT','TRIANGLES','UNSIGNED_INT','SCISSOR_TEST','COLOR_BUFFER_BIT'].entries())gl[name]=index+1;
  for(const name of['createShader','createProgram','createVertexArray','createBuffer'])gl[name]=()=>{const value={kind:name,id:++serial};created.push(value);calls.push([name,value]);return value;};
  for(const name of['deleteShader','deleteProgram','deleteVertexArray','deleteBuffer'])gl[name]=value=>{deleted.push(value);calls.push([name,value]);};
  for(const name of['shaderSource','compileShader','attachShader','linkProgram','bindVertexArray','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','useProgram','viewport','activeTexture','bindTexture','uniform1i','uniform2f','uniform1f','enable','disable','depthMask','depthFunc','clearDepth','clear','scissor','uniformMatrix4fv','uniform4fv','drawElements'])gl[name]=(...values)=>calls.push([name,...values]);
  gl.getShaderParameter=gl.getProgramParameter=()=>true;
  gl.getAttribLocation=()=>0;gl.getUniformLocation=(_program,name)=>({name});
  return{gl,calls,created,deleted};
}
const drawOptions={width:240,height:160,dpr:2,desktopOrigin:{x:48,y:24},blueNoiseTexture:{id:'existing-blue-noise'},coherence:0,negative:0};

test('the canonical upload accepts JSON arrays and typed arrays under the same bounded catalogue',()=>{
  const p=packet(),valid=validateWindowArchitecturePacket(p);
  assert.equal(valid.ok,true);assert.deepEqual(valid.catalogue.get('rest-note-cube-core'),{triangles:1,vertices:3});
  const typed=packet({meshes:[{...mesh(),p:new Float32Array(mesh().p),i:new Uint32Array(mesh().i)}]});
  assert.equal(validateWindowArchitecturePacket(typed).ok,true);
  assert.deepEqual(windowArchitectureCatalogue(typed.meshes),valid.catalogue);
  assert.equal(validateWindowArchitecturePacket(pose(1),{catalogue:valid.catalogue}).ok,true);
  assert.equal(validateWindowArchitecturePacket(pose(1)).reason,'unknown-mesh-revision');
});

test('unknown panes, assets, indices and nonfinite geometry cannot allocate a presentation',()=>{
  for(const p of[
    packet({version:2}),packet({phase:'overworld'}),packet({sourceSeconds:-1}),packet({sourceSeconds:Infinity}),
    packet({meshRevision:''}),packet({panes:[]}),packet({meshes:[mesh(),mesh()]}),
    packet({meshes:[{...mesh(),p:[NaN,...mesh().p.slice(1)]}]}),
    packet({meshes:[{...mesh(),i:[0,1,3]}]}),packet({meshes:[{...mesh(),i:[0,.5,2]}]}),
    packet({panes:[{surfaceId:'unknown',camera:camera(),instances:[instance()]}]}),
    packet({panes:[{surfaceId:'rest:source',camera:camera(),instances:[{...instance(),meshId:'not-uploaded'}]}]}),
    packet({panes:[{surfaceId:'rest:source',camera:{...camera(),projection:{...camera().projection,tanHalfFov:0}},instances:[instance()]}]}),
    packet({panes:[{surfaceId:'rest:source',camera:{...camera(),crop:{x:0,y:0,width:0,height:1}},instances:[instance()]}]}),
    packet({panes:[{surfaceId:'rest:source',camera:camera(),instances:[instance()],background:{assetId:'https://outside.test/movie',mediaTime:0}}]}),
    packet({panes:[{surfaceId:'rest:source',camera:camera(),instances:[instance()],background:{assetId:'eye-s5',mediaTime:0}}]}),
  ])rejected(p);
  const f=fixture();assert.equal(f.player.update(packet({sourceSeconds:NaN}),{revision:1}),false);assert.equal(f.player.snapshot().active,false);
});

test('mesh, instance, layer and submitted-triangle budgets apply to the complete pane',()=>{
  rejected(packet({meshes:Array.from({length:LIMITS.meshes+1},(_,n)=>({...mesh(),id:'mesh-'+n}))}));
  rejected(packet({meshes:[{...mesh(),p:new Float32Array((LIMITS.vertices+1)*3)}]}));
  rejected(packet({meshes:[{...mesh(),i:new Uint32Array((LIMITS.triangles+1)*3)}]}));
  rejected(packet({panes:[{surfaceId:'rest:source',camera:camera(),instances:Array.from({length:LIMITS.instancesPerPane+1},(_,n)=>instance(0,'instance:'+n))}]}));
  rejected(packet({panes:[{surfaceId:'rest:source',layers:Array.from({length:LIMITS.layers+1},(_,n)=>({id:'layer:'+n,camera:camera(),instances:[]}))}]}));
  const dense={...mesh(),i:Array.from({length:LIMITS.triangles},()=>[0,1,2]).flat()};
  rejected(packet({meshes:[dense],panes:[{surfaceId:'rest:source',camera:camera(),instances:[instance(0,'a'),instance(0,'b'),instance(0,'c')]}]}));
  const duplicate=packet();duplicate.panes.push({...duplicate.panes[0]});rejected(duplicate);
});

test('explicit layers have distinct stable identities so each camera blends from its own previous view',()=>{
  const layer=id=>({id,camera:camera(),instances:[]});
  for(const layers of[[{camera:camera(),instances:[]}],[layer('same'),layer('same')],[layer('invalid layer name')]])
    rejected(packet({panes:[{surfaceId:'rest:source',layers}]}));
  assert.equal(validateWindowArchitecturePacket(packet({panes:[{surfaceId:'rest:source',layers:[layer('room'),layer('foreground')]}]})).ok,true);
  assert.equal(validateWindowArchitecturePacket(packet()).ok,true,'the existing inline camera/instances form needs no explicit layer ID');
});

test('layer clips admit only finite positive viewport rectangles and bounded material edge parameters',()=>{
  const withClip=clip=>packet({panes:[{surfaceId:'rest:source',layers:[{id:'foreground',camera:camera(),instances:[instance()],clip}]}]});
  const clip={x:.125,y:.25,width:.5,height:.375,edge:'right',edgeWidth:.025,edgeShade:.4};
  assert.equal(validateWindowArchitecturePacket(withClip(clip)).ok,true);
  assert.equal(validateWindowArchitecturePacket(withClip({x:0,y:0,width:1,height:1,edge:'left',edgeWidth:0,edgeShade:0})).ok,true);
  assert.equal(validateWindowArchitecturePacket(withClip({x:0,y:0,width:1,height:1,edge:'right',edgeWidth:.05,edgeShade:1})).ok,true);
  for(const patch of[
    {x:-.001},{y:-.001},{x:.75,width:.5},{y:.75,height:.5},{width:0},{height:-1},
    {x:NaN},{width:Infinity},{edge:'top'},{edgeWidth:-.001},{edgeWidth:.051},{edgeWidth:NaN},
    {edgeShade:-.001},{edgeShade:1.001},{edgeShade:Infinity},
  ])rejected(withClip({...clip,...patch}));
});

test('pose revisions cannot replay stale state or name a catalogue that has not been uploaded',()=>{
  const f=fixture();assert.equal(f.player.update(packet(),{revision:1}),true);
  f.at(100);assert.equal(f.player.update(pose(4),{revision:2}),true);
  assert.equal(f.player.update(pose(99),{revision:2}),false);
  assert.equal(f.player.update({...pose(99),meshRevision:'unknown:2'},{revision:3}),false);
  f.at(200);near(row(f.player.sample()).matrix[12],4);assert.equal(f.player.snapshot().revision,2);
  assert.equal(f.player.update(packet({meshRevision:'source-society:2'}),{revision:3}),true);assert.equal(f.player.snapshot().meshRevision,'source-society:2');
});

test('resending a catalogue under the same mesh revision cannot validate poses against different resident geometry',()=>{
  const f=fixture();assert.equal(f.player.update(packet(),{revision:1}),true);
  const replacement=packet({meshes:[{...mesh(),id:'unresident'}],panes:[{surfaceId:'rest:source',camera:camera(),instances:[{...instance(),meshId:'unresident'}]}]});
  assert.equal(f.player.update(replacement,{revision:2}),false);assert.equal(f.player.snapshot().revision,1);
  const dense={...mesh(),i:Array.from({length:LIMITS.triangles},()=>[0,1,2]).flat()},g=fixture();assert.equal(g.player.update(packet({meshes:[dense]}),{revision:1}),true);
  const understated=packet({panes:[{surfaceId:'rest:source',camera:camera(),instances:[instance(0,'a'),instance(0,'b'),instance(0,'c')]}]});
  assert.equal(g.player.update(understated,{revision:2}),false,'a smaller resend must not understate the resident draw-triangle budget');assert.equal(g.player.snapshot().revision,1);
});

test('a controller cannot accept a packet intended only for the other pane',()=>{
  const f=fixture({surfaceId:'rest:answer'});assert.equal(f.player.update(packet(),{revision:1}),false);assert.equal(f.player.sample(),null);
  const p=packet();p.panes=[{...p.panes[0],surfaceId:'rest:answer'}];assert.equal(f.player.update(p,{revision:1}),true);
});

test('interpolation reaches the newest supplied pose and never extrapolates a missing future performance',()=>{
  const f=fixture();assert.equal(f.player.update(packet(),{revision:1}),true);
  f.at(100);f.player.update(pose(10,162),{revision:2});
  f.at(100+LIMITS.interpolationMs/2);near(row(f.player.sample()).matrix[12],5);near(f.player.sample().sourceSeconds,161);
  f.at(100+LIMITS.interpolationMs);near(row(f.player.sample()).matrix[12],10);near(f.player.sample().sourceSeconds,162);
  f.at(50000);near(row(f.player.sample()).matrix[12],10);near(f.player.sample().sourceSeconds,162);
});

test('identical cameras preserve their handedness and orientation throughout a pose blend',()=>{
  const f=fixture();f.player.update(packet(),{revision:1});f.at(100);f.player.update(pose(10),{revision:2});f.at(100+LIMITS.interpolationMs/2);
  const c=view(f.player.sample());for(const name of['right','up','forward'])c.basis[name].forEach((v,k)=>near(v,camera().basis[name][k]));
  assert.ok(c.basis.right[0]>0,'a translation must not mirror the unchanged view');
});

test('opposed valid camera views retain a finite orthonormal basis at the transition midpoint',()=>{
  const f=fixture();f.player.update(packet(),{revision:1});f.at(100);const p=pose(0);
  p.panes[0].camera.basis={right:[-1,0,0],up:[0,1,0],forward:[0,0,1]};f.player.update(p,{revision:2});f.at(100+LIMITS.interpolationMs/2);
  const basis=view(f.player.sample()).basis,axes=[basis.right,basis.up,basis.forward],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
  for(const axis of axes){assert.ok(axis.every(Number.isFinite));near(Math.hypot(...axis),1);}
  for(const [a,b]of[[0,1],[0,2],[1,2]])near(dot(axes[a],axes[b]),0);
});

test('rotation interpolation preserves a rigid object instead of shrinking a blended matrix',()=>{
  const f=fixture(),turn=identity();turn[0]=0;turn[2]=-1;turn[8]=1;turn[10]=0;
  f.player.update(packet(),{revision:1});f.at(100);const p=pose(0);p.panes[0].instances[0].matrix=turn;f.player.update(p,{revision:2});f.at(100+LIMITS.interpolationMs/2);
  const m=row(f.player.sample()).matrix;near(Math.hypot(m[0],m[1],m[2]),1);near(Math.hypot(m[4],m[5],m[6]),1);near(Math.hypot(m[8],m[9],m[10]),1);near(Math.abs(m[0]),Math.SQRT1_2);
});

test('holding a midpoint preserves the displayed pose and source clock across a long pause',()=>{
  const f=fixture();f.player.update(packet(),{revision:1});f.at(100);f.player.update(pose(10,162),{revision:2});f.at(100+LIMITS.interpolationMs/2);
  const shown=f.player.sample();f.player.hold(true);f.at(90000);assert.deepEqual(f.player.sample(),shown);
  assert.equal(f.player.update(pose(30,170),{revision:3}),false);f.player.hold(false);assert.deepEqual(f.player.sample(),shown);
  f.at(90010);assert.deepEqual(f.player.sample(),shown,'resume cannot complete the discarded pause interval');
  assert.equal(f.player.update(pose(20,164),{revision:3}),true);near(row(f.player.sample()).matrix[12],5);
});

test('reduced motion keeps the first accepted pose fixed without consuming later movement',()=>{
  const f=fixture({reducedMotion:true});assert.equal(f.player.update(packet(),{revision:1}),true);const first=f.player.sample();f.at(500);
  assert.equal(f.player.update(pose(20,200),{revision:2}),false);sameDisplayedPose(f.player.sample(),first);f.player.hold(true);f.at(100000);f.player.hold(false);sameDisplayedPose(f.player.sample(),first);
});

test('projection cropping selects the same camera image rather than silently changing the viewpoint',()=>{
  const project=(c,p)=>{const {view,projection}=windowArchitectureCameraMatrices(c),apply=(m,q)=>[0,1,2,3].map(k=>m[k]*q[0]+m[k+4]*q[1]+m[k+8]*q[2]+m[k+12]*q[3]),clip=apply(projection,apply(view,[...p,1]));return clip.map(v=>v/clip[3]);};
  near(project(camera(),[0,0,0])[0],0);
  const left={...camera(),crop:{x:0,y:0,width:.5,height:1}};near(project(left,[0,0,0])[0],1);
  assert.ok(project(camera(),[1,0,0])[0]>0);assert.ok(project(left,[1,0,0])[0]>1);
});

test('many pose packets and draws reuse one immutable GPU upload until a new mesh revision',()=>{
  const gpu=fakeGl(),f=fixture({gl:gpu.gl});assert.equal(f.player.update(packet(),{revision:1}),true);assert.equal(f.player.draw(drawOptions),true);
  const uploads=gpu.calls.filter(v=>v[0]==='bufferData').length;assert.ok(uploads>0);assert.equal(f.player.snapshot().uploads,1);
  for(let revision=2;revision<=30;revision++){f.at(revision*50);assert.equal(f.player.update(pose(revision),{revision}),true);assert.equal(f.player.draw(drawOptions),true);}
  assert.equal(gpu.calls.filter(v=>v[0]==='bufferData').length,uploads);assert.equal(f.player.snapshot().uploads,1);
  assert.equal(f.player.update(packet({meshRevision:'source-society:2'}),{revision:31}),true);assert.ok(gpu.calls.filter(v=>v[0]==='bufferData').length>uploads);assert.equal(f.player.snapshot().uploads,2);
});

test('foreground geometry draws with its own depth buffer and two explicit camera layers',()=>{
  const gpu=fakeGl(),f=fixture({gl:gpu.gl}),p=packet();p.panes[0]={surfaceId:'rest:source',layers:[{id:'room',camera:camera(),instances:[instance(0,'room:core')]},{id:'foreground',camera:camera(),instances:[instance(0,'foreground:core')]}]};
  assert.equal(f.player.update(p,{revision:1}),true);assert.equal(f.player.draw(drawOptions),true);
  assert.equal(gpu.calls.filter(v=>v[0]==='drawElements').length,2);assert.equal(gpu.calls.filter(v=>v[0]==='clear'&&v[1]===gpu.gl.DEPTH_BUFFER_BIT).length,2);
  const first=gpu.calls.findIndex(v=>v[0]==='drawElements');assert.ok(gpu.calls.slice(0,first).some(v=>v[0]==='enable'&&v[1]===gpu.gl.DEPTH_TEST));
  assert.ok(gpu.calls.slice(first).some(v=>v[0]==='disable'&&v[1]===gpu.gl.DEPTH_TEST),'the overlay leaves media depth testing disabled');
});

test('hard clipping converts top-origin logical fractions to the actual bottom-origin framebuffer and resets every pass',()=>{
  const gpu=fakeGl(),f=fixture({gl:gpu.gl}),p=packet(),clip={x:.125,y:.25,width:.5,height:.375,edge:'right',edgeWidth:.025,edgeShade:.4};
  p.panes[0]={surfaceId:'rest:source',layers:[
    {id:'clipped',camera:camera(),instances:[instance(0,'clipped:core')],clip},
    {id:'unclipped',camera:camera(),instances:[instance(0,'unclipped:core')]},
  ]};
  assert.equal(f.player.update(p,{revision:1}),true);assert.equal(f.player.draw({...drawOptions,width:480,height:320,dpr:2}),true);
  assert.deepEqual(gpu.calls.filter(v=>v[0]==='scissor').map(v=>v.slice(1)),[[60,120,240,120]],'framebuffer dimensions already include DPR; clipping must not scale them again');
  let scissored=false,depthClears=0;
  for(const call of gpu.calls){
    if(call[0]==='enable'&&call[1]===gpu.gl.SCISSOR_TEST)scissored=true;
    if(call[0]==='disable'&&call[1]===gpu.gl.SCISSOR_TEST)scissored=false;
    if(call[0]==='clear'&&call[1]===gpu.gl.DEPTH_BUFFER_BIT){depthClears++;assert.equal(scissored,false,'every layer clears its complete depth buffer before applying a clip');}
  }
  assert.equal(depthClears,2);assert.equal(scissored,false,'the media/background pass must not inherit a scissor');
  const edgeWidths=gpu.calls.filter(v=>v[0]==='uniform2f'&&v[1]?.name==='clipEdge').map(v=>v.slice(2));
  assert.equal(edgeWidths[0][0],.025);assert.equal(edgeWidths[1][0],0,'an unclipped layer disables the previous edge band');
});

test('edge shading belongs to submitted geometry without adding a painted strip or touching media colour',()=>{
  const gpu=fakeGl(),f=fixture({gl:gpu.gl}),p=packet(),clip={x:.125,y:.25,width:.5,height:.375,edge:'right',edgeWidth:.025,edgeShade:.4};
  p.panes[0]={surfaceId:'rest:source',layers:[{id:'foreground',camera:camera(),instances:[instance()],clip}]};
  assert.equal(f.player.update(p,{revision:1}),true);const uploads=gpu.calls.filter(v=>v[0]==='bufferData').length;
  assert.equal(f.player.draw(drawOptions),true);
  assert.deepEqual(gpu.calls.filter(v=>v[0]==='uniform4fv'&&v[1]?.name==='layerClip').at(-1).slice(2),[[.125,.25,.5,.375]]);
  assert.deepEqual(gpu.calls.filter(v=>v[0]==='uniform2f'&&v[1]?.name==='clipEdge').at(-1).slice(2),[.025,.4]);
  assert.equal(gpu.calls.filter(v=>v[0]==='uniform1f'&&v[1]?.name==='clipRight').at(-1)[2],1);
  assert.equal(gpu.calls.filter(v=>v[0]==='drawElements').length,1,'one uploaded object produces one geometry draw');
  assert.equal(gpu.calls.filter(v=>v[0]==='bufferData').length,uploads,'edge treatment creates no extra strip mesh');
  assert.equal(gpu.calls.some(v=>v[0]==='clear'&&v[1]===gpu.gl.COLOR_BUFFER_BIT),false,'the geometry overlay cannot repaint the media background');
  f.at(100);p.meshes=undefined;p.panes[0].layers[0].instances=[];p.panes[0].layers[0].clip={...clip,edge:'left'};
  assert.equal(f.player.update(p,{revision:2}),true);f.at(200);const before=gpu.calls.filter(v=>v[0]==='drawElements').length;assert.equal(f.player.draw(drawOptions),true);
  assert.equal(gpu.calls.filter(v=>v[0]==='drawElements').length,before,'without actual geometry, an edge band cannot become an independent picture-frame strip');
  assert.equal(gpu.calls.filter(v=>v[0]==='uniform1f'&&v[1]?.name==='clipRight').at(-1)[2],0);
});

test('clearing and context replacement release owned buffers and cannot leave a drawable retired pose',()=>{
  const a=fakeGl(),b=fakeGl(),f=fixture({gl:a.gl});f.player.update(packet(),{revision:1});f.player.draw(drawOptions);
  const before=a.created.filter(v=>v.kind==='createBuffer').length;f.player.setGl(b.gl);assert.equal(a.deleted.filter(v=>v.kind==='createBuffer').length,before);assert.equal(f.player.draw(drawOptions),true);
  f.player.clear();assert.equal(f.player.sample(),null);assert.equal(f.player.snapshot().active,false);assert.equal(f.player.snapshot().gpuMeshes,0);assert.equal(f.player.draw(drawOptions),false);
  assert.equal(b.deleted.filter(v=>v.kind==='createBuffer').length,b.created.filter(v=>v.kind==='createBuffer').length);
  assert.equal(f.player.update(pose(2),{revision:1}),false,'a retired catalogue cannot be referenced after clear');f.player.dispose();
});
