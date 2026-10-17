// Native Metal/VFD check for the three optional roof observations. This is a
// review fixture: it warps to nearby walkable roof cells, then uses the real
// reticle, prop focus and renderer. It does not grant quest progress.
import puppeteer from 'puppeteer-core';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

const url=process.env.ROOF_DRESSING_URL||'http://127.0.0.1:5360/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0';
const out=resolve(process.env.ROOF_DRESSING_OUT||'artifacts/roof-floor-design/live/dressing-native');
await mkdir(out,{recursive:true});
const hash=async()=>createHash('sha256').update(await readFile('public/assets/conservatory-props.glb')).digest('hex');
const before=await hash(),profile=await mkdtemp(join(tmpdir(),'roof-dressing-native-'));
const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:true,userDataDir:profile,protocolTimeout:120000,
  args:['--no-sandbox','--enable-webgl','--use-angle=metal','--autoplay-policy=no-user-gesture-required'],
});
const page=await browser.newPage();await page.setViewport({width:1120,height:700,deviceScaleFactor:1});
await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
const report={url,assetHashBefore:before,assetHashAfter:null,checks:[],captures:[],errors:[]};
let stage='boot';
page.on('pageerror',error=>report.errors.push({stage,type:'pageerror',message:String(error.stack||error)}));
page.on('console',message=>{
  const value=message.text();
  if(/shader.*error|GLSL.*error|ERROR: 0:|program.*link.*fail|GL_INVALID_OPERATION|WebGL: INVALID/i.test(value))
    report.errors.push({stage,type:'console',message:value});
});
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const state=()=>page.evaluate(()=>({
  pos:window.__probe?.pos?.(),floor:window.__probe?.floorH?.(),
  focus:window.__probe?.interactionFocus?.(),look:window.__probe?.lookAngles?.(),
  scene:window.__scenes?.top?.()?.id||null,sceneView:window.__scenes?.top?.()?.view?.()||null,
  props:window.__probe?.props?.(),display:window.__chunkSurferPixelMesh?.status?.(),
}));
async function look(x,y,pitch){
  await page.evaluate(({x,y,pitch})=>{
    const here=window.__probe.pos(),target={x:x*2+1,y:y*2+1};
    window.__probe.lookAtWorld(Math.atan2(target.x-here.x,-(target.y-here.y)),pitch);
  },{x,y,pitch});
  await sleep(250);
}
async function capture(name){
  stage=name;await sleep(500);const snapshot=await state(),file=join(out,`${name}.webp`);
  await page.screenshot({path:file,type:'webp',quality:88});
  report.captures.push({name,file,pos:snapshot.pos,floor:snapshot.floor,focus:snapshot.focus,
    scene:snapshot.scene,sceneView:snapshot.sceneView,
    look:snapshot.look,renderedIds:snapshot.props?.renderedIds,display:snapshot.display});
  return snapshot;
}
const subjects=[
  {id:'roof-school-bell',from:[195,275],focus:[195,274],pitch:-.06},
  {id:'roof-listening-vent',from:[210,292],focus:[210,291],pitch:-.18},
  {id:'roof-guarantor-marks',from:[211,279],focus:[212.2,278.2],pitch:-.22},
];
const only=process.env.ROOF_DRESSING_ONLY||'';
try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__probe?.testRun&&window.__scenes?.top?.()?.id,{timeout:60000});
  await page.evaluate(async()=>{
    await window.__probe.testRun();window.__probe.tutSkip();window.__probe.hush?.();
    window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','roof.access','academic.entered']);
    window.__probe.setTorch(true);
  });
  for(const item of subjects.filter(item=>!only||item.id===only)){
    await page.evaluate(([x,y])=>window.__probe.warpCell(x,y),item.from);
    const focus=process.env.ROOF_DRESSING_BELL_AIM_MESH==='1'&&item.id==='roof-school-bell'
      ?[194,273]:item.focus;
    await look(...focus,item.pitch);
    const focusShot=await capture(`${item.id}-focus`);
    check(`${item.id} focuses from roof walk`,focusShot.focus?.propId===item.id,
      {pos:focusShot.pos,focus:focusShot.focus?.propId||null});
    check(`${item.id} renders in native world`,focusShot.props?.renderedIds?.includes(item.id),
      {rendered:focusShot.props?.renderedIds?.includes(item.id)});
  }
  if(!only){
  // The bell's approach silhouette matters more than a reticle close-up.
  await page.evaluate(()=>window.__probe.warpCell(198,278));
  await look(194,273,.04);
  const bellMid=await capture('roof-school-bell-mid-distance');
  check('bell approach remains on roof',bellMid.floor===17,
    {floor:bellMid.floor,pos:bellMid.pos});
  await page.evaluate(()=>window.__probe.warpCell(213,285));
  await look(204,273,-.06);
  const arrival=await capture('roof-east-arrival');
  check('east arrival remains on roof',arrival.floor===17,{floor:arrival.floor,pos:arrival.pos});
  await page.evaluate(()=>window.__probe.warpCell(200,289));
  await look(200,287,0);
  const seatFocus=await state();
  check('supported glass sit remains focusable',seatFocus.focus?.propId==='roof-sit-west',
    {focus:seatFocus.focus?.propId||null});
  if(seatFocus.focus?.propId==='roof-sit-west'){
    await page.keyboard.press('e');
    await page.waitForFunction(()=>window.__scenes?.top?.()?.id==='academic-roof-sit'
      &&window.__scenes.top().view?.().phase==='seated',{timeout:10000});
    const seated=await capture('roof-supported-glass-seated');
    check('seated city view retained',seated.scene==='academic-roof-sit',seated.scene);
  }
  }
  report.assetHashAfter=await hash();
  check('GLB unchanged during capture',report.assetHashBefore===report.assetHashAfter,
    {before:report.assetHashBefore,after:report.assetHashAfter});
  check('no native page or shader errors',report.errors.length===0,report.errors);
}finally{
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();await rm(profile,{recursive:true,force:true});
}
if(report.checks.some(item=>!item.pass))process.exitCode=1;
