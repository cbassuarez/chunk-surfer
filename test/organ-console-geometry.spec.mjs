import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOrganConsole} from '../tools/chunk_surfer/organ-console-geometry.mjs';

const parts=[],MAT={dark:'dark',wood:'wood',black:'black',ivory:'ivory',brass:'brass'};
const box=(_m,center,size,material)=>parts.push({kind:'box',center,size,material});
const cylinder=(_m,center,radius,height,material,sides)=>parts.push({kind:'cylinder',center,size:[radius*2,height,radius*2],material,sides});
// Execute the real production feet helper as well; a test-only approximation
// could otherwise claim the old floor contact while its legs moved or grew.
const builder=readFileSync(new URL('../tools/chunk_surfer/build-props.mjs',import.meta.url),'utf8');
const legsSource=builder.match(/function addLegs\([^\n]+\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(legsSource);
const addLegs=new Function('addCylinder',`${legsSource};return addLegs;`)(cylinder);
buildOrganConsole({mesh:name=>({name}),MAT,addBox:box,addLegs,
  addEllipsoid:(_m,center,radii,material,lat,lon)=>parts.push({kind:'ellipsoid',center,size:radii.map(r=>r*2),material,lat,lon})});
const ends=p=>({min:p.center.map((v,i)=>v-p.size[i]/2),max:p.center.map((v,i)=>v+p.size[i]/2)});
const near=(a,b,tolerance=1e-8)=>Math.abs(a-b)<tolerance;
const keys=parts.filter(p=>p.kind==='box'&&['black','ivory'].includes(p.material));
const whites=keys.filter(p=>p.material==='ivory'),blacks=keys.filter(p=>p.material==='black');
const rows=[...new Set(whites.map(p=>p.center[1]))].sort((a,b)=>a-b);

test('both actual manuals have 61 distinct keys with the five-octave 2/3 accidental pattern',()=>{
  assert.equal(rows.length,2);
  for(const row of rows){
    const natural=whites.filter(p=>near(p.center[1],row)).sort((a,b)=>a.center[0]-b.center[0]);
    const top=ends(natural[0]).max[1];
    const accidental=blacks.filter(p=>near(ends(p).min[1],top)).sort((a,b)=>a.center[0]-b.center[0]);
    assert.equal(natural.length,36,'a C-to-C 61-note manual needs 36 separate naturals');
    assert.equal(accidental.length,25,'five octaves need 25 raised sharps/flats');
    const boundaries=accidental.map(p=>{
      const index=natural.findIndex((n,i)=>i+1<natural.length&&near(p.center[0],(n.center[0]+natural[i+1].center[0])/2));
      assert.notEqual(index,-1,'a black key must lie between two actual naturals');return index;
    });
    assert.deepEqual(boundaries,Array.from({length:5},(_,octave)=>[0,1,3,4,5].map(n=>octave*7+n)).flat(),
      'the raised keys must omit E-F and B-C, preserving the 2/3 groups');
    for(let i=1;i<natural.length;i++)assert.ok(ends(natural[i]).min[0]-ends(natural[i-1]).max[0]>=.00099,
      'the key row must have real gaps instead of a continuous ivory slab');
    for(const key of accidental){
      assert.ok(ends(key).max[1]>top+.02,'black keys must stand above the naturals');
      assert.ok(ends(key).min[2]>ends(natural[0]).min[2]+.10,'accidentals must be set back from the keyfront');
      assert.ok(near(ends(key).max[2],ends(natural[0]).max[2]),'key tails must agree with their manual back');
    }
  }
});

test('manuals have a useful forward step and touch their real supporting keybeds',()=>{
  const low=whites.filter(p=>near(p.center[1],rows[0])),high=whites.filter(p=>near(p.center[1],rows[1]));
  assert.ok(ends(low[0]).min[2]<ends(high[0]).min[2]-.14,'the lower manual must project toward the player');
  for(const key of whites){
    const e=ends(key),support=parts.find(p=>p.kind==='box'&&p.material==='wood'&&near(ends(p).max[1],e.min[1])
      &&ends(p).min[0]<=e.min[0]&&ends(p).max[0]>=e.max[0]&&ends(p).min[2]<=e.min[2]&&ends(p).max[2]>=e.max[2]);
    assert.ok(support,'each natural must rest on a full, attached keybed');
  }
  const upperFront=ends(high[0]).min[2];
  // A real approach-level ray to each row's raised keyfront must pass in front
  // of the upper bed, rather than disappear behind the old reversed step.
  for(const key of blacks.filter(p=>ends(p).max[1]<rows[1])){
    const e=ends(key),eye=[0,1.62,-1.5],t=(ends(high[0]).max[1]-e.max[1])/(eye[1]-e.max[1]);
    const rayZ=e.min[2]+(eye[2]-e.min[2])*t;
    assert.ok(rayZ<upperFront,'the upper manual hides the lower raised keyfront from the playing approach');
  }
});

test('stops remain pushed in and the refined shared console retains its complete old envelope',()=>{
  const knobs=parts.filter(p=>p.kind==='ellipsoid'&&p.material==='ivory');
  assert.equal(knobs.length,8,'use a modest two-bank stop layout');
  for(const knob of knobs){
    const stem=parts.find(p=>p.kind==='box'&&p.material==='brass'&&near(p.center[0],knob.center[0])&&near(p.center[1],knob.center[1]));
    assert.ok(stem&&ends(stem).max[2]>=-.225,'each stopped control must touch the unchanged case face');
    assert.ok(ends(stem).min[2]>=ends(knob).min[2]&&ends(stem).min[2]<=ends(knob).max[2],
      'the shallow control stem must meet its knob');
    assert.ok(knob.center[2]>-.28,'the stops must remain pushed in');
  }
  const envelope={min:[0,1,2].map(axis=>Math.min(...parts.map(p=>ends(p).min[axis]))),
    max:[0,1,2].map(axis=>Math.max(...parts.map(p=>ends(p).max[axis])))};
  for(const[end,expected]of Object.entries({min:[-.775,.02,-.74],max:[.775,1.21,.425]})){
    for(let axis=0;axis<3;axis++)assert.ok(near(envelope[end][axis],expected[axis]),
      `the ${end} ${axis} extent changes the existing mesh/working envelope`);
  }
  assert.ok(parts.every(p=>Object.values(MAT).includes(p.material)),'reuse only the five existing nonemissive materials');
  const triangles=parts.reduce((n,p)=>n+(p.kind==='box'?12:p.kind==='cylinder'?p.sides*4:p.lat*p.lon*2),0);
  assert.ok(triangles<3000,`keep this repeated detailed console below 3000 triangles (${triangles})`);
});
