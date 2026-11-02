import assert from 'node:assert/strict';

export function primitiveMaterialRoleBinding(source,uniform){
 const call=source.match(new RegExp("setMaterialScalar\\('"+uniform+"',([^;]+)\\);"));
 assert.ok(call,'actual scalar binding missing: '+uniform);
 const loop=source.indexOf('for(const p of m.primitives){'),draw=source.indexOf('gl.drawElementsInstanced',loop);
 assert.ok(loop>=0&&call.index>loop&&call.index<draw,uniform+' must be evaluated for each primitive before its draw');
 return{call:call[0],expression:call[1]};
}

// Exercise the production pass-local cache and production binding together.
// Verify effective state at each draw, including when a duplicate upload is
// correctly skipped, rather than demanding an obsolete raw uniform call.
export function tracePrimitiveMaterialRole(source,uniform,draws,{initial=1}={}){
 const binding=primitiveMaterialRoleBinding(source,uniform),start=source.indexOf('const materialScalars = new Map();'),
  end=source.indexOf('// The atlas and morph bindings use different units',start);
 assert.ok(start>=0&&end>start,'actual pass-local material cache must be available');
 const state=new Map([[uniform,initial]]),writes=[],gl={uniform1f(name,value){state.set(name,value);writes.push([name,value]);}},U=name=>name;
 const run=new Function('gl','U','draws','read',source.slice(start,end)+
  '\nreturn draws.map(({name,p})=>{'+binding.call+'return read();});');
 return{values:run(gl,U,draws,()=>state.get(uniform)),writes};
}
