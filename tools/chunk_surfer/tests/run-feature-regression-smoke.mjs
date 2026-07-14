#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const viteEntry=path.join(root,'node_modules','vite','bin','vite.js');
const mockEntry=path.join(root,'tools','chunk_surfer','tests','mock-lens-service.mjs');
const smokeEntry=path.join(root,'tools','chunk_surfer','tests','feature-regression-smoke.mjs');

function reservePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.unref();
    server.once('error',reject);
    server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{
      const address=server.address();
      server.close(()=>resolve(address.port));
    });
  });
}

function chromeCandidates(){
  if(process.env.CHROME_PATH)return [process.env.CHROME_PATH];
  if(process.platform==='darwin')return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  if(process.platform==='win32')return [
    path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Google','Chrome','Application','chrome.exe'),
    path.join(process.env.LOCALAPPDATA||'', 'Google','Chrome','Application','chrome.exe'),
  ];
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

const chrome=chromeCandidates().find((candidate)=>candidate&&existsSync(candidate));
if(!chrome){
  throw new Error(`Chrome executable not found for ${process.platform}; set CHROME_PATH explicitly`);
}
if(!existsSync(viteEntry))throw new Error('Vite is missing; run npm ci first');

const children=[];
let stopping=false;

function launch(label,args,options={}){
  const child=spawn(process.execPath,args,{
    cwd:root,
    env:{...process.env,...options.env},
    stdio:options.inherit?'inherit':['ignore','pipe','pipe'],
  });
  children.push(child);
  if(!options.inherit){
    child.stdout.on('data',(chunk)=>process.stdout.write(`[${label}] ${chunk}`));
    child.stderr.on('data',(chunk)=>process.stderr.write(`[${label}] ${chunk}`));
  }
  child.on('error',(error)=>process.stderr.write(`[${label}] ${error.message}\n`));
  return child;
}

async function waitForHttp(url,child,timeoutMs=30000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`Vite exited before ${url} became ready`);
    try{
      const response=await fetch(url);
      if(response.ok)return;
    }catch{}
    await new Promise((resolve)=>setTimeout(resolve,200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForOutput(child,pattern,timeoutMs=30000){
  return new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>finish(new Error(`Timed out waiting for ${pattern}`)),timeoutMs);
    const onData=(chunk)=>{
      output+=chunk.toString();
      if(pattern.test(output))finish();
    };
    const onExit=()=>finish(new Error('Mock lens exited before becoming ready'));
    function finish(error){
      clearTimeout(timer);
      child.stdout.off('data',onData);
      child.off('exit',onExit);
      error?reject(error):resolve();
    }
    child.stdout.on('data',onData);
    child.once('exit',onExit);
  });
}

function waitForExit(child){
  return new Promise((resolve,reject)=>{
    child.once('error',reject);
    child.once('exit',(code,signal)=>{
      code===0?resolve():reject(new Error(`Visual smoke exited with ${signal||code}`));
    });
  });
}

async function stopChildren(){
  if(stopping)return;
  stopping=true;
  for(const child of children){
    if(child.exitCode===null&&!child.killed)child.kill('SIGTERM');
  }
  await Promise.all(children.map((child)=>new Promise((resolve)=>{
    if(child.exitCode!==null)return resolve();
    const timer=setTimeout(resolve,3000);
    child.once('exit',()=>{clearTimeout(timer);resolve();});
  })));
}

for(const signal of ['SIGINT','SIGTERM','SIGHUP']){
  process.on(signal,()=>{stopChildren().finally(()=>process.exit(1));});
}

try{
  const [frontendPort,lensPort]=await Promise.all([reservePort(),reservePort()]);
  const base=`http://127.0.0.1:${frontendPort}`;
  const lens=`ws://127.0.0.1:${lensPort}`;
  const mock=launch('lens',[mockEntry],{env:{MOCK_LENS_PORT:String(lensPort)}});
  const mockReady=waitForOutput(mock,/mock lens ready/);
  const vite=launch('vite',[viteEntry,'--host','127.0.0.1','--port',String(frontendPort),'--strictPort']);
  await Promise.all([mockReady,waitForHttp(`${base}/index.html`,vite)]);
  const smoke=launch('smoke',[smokeEntry],{
    inherit:true,
    env:{CHROME_PATH:chrome,CHUNK_SURFER_URL:base,MOCK_LENS_URL:lens},
  });
  await waitForExit(smoke);
}finally{
  await stopChildren();
}
