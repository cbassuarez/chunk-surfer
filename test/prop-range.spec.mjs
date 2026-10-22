import test from 'node:test';
import assert from 'node:assert/strict';
import {createPropRangeController} from '../src/render/prop-range.js';
test('an authored100m descent gets depth range and returns ordinary and drive clips exactly',()=>{
 const range=createPropRangeController(),owner={};
 assert.equal(range.current(),90);const release=range.acquire(owner,240);
 assert.equal(range.current(),240);assert.equal(range.current({drive:true}),260);
 assert.throws(()=>range.acquire({},240));assert.equal(release(),true);assert.equal(release(),false);
 assert.equal(range.current(),90);assert.equal(range.current({drive:true}),260);
 for(const n of [NaN,Infinity,89,321])assert.throws(()=>range.acquire({},n));
});
