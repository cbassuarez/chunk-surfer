import test from 'node:test';
import assert from 'node:assert/strict';
import {sightPolygon,sightVisibilityLookup,visibilityLookup} from '../src/render/minimap.js';

test('bounded sight lookup preserves the original visibility and fan for live doors and rotated props',()=>{
  const open=new Set();
  for(let y=-110;y<=110;y++)for(let x=-110;x<=110;x++)if(x!==-30||y<0)open.add(`${x},${y}`);
  let seed=0x32b44;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const occluders=Array.from({length:100},(_,i)=>({x:(random()-.5)*100,y:(random()-.5)*100,
    w:i%9===0?42:random()*5,d:i%13===0?35:random()*4,yaw:(random()-.5)*8}));
  const doors=[{state:'closed',position:{x:2,y:-5},widthAxis:'x',apertureWidth:3},
    {state:'open',position:{x:-3,y:5},widthAxis:'y',apertureWidth:2},
    {state:'closed',position:{x:-18,y:0},widthAxis:'y',apertureWidth:1}];
  const command={origin:{x:-4.25,y:1.5},radius:18,visibilityOpen:open,visibilityScale:2,occluders,doors};
  function compare(){
    const old=visibilityLookup(command),fast=sightVisibilityLookup(command);
    // Include the exact boundary, outside the fan (fallback), and negative cells.
    for(let i=0;i<6000;i++){
      const x=command.origin.x+(random()-.5)*60,y=command.origin.y+(random()-.5)*60;
      assert.equal(fast(x,y),old(x,y),`visibility at ${x},${y}`);
    }
    for(let i=0;i<16;i++){
      const heading=i*Math.PI/8;
      assert.deepEqual(sightPolygon({origin:command.origin,heading,isOpen:fast,radius:command.radius}),
        sightPolygon({origin:command.origin,heading,isOpen:old,radius:command.radius}),`heading ${heading}`);
    }
  }
  compare();
  // Every new frame sees changes to doors, props and player position.
  doors[0].state='open';doors[1].state='closed';occluders[0].x=1;occluders[0].yaw=.3;
  command.origin={x:3.1,y:-2.4};compare();
});
