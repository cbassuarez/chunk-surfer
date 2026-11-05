import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as code from '../src/render/source-code-screen.js';
import {cameraBasis} from '../src/render/camera-basis.js';
import {sourceRestFacultyUniforms} from '../src/render/source-rest-faculties.js';
import {sourceExecutionParameters} from '../src/render/source-execution-trails.js';

const printed=(process='source-blueprint-fragments')=>({
  texture:{source:true},base:[1,1,1,1],alphaCut:0,
  printedSurface:{version:1,coverage:'baseColorAlpha',polarity:'light-on-dark',process,emission:'none'},
});
const propsSource=()=>readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');

test('only authored Source code materials enter the separate glyph pass',()=>{
  for(const process of ['source-fragments','source-blueprint-fragments','source-silver-fracture','primordial Source clauses']){
    assert.equal(code.sourceCodeMaterialEligible(printed(process)),true,process);
  }
  for(const primitive of [{},printed('ordinary-document'),{...printed(),printedSurface:null},
    {...printed(),printedSurface:{...printed().printedSurface,coverage:'solid'}},
    {...printed(),printedSurface:{...printed().printedSurface,sampling:'area'}},
    {...printed(),materialColor:[1,0,0]},{...printed(),colorClass:'page'},
    {...printed(),portrait:true}])assert.equal(code.sourceCodeMaterialEligible(primitive),false);
});

test('only eligible chunk-error sheets receive two fixed ink skins',()=>{
  const lift=code.SOURCE_CODE_LIFT_METRES;
  for(const process of code.SOURCE_CODE_PROCESSES){
    const ordinary=printed(process),fault={...ordinary,materialRole:'source-chunk-error'},before=structuredClone(fault);
    assert.deepEqual(code.sourceCodePhysicalLifts(ordinary),[lift]);
    assert.deepEqual(code.sourceCodePhysicalLifts(fault),[lift,-lift]);
    assert.deepEqual(code.sourceCodePhysicalLifts({...fault,eye:[99,-4,17],yaw:2,timeSec:1000}),[lift,-lift],'world-space skins cannot depend on view or time');
    assert.deepEqual(fault,before);assert.ok(Object.isFrozen(code.sourceCodePhysicalLifts(fault)));
  }
  for(const materialRole of ['source-silver-fracture','quiet-metal','source-continuation'])assert.deepEqual(code.sourceCodePhysicalLifts({...printed(),materialRole}),[lift]);
  for(const fault of [{materialRole:'source-chunk-error'},{...printed('ordinary-document'),materialRole:'source-chunk-error'},
    {...printed(),materialRole:'source-chunk-error',colorClass:'page'},
    {...printed(),materialRole:'source-chunk-error',printedSurface:{...printed().printedSurface,sampling:'area'}}])assert.deepEqual(code.sourceCodePhysicalLifts(fault),[],'non-code exceptions cannot acquire a duplicate skin');
});

test('page and explicit material-color cards retain their ordinary presentation',()=>{
  for(const instance of [{text:'return x;',colorClass:'field'},{text:'return x;',colorClass:'path'},
    {source:{text:'throw error;'},colorClass:'fault'}]){
    assert.equal(code.sourceCodeTextEligible(instance),true);
  }
  for(const instance of [{text:'return x;',colorClass:'page'},{text:'return x;',materialColor:[.4,.5,.6]},
    {text:'return x;',colorClass:'field',materialColor:[1,0,0]},{text:''},{text:' \n\t '}])assert.equal(code.sourceCodeTextEligible(instance),false);
});

test('clean substrate uses authored sRGB stock in the existing linear material pass',()=>{
  const primitive={...printed(),sourceCodeStock:[0,.5,1]};
  assert.deepEqual(code.sourceCodeStock(primitive,{linear:false}),[0,.5,1]);
  const stock=code.sourceCodeStock(primitive);
  assert.equal(stock[0],0);assert.ok(Math.abs(stock[1]-.21404114048223255)<1e-12);assert.equal(stock[2],1);
  assert.deepEqual(code.sourceCodeStock(printed(),{linear:false}),[0,0,170/255]);
  assert.deepEqual(code.sourceCodeStock({...printed(),printedSurface:{...printed().printedSurface,polarity:'dark-on-light'}},{linear:false}),[214/255,217/255,208/255]);
  const invalid=code.sourceCodeStock({...printed(),sourceCodeStock:[-1,NaN,2]});
  assert.deepEqual(invalid,[0,0,1]);
  assert.deepEqual(primitive.sourceCodeStock,[0,.5,1],'stock conversion cannot mutate shared material metadata');
});

