import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VAN_ICON_WEATHER as W,rainDropAt,lightningAt,createVanIconWeather} from '../tools/app-icon/weather.mjs';

test('rain remains deterministic physical motion, bounded above the ground',()=>{
 for(let i=0;i<W.rainDrops;i++)for(const time of[0,.35,1.12,2.42,3.4]){
  const p=rainDropAt(i,time,-1.012);assert.deepEqual(p,rainDropAt(i,time,-1.012));
  assert.ok(p.y>=-1.012+.06&&p.y<=-1.012+.06+4.7);assert.ok(p.length>.1&&p.length<.4);assert.ok(p.speed>6&&p.speed<10);
 }
 assert.notDeepEqual(rainDropAt(0,.35),rainDropAt(0,.55));
});

test('the one soft lightning event ends before the still and thunder follows it',()=>{
 const [range]=W.flashRanges;
 assert.equal(lightningAt(range.fromSeconds),0);assert.equal(lightningAt(range.toSeconds),0);assert.equal(lightningAt(3.4),0);
 assert.equal(lightningAt(2.42),1);assert.ok(lightningAt(2.70)>0&&lightningAt(2.70)<1);
 assert.equal(lightningAt(2.42,{reducedMotion:true}),0);assert.equal(lightningAt(2.42,{reduceFlash:true}),0);
 assert.ok(W.thunderAtSeconds[0]>W.lightningAtSeconds[0]);assert.equal(W.nativeAudio,false);
 for(let t=0;t<=3.4;t+=.01)assert.ok(lightningAt(t)>=0&&lightningAt(t)<=1);
});

test('geometry participates in the scene and small icon LOD only thins real rain',()=>{
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,80);camera.position.set(4.4,3,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const weather=createVanIconWeather(THREE,scene,{groundY:-1,camera});
 weather.update(2.42,{size:256});const large=weather.debug();assert.equal(large.rainInstances,72);assert.equal(large.puddles,7);assert.equal(large.ripples,12);assert.equal(large.screenOverlay,false);assert.ok(large.lightningIntensity>0);
 const rain=scene.getObjectByName('physical falling rain');assert.ok(rain.isInstancedMesh);assert.ok(rain.material.isMeshStandardMaterial);
 weather.update(2.42,{size:16,reduceFlash:true});assert.equal(weather.debug().rainInstances,12);assert.equal(weather.debug().lightningIntensity,0);
 for(const node of scene.getObjectByName('icon-world-rain-and-wet-ground').children)if(node.name.includes('wet ground island'))assert.ok(node.material.transparent&&node.material.opacity<.2);
 weather.dispose();assert.equal(scene.children.length,0);
});
