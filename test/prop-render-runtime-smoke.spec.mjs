import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',
  args:['--use-angle=metal','--no-sandbox'],
});
try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded',timeout:30000});
  const result=await page.evaluate(async()=>{
    document.open();document.write('<canvas id="c" width="320" height="180"></canvas>');document.close();
    const P=await import(`/src/render/props3d.js?smoke=${Date.now()}`);
    const canvas=document.querySelector('#c'),gl=canvas.getContext('webgl2',{antialias:false});
    P.props3dInit(gl);P.props3dResize(320,180,{shadowMapSize:512});
    await P.loadPropPack('/assets/conservatory-props.glb');
    P.setPropInstances([{id:'smoke-piano',mesh:'upright_piano',x:0,y:0,z:-3,yaw:0,scale:1,zone:6}]);
    P.renderPropPass({camX:0,camY:1.58,camZ:0,yaw:0,pitch:0,light:1,maxDistance:20,
      fogTexture:null,fogOrigin:[0,0],fogSize:1,cellMeters:.5,zoneTints:new Float32Array(17*3).fill(1),
      localLightCount:0,localLightPositions:new Float32Array(32),localLightColors:new Float32Array(32),
      torch:{power:1,color:[1,1,1],reach:1,coneInner:.7,coneOuter:.9,spill:.08},
      ambientColor:[1,1,1],ambientIntensity:.15,planTexture:null,planSize:[0,0],planOrigin:[0,0]});
    const target=P.propTargets(),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.color,0);
    const pixels=new Uint8Array(320*180*4);gl.readPixels(0,0,320,180,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let opaque=0,bright=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3])opaque++;if(pixels[i]+pixels[i+1]+pixels[i+2]>12)bright++;}
    return{opaque,bright,stats:P.propPackStats(),error:gl.getError()};
  });
  console.log(JSON.stringify(result));
  if(result.error!==0||result.opaque<100||result.bright<100)process.exitCode=1;
}finally{await browser.close();}
