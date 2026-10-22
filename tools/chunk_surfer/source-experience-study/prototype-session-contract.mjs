// Shared read-only manifest, Vite interception and declared fixture contract.
// Importing this module never launches a browser or starts a server.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const sha=value=>createHash('sha256').update(value).digest('hex');
export const fixtureMainSearch="      drankCoffee:flagTest('drank.coffee'),hasRig:flagTest('has.interface'),marbleEyes:'returned',";
export const fixtureMainReplace="      drankCoffee:flagTest('drank.coffee'),hasRig:flagTest('has.interface'),marbleEyes:null,";
export const fixtureSetupFlags=Object.freeze(['bag.taken','setup.levels','setup.waypoint','combat.trained']);
export async function productionIdentity(){
  // A native snapshot is bound to every source and packaged asset, rather than
  // a handpicked module list that can miss newly introduced imports. This is
  // deliberately stricter than a visible-asset claim; future unrelated edits
  // invalidate the participant condition until the comparison is reviewed.
  const paths=['index.html','fireball-cast.html','source-desktop-surface.html','window-media.html','styles.css','vite.config.js','package.json','package-lock.json'];
  for(const root of ['src','public','assets','content','LEGAL']){
    const entries=await readdir(root,{recursive:true,withFileTypes:true});
    for(const entry of entries)if(entry.isFile())paths.push(`${entry.parentPath||entry.path}/${entry.name}`);
  }
  const relative=paths.map(path=>path.startsWith(process.cwd()+'/')?path.slice(process.cwd().length+1):path).sort();
  return Object.fromEntries(await Promise.all(relative.map(async path=>[path,sha(await readFile(path))])));
}
export function exactReplace(source,search,replacement,count=1){
  const actual=source.split(search).length-1;assert.equal(actual,count,`Exact replacement count ${actual} differs from ${count}`);return source.replace(search,replacement);
}
export async function loadExperiment(id){
  assert.ok(['guidance','bust','chapter'].includes(id));
  if(id==='chapter'){
    const guidance=await loadExperiment('guidance'),bust=await loadExperiment('bust');
    assert.equal(guidance.sourceSha,bust.sourceSha,'Chapter prototype manifests describe different production runtimes');
    const manifests=[{id:'guidance',path:guidance.path,sha256:guidance.manifestSha},{id:'bust',path:bust.path,sha256:bust.manifestSha}];
    const changes=[...guidance.changes,...bust.changes];let source=await readFile(guidance.sourcePath,'utf8');
    for(const change of changes)source=exactReplace(source,change.search,change.replace,change.expectedCount);
    return{id,path:manifests.map(manifest=>manifest.path),manifest:{id:'chapter-two-bounded-prototypes',manifests,patchedSourceSha256:sha(source)},
      sourcePath:guidance.sourcePath,sourceSha:guidance.sourceSha,changes,manifestSha:sha(JSON.stringify(manifests)),mainSha:guidance.mainSha};
  }
  const path=resolve(`artifacts/source-experience-study/prototypes/${id}/${id==='guidance'?'manifest.json':'patch-manifest.json'}`);
  const manifest=JSON.parse(await readFile(path,'utf8'));
  const sourcePath=id==='guidance'?manifest.requestInterception[0].source:resolve(manifest.sourcePath);
  const source=await readFile(sourcePath,'utf8'),sourceSha=id==='guidance'?manifest.requestInterception[0].sourceSha256:manifest.sourceSha256;
  assert.equal(sha(source),sourceSha,`${id} production source drift; review manifest before capture`);
  const changes=id==='guidance'?manifest.changes.map(change=>({search:change.anchor,replace:change.replacement,expectedCount:1})):manifest.replacements;
  let patched=source;for(const change of changes)patched=exactReplace(patched,change.search,change.replace,change.expectedCount);
  assert.equal(sha(patched),id==='guidance'?manifest.requestInterception[0].replacementSha256:manifest.patchedSourceSha256);
  const main=await readFile('src/main.js','utf8');if(id==='bust')exactReplace(main,fixtureMainSearch,fixtureMainReplace);
  return{id,path,manifest,sourcePath,sourceSha,changes,manifestSha:sha(await readFile(path)),mainSha:sha(main)};
}
export async function installPrototypeInterception(page,experiment,condition,report){
  assert.ok(['before','after'].includes(condition));report.interceptions||=[];report.errors||=[];
  await page.setRequestInterception(true);
  page.on('request',async request=>{
    const path=new URL(request.url()).pathname,runtime=path==='/src/game/source-space-runtime.js',mainFixture=experiment.id==='bust'&&path==='/src/main.js';
    if(!runtime&&!mainFixture){await request.continue();return;}
    try{
      const response=await fetch(request.url(),{headers:{accept:'*/*'},signal:AbortSignal.timeout(30000)});assert.equal(response.ok,true,`Vite response ${response.status}`);
      const source=await response.text();let patched=source;
      if(runtime&&condition==='after')for(const change of experiment.changes)patched=exactReplace(patched,change.search,change.replace,change.expectedCount);
      if(mainFixture)patched=exactReplace(patched,fixtureMainSearch,fixtureMainReplace);
      report.interceptions.push({url:request.url(),kind:mainFixture?'shared-eye-ineligible-fixture':'runtime-intervention',applied:mainFixture||condition==='after',
        sourceBytes:Buffer.byteLength(source),responseBytes:Buffer.byteLength(patched),beforeSha256:sha(source),afterSha256:sha(patched),exactReplacements:mainFixture?1:condition==='after'?experiment.changes.length:0});
      await request.respond({status:response.status,contentType:'text/javascript',headers:{'cache-control':'no-store'},body:patched});
    }catch(error){report.errors.push({type:'interception',path,text:String(error)});await request.abort('failed');}
  });
}
export async function preparePrototypeFixture(page,id){
  await page.evaluate(async experiment=>{
    await window.__probe.testRun();window.__probe.tutSkip();
    window.__probe.setFlags(['bag.taken','setup.levels','setup.waypoint','combat.trained']);
    if(experiment==='chapter'){
      window.__probe.sourceChapelReady();window.__probe.sourcePreset('hall-entry');window.__probe.lookAtWorld(0,0);
    }else if(experiment==='guidance'){
      window.__probe.sourcePreset('first-contact');const o=window.__probe.chunkSurf().landscapeOrigin;
      window.__probe.sourceWarp(o.x,o.y-532/.5,0);window.__probe.lookAtWorld(0,-.04);
    }else{
      await window.__probe.horizonPreset(168);const p=window.__probe,source=p.chunkSurf(),horizon=p.horizonFrame(),placement=p.bustReliquary().placement;
      p.sourceWarp(source.landscapeOrigin.x+placement.lateral,horizon.seamY-placement.depth+8,0);p.lookAtWorld(0,-.04);
    }
    await document.fonts.ready;
  },id);
}
export async function installEvidenceReader(page){
  await page.evaluate(()=>{
    window.__sourceExperienceEvidence=()=>{
      let saved=null,key=null;
      for(const candidate of ['chunk-surfer:save:v4','chunk-surfer:save:autosave:v1']){
        try{const raw=JSON.parse(localStorage.getItem(candidate)||'null'),value=raw?.data||raw;if(value?.chunkSurf){saved=value;key=candidate;break;}}catch{}
      }
      const probe=window.__probe.chunkSurf();
      return{source:{...(saved?.chunkSurf||{}),...probe},sourceEvidence:{liveProbeKeys:Object.keys(probe),persistedKey:key,persistedProfile:saved?.chunkSurf?.profile||null,
        persistedSeed:saved?.chunkSurf?.seed??null,persistedCheckpoint:saved?.chunkSurf?.checkpointId||null,liveOverridesPersisted:true},bust:window.__probe.bustReliquary?.()||null};
    };
  });
}
export function suppressClientHmr(){
  performance.setResourceTimingBufferSize(20000);const NativeSocket=window.WebSocket;
  class QuietHmrSocket extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;constructor(url){super();this.url=String(url);this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}}
  window.WebSocket=class extends NativeSocket{constructor(url,protocols){if(protocols==='vite-hmr')return new QuietHmrSocket(url);super(url,protocols);}};
}
