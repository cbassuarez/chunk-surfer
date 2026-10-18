// Run this bounded capture in its own headless browser. It uses the actual
// native study API, real P3/R3d depth and the installed final VFD compositor.
// Complete lossless videos preserve every frame of a continuously rendered
// offline30Hz history. Timed frames exclude readback/encoding. No server owned.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const root='artifacts/lettering-weathering',baseline=root+'/baseline';
const input=process.env.LETTERING_SOURCE||root+'/production';
const output=process.env.LETTERING_MOTION_OUTPUT||root+'/motion';
const origin=process.env.LETTERING_ORIGIN||'http://127.0.0.1:5334';
const reportPath=path.join(output,process.env.LETTERING_MOTION_REPORT||'report.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile=file=>sha(fs.readFileSync(file));
const defaults=[
  {id:'hall',kind:'encounter',mesh:'gilt-hall',distance:3,near:2.3,far:4,lateral:.55},
  {id:'banner',kind:'fixture',mesh:'vigil_part_banner',distance:3.5,near:2.8,far:4.4,lateral:.65},
  {id:'placard',kind:'fixture',mesh:'vigil_part_sign_save',distance:2.5,near:1.8,far:3.3,lateral:.6},
];
const requested=(process.env.LETTERING_MOTION_CASES||'hall,banner').split(',').filter(Boolean);
assert.ok(requested.length&&requested.length<=3,'Select one to three bounded lettering motion cases');
assert.ok(requested.every(id=>defaults.some(c=>c.id===id)),'Unknown LETTERING_MOTION_CASES entry');
const cases=defaults.filter(c=>requested.includes(c.id));
const sourceFiles=[
  'src/render/props3d.js','src/render/prop-material-contract.js','src/render/r3d.js',
  'src/render/pixel-mesh/shader.js','src/render/printed-surface.js',
  'src/render/physical-source-print.js','src/render/physical-print-finish.js',
  'src/render/source-divide-meshes.js','src/render/source-last-reception-meshes.js',
  'src/render/tower-personal-meshes.js','src/data/world-inscriptions.js',
  'src/data/paper-pigment.js','src/data/paper-world-material.js','assets/paper/world-material.png','assets/paper/world-material.json',
  'src/data/corridor-lettering.js','src/data/building-map.js','src/world/corridor-dressing.js',
  'src/game/props.js','src/data/floorplan/conservatory.js','src/world/floorplan.js',
  'src/data/conservatory-props.js','src/data/conservatory-lights.js',
  'artifacts/lettering-weathering/native.js','artifacts/lettering-weathering/native.html','artifacts/lettering-study/encounters.js',
  'artifacts/lettering-production/gilt/encounter.js',
];
const hashes=()=>Object.fromEntries(sourceFiles.map(file=>[file,hashFile(file)]));
const inputFiles=[baseline+'/public/assets/conservatory-props.glb',baseline+'/public/assets/conservatory-props.lettering.json',
  baseline+'/public/assets/conservatory-props.stats.json',baseline+'/src/render/props3d.js',
  input+'/conservatory-props.glb',input+'/conservatory-props.lettering.json',input+'/conservatory-props.stats.json',input+'/prop-geometry.js'];
const inputHashes=()=>Object.fromEntries(inputFiles.map(file=>[file,hashFile(file)]));
const percentile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];};
const summary=values=>({samples:values.length,medianMs:percentile(values,.5),p95Ms:percentile(values,.95)});
const compactEvidence=(e,targetMesh)=>{
  const d=e.propDiagnostics;
  return{...e,propDiagnostics:d?{mainDrawCalls:d.mainDrawCalls,shadowDrawCalls:d.shadowDrawCalls,
    renderedInstances:d.renderedInstances,triangles:d.triangles,shadowTriangles:d.shadowTriangles,
    visibleMaterialRoles:d.visibleMaterialRoles,targetMesh,targetMainDrawCalls:d.mainDrawCallsByMesh?.[targetMesh]||0}:null};
};

