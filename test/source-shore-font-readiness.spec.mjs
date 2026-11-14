import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceShoreBounds} from '../src/data/source-hanging-shore.js';
import {physicalPrintPixels} from '../src/render/physical-source-print.js';
import {WORLD_LETTERING_FONT_FILES,worldLetteringFontsStatus} from '../src/render/world-lettering-fonts.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
let sequence=0;
const fresh=()=>import(new URL(`../src/render/source-shore3d.js?font-readiness=${++sequence}`,import.meta.url));
function fakeGl(){
 let id=0,constant=0;const calls=[],values=new Map();let gl;
 gl=new Proxy({calls},{get(target,key){
  if(key in target)return target[key];
  if(/^[A-Z_0-9]+$/.test(String(key))){if(!values.has(key))values.set(key,++constant);return values.get(key);}
  if(key==='getShaderParameter'||key==='getProgramParameter')return()=>true;
  if(key==='checkFramebufferStatus')return()=>gl.FRAMEBUFFER_COMPLETE;
  if(key==='getUniformLocation')return(_program,name)=>name;
  if(key==='getVertexAttrib')return()=>false;
  if(key==='getParameter')return()=>0;
  if(String(key).startsWith('create'))return()=>({id:++id});
  return(...args)=>{calls.push([key,...(key==='texImage2D'?[args[3],args[4]]:[])]);};
 }});return gl;
}
function fontDocument(){
 const ink=[],faces=[];let canvases=0;
 const owner={baseURI:'http://127.0.0.1:5634/',fonts:{add(face){faces.push(face);}},createElement(name){
  assert.equal(name,'canvas');canvases++;
  const canvas={width:0,height:0},context={font:'13px',fillStyle:'',fillRect(){},clearRect(){},
   measureText(text){const size=Number.parseFloat(this.font)||13;return{width:text.length*size*.6,actualBoundingBoxLeft:0,actualBoundingBoxRight:text.length*size*.6,actualBoundingBoxAscent:size*.7,actualBoundingBoxDescent:size*.2};},
   fillText(text){ink.push({text,font:this.font});},getImageData(_x,_y,width,height){const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=214;data[i+1]=217;data[i+2]=208;data[i+3]=255;}return{data};}};
  canvas.getContext=()=>context;return canvas;
 }};
 return{owner,ink,faces,canvasCount:()=>canvases};
}
function globals(t,owner,Face){const document=globalThis.document,FontFace=globalThis.FontFace;globalThis.document=owner;globalThis.FontFace=Face;t.after(()=>{if(document===undefined)delete globalThis.document;else globalThis.document=document;if(FontFace===undefined)delete globalThis.FontFace;else globalThis.FontFace=FontFace;});}
const input=()=>({frame:{...sourceShoreBounds({x:22,y:-104}),active:true,outside:true,proper:false},camX:0,camY:1.62,camZ:-240,width:64,height:64});

test('a prepared shore renders geometry immediately and bakes exact physical glyphs only after shared fonts finish',async t=>{
 const gate=deferred(),document=fontDocument();let loads=0;
 class Face{constructor(family){this.family=family;}async load(){loads++;await gate.promise;return this;}}
 globals(t,document.owner,Face);const shore=await fresh(),gl=fakeGl();assert.equal(shore.sourceShoreInit(gl),true);
 const preparing=shore.sourceShorePrepareFonts();assert.equal(shore.sourceShorePrepareFonts(),preparing);assert.equal(loads,WORLD_LETTERING_FONT_FILES.length);
 assert.throws(()=>physicalPrintPixels({width:2,height:2,ground:'#fff',draw(){}}),/fonts must load/,'the physical-print invariant is still enforced');
 for(let i=0;i<3;i++){
  assert.equal(shore.sourceShoreDraw(input()),true,'font arrival cannot block shore geometry/support');
  assert.equal(shore.sourceShoreCodeDraw({...input(),bindCommon(){throw Error('glyph state must remain untouched while pending');}}),false);
 }
 assert.equal(document.canvasCount(),0,'material draws no longer eagerly bake their unused source texture');assert(gl.calls.some(call=>call[0]==='drawArrays'));
 assert.equal(shore.sourceShoreDebug().fontsPending,true);assert.equal(shore.sourceShoreDebug().printReady,false);
 gate.resolve();assert.equal(await preparing,true);assert.equal(worldLetteringFontsStatus(document.owner).ready,true);
 assert.equal(shore.sourceShoreCodeDraw({...input(),bindCommon(){}}),true);
 assert.equal(document.canvasCount(),2);assert(document.ink.length>=26);assert(document.ink.every(row=>row.font.includes('World Lettering Mono')));
 assert.equal(shore.sourceShoreDebug().fontsReady,true);assert.equal(shore.sourceShoreDebug().printReady,true);
 assert.equal(shore.sourceShoreCodeDraw({...input(),bindCommon(){}}),true);assert.equal(document.canvasCount(),2,'only the ready-font result is cached');
 assert.equal(loads,WORLD_LETTERING_FONT_FILES.length);assert.equal(shore.sourceShoreDebug().fontError,'');
});

test('an unavailable font reports one diagnostic and leaves physical shore rendering live without repeated bake failures',async t=>{
 const document=fontDocument();let loads=0,warnings=0;
 class Face{async load(){loads++;throw Error('fixture missing physical font');}}
 globals(t,document.owner,Face);const warn=console.warn;console.warn=()=>{warnings++;};t.after(()=>{console.warn=warn;});
 const shore=await fresh(),gl=fakeGl();shore.sourceShoreInit(gl);assert.equal(await shore.sourceShorePrepareFonts(),false);
 for(let i=0;i<3;i++){
  assert.equal(shore.sourceShoreDraw(input()),true);assert.equal(shore.sourceShoreCodeDraw({...input(),bindCommon(){}}),false);
  assert.equal(await shore.sourceShorePrepareFonts(),false);
 }
 assert.equal(document.canvasCount(),0);assert.equal(warnings,1);assert.equal(loads,WORLD_LETTERING_FONT_FILES.length);
 const status=shore.sourceShoreDebug();assert.equal(status.fontsReady,false);assert.equal(status.fontsPending,false);assert.equal(status.printReady,false);assert.match(status.fontError,/fixture missing physical font/);
});
