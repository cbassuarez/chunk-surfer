import assert from 'node:assert/strict';

// Extract one complete real function without accidentally including adjacent
// exports as a source file grows. Geometry tests still execute its actual body.
export function productionFunction(source,name){
  const begin=source.indexOf(`function ${name}(`);
  assert.ok(begin>=0,`missing production function ${name}`);
  let i=source.indexOf('{',begin),depth=0,quote=null,line=false,block=false,escape=false;
  for(;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
    if(c==='/'&&next==='/'){line=true;i++;continue;}
    if(c==='/'&&next==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(begin,i+1);
  }
  throw Error(`unclosed production function ${name}`);
}