function losslessEncoder(file){
  const args=['-loglevel','error','-y','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0',
    '-an','-c:v','libvpx-vp9','-lossless','1','-pix_fmt','gbrp','-colorspace','rgb','-color_range','pc',
    '-threads','1','-row-mt','0','-cpu-used','5',file];
  const child=spawn('/opt/homebrew/bin/ffmpeg',args,{stdio:['pipe','ignore','pipe']});
  let error=null,stderr='',closed=false;
  child.on('error',e=>{error=e;});child.stdin.on('error',e=>{error=e;});
  child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-16384);});
  const done=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
  const wait=milliseconds=>new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),milliseconds);done.then(result=>{clearTimeout(timer);resolve(result);});});
  return{
    args,
    async write(bytes){
      if(error||closed)throw error||new Error(`Video encoder closed before all frames: ${stderr}`);
      // Await each writable callback instead of queueing61 compressed frames.
      // Errors, including EPIPE, reject here and enter per-sequence cleanup.
      await new Promise((resolve,reject)=>child.stdin.write(bytes,e=>e?reject(e):resolve()));
      if(error)throw error;
    },
    async finish(){
      if(error)throw error;child.stdin.end();const result=await wait(120000);
      if(!result)throw new Error(`Video encoder timed out: ${stderr}`);
      if(error)throw error;assert.equal(result.code,0,`Video encoder failed (${result.signal||result.code}): ${stderr}`);
    },
    async cleanup({remove=false}={}){
      child.stdin.destroy();
      if(!closed){child.kill('SIGTERM');await wait(2500);}
      if(!closed){child.kill('SIGKILL');await wait(2500);}
      if(remove)fs.rmSync(file,{force:true});
      if(!closed)throw new Error('Owned video encoder did not close after SIGKILL');
    },
  };
}

async function verifyVideo(file,witnesses){
  const probe=JSON.parse(execFileSync('/opt/homebrew/bin/ffprobe',['-v','error','-threads','1','-count_frames',
    '-show_entries','stream=codec_name,codec_long_name,width,height,nb_read_frames,avg_frame_rate,pix_fmt,color_range,color_space',
    '-of','json',file],{encoding:'utf8'})).streams[0];
  assert.equal(probe.codec_name,'vp9');assert.equal(+probe.nb_read_frames,61);assert.equal(probe.width,960);assert.equal(probe.height,600);assert.equal(probe.avg_frame_rate,'30/1');
  // Decode actual start/middle/end RGB, not just a lossless codec label.
  const indices=[0,32,60],frameBytes=960*600*3;
  const decoded=execFileSync('/opt/homebrew/bin/ffmpeg',['-loglevel','error','-threads','1','-i',file,
    '-vf',"select='eq(n,0)+eq(n,32)+eq(n,60)'",'-fps_mode','passthrough','-filter_threads','1','-threads','1',
    '-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:frameBytes*3+1048576});
  assert.equal(decoded.length,frameBytes*indices.length);
  const pixelProof=[];
  for(const [j,index]of indices.entries()){
    const witness=witnesses.find(w=>w.index===index);assert.ok(witness,`Missing video witness ${index}`);
    const png=fs.readFileSync(path.join(output,witness.file)),rgb=await sharp(png).removeAlpha().raw().toBuffer();
    const videoRgb=decoded.subarray(j*frameBytes,(j+1)*frameBytes);assert.equal(rgb.length,frameBytes);
    assert.ok(rgb.equals(videoRgb),`Saved video RGB differs from native PNG frame${index}`);
    pixelProof.push({index,png:witness.file,pngSha256:sha(png),sourceRgbSha256:sha(rgb),decodedRgbSha256:sha(videoRgb),rgbBytes:frameBytes,exact:true});
  }
  return{probe,pixelProof,allDecodedWitnessesExact:true};
}

function imageDimensions(bytes,mime){
  if(mime==='image/png'&&bytes.length>=24&&bytes.readUInt32BE(0)===0x89504e47)
    return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(mime==='image/jpeg'&&bytes.length>4){
    let i=2;
    while(i+4<bytes.length){
      if(bytes[i++]!==255)continue;
      while(bytes[i]===255)i++;
      const marker=bytes[i++];if(marker===0xd9||marker===0xda)break;
      if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      const length=bytes.readUInt16BE(i);
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&i+7<bytes.length)
        return{height:bytes.readUInt16BE(i+3),width:bytes.readUInt16BE(i+5)};
      if(length<2)break;i+=length;
    }
  }
  return null;
}

function packTextureEstimate(file){
  const bytes=fs.readFileSync(file);assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  let json,bin;
  for(let at=12;at+8<=bytes.length;){const length=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4),part=bytes.subarray(at+8,at+8+length);
    if(type===0x4e4f534a)json=JSON.parse(part.toString('utf8'));if(type===0x004e4942)bin=part;at+=8+length;}
  assert.ok(json&&bin,'GLB JSON/BIN required');
  const textures=(json.textures||[]).map((texture,index)=>{
    const image=json.images?.[texture.source],view=json.bufferViews?.[image?.bufferView];
    if(!view)return{index,source:texture.source,unknown:true};
    const imageBytes=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),size=imageDimensions(imageBytes,image.mimeType);
    if(!size)return{index,source:texture.source,mime:image.mimeType,encodedBytes:view.byteLength,unknown:true};
    let width=size.width,height=size.height,mipBytes=0,levels=0;
    for(;;){mipBytes+=width*height*4;levels++;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}
    return{index,source:texture.source,mime:image.mimeType,...size,levels,baseLevelBytes:size.width*size.height*4,rgba8FullMipBytes:mipBytes};
  });
  return{file,packSha256:sha(bytes),glbBytes:bytes.length,textures,
    nominalRgba8BaseBytes:textures.reduce((n,t)=>n+(t.baseLevelBytes||0),0),
    nominalRgba8FullMipBytes:textures.reduce((n,t)=>n+(t.rgba8FullMipBytes||0),0),
    unknownTextures:textures.filter(t=>t.unknown).length,
    interpretation:'Nominal RGBA8 allocation per texture object with a full generated rectangular mip chain. Other loaded packs, framebuffers, driver padding and physical residency are excluded.'};
}