test('glyph depth rejects walls and the nearer Pressure body without masking empty space',()=>{
  const scene=1/(1+10*.14);
  assert.equal(code.sourceCodeDepthVisible(9,scene),true);
  assert.equal(code.sourceCodeDepthVisible(10,scene),true);
  assert.equal(code.sourceCodeDepthVisible(11,scene),false);
  assert.equal(code.sourceCodeDepthVisible(100,0),true,'zero packed depth names the unoccupied far view');
  assert.equal(code.sourceCodeDepthVisible(100,1),true,'Source acquisition clear alpha is also unoccupied air');
  assert.equal(code.sourceCodeDepthVisible(9,scene,{pressureDepth:8,pressureCoverage:.5}),false);
  assert.equal(code.sourceCodeDepthVisible(7,scene,{pressureDepth:8,pressureCoverage:.5}),true);
  assert.equal(code.sourceCodeDepthVisible(9,scene,{pressureDepth:8,pressureCoverage:.018}),true,'an absent/under-threshold Pressure sample cannot become a wall');
  assert.equal(code.sourceCodeDepthVisible(10,scene,{pressureDepth:9.99,pressureCoverage:1}),true,'the same physical boundary retains its existing finite tolerance');
  for(const invalid of [0,-1,NaN,Infinity])assert.equal(code.sourceCodeDepthVisible(invalid,scene),false);
});

test('post-code visibility follows the same committed field loss and black as the room',()=>{
  assert.equal(code.sourceCodeVisibility(),1);
  assert.equal(code.sourceCodeVisibility({enabled:false,canLeave:false,black:1}),1);
  assert.equal(code.sourceCodeVisibility({enabled:true,canLeave:false,black:1}),0);
  assert.equal(code.sourceCodeVisibility({enabled:true,canLeave:false,black:.5}),.5);
  assert.equal(code.sourceCodeVisibility({enabled:true,canLeave:true,black:1}),1,'uncommitted rest cannot introduce the terminal blackout');
  const loss=code.sourceCodeVisibility({enabled:true,canLeave:false,fieldLoss:1},[.05,.95],2);
  assert.ok(loss>=0&&loss<1,'rest field loss also removes post-dither code');
});

test('glyph targets use the actual presentation dimensions including full-resolution capture targets',()=>{
  assert.deepEqual(code.sourceCodeTargetSize({width:2048,height:1024},{width:1280,height:800}),{width:2048,height:1024});
  assert.deepEqual(code.sourceCodeTargetSize({}, {width:1280,height:800}),{width:1280,height:800});
  assert.deepEqual(code.sourceCodeTargetSize({width:1280.9,height:800.9}),{width:1280,height:800});
  assert.deepEqual(code.sourceCodeTargetSize({width:-2,height:-5}),{width:1,height:1});
});

test('the glyph programs retain physical clips and depth while keeping token light out of the recording shader',()=>{
  assert.equal(code.SOURCE_CODE_LIFT_METRES,.02);
  for(const shader of [code.SOURCE_CODE_PHYSICAL_FRAG,code.SOURCE_CODE_TEXT_FRAG]){
    assert.match(shader,/sourceCodeWorldVisibility/);
    assert.match(shader,/sourceRestFacultyVisibility/);
    assert.match(shader,/uPressureReady/);
    assert.doesNotMatch(shader,/captureBit|sourcePrismaticInk|recordingScreenPhase|uTime|performance|Math\.random/);
    const samplers=[...shader.matchAll(/uniform\s+sampler\w+\s+([^;]+);/g)].flatMap(match=>match[1].split(','));
    assert.ok(samplers.length<=16,'the separate glyph program stays within the guaranteed texture limit');
  }
  assert.match(code.SOURCE_CODE_PHYSICAL_FRAG,/clipMeshPortal\(vWorld\)/);
  assert.match(code.SOURCE_CODE_PHYSICAL_FRAG,/sourceSurroundingsVisible/);
  assert.match(code.SOURCE_CODE_PHYSICAL_FRAG,/uExteriorClipPlane/);
  assert.match(code.SOURCE_CODE_COMPOSITE_FRAG,/uGlyphLayer/);
  assert.doesNotMatch(code.SOURCE_CODE_COMPOSITE_FRAG,/uTime|captureBit|recordingScreenPhase|sourcePrismaticInk/);
});

