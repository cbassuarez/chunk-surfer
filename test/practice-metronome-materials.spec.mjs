import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  practiceMetronomeGeometry,practiceMetronomeInstances,practiceMetronomePose,
  practiceMetronomePlacement,PRACTICE_METRONOME_SHAPE as C,
  PRACTICE_METRONOME_PICK_GEOMETRY as K,PRACTICE_METRONOME_SCALE,
  PRACTICE_METRONOME_SCALE_SURFACE as S,
} from '../src/render/practice-metronome-model.js';
import {installProceduralMeshes,proceduralMeshBounds} from '../src/render/procedural-mesh-install.js';
import {
  createPracticeMetronomeMaterialCanvases,installPracticeMetronomeMeshes,
  PRACTICE_METRONOME_MATERIAL_SPEC,PRACTICE_METRONOME_TEXTURE_BYTES,
  PRACTICE_METRONOME_SCALE_PRINT,PRACTICE_METRONOME_PRINT_SURFACE,
} from '../src/render/practice-metronome-materials.js';
import {printedSurfaceDescriptor} from '../src/render/printed-surface.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} versus ${b}`);
function canvasRecorder(){
  const canvases=[];
  const factory=(width,height)=>{
    const calls=[],canvas={width,height,calls,putCount:0},image=()=>canvas.image||(canvas.image={width,height,data:new Uint8ClampedArray(width*height*4)});
    // Controlled full/partial/clear coverage probes test channel transport,
    // not a substitute font rasteriser or native reading/shape acceptance.
    const stamp=(px,py,ink)=>{
      const rgb=ink==='#fff'?[255,255,255]:[23,23,15],data=image().data;
      for(const[dx,alpha]of[[0,255],[1,96],[2,0]]){
        const x=Math.max(0,Math.min(width-1,Math.floor(px)+dx)),y=Math.max(0,Math.min(height-1,Math.floor(py))),at=(y*width+x)*4;
        for(let k=0;k<3;k++)data[at+k]=canvas.options?.alpha?(alpha?rgb[k]:data[at+k]):Math.round(data[at+k]*(1-alpha/255)+rgb[k]*alpha/255);
        data[at+3]=canvas.options?.alpha?alpha:255;
      }
    };
    let line=[];
    const ctx={
      createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
      putImageData:value=>{canvas.image=value;canvas.putCount++;},getImageData:()=>image(),clearRect:()=>{image().data.fill(0);},
      fillText:(...args)=>{calls.push({kind:'text',args,font:ctx.font,align:ctx.textAlign,ink:ctx.fillStyle});stamp(args[1],args[2],ctx.fillStyle);},
      beginPath(){line=[];},moveTo(...args){line.push(args);},lineTo(...args){line.push(args);},stroke(){
        calls.push({kind:'stroke',args:[...line.map(p=>[...p])],width:ctx.lineWidth,ink:ctx.strokeStyle});
        for(const p of line)stamp(...p,ctx.strokeStyle);
      },
    };canvas.getContext=(_type,options)=>{canvas.options=options;return ctx;};canvases.push(canvas);return canvas;
  };
  return{factory,canvases};
}
function glRecorder(){
  let next=1;const textures=new Set(),uploads=[],buffers=[],state=new Map();
  const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_INT:5,
    TEXTURE_2D:6,UNPACK_FLIP_Y_WEBGL:7,UNPACK_PREMULTIPLY_ALPHA_WEBGL:8,SRGB8_ALPHA8:9,RGBA8:10,RGBA:11,UNSIGNED_BYTE:12,
    TEXTURE_MIN_FILTER:13,LINEAR_MIPMAP_LINEAR:14,TEXTURE_MAG_FILTER:15,LINEAR:16,TEXTURE_WRAP_S:17,CLAMP_TO_EDGE:18,TEXTURE_WRAP_T:19,
    ACTIVE_TEXTURE:20,TEXTURE_BINDING_2D:21,TEXTURE0:22,
    createVertexArray:()=>({vao:next++}),createBuffer:()=>({buffer:next++}),bindVertexArray(){},bindBuffer(){},
    bufferData:(target,data)=>buffers.push({target,data}),enableVertexAttribArray(){},vertexAttribPointer(){},vertexAttribDivisor(){},disableVertexAttribArray(){},vertexAttrib1f(){},
    createTexture:()=>{const t={texture:next++};textures.add(t);return t;},isTexture:t=>textures.has(t),
    bindTexture:(_target,texture)=>state.set(gl.TEXTURE_BINDING_2D,texture),pixelStorei:(key,value)=>state.set(key,value),
    getParameter:key=>state.get(key)??(key===gl.ACTIVE_TEXTURE?gl.TEXTURE0:false),activeTexture:value=>state.set(gl.ACTIVE_TEXTURE,value),
    texImage2D:(...args)=>uploads.push(args),generateMipmap(){},texParameteri(){},deleteTexture:t=>textures.delete(t),
  };return{gl,textures,uploads,buffers};
}
function triangle(piece,at){
  const ids=piece.i.slice(at,at+3),p=ids.map(id=>piece.p.slice(id*3,id*3+3)),a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]),
    n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  return{ids,p,n,area:Math.hypot(...n)/2};
}