fs.mkdirSync(output,{recursive:true});
const report={kind:'production-lettering-motion',version:1,at:new Date().toISOString(),input,
  sourceHashes:hashes(),inputHashes:inputHashes(),toolSha256:hashFile('tools/chunk_surfer/lettering-weathering/motion.mjs'),
  requested,cases:[],errors:[],
  protocol:{native:[960,600],simulationHz:30,renderedFramesPerPath:61,savedFramesPerPath:16,videoFramesPerPath:61,
    savedFrameIndices:Array.from({length:16},(_,i)=>i*4),warmupFramesPerPath:30,
    performanceWarmupFrames:10,performanceTimedFrames:30,
    histories:'One explicit reset and one held look setter at sequence start; history retained between all movement frames',
    motion:'Camera translates with fixed yaw and pitch; baseline cameras and authored lighting times are reused verbatim after',
    timing:'Separate requestAnimationFrame timing phase; GPU query encloses only r3dFrame, never capture/readback/encoding'},
  limits:['Videos contain all61 offline simulated30Hz native frames; container cadence does not establish achieved realtime FPS or an uninterrupted route walk. Sixteen PNG witnesses additionally sample every fourth frame.',
    'The banner is an explicit asset fixture; hall is a reconstructed production encounter',
    'Sequential timings are exploratory and not a material-only benchmark or game FPS',
    'Nominal texture bytes are not measured driver residency; additional scene packs remain loaded',
    'Fresh-reader and independent material-aware review remain pending']};
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const poses=new Map();
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',protocolTimeout:180000,args:['--use-angle=metal','--no-sandbox']});
try{
  for(const arm of ['before','after']){
    const page=await browser.newPage();await page.setViewport({width:1100,height:800,deviceScaleFactor:1});
    const client=page._client();await client.send('Network.enable',{maxTotalBufferSize:536870912,maxResourceBufferSize:134217728});
    page.on('pageerror',error=>report.errors.push({arm,error:error.stack||error.message}));
    page.on('console',message=>{const text=message.text();if(['error','warn'].includes(message.type())||/initial|ready|compile|loading|loaded/i.test(text))
      console.log('BROWSER',arm,message.type(),text);});
    page.on('requestfailed',request=>console.log('REQUEST FAILED',arm,request.url(),request.failure()?.errorText));
    const overrides=new Map([
      ['/assets/conservatory-props.glb',arm==='before'?baseline+'/public/assets/conservatory-props.glb':input+'/conservatory-props.glb'],
      ['/assets/conservatory-props.lettering.json',arm==='before'?baseline+'/public/assets/conservatory-props.lettering.json':input+'/conservatory-props.lettering.json'],
      ['/assets/conservatory-props.stats.json',arm==='before'?baseline+'/public/assets/conservatory-props.stats.json':input+'/conservatory-props.stats.json'],
    ]);
    if(arm==='before')overrides.set('/src/render/props3d.js',baseline+'/src/render/props3d.js');
    else overrides.set('/src/data/generated/prop-geometry.js',input+'/prop-geometry.js');
    const overrideHashes=Object.fromEntries([...overrides].map(([url,file])=>[url,{file,sha256:hashFile(file)}]));
    const received=[];
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      try{
        const file=overrides.get(new URL(request.url()).pathname);
        if(!file){await request.continue();return;}
        let body=fs.readFileSync(file);const js=file.endsWith('.js');
        if(js)body=Buffer.from(body.toString().replace(/\bfrom\s*(['"])(\.\.?\/[^'"]+)\1/g,
          (whole,q,s)=>'from '+q+new URL(s,request.url()).href+q));
        await request.respond({status:200,contentType:js?'application/javascript':file.endsWith('.glb')?'model/gltf-binary':'application/json',body});
      }catch(error){report.errors.push({arm,request:request.url(),error:error.stack});await request.abort();}
    });
    page.on('response',response=>{
      if(new URL(response.url()).pathname==='/assets/conservatory-props.glb'){
        console.log('Package response',arm,response.status());
        received.push(response.buffer().then(bytes=>({url:response.url(),sha256:sha(bytes),bytes:bytes.length}))
          .catch(error=>({url:response.url(),bodyError:error.stack||error.message})));
      }
    });
    await page.evaluateOnNewDocument(()=>{
      window.productionWallNow=performance.now.bind(performance);window.productionClock=0;window.productionStepMs=1000/30;
      Object.defineProperty(performance,'now',{value:()=>window.productionClock});let letteringRandomState=0x6c657474;Math.random=()=>{letteringRandomState=(Math.imul(letteringRandomState,1664525)+1013904223)>>>0;return letteringRandomState/4294967296;};performance.setResourceTimingBufferSize(10000);
      window.WebSocket=class extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}};
    });
    console.log('Opening native motion renderer',arm);
    await page.goto(origin+'/artifacts/lettering-weathering/native.html',{waitUntil:'domcontentloaded',timeout:60000});
    console.log('Native document loaded',arm);
    await page.waitForFunction(()=>window.productionLettering?.ready||window.productionLettering?.failure,{timeout:180000});
    assert.equal(await page.evaluate(()=>window.productionLettering.failure),undefined);
    console.log('Native API ready',arm);
    await page.waitForNetworkIdle({idleTime:500,timeout:45000});
    const receivedPacks=await Promise.all(received),expectedPack=overrideHashes['/assets/conservatory-props.glb'].sha256;
    (report.packResponses||=[]).push({arm,receivedPacks});
    assert.ok(receivedPacks.some(pack=>pack.sha256===expectedPack),'Actual received package hash mismatch');
    const textureEstimate=packTextureEstimate(overrides.get('/assets/conservatory-props.glb'));
    await page.evaluate(()=>{
      const S=window.productionLettering,R=S.R;window.productionClock=100000;
      R.r3dSetPixelMesh({reduceMotion:false,reduceFlash:false,memory:true});
      const original=S.render;S.render=options=>{
        window.productionClock+=window.productionStepMs;
        const rendered=original(options),e=rendered.evidence,t=e.actualTorch;
        if(!Number.isFinite(t?.power)||!Number.isFinite(t?.lightEase))throw Error('Nonfinite actual torch');
        if(e.glError!==0)throw Error('GL error '+e.glError);if(!e.displayStatus?.shaderReady||!e.displayStatus?.supported||!e.displayStatus?.enabled)throw Error('Final display shader unavailable');
        if(e.settings.reduceMotion!==false||e.settings.reduceFlash!==false||e.settings.memory!==true)throw Error('Motion policy changed');
        return rendered;
      };
    });
    console.log('Motion renderer ready',arm,expectedPack.slice(0,12));
    for(const c of cases){
      const info=await page.evaluate(c=>window.productionLettering.configure({kind:c.kind,id:c.mesh,width:960,height:600}),c);
      let paths=poses.get(c.id);
      if(!paths){
        paths=await page.evaluate(c=>{
          const scene=window.productionLettering.currentScene(),anchor=scene.camera(c.distance,0);
          return['approach','lateral'].map(kind=>({kind,frames:Array.from({length:61},(_,i)=>{
            const t=i/60,distance=kind==='approach'?c.far+(c.near-c.far)*t:c.distance;
            const offset=kind==='lateral'?-c.lateral+2*c.lateral*t:0,point=scene.camera(distance,offset);
            return{index:i,distance,offset,timeSec:100+(kind==='lateral'?10:0)+i/30,
              camera:{x:point.x,y:anchor.y,z:point.z,yaw:anchor.yaw,pitch:anchor.pitch},
              validation:scene.validateCamera?scene.validateCamera(distance,offset):{notApplicable:true,reason:'Explicit asset inspection fixture'}};
          })}));
        },c);
        poses.set(c.id,paths);
      }
      const row={id:c.id,arm,info,overrideHashes,receivedPacks,packSha256:expectedPack,textureEstimate,sequences:[]};
      report.cases.push(row);save();
      for(const sequence of paths){
        const sequenceRow={kind:sequence.kind,heldAngles:{yaw:sequence.frames[0].camera.yaw,pitch:sequence.frames[0].camera.pitch},
          firstIndex:0,lastIndex:60,renderedFrames:61,savedFrames:[],frameEvidence:[],validations:sequence.frames.map(f=>({index:f.index,...f.validation}))};
        row.sequences.push(sequenceRow);
        await page.evaluate(first=>{
          const S=window.productionLettering;S.beginSequence();window.productionStepMs=1000/30;
          for(let i=0;i<30;i++)S.render({stage:'final',light:'torch',camera:first.camera,distance:first.distance,offset:first.offset,
            timeSec:first.timeSec-(30-i)/30,capture:false});
        },sequence.frames[0]);
        const videoFile=`${c.id}-${arm}-${sequence.kind}.webm`,videoPath=path.join(output,videoFile),encoder=losslessEncoder(videoPath);
        let encoded=false;
        try{
          for(const frame of sequence.frames){
            // Every native frame is read back for the video. The16 separate
            // PNG files remain sparse witnesses, not a substitute animation.
            const result=await page.evaluate(frame=>{
              const q=window.productionLettering.render({stage:'final',light:'torch',camera:frame.camera,distance:frame.distance,
                offset:frame.offset,timeSec:frame.timeSec,capture:true});
              return{png:q.frame.toDataURL('image/png'),evidence:q.evidence};
            },frame);
            assert.equal(result.evidence.history.explicitReset,false,'Per-frame history reset');
            assert.equal(result.evidence.history.lookSetterReset,false,'Per-frame look setter');
            assert.deepEqual(result.evidence.camera,frame.camera,'Saved pose diverged from paired baseline');
            sequenceRow.frameEvidence.push({index:frame.index,...compactEvidence(result.evidence,info.mesh)});
            const bytes=Buffer.from(result.png.split(',')[1],'base64');await encoder.write(bytes);
            if(frame.index%4===0){
              const file=`${c.id}-${arm}-${sequence.kind}-${String(frame.index).padStart(3,'0')}.png`;
              fs.writeFileSync(path.join(output,file),bytes);sequenceRow.savedFrames.push({index:frame.index,file,sha256:sha(bytes),bytes:bytes.length});
            }
          }
          assert.equal(sequenceRow.savedFrames.length,16);await encoder.finish();encoded=true;
          const proof=await verifyVideo(videoPath,sequenceRow.savedFrames),videoBytes=fs.readFileSync(videoPath);
          sequenceRow.video={file:videoFile,sha256:sha(videoBytes),bytes:videoBytes.length,frames:61,simulationHz:30,
            encoder:{executable:'/opt/homebrew/bin/ffmpeg',args:encoder.args,lossless:true,pixelFormat:'gbrp',threads:1},...proof,
            simulation:'All61 offline native frames at30Hz; identical paired poses/times and continuous temporal history; no achieved runtime-FPS claim'};
        }finally{await encoder.cleanup({remove:!encoded});}
        save();console.log('Saved verified video',arm,c.id,sequence.kind,videoFile);
      }
      const performance=await page.evaluate(async camera=>{
        const S=window.productionLettering,R=S.R,gl=R.r3dCanvas().getContext('webgl2');
        const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[],cpu=[],evidence=[];
        let disjoint=false;window.productionStepMs=1000/60;S.beginSequence();
        for(let i=0;i<10;i++){
          await new Promise(requestAnimationFrame);S.render({camera,stage:'final',light:'torch',timeSec:200+i/60,capture:false});
        }
        for(let i=0;i<30;i++){
          await new Promise(requestAnimationFrame);
          const query=ext?gl.createQuery():null;
          const q=S.render({camera,stage:'final',light:'torch',timeSec:201+i/60,capture:false,
            gpuQuery:query?{ext,query}:null});
          cpu.push(q.evidence.cpuSubmissionMs);evidence.push(q.evidence);
          if(query)queries.push(query);
          if(ext&&gl.getParameter(ext.GPU_DISJOINT_EXT))disjoint=true;
        }
        const deadline=window.productionWallNow()+2000;
        while(queries.some(query=>!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))&&window.productionWallNow()<deadline)
          await new Promise(resolve=>setTimeout(resolve,25));
        if(ext&&gl.getParameter(ext.GPU_DISJOINT_EXT))disjoint=true;
        const gpu=[],unavailable=[];
        for(let i=0;i<queries.length;i++){
          const query=queries[i];
          if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
            const milliseconds=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;
            if(!disjoint)gpu.push(milliseconds);
          }else unavailable.push(i);
          gl.deleteQuery(query);
        }
        return{cpu,gpu,queryCount:queries.length,unavailable,disjoint,gpuExtensionAvailable:!!ext,evidence,glError:gl.getError()};
      },paths[0].frames[30].camera);
      assert.equal(performance.glError,0);assert.equal(performance.cpu.length,30);
      assert.ok(performance.cpu.every(Number.isFinite));assert.ok(performance.gpu.every(Number.isFinite));
      assert.ok(performance.evidence.every(e=>!e.history.explicitReset&&!e.history.lookSetterReset));
      row.performance={...performance,evidence:performance.evidence.map(e=>compactEvidence(e,info.mesh)),
        cpuSummary:summary(performance.cpu),gpuSummary:summary(performance.gpu)};
      save();console.log('Timed',arm,c.id,JSON.stringify({cpu:row.performance.cpuSummary,gpu:row.performance.gpuSummary,
        disjoint:performance.disjoint,unavailable:performance.unavailable.length}));
    }
    await page.close();
  }
  report.sourceHashesAfter=hashes();report.changedSources=sourceFiles.filter(file=>report.sourceHashes[file]!==report.sourceHashesAfter[file]);
  report.inputHashesAfter=inputHashes();report.changedInputs=inputFiles.filter(file=>report.inputHashes[file]!==report.inputHashesAfter[file]);
  assert.deepEqual(report.errors,[],'Browser error during capture');
  assert.deepEqual(report.changedSources,[],'Shared source changed during movement capture');
  assert.deepEqual(report.changedInputs,[],'Captured package or baseline override changed during movement capture');
  report.complete=true;report.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({complete:true,cases:report.cases.length,
    sequences:report.cases.reduce((n,c)=>n+c.sequences.length,0),
    videos:report.cases.reduce((n,c)=>n+c.sequences.filter(s=>s.video?.allDecodedWitnessesExact).length,0),
    savedFrames:report.cases.reduce((n,c)=>n+c.sequences.reduce((m,s)=>m+s.savedFrames.length,0),0),report:reportPath}));
}catch(error){report.failure=error.stack;save();throw error;}
finally{await browser.close();}