test('each assembled glyph fragment declares every shared helper uniform before it is read',()=>{
  for(const shader of [code.SOURCE_CODE_PHYSICAL_FRAG,code.SOURCE_CODE_TEXT_FRAG,code.SOURCE_CODE_COMPOSITE_FRAG]){
    const source=shader.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''),declarations=new Map();
    for(const match of source.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+([^;]+);/g)){
      for(const item of match[1].split(','))declarations.set(item.trim().replace(/\[.*$/,''),match.index);
    }
    for(const read of source.matchAll(/\bu[A-Z]\w*\b/g)){
      assert.ok(declarations.has(read[0]),`shared helper requires undeclared uniform ${read[0]}`);
      assert.ok(declarations.get(read[0])<=read.index,`${read[0]} is read before its GLSL declaration`);
    }
  }
  assert.match(code.SOURCE_CODE_PHYSICAL_FRAG,/uniform float uReducedMotion;/);
});

test('actual world material bindings remove Source glyph relief and reset normally on neighboring props',()=>{
  const source=propsSource(),start=source.indexOf('const materialScalars = new Map();'),
    end=source.indexOf('// The atlas and morph bindings use different units',start);
  assert.ok(start>=0&&end>start);
  const declaration=source.match(/const cleanSourceCode=[^;]+;/)?.[0];assert.ok(declaration);
  const uniforms=['uSourceCodeClean','uUseNormal','uUseOrm','uLetteringFinish'];
  const calls=uniforms.map(name=>{const match=source.match(new RegExp("setMaterialScalar\\('"+name+"',[^;]+;"));assert.ok(match,name);return match[0];}).join('');
  const material={...printed(),normalTexture:{},ormTexture:{},letteringFinish:{localSpecular:true}},ordinary={...material,printedSurface:{...material.printedSurface,process:'ordinary-document'}};
  const run=new Function('sourceCodeMaterialEligible','primitives','sourceRoomLighting','sourceCodeScreen','gl','U','driveStudyFrame','physicalStudyMaterials','read',
    source.slice(start,end)+'return primitives.map(p=>{'+declaration+calls+'return read();});');
  const trace=(sourceRoomLighting,sourceCodeScreen=false)=>{
    const state=new Map(),gl={uniform1f:(name,value)=>state.set(name,value)};
    return run(code.sourceCodeMaterialEligible,[material,ordinary,material],sourceRoomLighting,sourceCodeScreen,gl,name=>name,false,false,()=>Object.fromEntries(state));
  };
  assert.deepEqual(trace(true),[
    {uSourceCodeClean:1,uUseNormal:0,uUseOrm:0,uLetteringFinish:0},
    {uSourceCodeClean:0,uUseNormal:1,uUseOrm:1,uLetteringFinish:1},
    {uSourceCodeClean:1,uUseNormal:0,uUseOrm:0,uLetteringFinish:0},
  ]);
  assert.deepEqual(trace(false,true),trace(true),'standalone Shore code also leaves world acquisition even without Source room lighting');
  assert.ok(trace(false).every(state=>state.uSourceCodeClean===0&&state.uUseNormal===1&&state.uUseOrm===1),'outside Source, physical print keeps its ordinary finish');
});

test('the actual acquisition branch replaces code color and coverage rather than merely overlaying crisp duplicates',()=>{
  const source=propsSource(),branch=source.match(/if\(uSourceCodeClean>\.5\)texel=vec4\(uSourceCodeStock,0\.0\);/)?.[0];
  assert.ok(branch,'clean stock must replace the sampled glyph before lighting and recording');
  const vec4=(rgb,alpha)=>[...rgb,alpha],run=new Function('uSourceCodeClean','uSourceCodeStock','texel','vec4',branch+'return texel;');
  const ink=[1,.1,.8,.9],stock=[0,0,.4];
  assert.deepEqual(run(1,stock,ink,vec4),[0,0,.4,0]);
  assert.deepEqual(run(0,stock,ink,vec4),ink);
  assert.ok(source.indexOf(branch)<source.indexOf('float printedCoverage='),'glyph coverage is removed before any material mark can claim it');
  assert.match(source,/const postCode=physical\|\|lighting\.sourceCodeScreen===true/);
  assert.match(source,/visibleSourceText\(eye,forward,maxDistance\)\.filter\(\(\{entry\}\)=>!postCode\|\|!sourceCodeTextEligible\(entry\)\)/,'room and standalone Shore SourceText code must also leave the pre-dither pass while page exceptions stay');
});

