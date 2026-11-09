import test from 'node:test';
import assert from 'node:assert/strict';
test('the real renderer reaches its capability check with shared bindings in scope',async()=>{
 const previous=globalThis.document;let inserted=null;const canvas={style:{},dataset:{},getContext:()=>null};
 globalThis.document={baseURI:'http://127.0.0.1/',createElement:()=>canvas,addEventListener(){},removeEventListener(){}};
 try{const renderer=await import('../src/render/r3d.js');assert.throws(()=>renderer.r3dInit({firstChild:null,insertBefore(node){inserted=node;}}),/webgl2 unavailable/);assert.equal(inserted,canvas);assert.equal(canvas.className,'r3d');}
 finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
