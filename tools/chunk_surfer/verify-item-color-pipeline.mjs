// Calibrated unlit swatches establish whether the existing item's raw output
// encodes display color once. No production renderer or asset is modified.
import puppeteer from 'puppeteer-core';
import {Document,NodeIO} from '@gltf-transform/core';
import {KHRMaterialsUnlit} from '@gltf-transform/extensions';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.GAME_URL||'http://127.0.0.1:5297',io=new NodeIO().registerExtensions([KHRMaterialsUnlit]);
const values=[16,32,48,96,160],buffers=new Map();
for(const value of values){
 const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene(),unlit=doc.createExtension(KHRMaterialsUnlit),color=new THREE.Color(`rgb(${value},${value},${value})`);
 const mat=doc.createMaterial().setBaseColorFactor([color.r,color.g,color.b,1]).setExtension('KHR_materials_unlit',unlit.createUnlit());
 const geometry=new THREE.PlaneGeometry(2,2),primitive=doc.createPrimitive().setMaterial(mat);
 for(const[key,semantic,type]of[['position','POSITION','VEC3'],['normal','NORMAL','VEC3']])primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(new Float32Array(geometry.attributes[key].array)).setBuffer(buffer));
 primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(geometry.index.array)).setBuffer(buffer));scene.addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
 buffers.set(`/calibration-${value}.glb`,Buffer.from(await io.writeBinary(doc)));
}
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
try{
 const page=await browser.newPage();await page.setViewport({width:512,height:384});await page.setRequestInterception(true);
 page.on('request',request=>{const body=buffers.get(new URL(request.url()).pathname);body?request.respond({status:200,contentType:'model/gltf-binary',body}):request.continue();});
 await page.goto(`${base}/src/render/vendor/ascii-object/renderer.js`);await page.setContent('<base href="/"><style>body{margin:0}canvas{width:512px;height:384px}</style><canvas></canvas>');
 await page.evaluate(async()=>{const {createAsciiObject}=await import('/src/render/vendor/ascii-object/renderer.js');window.__calibration=createAsciiObject({canvas:document.querySelector('canvas')},{manual:true,ascii:false,background:'#000000',scale:3,fov:35,cameraDistance:6,floatIntensity:0,rotationIntensity:0,orbit:false});});
 const results=[];
 for(const value of values){
  const rgb=await page.evaluate(async value=>{
   await new Promise((resolve,reject)=>window.__calibration.setOptions({src:`/calibration-${value}.glb`,onLoad:resolve,onError:reject}));
   window.__calibration.resetView();window.__calibration.renderFrame();
   const canvas=document.querySelector('canvas'),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
   return[...ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data].slice(0,3);
  },value);results.push({input:value,output:rgb});
 }
 console.log(JSON.stringify(results));await mkdir('artifacts/van-kit-models',{recursive:true});await writeFile('artifacts/van-kit-models/color-pipeline.json',JSON.stringify(results,null,2));
 assert.ok(results.every(({input,output})=>output.every(channel=>Math.abs(channel-input)<=2)),'raw GLB output must preserve calibrated unlit display values within rounding');
}finally{await browser.close();}