test('the actual glyph renderer allocates independent full-size color/depth and composites once onto its capture target',()=>{
  const source=propsSource(),start=source.indexOf('function sourceCodeUniforms('),end=source.indexOf('// STREET SURFACES FOR PROPS',start);
  assert.ok(start>=0&&end>start);
  const section=source.slice(start,end).replace(/\bexport\s+/g,''),calls=[],allocations=[],attachments=[];
  let serial=0,currentProgram=null,currentTarget=null,blendFunction=null,currentLift=null,currentVao=null;
  const enabled=new Set();
  const gl=new Proxy({
    isContextLost:()=>false,isProgram:()=>true,checkFramebufferStatus:()=> 'FRAMEBUFFER_COMPLETE',
    createTexture:()=>({kind:'glyph-color',id:++serial}),createRenderbuffer:()=>({kind:'glyph-depth',id:++serial}),createFramebuffer:()=>({kind:'glyph-target',id:++serial}),
    getUniformLocation:(program,name)=>program.label+':'+name,
    useProgram:program=>{currentProgram=program;},bindFramebuffer:(_target,target)=>{currentTarget=target;calls.push(['target',target]);},
    enable:key=>enabled.add(key),disable:key=>enabled.delete(key),blendFunc:(source,destination)=>{blendFunction=[source,destination];},
    texImage2D:(...args)=>allocations.push(['color',args[3],args[4]]),renderbufferStorage:(...args)=>allocations.push(['depth',args[2],args[3]]),
    framebufferTexture2D:(...args)=>attachments.push(['texture',args[1],args[3]]),framebufferRenderbuffer:(...args)=>attachments.push(['depth',args[1],args[3]]),
    viewport:(_x,_y,width,height)=>calls.push(['viewport',width,height]),
    uniform1f:(name,value)=>{if(name.endsWith(':uSourceCodeLift'))currentLift=value;calls.push(['uniform',name,value]);},
    bindVertexArray:vao=>{currentVao=vao;calls.push(['vao',vao]);},
    drawElementsInstanced:(...args)=>calls.push(['mesh',currentProgram.label,currentTarget,args,{lift:currentLift,vao:currentVao}]),
    drawArrays:(...args)=>calls.push(['composite',currentProgram.label,currentTarget,args,{blend:enabled.has('BLEND'),blendFunction}]),
  },{get:(target,key)=>key in target?target[key]:String(key).toUpperCase()===key?key:(...args)=>{calls.push([key,...args]);}});
  const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const primitive={...printed(),vao:{native:true},count:6,indexType:'UNSIGNED_INT'},mesh={primitives:[primitive],extras:{}};
  const instance={mesh:'route',matrix:identity,id:'translated-route',x:0,y:-29.75,z:0},uploads=[],visibilityRequests=[];
  let glyphGroups=null;
  const environment={gl,width:640,height:400,initialFrame:{eye:[0,1.62,-2.8],yaw:.7,pitch:.1,viewMatrix:identity,projection:identity,maxDistance:300,patternOriginOffsetMetres:[0,0,0]},
    ...code,sourceExecutionParameters,sourceRestFacultyUniforms,cameraBasis,
    propWindHeight:new Function(source.match(/function propWindHeight\(wind\)\{[^\r\n]+\}/)[0]+'return propWindHeight;')(),
    VERT:'actual-shared-vertex',TEXT_VERT:'actual-shared-text-vertex',
    linkProgram:(_vertex,_fragment,label)=>({label}),natatoriumMetric:{},natatoriumMetricUniform:()=>[0,0,0,0],
    pack:{catalog:new Map([['route',mesh]])},visibleGroups:(_eye,_range,options)=>{visibilityRequests.push(options);return glyphGroups||new Map([['route\0portal:clip-test',[instance]]]);},viewFrustum:()=>({}),groupMeshName:key=>key.split('\0',1)[0],
    bindSourceSurroundingsPressure(){},bindRestHorizonTide(){},bindCharacterPose(){},uploadInstances:(...args)=>uploads.push(args),
    sourceSurroundingsGate:{x:0,y:0,z:0,width:1,height:1,normalX:0,normalZ:1},portalClipArray:()=>null,portalExcludeArray:()=>null,
    bindSourceSurroundingsPresentation(){},bindMeshCharacterMorph(){},bindSourceSurroundingsPressureShape(){},sourceSurroundingsPrimitiveSide:()=>0,visibleSourceText:()=>[],
  };
  const construct=new Function(...Object.keys(environment),'let sourceCodeGpu=null,sourceCodeFrame=initialFrame;'+section+'return {renderSourceCodeScreen,sourceCodeScreenDiagnostics};');
  const renderer=construct(...Object.values(environment)),target={fbo:{capture:true},width:1920,height:1080};
  assert.equal(renderer.renderSourceCodeScreen({target,sceneDepth:'world-depth'}),true);
  assert.deepEqual(allocations,[['color',1920,1080],['depth',1920,1080]]);
  assert.deepEqual(calls.filter(call=>call[0]==='viewport'),[['viewport',1920,1080],['viewport',1920,1080]]);
  const meshes=calls.filter(call=>call[0]==='mesh'),composites=calls.filter(call=>call[0]==='composite');
  assert.equal(meshes.length,1);assert.equal(meshes[0][2].kind,'glyph-target');
  assert.equal(meshes[0][4].lift,code.SOURCE_CODE_LIFT_METRES,'ordinary physical code retains one positive skin');
  assert.equal(composites.length,1);assert.equal(composites[0][2],target.fbo);
  assert.deepEqual(composites[0][4],{blend:true,blendFunction:['ONE','ONE_MINUS_SRC_ALPHA']});
  assert.equal(uploads[0][0],mesh);assert.equal(uploads[0][1][0],instance,'native matrices and translated copies are reused rather than billboarded');
  assert.ok(calls.some(call=>call[0]==='uniform'&&call[1].endsWith(':uSourceCodeLift')&&call[2]===.02));
  assert.ok(attachments.every(attachment=>attachment[2]!=='world-depth'),'sampled world depth must never be attached to the glyph target');
  const fault={...printed(),materialRole:'source-chunk-error',vao:{flatFault:true},count:9,indexType:'UNSIGNED_INT'},
    neighbour={...primitive,vao:{ordinaryNeighbour:true}},excluded={...printed('ordinary-document'),materialRole:'source-chunk-error',vao:{excluded:true},count:6,indexType:'UNSIGNED_INT'},mixedStart=calls.length;
  mesh.primitives=[primitive,fault,neighbour,excluded];
  assert.equal(renderer.renderSourceCodeScreen({target,sceneDepth:'world-depth'}),true);
  const mixed=calls.slice(mixedStart),mixedDraws=mixed.filter(call=>call[0]==='mesh'),lift=code.SOURCE_CODE_LIFT_METRES;
  assert.deepEqual(mixedDraws.map(call=>call[4].lift),[lift,lift,-lift,lift]);
  assert.deepEqual(mixedDraws.map(call=>call[4].vao),[primitive.vao,fault.vao,fault.vao,neighbour.vao],'both fault skins reuse the exact native sheet while neighbours draw once');
  assert.deepEqual(mixedDraws[1][3],mixedDraws[2][3],'the second skin keeps the same indices and instance count');
  assert.equal(renderer.sourceCodeScreenDiagnostics().physicalDraws,4,'diagnostics count actual draws including the second fault skin');
  const reverseIndex=mixed.findIndex(call=>call[0]==='mesh'&&call[4].lift===-lift);
  assert.deepEqual(mixed[reverseIndex+1],['uniform','Source code physical:uSourceCodeLift',lift],'positive lift is restored immediately after the reverse skin');
  mesh.primitives=[primitive];
  assert.equal(renderer.renderSourceCodeScreen({target,sceneDepth:'world-depth'}),true);
  assert.equal(allocations.length,2,'unchanged full-resolution targets are reused');
  assert.equal(renderer.renderSourceCodeScreen({target:{...target,width:2048,height:1024},sceneDepth:'world-depth'}),true);
  assert.deepEqual(allocations.slice(2),[['color',2048,1024],['depth',2048,1024]]);
  let additional;
  assert.equal(renderer.renderSourceCodeScreen({target,sceneDepth:'world-depth',drawAdditionalCode:context=>{
    additional=context;gl.disable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  }}),true);
  assert.equal(additional.framebuffer.kind,'glyph-target');assert.equal(additional.width,1920);assert.equal(additional.height,1080);
  assert.deepEqual(calls.filter(call=>call[0]==='composite').at(-1)[4],{blend:true,blendFunction:['ONE','ONE_MINUS_SRC_ALPHA']},'an additional Source renderer cannot leave the final premultiplied composite in another blend mode');
  const memory={...instance,id:'translated-route:freed-code',sourceCodeOnly:true,matrix:new Float32Array(identity)},memoryStart=calls.length;
  mesh.extras.vegetationWind={amplitudeM:.4,frequencyHz:2,heightM:5};primitive.sourceSurroundingsPressure=true;
  glyphGroups=new Map([['route\0source-code-memory',[memory]],['route',[instance]]]);
  assert.equal(renderer.renderSourceCodeScreen({target,sceneDepth:'world-depth'}),true);
  const memoryCalls=calls.slice(memoryStart),winds=memoryCalls.filter(call=>call[0]==='uniform4f'&&String(call[1]).endsWith(':uVegetationWind'));
  assert.deepEqual(winds.map(call=>call[2]),[0,.4],'memory is static while the next living batch keeps its native wind');
  assert.ok(memoryCalls.some(call=>call[0]==='uniform2f'&&String(call[1]).endsWith(':uSourceSurroundingsPressureShape')&&call[2]===0&&call[3]===0),'frozen lettering must not inherit travelling stock deformation');
  assert.equal(renderer.sourceCodeScreenDiagnostics().memoryDraws,1);
  assert.equal(renderer.sourceCodeScreenDiagnostics().memoryInstances,1);
  assert.ok(visibilityRequests.every(options=>options.sourceCode===true),'glyphs use their independent visibility selection');
  const main=source.slice(source.indexOf('export function renderPropPass('),source.indexOf('export function propPackStats('));
  assert.match(main,/gl\.uniform1f\(U\('uSourceCodeLift'\),0\)/,'the next ordinary world pass explicitly resets the physical glyph lift');
});

