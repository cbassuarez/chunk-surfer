import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',
  args:['--use-angle=metal','--no-sandbox'],
});

try{
  const page=await browser.newPage();
  await page.setViewport({width:640,height:360,deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  const result=await page.evaluate(async()=>{
    document.open();
    document.write('<div id="map" style="position:fixed;inset:0;width:640px;height:360px"></div>');
    document.close();
    const R=await import(`/src/render/r3d.js?compositeSmoke=${Date.now()}`);
    const map=document.querySelector('#map');
    R.r3dInit(map);
    R.r3dSetFacing(0);
    const deadline=performance.now()+15000;
    while((R.r3dPropStats()?.meshes||0)<100&&performance.now()<deadline){
      await new Promise((resolve)=>setTimeout(resolve,50));
    }
    const baseState={
      px:20,py:20,floorH:0,tileW:12,tileH:12,worldCount:0,
      worldTints:[[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]],
      chunks:[],key:null,door:null,hush:null,audio:0,light:1,plan:false,
      water:{active:false},sensoryProfile:'story',
    };
    const capture=()=>{
      R.r3dFrame(baseState);
      const canvas=R.r3dCaptureSceneCanvas(256),ctx=canvas.getContext('2d');
      return ctx.getImageData(0,0,256,256).data;
    };
    R.r3dSetProps([]);
    const without=capture();
    R.r3dSetProps([{id:'composite-piano',mesh:'upright_piano',x:10.25,y:0,z:7.25,yaw:0,scale:1,zone:6}]);
    const withProp=capture();
    let changed=0,brighter=0,darker=0,maxDelta=0;
    for(let i=0;i<withProp.length;i+=4){
      const delta=Math.abs(withProp[i]-without[i])+Math.abs(withProp[i+1]-without[i+1])+Math.abs(withProp[i+2]-without[i+2]);
      if(delta>6)changed+=1;
      const signed=(withProp[i]+withProp[i+1]+withProp[i+2])-(without[i]+without[i+1]+without[i+2]);
      if(signed>6)brighter+=1;
      if(signed<-6)darker+=1;
      maxDelta=Math.max(maxDelta,delta);
    }
    return{changed,brighter,darker,maxDelta,stats:R.r3dPropStats()};
  });
  console.log(JSON.stringify(result));
  if(result.changed<100||result.maxDelta<20)process.exitCode=1;
}finally{
  await browser.close();
}
