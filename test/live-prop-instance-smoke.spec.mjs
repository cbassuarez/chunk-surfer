import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',
  args:['--use-angle=metal','--no-sandbox'],
});
try{
  const page=await browser.newPage();
  const errors=[];
  page.on('console',(message)=>{
    if(message.type()==='error'||message.type()==='warning')errors.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror',(error)=>errors.push(`pageerror: ${error.message}`));
  await page.goto('http://127.0.0.1:5173/?renderer=3d&mode=story&at=105,117&skiptut=1&nomic=1&nothink=1',{
    waitUntil:'domcontentloaded',timeout:30000,
  });
  await page.waitForFunction(()=>window.__probe?.props?.().pack?.meshes>100,{timeout:30000});
  const result=await page.evaluate(()=>{
    const props=window.__probe.props();
    return{
      pos:window.__probe.pos(),
      plan:window.__probe.plan(),
      stairAnomaly:window.__probe.stairAnomaly(),
      pack:props.pack,
      authored:props.instances.length,
      practice:props.instances.filter((entry)=>entry.id.startsWith('practice-')).length,
      groupCounts:Object.fromEntries(Object.entries(Object.groupBy(props.instances,(entry)=>entry.renderGroup||'')).map(([key,list])=>[key,list.length])),
      practiceSample:props.instances.filter((entry)=>entry.id.startsWith('practice-')).slice(0,3),
      renderedIds:props.renderedIds,
    };
  });
  console.log(JSON.stringify({...result,errors}));
  if(result.pack.instances<1||result.practice<1||errors.some((entry)=>entry.includes('prop pack unavailable')))process.exitCode=1;
}finally{
  await browser.close();
}