test('the Source room presents code after the final world post and before its black identities',()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const start=source.indexOf('function drawSourceRoomMemory('),hook=source.indexOf('\nfunction drawSourceCodeScreen(',start),end=source.indexOf('\nconst DATAMOSH_FRAG',hook);
  assert.ok(start>=0&&hook>start&&end>hook);
  const room=source.slice(start,hook),post=room.indexOf('presentThroughPost('),glyph=room.indexOf('drawSourceCodeScreen('),identity=room.indexOf('drawSourceIdentity(');
  assert.ok(post>=0&&glyph>post&&identity>glyph,'code must be drawn by its own post-world pass, before exact absence is restored');
  assert.doesNotMatch(room.slice(glyph,identity),/runPixelMeshPass\(|presentThroughPost\(/,'the glyph layer must never re-enter recording or post processing');
  const wrapper=source.slice(hook,end),capture={fbo:{capture:true},width:2048,height:1024},pressure={ready:true},faculties={enabled:true,black:.4};
  let submitted;
  const environment={presentTarget:capture,canvas:{width:1280,height:800},camX:6,camY:4,camZ:-8,CELL:.5,yaw:.7,planYaw:.2,pitch:-.1,
    sceneTex:'combined-world-depth',sourceRestFaculties:faculties,SHORE:{},P3:{pressureTargets:()=>pressure,renderSourceCodeScreen:options=>{submitted=options;return true;}}};
  const run=new Function(...Object.keys(environment),wrapper+'return drawSourceCodeScreen(123,{boundaryOnly:true});');
  assert.equal(run(...Object.values(environment)),true);
  assert.deepEqual(submitted.target,capture);assert.equal(submitted.sceneDepth,'combined-world-depth');
  assert.equal(submitted.pressure,pressure);assert.equal(submitted.faculties,faculties);
  assert.deepEqual(submitted.camera.eye,[3,2,-4]);assert.equal(submitted.camera.pitch,-.1);
  assert.ok(Math.abs(submitted.camera.yaw-.9)<1e-12);
});
