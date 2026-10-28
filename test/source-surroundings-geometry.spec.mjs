import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_SURROUNDINGS_CENTRE_ARCS} from '../src/data/source-surroundings.js';
import {sourceSurroundingsFrame} from '../src/game/source-surroundings.js';
import {SOURCE_SURROUNDINGS_REQUIRED_MESHES,SOURCE_SURROUNDINGS_GEOMETRY_STATS,SOURCE_SURROUNDINGS_EMITTER_ALIASES,
  sourceSurroundingsGeometryLibrary,sourceSurroundingsMeshPayload,sourceSurroundingsProps,installSourceSurroundingsEmitterAliases} from '../src/render/source-surroundings-geometry.js';

const library=sourceSurroundingsGeometryLibrary();
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
function closedComponents(piece){
  const parents=Array.from({length:piece.p.length/3},(_,i)=>i),edges=new Map();
  function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
  for(let k=0;k<piece.i.length;k+=3){
    const triangle=piece.i.slice(k,k+3);for(const index of triangle)parents[root(index)]=root(triangle[0]);
    for(let edge=0;edge<3;edge++){
      const a=triangle[edge],b=triangle[(edge+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      const row=edges.get(key)||{count:0,direction:0};row.count++;row.direction+=a<b?1:-1;edges.set(key,row);
    }
  }
  for(const edge of edges.values()){assert.equal(edge.count,2,piece.name+' has an open edge');assert.equal(edge.direction,0,piece.name+' has inconsistent winding');}
  const volumes=new Map();
  for(let k=0;k<piece.i.length;k+=3){
    const [a,b,c]=piece.i.slice(k,k+3).map(i=>piece.p.slice(i*3,i*3+3));
    const v=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    const id=root(piece.i[k]);volumes.set(id,(volumes.get(id)||0)+v);
  }
  for(const value of volumes.values())assert.ok(value>1e-12,piece.name+' has an inside-out or zero-volume component: '+value);
}

test('every installed architectural component is a closed, outward solid with finite native payloads',()=>{
  for(const piece of library){
    closedComponents(piece);
    const payload=sourceSurroundingsMeshPayload(piece);
    assert.equal(payload.positions.length,piece.i.length*3);assert.equal(payload.normals.length,payload.positions.length);
    assert.equal(payload.uvs.length,piece.i.length*2);assert.deepEqual(payload.bounds.center,[0,0,0],'preserve semantic body/arc origin');
    assert.ok(payload.positions.every(Number.isFinite));assert.ok(payload.uvs.every(Number.isFinite));
    for(let k=0;k<payload.normals.length;k+=3)assert.ok(Math.abs(Math.hypot(...payload.normals.subarray(k,k+3))-1)<1e-6);
    assert.throws(()=>piece.p.push(0),TypeError);
  }
});

test('body archetypes have genuine openings, treads and coffer depth inside normalized full extents',()=>{
  for(const archetype of ['arcade','stair','soundboard']){
    const pieces=library.filter(p=>p.archetype===archetype),points=pieces.flatMap(p=>p.p);
    assert.equal(pieces.length,4);assert.ok(pieces.every(p=>p.kind==='detail'));
    for(let axis=0;axis<3;axis++){
      const values=points.filter((_,i)=>i%3===axis);
      assert.ok(Math.abs(Math.min(...values)+.5)<1e-8);assert.ok(Math.abs(Math.max(...values)-.5)<1e-8);
    }
    assert.ok(pieces.find(p=>p.layer==='back').triangles>12,'backing is constructed, not a zero-thickness card');
  }
  assert.ok(library.find(p=>p.archetype==='stair'&&p.layer==='stock').triangles>=14*12,'fourteen closed tread caps');
  assert.ok(library.find(p=>p.archetype==='soundboard'&&p.layer==='stock').triangles>=12*12,'deep transverse coffer ribs');
});

test('all nine broken arcades leave the authored centre and radial gaps physically empty',()=>{
  for(const definition of SOURCE_SURROUNDINGS_CENTRE_ARCS){
    const pieces=library.filter(piece=>piece.arcId===definition.id);assert.equal(pieces.length,4);
    for(const piece of pieces)for(let k=0;k<piece.p.length;k+=3){
      const [x,y,z]=piece.p.slice(k,k+3),radius=Math.hypot(x,y),angle=Math.atan2(y,x);
      let a=angle;while(a<definition.startAngle-1e-7)a+=Math.PI*2;
      assert.ok(radius>=definition.radius-definition.width/2-1e-7);assert.ok(radius<=definition.radius+definition.width/2+1e-7);
      assert.ok(a<=definition.endAngle+1e-7);assert.ok(Math.abs(z)<=definition.depth/2+1e-7);
    }
  }
});

test('fixed remote geometry remains within the explicit mesh/instance budget without lights or collision',()=>{
  assert.ok(SOURCE_SURROUNDINGS_GEOMETRY_STATS.triangles<35000);
  const original={phase:'wrong-return',elapsed:28},before=JSON.stringify(original),origin={x:20,y:-9,z:4};
  const fall=sourceSurroundingsFrame(original),centre=sourceSurroundingsFrame({...original,phase:'catch'});
  const props=[...sourceSurroundingsProps(fall,{origin}),...sourceSurroundingsProps(centre,{origin})];
  assert.ok(props.length<140);assert.equal(new Set(props.map(p=>p.id)).size,props.length);
  assert.ok(props.every(p=>p.noCollision&&p.walkable===false&&p.decorative));
  assert.ok(props.every(p=>p.zone!==undefined));assert.ok(props.every(p=>!p.light));
  assert.equal(JSON.stringify(original),before);
  assert.strictEqual(sourceSurroundingsGeometryLibrary(),library,'never rebuild geometry from a frame');
  for(const name of ['tower_bell_04','tower_clapper_04','source-surroundings-bell','source-surroundings-clapper'])assert.ok(SOURCE_SURROUNDINGS_REQUIRED_MESHES.includes(name));
});

test('origin offsets and full XYZ poses produce actual transformed per-part bounds',()=>{
  const frame={world:'fall',score:{pulse:.5},bodies:[{id:'placed',archetype:'arcade',position:{x:120,y:40,z:-100},rotation:{x:.4,y:.7,z:-.3},size:{x:80,y:36,z:18},loading:.6,opacity:1}]};
  const origin={x:11,y:-4,z:27},props=sourceSurroundingsProps(frame,{origin});assert.equal(props.length,4);
  for(const prop of props){
    const piece=library.find(p=>p.name===prop.mesh),b=prop.worldBounds;
    assert.ok(prop.matrix.every(Number.isFinite));assert.deepEqual([prop.x,prop.y,prop.z],b.center);
    for(let i=0;i<piece.p.length;i+=3){const point=transform(prop.matrix,piece.p.slice(i,i+3));for(let k=0;k<3;k++)assert.ok(point[k]>=b.min[k]-1e-5&&point[k]<=b.max[k]+1e-5);}
    const scale=Math.max(1,...[0,4,8].map(k=>Math.hypot(...prop.matrix.subarray(k,k+3))));
    assert.ok(Math.abs(prop.cullRadius*scale-prop.worldCullRadius)<1e-7,'native culler must not scale a world radius twice');
  }
  assert.ok(props.filter(p=>p.materialRole==='source-surroundings-joint').every(p=>Math.abs(p.fixturePower-(.35+.65*.6))<1e-12));
});

test('canonical musical senders preserve the original bell/clapper shapes and normalize around their real bounds',()=>{
  const rows=[
    {id:'bell',mesh:'tower_bell_04',bounds:{min:[-.64,-1.02,-.637],max:[.64,.14,.637]}},
    {id:'clapper',mesh:'tower_clapper_04',bounds:{min:[-.13,-1.28,-.127],max:[.13,-.06,.127]}},
  ];
  for(const row of rows){
    const position={x:95,y:63,z:-84},size={x:32,y:29,z:31.85};
    const [prop]=sourceSurroundingsProps({world:'fall',emitters:[{...row,position,size,rotation:{x:0,y:0,z:0},opacity:1}]});
    assert.equal(prop.mesh,SOURCE_SURROUNDINGS_EMITTER_ALIASES[row.mesh]);assert.equal(prop.materialRole,'source-surroundings-emitter');
    assert.equal(prop.sourceSurroundingsSide,1);assert.deepEqual(prop.emissive,[.10,.17,.23,.75]);
    const actualMin=transform(prop.matrix,row.bounds.min),actualMax=transform(prop.matrix,row.bounds.max);
    for(let k=0;k<3;k++){
      assert.ok(Math.abs(actualMax[k]-actualMin[k]-size[['x','y','z'][k]])<1e-5);
      assert.ok(Math.abs((actualMax[k]+actualMin[k])/2-position[['x','y','z'][k]])<1e-5);
    }
  }
  assert.equal(sourceSurroundingsProps({world:'fall',emitters:[{id:'not-canon',mesh:'rock'}]}).length,0);
});

test('every custom piece and emitted prop has its own explicit world-side clipping metadata',()=>{
  for(const piece of library){
    assert.equal(piece.sourceSurroundingsSide,piece.arcId?2:1);
    if(piece.layer==='edge')assert.deepEqual(piece.emissive,[1.1,1.7,1.8]);
    else assert.deepEqual(piece.emissive,[0,0,0]);
  }
  for(const [phase,side]of [['wrong-return',1],['catch',2]]){
    const props=sourceSurroundingsProps(sourceSurroundingsFrame({phase,elapsed:28}));
    assert.ok(props.length>0);assert.ok(props.every(prop=>prop.sourceSurroundingsSide===side));
  }
});

test('native emitter aliases share draw resources while keeping clipping flags out of canonical materials',()=>{
  const gl={createBuffer(){throw Error('Aliases must not allocate GPU buffers');},createVertexArray(){throw Error('Aliases must not rebuild native meshes');}},catalog=new Map();
  for(const name of Object.keys(SOURCE_SURROUNDINGS_EMITTER_ALIASES)){
    const primitive=Object.freeze({vao:{native:name},count:36,indexType:5125,base:Object.freeze([.17,.21,.24,1]),
      emissive:Object.freeze([0,0,0]),metallic:.78,roughness:.43,materialFactors:'gltf',texture:{native:'texture'},normalTexture:{native:'normal'},
      ormTexture:{native:'orm'},materialRole:'original-tower-metal',portrait:false,alphaCut:0});
    catalog.set(name,Object.freeze({name,nodeMatrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),instanceBuffer:{native:'instances'},
      extras:Object.freeze({nativeTower:true}),primitives:Object.freeze([primitive])}));
  }
  const before=[...catalog].map(([name,value])=>[name,structuredClone(value)]);
  assert.deepEqual(installSourceSurroundingsEmitterAliases(gl,{catalog}),Object.values(SOURCE_SURROUNDINGS_EMITTER_ALIASES));
  for(const [source,name]of Object.entries(SOURCE_SURROUNDINGS_EMITTER_ALIASES)){
    const original=catalog.get(source),alias=catalog.get(name);
    assert.notStrictEqual(alias,original);assert.equal(alias.name,name);assert.strictEqual(alias.instanceBuffer,original.instanceBuffer);assert.strictEqual(alias.nodeMatrix,original.nodeMatrix);
    assert.notStrictEqual(alias.primitives,original.primitives);assert.notStrictEqual(alias.primitives[0],original.primitives[0]);
    for(const key of ['vao','texture','normalTexture','ormTexture','base','emissive'])assert.strictEqual(alias.primitives[0][key],original.primitives[0][key]);
    for(const key of ['count','indexType','metallic','roughness','materialFactors','materialRole','portrait','alphaCut'])assert.equal(alias.primitives[0][key],original.primitives[0][key]);
    assert.equal(alias.primitives[0].sourceSurroundingsSide,1);assert.equal(original.primitives[0].sourceSurroundingsSide,undefined);
    alias.primitives[0].sourceSurroundingsSide=2;assert.equal(original.primitives[0].sourceSurroundingsSide,undefined);
  }
  catalog.delete('source-surroundings-bell');installSourceSurroundingsEmitterAliases(gl,{catalog});
  assert.ok(catalog.has('source-surroundings-bell'));assert.equal(catalog.get('source-surroundings-clapper').primitives[0].sourceSurroundingsSide,1,'repair stale alias metadata too');
  for(const [name,value]of before)assert.deepEqual(catalog.get(name),value);
  assert.deepEqual(installSourceSurroundingsEmitterAliases(gl,{catalog:new Map()}),[]);
});

test('reduced poses do not introduce an independent pulsing light animation',()=>{
  const a=sourceSurroundingsFrame({phase:'catch',elapsed:1},{reducedMotion:true}),b=sourceSurroundingsFrame({phase:'catch',elapsed:100},{reducedMotion:true});
  const rowsA=sourceSurroundingsProps(a),rowsB=sourceSurroundingsProps(b);
  assert.deepEqual(rowsA.map(p=>Array.from(p.matrix)),rowsB.map(p=>Array.from(p.matrix)));
  assert.deepEqual(rowsA.map(p=>p.fixturePower),rowsB.map(p=>p.fixturePower));
});
