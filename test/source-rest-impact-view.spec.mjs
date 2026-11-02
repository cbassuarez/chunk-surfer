import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestImpactInView} from '../src/render/source-rest-impact-view.js';

const impact={contact:true,point:[0,-.18,-.65],chipId:'chip',bodyPart:'hand'};
const props=[{id:'chip'},{id:'hand'}],camera={eye:[0,0,0],yaw:0,pitch:0,aspect:16/9};

test('contact needs both actual submitted chip and body and the current view, not only a performance timestamp',()=>{
  assert.equal(sourceRestImpactInView(impact,camera,props),true);
  assert.equal(sourceRestImpactInView(impact,camera,props.slice(0,1)),false);
  assert.equal(sourceRestImpactInView(impact,camera,[props[0],{id:'hand',portalDestination:true}]),false);
  assert.equal(sourceRestImpactInView(impact,{...camera,yaw:Math.PI},props),false);
  assert.equal(sourceRestImpactInView({...impact,point:[0,-2,-.65]},camera,props),false);
  assert.equal(sourceRestImpactInView({...impact,point:[0,-2,-.65]},{...camera,pitch:-1.2},props),true);
});

test('the receipt uses actual lens/aspect and excludes contact behind the eye or outside the bodily near field',()=>{
  const side={...impact,point:[.55,0,-.65]};
  assert.equal(sourceRestImpactInView(side,camera,props),true);
  assert.equal(sourceRestImpactInView(side,{...camera,tanHalfFov:.4,aspect:1},props),false);
  for(const point of [[0,0,.5],[0,0,-5],[NaN,0,-1]])assert.equal(sourceRestImpactInView({...impact,point},camera,props),false);
});
