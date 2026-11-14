// A bounded, muted check of the real boot host. The arrival and departure
// cases delay delivery of a real rendered frame to the startup guard.
import {cp,mkdir,mkdtemp,readFile,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';

const root=process.cwd(),out=resolve(process.env.STARTUP_VAN_OUT||'artifacts/van-icon-implementation/startup');
const profile=await mkdtemp(join(tmpdir(),'chunk-startup-van-'));
const frozen=await mkdtemp(join(tmpdir(),'chunk-startup-van-source-'));
const widget=JSON.parse(await readFile(resolve('public/app-icon/van-startup.json'),'utf8'));
const scenarios=process.env.STARTUP_VAN_SCENARIOS?.split(',')||[
  'held-main','warm-cached','ready-on-arrival','ready-on-departure','held-video','missing-video','transient-main','reduced-motion',
];
const port=Number(process.env.STARTUP_VAN_PORT||5641);
const report={passed:false,widget:{encodedVideoBytes:widget.bytes.video,posterBytes:widget.bytes.poster,frameCount:widget.frameCount,cellSize:widget.cellSize},silence:{browserMuted:true,microphoneDisabled:true},
  scope:'Real browser boot, loop continuity, physical departure on readiness and optional-media failure paths. The two timed cases hold delivery of the rendered first-frame receipt.',scenarios:[]};
let server,browser;
async function state(page){return page.evaluate(()=>({at:performance.now(),van:window.__chunkStartupVan?.status(),guard:window.__chunkStartup?.status(),
  hidden:document.querySelector('#startupRecovery').hidden,pointerEvents:getComputedStyle(document.querySelector('#startupRecovery')).pointerEvents,
  display:getComputedStyle(document.querySelector('#startupRecovery')).display,opacity:Number(getComputedStyle(document.querySelector('#startupRecovery')).opacity),
  vanWidth:document.querySelector('#startupVan').getBoundingClientRect().width,scene:window.__scenes?.top()?.id}));}
try{
  await mkdir(out,{recursive:true});
  // Other chats share this working tree. Capture a self-consistent source
  // revision instead of invalidating a successful UI run when unrelated main
  // code changes halfway through it. Generated/public assets are frozen by
  // their owner for this verification window.
  for(const name of['src','content','LEGAL','index.html','package.json'])await cp(join(root,name),join(frozen,name),{recursive:true});
  for(const name of['assets','public','node_modules'])await symlink(join(root,name),join(frozen,name),'dir');
  report.sourceHashes={};for(const file of['index.html','public/startup-guard.js','public/startup-van.js','src/main.js','src/audio/startup-van.js'])
    report.sourceHashes[file]=createHash('sha256').update(await readFile(join(frozen,file))).digest('hex');
  server=await createServer({root:frozen,configFile:false,base:'./',cacheDir:join(profile,'vite'),
    define:{__APP_VERSION__:JSON.stringify(JSON.parse(await readFile('package.json','utf8')).version),__LOCAL_TEXT_REVIEW__:true},
    optimizeDeps:{noDiscovery:true,include:['three','three/addons/loaders/GLTFLoader.js',
      'three/addons/environments/RoomEnvironment.js','three/addons/geometries/RoundedBoxGeometry.js',
      'three/addons/utils/SkeletonUtils.js','three/addons/utils/BufferGeometryUtils.js',
      '@tauri-apps/api/core','@tauri-apps/api/event','@tauri-apps/api/path','@tauri-apps/api/webviewWindow','@tauri-apps/api/window',
      '@tauri-apps/plugin-fs','@tauri-apps/plugin-log','@tauri-apps/plugin-opener']},
    server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null,fs:{allow:[root,frozen,await realpath(root),await realpath(frozen)]}}});
  await server.listen();
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:profile,protocolTimeout:120000,
    args:['--mute-audio','--use-angle=metal','--autoplay-policy=no-user-gesture-required','--no-first-run','--no-default-browser-check']});
  for(const id of scenarios){
    const page=await browser.newPage(),result={id,passed:false,pageErrors:[],consoleErrors:[],audio:[]};report.scenarios.push(result);
    try{
      await page.setViewport({width:1100,height:780,deviceScaleFactor:1});
      if(id==='reduced-motion')await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      page.on('pageerror',e=>result.pageErrors.push(String(e.stack||e)));
      page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});
      await page.evaluateOnNewDocument((readyStage)=>{
        let client,guard,observing=false,releaseFrame,delivered=false;
        window.__startupAudioTrace=[];window.__startupTrace=[];window.__startupVideoFrames=[];window.__startupDeparture=[];
        function record(kind,extra){
          const surface=document.querySelector('#startupRecovery');
          const style=surface?getComputedStyle(surface):null;
          window.__startupTrace.push({kind,at:performance.now(),guard:guard?.status(),van:client?.status(),
            hidden:surface?.hidden,pointerEvents:style?.pointerEvents,display:style?.display,opacity:style?Number(style.opacity):null,...extra});
        }
        function observeSurface(){
          const surface=document.querySelector('#startupRecovery');if(observing||!surface)return;observing=true;
          new MutationObserver(()=>record('surface')).observe(surface,{attributes:true,attributeFilter:['hidden','data-phase','aria-hidden']});
          const video=document.querySelector('#startupVanVideo');
          const poster=document.querySelector('#startupVanPoster');
          function trackDeparture(now){
            if(guard?.status()!=='ready'||!surface.hidden){
              requestAnimationFrame(trackDeparture);
              if(guard?.status()==='ready'){
                const artwork=video.hidden?poster:video;
                window.__startupDeparture.push({at:now,time:video.currentTime,x:artwork.getBoundingClientRect().left,
                  opacity:Number(getComputedStyle(artwork).opacity),phase:client?.status().phase});
              }
            }
          }
          requestAnimationFrame(trackDeparture);
          if(!video?.requestVideoFrameCallback)return;
          const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
          const context=canvas.getContext('2d',{willReadFrequently:true});
          function sample(_,frame){
            if(client?.status().complete)return;
            if(!video.hidden){
              context.drawImage(video,0,0,128,128);
              const pixels=context.getImageData(0,0,128,128).data;
              let silhouettePixels=0,totalX=0;
              for(let p=0;p<pixels.length;p+=4){
                if(pixels[p]+pixels[p+1]+pixels[p+2]<360)continue;
                silhouettePixels++;totalX+=(p/4)%128;
              }
              window.__startupVideoFrames.push({at:performance.now(),ready:guard?.status()==='ready',
                time:frame.mediaTime,frames:frame.presentedFrames,silhouettePixels,
                centerX:silhouettePixels?totalX/silhouettePixels:null,
              });
              const visualStage=frame.mediaTime>=.55&&frame.mediaTime<.95?'arrival':frame.mediaTime>=1.55&&frame.mediaTime<2.18?'departure':null;
              if(releaseFrame&&!delivered&&visualStage===readyStage&&silhouettePixels>500){
                record('delivered-frame',{visualStage,mediaTime:frame.mediaTime});
                delivered=true;releaseFrame();releaseFrame=null;
              }
            }
            video.requestVideoFrameCallback(sample);
          }
          video.requestVideoFrameCallback(sample);
        }
        // Wrap calls only to record their actual timestamps and returned state.
        // No callback invokes a readiness or presentation method independently.
        Object.defineProperty(window,'__chunkStartupVan',{configurable:true,get:()=>client,set:value=>{
          client=value;
          for(const name of['reveal','finish']){const original=value[name];value[name]=function(...args){record('van-'+name+'-before',{reason:args[0]});const returned=original.apply(value,args);record('van-'+name+'-after',{reason:args[0]});return returned;};}
          const set=value.setAudio;value.setAudio=handler=>set.call(value,event=>{
            const routed=handler(event);
            if(event.type!=='tick'||window.__startupAudioTrace.length<8)
              window.__startupAudioTrace.push({type:event.type,stage:event.stage,elapsed:event.elapsed,progress:event.progress,reason:event.reason,routed});
            return routed;
          });
          record('van-installed');observeSurface();
        }});
        Object.defineProperty(window,'__chunkStartup',{configurable:true,get:()=>guard,set:value=>{
          guard={};
          for(const [name,original]of Object.entries(value))guard[name]=typeof original!=='function'?original:name==='status'?original.bind(value):function(...args){
            const invoke=()=>{
              record('guard-'+name+'-before');const before=value.status(),returned=original.apply(value,args);record('guard-'+name+'-after');
              if(before!=='ready'&&value.status()==='ready')record('guard-ready',{enteredBy:name});return returned;
            };
            if(name==='frame'&&readyStage&&!delivered){releaseFrame=invoke;return false;}
            return invoke();
          };
          Object.freeze(guard);record('guard-installed');observeSurface();
        }});
      },id==='ready-on-arrival'?'arrival':id==='ready-on-departure'?'departure':null);
      let heldMain=null,heldVideo=null,mainFailures=0;result.widgetRequests=[];
      await page.setRequestInterception(true);
      page.on('request',request=>{
        const path=new URL(request.url()).pathname;
        if(path.startsWith('/app-icon/')){result.widgetRequests.push(path);assert.ok(!/van-launch|\/van\.png/.test(path),'native artwork is never requested by startup');}
        if(id==='missing-video'&&path==='/app-icon/van-startup.mp4')return request.abort();
        if(id==='held-video'&&path==='/app-icon/van-startup.mp4'){heldVideo=request;return;}
        if(id==='transient-main'&&path==='/src/main.js'&&mainFailures++===0)return request.abort();
        if(['held-main','held-video','missing-video'].includes(id)&&path==='/src/main.js'){heldMain=request;return;}
        request.continue();
      });
      // Attach the catch immediately because a held module delays DOMContentLoaded.
      const navigation=page.goto(`http://127.0.0.1:${port}/?mode=story&nomic=1&sam=0`,{waitUntil:'domcontentloaded',timeout:120000});
      navigation.catch(()=>{});
      if(id==='missing-video'){
        await page.waitForFunction(()=>window.__chunkStartupVan?.status().complete,{timeout:30000});
        result.artFailure=await state(page);
        assert.match(result.artFailure.van.error,/video unavailable|Failed to fetch/);
        assert.equal(result.artFailure.guard,'starting');
        assert.ok(heldMain);await heldMain.continue();heldMain=null;
      }
      if(id==='held-video'){
        await page.waitForFunction(()=>document.querySelector('#startupVanPoster:not([hidden])[data-repeating]'),{timeout:5000});
        result.loadingFallback=await page.evaluate(async()=>{
          const poster=document.querySelector('#startupVanPoster'),from=poster.getBoundingClientRect().left;
          await new Promise(resolve=>setTimeout(resolve,150));
          return {running:poster.getAnimations().some(animation=>animation.playState==='running'),
            distance:Math.abs(poster.getBoundingClientRect().left-from)};
        });
        assert.ok(result.loadingFallback.running&&result.loadingFallback.distance>10,'fallback van keeps moving while video is held');
        assert.ok(heldVideo);
        assert.ok(heldMain);await heldMain.continue();heldMain=null;
      }
      if(id==='held-main'){
        await page.waitForFunction(()=>{
          const frames=window.__startupVideoFrames;
          const wraps=frames.filter((frame,index)=>index>0&&frame.time<frames[index-1].time-1);
          return wraps.length>=2&&frames.at(-1).silhouettePixels>500;
        },{timeout:30000});
        result.beforeMain=await state(page);
        result.decodedFrames=await page.evaluate(()=>window.__startupVideoFrames);
        const passes=[[]],gapLimitMs=650;
        for(const frame of result.decodedFrames){
          const previous=passes.at(-1).at(-1);
          if(previous&&frame.time<previous.time-1){
            assert.ok(frame.at-previous.at<gapLimitMs,`loader stopped at its loop boundary for ${frame.at-previous.at} ms`);
            passes.push([]);
          }
          passes.at(-1).push(frame);
        }
        for(const pass of passes.slice(0,2)){
          const body=pass.filter(frame=>frame.silhouettePixels>500);
          assert.ok(body[0]?.centerX>75,'van enters from the right on every cycle');
          assert.ok(body.at(-1)?.centerX<58,'van drives towards the left on every cycle');
          assert.ok(pass.at(-1).silhouettePixels<200,'van clears the frame before the next entry');
        }
        result.loopGapsMs=passes.slice(1,3).map((pass,index)=>{
          const previous=passes[index].findLast(frame=>frame.silhouettePixels>24);
          const next=pass.find(frame=>frame.silhouettePixels>24);
          return next.at-previous.at;
        });
        for(const gap of result.loopGapsMs)assert.ok(gap<gapLimitMs,`van stayed offscreen between passes for ${gap} ms`);
        assert.ok(passes[2].some(frame=>frame.silhouettePixels>500&&frame.centerX>75),'third approach enters from the right');
        assert.ok(heldMain,'the main module is still intercepted');
        assert.equal(result.beforeMain.guard,'starting');assert.equal(result.beforeMain.van.phase,'playing');
        assert.ok(result.beforeMain.van.elapsed>.15,'animation advances before the main module can execute');
        assert.ok(result.beforeMain.vanWidth>0&&result.beforeMain.vanWidth<=160,'compact van fits within160 CSS pixels');
        assert.equal(result.beforeMain.hidden,false);assert.equal(result.beforeMain.scene,undefined);
        await page.screenshot({path:join(out,'loading-before-main.png')});
        result.mainReleasedAt=await page.evaluate(()=>performance.now());
        await heldMain.continue();heldMain=null;
      }
      await navigation;
      {
        await page.waitForFunction(()=>window.__chunkStartup?.status()==='ready',{timeout:90000});
        await page.waitForFunction(()=>document.querySelector('#startupRecovery').hidden,{timeout:4500});
        result.end=await state(page);
        result.trace=await page.evaluate(()=>window.__startupTrace);
        result.audio=await page.evaluate(()=>window.__startupAudioTrace);
        const reveal=result.trace.find(e=>e.kind==='van-reveal-after'&&e.guard==='ready');
        const beforeReveal=result.trace.find(e=>e.kind==='van-reveal-before'&&e.guard==='ready');
        const ready=result.trace.find(e=>e.kind==='guard-ready');
        const hidden=result.trace.find(e=>e.kind==='surface'&&e.guard==='ready'&&e.hidden);
        assert.ok(ready&&reveal&&beforeReveal,'real guard readiness calls the client reveal');
        assert.equal(reveal.pointerEvents,'none','overlay releases input in the readiness call');
        assert.ok(['departing','revealed','finished'].includes(reveal.van.phase));
        assert.ok(hidden,'departure retires the loading overlay');
        const frame=result.trace.filter(e=>e.kind==='guard-frame-before'&&e.at<=reveal.at).at(-1);
        const boot=result.trace.filter(e=>e.kind==='guard-booted-before'&&e.at<=reveal.at).at(-1);
        result.handoff={elapsedAtReady:reveal.van.elapsed,phaseBeforeReveal:beforeReveal.van.phase,phaseAfterReveal:reveal.van.phase,
          frameToRevealGapMs:frame?reveal.at-frame.at:null,bootedToRevealGapMs:boot?reveal.at-boot.at:null,
          revealToHiddenMs:hidden.at-reveal.at,readyToInputReleaseMs:0};
        if(id.startsWith('ready-on-')){
          result.departure=await page.evaluate(()=>window.__startupDeparture);
          const visible=result.departure.filter(sample=>sample.phase==='departing');
          assert.ok(visible.length>2,'van is still visible as it departs');
          assert.ok(visible.every(sample=>sample.opacity>.99),'van departs at full opacity');
          const translated=visible[0].x-visible.at(-1).x>50;
          const movie=await page.evaluate(()=>window.__startupVideoFrames.filter(frame=>frame.ready));
          assert.ok(translated||movie.some(frame=>frame.centerX<56&&frame.silhouettePixels>250),'departure moves the silhouette left');
          assert.ok(translated||movie.every((frame,i)=>!i||frame.time>=movie[i-1].time),'departure does not restart the movie');
          assert.equal(result.trace.find(e=>e.kind==='delivered-frame')?.visualStage,
            id==='ready-on-arrival'?'arrival':'departure');
          assert.equal(reveal.van.phase,'departing');
        }
        assert.ok(result.end.hidden);assert.ok(result.end.van.complete);assert.ok(result.end.scene);
        if(id==='warm-cached'){
          assert.ok(['loading','playing','finished'].includes(beforeReveal.van.phase),'the game does not wait for the optional artwork');
          await page.screenshot({path:join(out,'warm-restored-startup-agency.png')});
        }
        if(id==='missing-video')assert.match(result.end.van.error,/video unavailable|Failed to fetch/);
        if(id==='reduced-motion'){
          assert.equal(result.end.van.reduced,true);assert.equal(result.end.van.elapsed,0);
          assert.ok(!result.audio.some(e=>e.type==='start'||e.type==='tick'),'Reduced Motion never schedules engine motion');
          assert.ok(!result.widgetRequests.includes('/app-icon/van-startup.mp4'),'Reduced Motion never requests the video');
        }
        if(id==='transient-main'){
          assert.equal(mainFailures,2,'one failed entry request recovers with exactly one reload');
          assert.equal(await page.evaluate(()=>document.body.textContent.includes('could not finish opening')),false);
          result.quietRecovery={failedEntryRequests:1,reloads:1};
        }else assert.equal(result.pageErrors.length,0,result.pageErrors.join('\n'));
        assert.ok(!result.consoleErrors.some(e=>/boot failed|LOOP FAULT/.test(e)),result.consoleErrors.join('\n'));
      }
      // Audio is opportunistic through the existing bus. Its attachment can be
      // later than readiness; neither a start nor an audible brake is required.
      result.passed=true;
    }catch(error){result.error=String(error.stack||error);try{result.failureState=await page.evaluate(()=>({url:location.href,guard:window.__chunkStartup?.diagnostics?.(),van:window.__chunkStartupVan?.status(),scene:window.__scenes?.top()?.id}));}catch{}}
    finally{await page.close();}
  }
  for(const [file,expected]of Object.entries(report.sourceHashes))assert.equal(createHash('sha256').update(await readFile(join(frozen,file))).digest('hex'),expected,`snapshot changed during the capture: ${file}`);
  report.passed=report.scenarios.every(scenario=>scenario.passed);
  if(!report.passed)process.exitCode=1;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{
  await browser?.close();await server?.close();await rm(profile,{recursive:true,force:true});await rm(frozen,{recursive:true,force:true});
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,scenarios:report.scenarios.map(s=>({id:s.id,passed:s.passed,handoff:s.handoff,error:s.error})),out}));
}
