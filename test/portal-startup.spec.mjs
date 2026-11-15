import test from 'node:test';
import assert from 'node:assert/strict';
import {props3dInit} from '../src/render/props3d.js';

test('boot links the playable prop passes without starting the large portal preview shader',()=>{
  const sources=[];
  const gl=new Proxy({
    createShader:()=>({}),createProgram:()=>({}),createVertexArray:()=>({}),createBuffer:()=>({}),
    shaderSource:(_,source)=>sources.push(source),
    getExtension:()=>null,getShaderParameter:()=>true,getProgramParameter:()=>true,
    isProgram:()=>true,isContextLost:()=>false,
  },{get:(object,key)=>key in object?object[key]:String(key).toUpperCase()===key?String(key):()=>{}});
  props3dInit(gl);
  assert.ok(sources.length>=8,'main, shadow, pressure, and text passes still compile');
  assert.ok(!sources.some(source=>source.includes('elsewhereScene(')),
    'the optional portal shader must not enter the driver during boot, including drivers without parallel compilation');
});