test('the physical instrument keeps six bounded pieces, explicit UVs and valid lit normals',()=>{
  const pieces=practiceMetronomeGeometry();assert.equal(pieces.length,6);
  assert.equal(new Set(pieces.map(p=>p.name)).size,6);
  let triangles=0;
  for(const p of pieces){
    assert.ok(p.p.every(Number.isFinite));assert.equal(p.p.length,p.n.length);assert.equal(p.uv.length,p.p.length/3*2);
    assert.ok(p.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.deepEqual(p.emissive,[0,0,0]);
    triangles+=p.i.length/3;
    for(let at=0;at<p.i.length;at+=3){
      const t=triangle(p,at);assert.ok(t.area>1e-12,`${p.name} has a degenerate triangle`);
      for(const id of t.ids){const n=p.n.slice(id*3,id*3+3);near(Math.hypot(...n),1);assert.ok(n.reduce((s,v,k)=>s+v*t.n[k],0)>0,'normal agrees with winding');}
    }
  }
  assert.ok(triangles<2800,`bounded geometry: ${triangles} triangles per instrument`);
  const wood=proceduralMeshBounds(pieces[0]);near(wood.min[0],-C.halfWidth);near(wood.max[0],C.halfWidth);near(wood.max[1],C.height);
  assert.ok(wood.min[2]>=-C.depth/2&&wood.max[2]<=C.depth/2);
  const slider=proceduralMeshBounds(pieces.at(-1));near(slider.min[0],-C.weightWidth/2);near(slider.max[1],C.weightHeight/2);
  assert.ok(slider.min[2]>=K.weightScrewFrontZ-.0002&&slider.max[2]<C.frontZ+.01);
});

test('closed castings and round parts have paired welded edges; only the authored vent/seam sheets are open',()=>{
  for(const piece of practiceMetronomeGeometry()){
    const edges=new Map(),key=id=>piece.p.slice(id*3,id*3+3).map(v=>Math.round(v*1e7)).join(',');
    for(let at=0;at<piece.i.length;at+=3){const t=piece.i.slice(at,at+3).map(key);for(let k=0;k<3;k++){
      const id=[t[k],t[(k+1)%3]].sort().join('|');edges.set(id,(edges.get(id)||0)+1);
    }}
    const open=[...edges.values()].filter(n=>n===1).length;
    assert.equal(open,piece.name.endsWith('_ink')?48:0,piece.name);
    assert.ok([...edges.values()].every(n=>n===2||(piece.name.endsWith('_case')&&n===4)||(piece.name.endsWith('_ink')&&n===1)));
  }
});

test('the original articulated matrices put the actual rod and slider at the shared physical pose',()=>{
  const prop={id:'test',x:3,y:4,z:5,yaw:.73,scale:1.4,scaleX:.9,scaleY:1.1},base=practiceMetronomePlacement(prop);
  for(const tempo of[40,134.4,300])for(const swing of[-1,0,1]){
    const parts=practiceMetronomeInstances(prop,{tempo,swing}),pose=practiceMetronomePose(tempo,swing),weight=parts.find(p=>p.mesh.endsWith('_weight'));
    assert.equal(parts.length,6);assert.equal(new Set(parts.map(p=>p.id)).size,6);
    const expected=[0,1,2].map(k=>base[k]*pose.weight.x+base[4+k]*pose.weight.y+base[8+k]*pose.weight.z+base[12+k]);
    const actual=[0,1,2].map(k=>weight.matrix[8+k]*C.frontZ+weight.matrix[12+k]);
    actual.forEach((v,k)=>near(v,expected[k],1e-6));
    assert.deepEqual(parts.find(p=>p.mesh.endsWith('_case')).matrix,base);
  }
});

test('the shared mesh installer uploads authored UVs and retains the legacy XZ fallback',()=>{
  const{gl}=glRecorder(),pack={catalog:new Map()},withUV={name:'uv',p:[0,0,0,1,0,0,0,1,0],i:[0,1,2],uv:[.1,.2,.3,.4,.5,.6],base:[1,1,1,1]};
  installProceduralMeshes(gl,pack,[withUV,{...withUV,name:'fallback',uv:undefined}]);
  const read=name=>Array.from(pack.catalog.get(name).primitives[0].nativeReceiverGeometry.uvs);
  read('uv').forEach((v,k)=>near(v,withUV.uv[k]));assert.deepEqual(read('fallback'),[0,0,1,0,0,0]);
});

test('the actual -Z scale face reads upright from the runtime camera with local +X on screen left',()=>{
  const face=practiceMetronomeGeometry().find(p=>p.name.endsWith('_scale'));
  let left=0,right=0;
  for(let at=0;at<face.p.length;at+=3){
    if(face.n[at+2]>-.9)continue;
    const x=face.p[at],y=face.p[at+1],u=face.uv[at/3*2],v=face.uv[at/3*2+1];
    if(x>0){assert.ok(u<.5,'screen-left physical side samples the left of the printed atlas');left++;}
    if(x<0){assert.ok(u>.5,'screen-right physical side samples the right of the printed atlas');right++;}
    near(v,(y-S.y0)/(S.y1-S.y0));
  }
  assert.ok(left&&right);
});

test('the scale is real serif typesetting on a bounded physical material, not segmented geometry',()=>{
  const{factory,canvases}=canvasRecorder(),materials=createPracticeMetronomeMaterialCanvases({canvasFactory:factory});
  assert.equal(canvases.length,13,'one temporary CPU mask, still twelve GPU maps');assert.ok(PRACTICE_METRONOME_TEXTURE_BYTES<8*1024*1024);
  const text=materials.scale.albedo.calls.filter(c=>c.kind==='text');
  assert.deepEqual(text.slice(0,PRACTICE_METRONOME_SCALE.length).map(c=>c.args[0]),PRACTICE_METRONOME_SCALE.map(String));
  assert.ok(text.every(c=>/Georgia.*serif/.test(c.font)));assert.ok(text.every(c=>c.args.slice(1).every(Number.isFinite)));
  const print=PRACTICE_METRONOME_SCALE_PRINT;
  assert.ok(print.fontPx>=36&&print.fontPx<=40&&print.fontWeight>=600,'physical print survives the close-up scale before dither');
  assert.ok(print.majorTickPx>=1.4&&print.minorTickPx>=1);
  for(const call of text.slice(0,PRACTICE_METRONOME_SCALE.length)){
    assert.ok(call.font.startsWith(`${print.fontWeight} ${print.fontPx}px`));assert.equal(call.ink,'#17170f');
    const[x,y,maxWidth]=call.args.slice(1),localY=S.y0+(1-y/1024)*(S.y1-S.y0),top=localY+print.fontPx/1024*(S.y1-S.y0)/2,
      halfWidth=.080+(.030-.080)*(top-.054)/(.401-.054),leftWorld=S.x0+(x-maxWidth)/512*(S.x1-S.x0);
    assert.ok(maxWidth>=print.fontPx*1.5,'40 and 300 have real typesetting width, not a clipped slot');
    assert.ok(leftWorld>=-halfWidth+.0019,'entire conservative em box stays within the physical taper');
  }
  for(const[kind,maps]of Object.entries(materials)){
    assert.deepEqual([maps.albedo.width,maps.albedo.height],PRACTICE_METRONOME_MATERIAL_SPEC[kind].albedo);
    for(const channel of['albedo','normal','orm'])assert.ok(maps[channel].image.data.every(Number.isFinite));
    const data=maps.normal.image.data;for(let at=0;at<data.length;at+=4)assert.ok(data[at+2]>=245,'subtle surface normals point outward');
  }
});

test('physical pigment changes only alpha and preserves exact stock/ink RGB, including uncovered stock',()=>{
  const{factory,canvases}=canvasRecorder(),materials=createPracticeMetronomeMaterialCanvases({canvasFactory:factory}),scale=materials.scale,
    color=scale.albedo,mask=canvases.find(c=>c.options.alpha===true),bitmap=scale.albedoBitmap;
  assert.ok(mask);assert.equal(color.options.alpha,false);assert.equal(mask.putCount,0,'coverage is white on a clear alpha canvas');
  assert.equal(color.putCount,1,'combined RGBA is never returned through Canvas');
  assert.deepEqual(mask.calls.map(({kind,args,font,align,width})=>({kind,args,font,align,width})),color.calls.map(({kind,args,font,align,width})=>({kind,args,font,align,width})),
    'every original numeral, title and graduation is drawn with identical layout');
  assert.ok(mask.calls.every(call=>call.ink==='#fff'),'the mask contains actual white glyph/tick coverage');
  const counts={clear:0,partial:0,full:0},stride=bitmap.width*4;
  for(let y=0;y<bitmap.height;y++)for(let x=0;x<bitmap.width;x++){
    const src=y*stride+x*4,dst=(bitmap.height-1-y)*stride+x*4,a=mask.image.data[src+3];
    for(let channel=0;channel<3;channel++)assert.equal(bitmap.pixels[dst+channel],color.image.data[src+channel],'the physical RGB channel changed');
    assert.equal(bitmap.pixels[dst+3],a,'ink alpha or explicit row orientation changed');
    assert.equal(color.image.data[src+3],255,'original opaque RGB canvas was mutated');
    counts[a===0?'clear':a===255?'full':'partial']++;
  }
  assert.ok(counts.clear&&counts.partial&&counts.full,'clear stock, antialiased edges and full ink all reach the typed bitmap');
  assert.ok(bitmap.pixels[0]>100&&bitmap.pixels[1]>100&&bitmap.pixels[3]===0,'zero-coverage ivory retains nonzero stock RGB');
  for(const[kind,maps]of Object.entries(materials)){
    if(kind==='scale')assert.equal(maps.printedSurface,PRACTICE_METRONOME_PRINT_SURFACE);
    else{assert.equal(maps.albedoBitmap,null);assert.equal(maps.printedSurface,null);}
    for(const channel of['normal','orm'])for(let at=3;at<maps[channel].image.data.length;at+=4)assert.equal(maps[channel].image.data[at],255,'normal and ORM channels remain ordinary opaque maps');
  }
});

test('ordinary P3 residency uses one shared set of sRGB albedo and linear normal/ORM textures across pack reloads',()=>{
  const{gl,textures,uploads}=glRecorder(),{factory}=canvasRecorder(),pack={catalog:new Map()};
  assert.equal(installPracticeMetronomeMeshes(gl,pack,{canvasFactory:factory}),true);assert.equal(textures.size,12);assert.equal(uploads.length,12);
  assert.equal(uploads.filter(call=>call[2]===gl.SRGB8_ALPHA8).length,4);assert.equal(uploads.filter(call=>call[2]===gl.RGBA8).length,8);
  const typed=uploads.filter(call=>call.length===9);assert.equal(typed.length,1,'only the physical scale uses a typed pigment upload');
  assert.equal(typed[0][2],gl.SRGB8_ALPHA8);assert.deepEqual(typed[0].slice(3,5),[512,1024]);assert.ok(typed[0].at(-1) instanceof Uint8Array);
  for(const mesh of pack.catalog.values()){
    assert.equal(mesh.extras.practiceMetronome,true);assert.ok(mesh.primitives[0].texture&&mesh.primitives[0].normalTexture&&mesh.primitives[0].ormTexture);
    assert.equal(mesh.primitives[0].materialFactors,'gltf');assert.deepEqual(mesh.primitives[0].emissive,[0,0,0]);
    const p=mesh.primitives[0];assert.equal(p.alphaCut,0,'clear pigment stock must keep the real plate depth and shadow');assert.equal(p.base[3],1);
    if(mesh.name==='practice_metronome_scale')assert.strictEqual(p.printedSurface,PRACTICE_METRONOME_PRINT_SURFACE);
    else assert.equal(p.printedSurface,null,'print identity cannot spill onto wood, rod, slider or fittings');
  }
  const maps=pack.catalog.get('practice_metronome_rod').primitives[0];
  assert.strictEqual(maps.texture,pack.catalog.get('practice_metronome_weight').primitives[0].texture,'brass is shared by moving parts');
  installPracticeMetronomeMeshes(gl,pack,{canvasFactory:factory});assert.equal(uploads.length,12);
  const fresh={catalog:new Map()};installPracticeMetronomeMeshes(gl,fresh,{canvasFactory:factory});assert.equal(uploads.length,12);
  assert.strictEqual(fresh.catalog.get('practice_metronome_rod').primitives[0].texture,maps.texture);
});

test('the declared opaque scale uses the existing default ordinary-practice pigment resolve',()=>{
  const contract=PRACTICE_METRONOME_PRINT_SURFACE;
  assert.deepEqual(contract,{version:1,coverage:'baseColorAlpha',polarity:'dark-on-light',process:'printed mechanical tempo scale',emission:'none'});
  assert.deepEqual(printedSurfaceDescriptor(contract,{alphaMode:'OPAQUE',hasTexture:true}),contract);
  assert.throws(()=>printedSurfaceDescriptor(contract,{alphaMode:'MASK',hasTexture:true}),/OPAQUE/);
  const renderer=fs.readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(renderer,/let printedSurfaceMode=3;/);assert.match(renderer,/pixelMeshU\('uPrintedSurfaceMode'\),printedSurfaceMode/);
  assert.doesNotMatch(main,/r3dSetPrintedSurfaceMode\s*\(/,'ordinary practice cannot require a global mode toggle');
});
