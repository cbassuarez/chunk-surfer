import puppeteer from 'puppeteer-core';
const OUT='/private/tmp/claude-501/-Users-seb-chunk-surfer/ead38971-e264-4071-a5a1-44d1c54907cb/scratchpad';
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new', args:['--use-angle=metal'] });
const p = await b.newPage(); await p.setViewport({width:1280,height:820,deviceScaleFactor:2});
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,200)));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
await p.goto('http://localhost:5199/', {waitUntil:'networkidle0', timeout:60000});
await new Promise(r=>setTimeout(r,6000));
await p.screenshot({path:`${OUT}/proto-fork.png`});
console.log(errs.length?('errors:\n'+[...new Set(errs)].slice(0,5).join('\n')):'no errors');
await b.close();
