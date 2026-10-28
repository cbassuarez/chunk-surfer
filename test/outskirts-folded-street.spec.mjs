import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {OUTSKIRTS_FOLDING as F, outskirtsFoldLayout, outskirtsFoldPoint, outskirtsFoldVisibility} from '../src/data/source-outskirts-folds.js';
import {OUTSKIRT_STRETCH,OUTSKIRT_STRETCH_START as START,OUTSKIRT_STRETCH_METRES as PERIOD,outskirtsPassLayout} from '../src/data/source-outskirts-arrival.js';
import {SOURCE_OUTSKIRTS_TOWN, outskirtsTownPlacement} from '../src/data/source-outskirts-town.js';
import {SOURCE_PRE_TAPE} from '../src/data/source-level.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {outskirtsCollisionBoxes,outskirtsPointBlocked,OUTSKIRTS_BODY_RADIUS} from '../src/game/outskirts-geometry.js';
import {buildPreTapeGodPreset} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {PROP_INSTANCE_FLOATS} from '../src/render/prop-instance-layout.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readExteriorAccessor} from '../tools/chunk_surfer/build-exterior-collision.mjs';

const all=Array.from({length:20},(_,k)=>outskirtsFoldLayout(k,OUTSKIRT_STRETCH));
const transform=(m,p)=>[0,1,2].map(row=>m[row]*p[0]+m[4+row]*p[1]+m[8+row]*p[2]+m[12+row]);
const multiply=(a,b)=>Array.from({length:16},(_,index)=>{const row=index%4,col=Math.floor(index/4);return a[row]*b[col*4]+a[4+row]*b[col*4+1]+a[8+row]*b[col*4+2]+a[12+row]*b[col*4+3];});
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
// Runtime instance translations are Float32 at kilometre-scale world coordinates.
const near=(a,b,why,epsilon=1e-4)=>assert.ok(Math.abs(a-b)<=epsilon,`${why}: ${a} != ${b}`);
const packed=new Map(),wanted=new Set(all.flat().map(piece=>piece.mesh));
function nodeMatrix(node){
  if(node.matrix)return node.matrix;
  const[x,y,z,w]=node.rotation||[0,0,0,1],[sx,sy,sz]=node.scale||[1,1,1],[tx,ty,tz]=node.translation||[0,0,0];
  return[(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
for(const url of SOURCE_OUTSKIRTS_TOWN.packs){
  if(!wanted.size)break;
  const asset=parseGlb(fs.readFileSync(new URL('../public'+url,import.meta.url))),parents=new Map();
  for(const[n,node]of asset.json.nodes.entries())for(const child of node.children||[])parents.set(child,n);
  const world=(index)=>{const local=nodeMatrix(asset.json.nodes[index]);return parents.has(index)?multiply(world(parents.get(index)),local):local;};
  for(const[index,mesh]of asset.json.meshes.entries())if(wanted.has(mesh.name)){
    const nodeIndices=asset.json.nodes.flatMap((node,index)=>node.mesh===asset.json.meshes.indexOf(mesh)?[index]:[]);
    const matrices=nodeIndices.length?nodeIndices.map(world):[identity];
    const primitives=matrices.flatMap(matrix=>mesh.primitives.map(p=>({
      positions:readExteriorAccessor(asset,p.attributes.POSITION).map(point=>transform(matrix,point)),
      indices:readExteriorAccessor(asset,p.indices).flat(),
    })));
    packed.set(mesh.name,{asset,mesh,primitives});wanted.delete(mesh.name);
  }
}
assert.deepEqual([...wanted],[],'every folded object uses an actually installed packed model');

function polygonClip(vertices,axis,bound,above){
  const output=[];
  for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length],inside=p=>above?p[axis]>=bound:p[axis]<=bound,ia=inside(a),ib=inside(b);if(ia)output.push(a);if(ia!==ib){const t=(bound-a[axis])/(b[axis]-a[axis]);output.push(a.map((v,k)=>v+(b[k]-v)*t));}}
  return output;
}
function bodyIntersection(triangle){
  let polygon=triangle;
  for(const[axis,bound,above]of[[0,-11.25-OUTSKIRTS_BODY_RADIUS,true],[0,11.25+OUTSKIRTS_BODY_RADIUS,false],[1,.45,true],[1,1.7,false]]){polygon=polygonClip(polygon,axis,bound,above);if(!polygon.length)return false;}
  return polygon.length>=3;
}

function runtimeAt(along){
  const built=buildPreTapeGodPreset(0,{seed:4417,marbleEyes:'returned'}),runtime=createSourceSpaceRuntime({initialState:built.state});
  const start=runtime.outskirtsPassStart(0),position={...start,y:start.y-(along-(START+.8))/CELL};runtime.setPlayerPosition(position);
  near(runtime.payphoneRoadLoopFrame().along,along,'fixture uses the actual runtime road coordinate');
  return{runtime,position};
}

function route(pieces){
  const step=.5,x0=-11,nx=45,nz=69,start=22,queue=[[start,0]],seen=new Set([start]);
  const blocked=(i,j)=>pieces.some(p=>{const dx=x0+i*step-p.across,dz=-(j*step-p.along),c=Math.cos(p.yaw),s=Math.sin(p.yaw);return outskirtsPointBlocked(outskirtsCollisionBoxes(p,PROP_BOUNDS[p.mesh]),dx*c-dz*s,dx*s+dz*c);});
  if(blocked(start,0))return false;
  for(let n=0;n<queue.length;n++){const[i,j]=queue[n];if(j===nz-1)return true;for(const[di,dj]of[[0,1],[1,0],[-1,0],[0,-1]]){const ii=i+di,jj=j+dj,key=jj*nx+ii;if(ii<0||ii>=nx||jj<0||jj>=nz||seen.has(key)||blocked(ii,jj))continue;seen.add(key);queue.push([ii,jj]);}}
  return false;
}

test('the first two returns stay ordinary; the third reveals a recognizable rigid arrival on other gravities by returns four and five',()=>{
  for(const k of[-1,0,1,2,20,28,Infinity,NaN,3.5])assert.deepEqual(outskirtsFoldLayout(k,OUTSKIRT_STRETCH),[]);
  assert.equal(F.firstPass,3);assert.equal(F.lastPass,19);
  assert.ok(all[3].every(p=>p.foldFrame==='west-return'&&p.foldRoll===-Math.PI/2));
  assert.ok(all[4].every(p=>p.foldFrame==='east-return'&&p.foldRoll===Math.PI/2));
  assert.ok(all[5].every(p=>p.foldFrame==='overhead'&&p.foldRoll===Math.PI));
  for(let along=0;along<=START+2*PERIOD;along+=.5)assert.equal(outskirtsFoldVisibility(along),0,'no prefetched upper street is visible in learning returns1–2');
  assert.equal(outskirtsFoldVisibility(F.revealFrom),0);assert.equal(outskirtsFoldVisibility(F.revealTo),1);
  const ramp=Array.from({length:21},(_,i)=>outskirtsFoldVisibility(F.revealFrom+(F.revealTo-F.revealFrom)*i/20));
  assert.ok(ramp[10]>0&&ramp[10]<1);for(let i=1;i<ramp.length;i++)assert.ok(ramp[i]>=ramp[i-1]);
  assert.ok(F.revealFrom>=START+2*PERIOD&&F.revealTo<START+3*PERIOD,'the emergence occurs during the third learned return');
  for(const pieces of all.slice(3)){assert.ok(pieces.length<=32,'the bounded treatment does not reproduce the entire district');const frames=new Map();for(const p of pieces){if(!frames.has(p.foldFrame))frames.set(p.foldFrame,[]);frames.get(p.foldFrame).push(p);assert.equal(p.folded,true);assert.equal(p.collision,'none');assert.equal(p.inspect,undefined);assert.equal(p.payphone,undefined);assert.equal(p.character,undefined);}
    for(const set of frames.values())for(const key of['road','gate','booth','booth-interior','booth-glazing','shelter','van','van-door-l','van-door-r','stables'])assert.ok(set.some(p=>p.foldSource===key),`${key} belongs to the same recognizable street strip`);
  }
});

test('all copied objects keep one full rigid frame, original model and scale; source inputs remain immutable',()=>{
  const before=structuredClone(OUTSKIRT_STRETCH),originals=new Map([...OUTSKIRT_STRETCH,{...outskirtsTownPlacement('yard-former-stables'),id:'stables'}].map(p=>[p.id,p]));
  for(const pieces of all.slice(3)){
    for(const frame of new Set(pieces.map(p=>p.foldFrame))){let translation=null;
      for(const p of pieces.filter(p=>p.foldFrame===frame&&originals.has(p.foldSource))){const source=originals.get(p.foldSource);assert.equal(p.mesh,source.mesh);assert.equal(p.yaw,source.yaw);for(const key of['scale','scaleX','scaleY','scaleZ'])assert.equal(p[key],source[key]);
        const c=Math.cos(p.foldRoll),s=Math.sin(p.foldRoll),delta=[p.across-(source.across*c-source.y*s),p.y-(source.across*s+source.y*c),p.along-source.along];if(!translation)translation=delta;else delta.forEach((v,i)=>near(v,translation[i],'a shared road-frame translation',1e-9));
      }
    }
  }
  assert.deepEqual(OUTSKIRT_STRETCH,before,'folding cannot mutate the ordinary player-level arrival');
  assert.equal(outskirtsFoldLayout(5,OUTSKIRT_STRETCH),outskirtsFoldLayout(5,OUTSKIRT_STRETCH),'the static canonical return is cached');
});

test('actual installed vertices and triangle interiors stay clear of the complete bodily corridor under every folded frame',t=>{
  let testedVertices=0,testedTriangles=0;
  for(const pieces of all.slice(3))for(const piece of pieces){const points=[];
    for(const primitive of packed.get(piece.mesh).primitives){const posed=primitive.positions.map(v=>{const p=outskirtsFoldPoint(piece,v);const point=[p.across,p.y,p.along];points.push(point);testedVertices++;assert.ok(point.every(Number.isFinite));return point;});
      for(let i=0;i<primitive.indices.length;i+=3){const triangle=primitive.indices.slice(i,i+3).map(index=>posed[index]);testedTriangles++;assert.equal(bodyIntersection(triangle),false,`${piece.id}/${piece.mesh} crosses body volume at pass ${all.indexOf(pieces)}`);}
    }
    // Generated source bounds are rounded to millimetres; keep that explicit
    // quantisation allowance separate from the exact triangle/body test above.
    const b=piece.bounds;for(const point of points){assert.ok(point[0]>=b.across0-.0011&&point[0]<=b.across1+.0011,`${piece.id} actual lateral extent escapes its culling bound`);assert.ok(point[1]>=b.y0-.0011&&point[1]<=b.y1+.0011,`${piece.id} actual height escapes its culling bound`);assert.ok(point[2]>=b.along0-.0011&&point[2]<=b.along1+.0011,`${piece.id} actual longitudinal extent escapes its culling bound`);}
    assert.deepEqual(outskirtsCollisionBoxes(piece,PROP_BOUNDS[piece.mesh]),[],'unsupported copies never become invisible body colliders');
  }
  assert.ok(testedVertices>100000&&testedTriangles>100000,'clearance uses packed geometry, not only authored boxes');
  t.diagnostic(JSON.stringify({packedVertices:testedVertices,packedTriangles:testedTriangles,foldedInstances:all.flat().length,passIndices:[F.firstPass,F.lastPass],bodyCentreAcross:[-11.25,11.25],bodyRadius:OUTSKIRTS_BODY_RADIUS,actualBodyAcross:[-11.25-OUTSKIRTS_BODY_RADIUS,11.25+OUTSKIRTS_BODY_RADIUS],bodyHeight:[.45,1.7]}));
});

test('the original street furniture remains traversable beneath side and ceiling copies',()=>{
  for(const k of[0,1,2,3,4,5,6,7,10,13,19])assert.ok(route(outskirtsPassLayout(k)),`the ordinary level street dead-ends at pass ${k}`);
});

test('production submission suppresses early copies, ramps during return three, and uses a full world-fold matrix rather than local Euler roll',()=>{
  for(const along of[START+.8,START+PERIOD+.8]){const{runtime,position}=runtimeAt(along);assert.equal(runtime.propInstances(position.x,position.y).some(i=>Number.isFinite(i.outskirtsFoldVisibility)),false,'late banks cannot leak into the first two views');}
  const during=runtimeAt((F.revealFrom+F.revealTo)/2),partial=during.runtime.propInstances(during.position.x,during.position.y).filter(i=>Number.isFinite(i.outskirtsFoldVisibility));assert.ok(partial.length);for(const i of partial){near(i.outskirtsFoldVisibility,.5,'shared reveal');assert.equal(i.noShadow,true,'invisible/partial banks cannot cast a premature shadow');}
  let checked=0;
  for(const k of[3,4,5,6,18,19]){const{runtime,position}=runtimeAt(START+k*PERIOD+8),instances=runtime.propInstances(position.x,position.y);const ordinary=instances.find(i=>i.id===`r${k}-road`),rawOrdinary=runtime.outskirtsPiece(ordinary?.id);assert.ok(ordinary&&rawOrdinary,'the trusted floor remains in the production submission');const ground=ordinary.matrix[13]-(rawOrdinary.y||0);
    for(const instance of instances.filter(i=>i.id.startsWith(`r${k}-fold-`))){const pose=runtime.outskirtsPiece(instance.id),p=outskirtsPassLayout(k).find(p=>`r${k}-${p.id}`===instance.id),m=instance.matrix;assert.ok(p?.folded&&pose);assert.equal(instance.zone,ZONE.sourceSpace);assert.equal(instance.sourceStructure,'outskirts');assert.equal(instance.outskirtsFoldVisibility,1);assert.equal(instance.noShadow,false);assert.equal(instance.apparitionVariant,undefined);assert.equal(instance.materialOverride,undefined);
      for(const local of[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[.7,1.3,-.9]]){const q=transform(m,local),expected=outskirtsFoldPoint(p,local);near(q[0],pose.x+expected.across-p.across,'rigid across');near(q[1],ground+expected.y,'rigid height');near(q[2],pose.z-(expected.along-p.along),'rigid world longitudinal axis');}
      checked++;
    }
  }
  assert.ok(checked>=6*16,'real runtime matrices for each side and overhead return were exercised');
});

test('the fold appearance stays in ordinary opaque materials and final dither with isolated batch extinction',()=>{
  assert.equal(PROP_INSTANCE_FLOATS,29,'no extra vertex attribute or instance channel');
  const source=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const fragment=source.match(/if\(uOutskirtsFold\.x>\.5\)\{[\s\S]*?\n  \}/)?.[0];assert.ok(fragment);assert.match(fragment,/col\*=night\*uOutskirtsFold\.y/);assert.doesNotMatch(fragment,/discard|gl_FragDepth|alpha|texture/,'extinction does not replace actual depth, textures, coverage or materials');assert.ok(source.indexOf(fragment)<source.indexOf('col=col/(1.0+col*.30)'));
  const pass=source.slice(source.indexOf('const SOURCE_DOOR_SCENERY='),source.indexOf('\nfunction uploadInstances('));
  const skip=source.match(/const REFLECTION_SKIP=new Set\([^;]+;/)?.[0];const context={staticInstances:[{mesh:'yard_van'},{mesh:'yard_van',outskirtsFoldVisibility:.5}],dynamicInstances:[],roofWatcherInstances:[],emergencyShadowInstances:[],diagnosticInstances:[],propDiagnosticsEnabled:false,propDiagnosticOptions:null,propInstanceVisible:()=>true,resolvedMeshName:p=>p.mesh};vm.createContext(context);vm.runInContext(`${skip}\n${pass}\nvar plain=visibleGroups([0,0,0],90);var reflected=visibleGroups([0,0,0],90,{reflection:true});`,context);
  for(const groups of[context.plain,context.reflected]){assert.equal(groups.size,2);assert.equal(groups.get('yard_van').length,1);assert.equal(groups.get('yard_van\0outskirts-fold').length,1,'the same original mesh cannot inherit its folded copy extinction');}
  const assign=source.match(/const fold=list\[0\]\.outskirtsFoldVisibility;gl\.uniform2f\(U\('uOutskirtsFold'\),[^;]+;/)?.[0];assert.ok(assign);const calls=[],apply=new Function('list','gl','U',assign),gl={uniform2f:(...args)=>calls.push(args)};apply([{outskirtsFoldVisibility:.5}],gl,key=>key);apply([{}],gl,key=>key);assert.deepEqual(calls,[['uOutskirtsFold',1,.5],['uOutskirtsFold',0,1]],'every following ordinary group explicitly resets the fold uniform');
  const dither=fs.readFileSync(new URL('../src/render/pixel-mesh/shader.js',import.meta.url),'utf8');assert.doesNotMatch(dither,/uOutskirtsFold|outskirtsFoldVisibility/,'the fold passes through the normal final acquisition');
});
