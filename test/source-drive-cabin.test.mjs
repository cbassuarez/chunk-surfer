import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function asset(path){const bytes=read(path),length=bytes.readUInt32LE(12);return{bytes,doc:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};}
const drive=asset('artifacts/source-drive-study/drive.glb');
const metrics=JSON.parse(read('artifacts/source-drive-study/geometry/metrics.json'));
const before=JSON.parse(read('artifacts/source-drive-study/geometry/cabin-v2/preserved-contract.json'));
function accessor(index){
 const a=drive.doc.accessors[index],v=drive.doc.bufferViews[a.bufferView],width={5126:4,5125:4,5123:2,5121:1}[a.componentType],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],packed=Buffer.alloc(a.count*size*width);
 for(let row=0;row<a.count;row++)drive.bin.copy(packed,row*size*width,(v.byteOffset||0)+(a.byteOffset||0)+row*(v.byteStride||size*width),(v.byteOffset||0)+(a.byteOffset||0)+row*(v.byteStride||size*width)+size*width);
 return{bytes:packed,values:Array.from({length:a.count*size},(_,i)=>packed[{5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType]](i*width))};
}
function material(index){const m=drive.doc.materials[index],p=m.pbrMetallicRoughness||{},t=p.baseColorTexture,im=t?drive.doc.images[drive.doc.textures[t.index].source]:null,v=im?drive.doc.bufferViews[im.bufferView]:null;return{name:m.name,baseColorFactor:p.baseColorFactor,metallicFactor:p.metallicFactor,roughnessFactor:p.roughnessFactor,emissiveFactor:m.emissiveFactor,doubleSided:m.doubleSided,alphaMode:m.alphaMode,texture:v?sha(drive.bin.subarray(v.byteOffset,v.byteOffset+v.byteLength)):null};}
function meshHash(mesh){return sha(JSON.stringify(mesh.primitives.map(p=>({indices:sha(accessor(p.indices).bytes),attributes:Object.fromEntries(Object.entries(p.attributes).sort().map(([k,i])=>[k,sha(accessor(i).bytes)])),material:material(p.material)}))));}
const cabin=drive.doc.meshes.find(m=>m.name==='drive_cabin'),triangles=[];
for(const primitive of cabin.primitives){const p=accessor(primitive.attributes.POSITION).values,indices=accessor(primitive.indices).values;for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(index=>p.slice(index*3,index*3+3)));}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a);
function hitTriangle(origin,direction,[a,b,c]){const e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)return Infinity;const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)return Infinity;const q=cross(t,e1),v=dot(direction,q)/det;if(v<0||u+v>1)return Infinity;const distance=dot(e2,q)/det;return distance>1e-6?distance:Infinity;}
function firstHit(origin,target){const delta=sub(target,origin),length=norm(delta),direction=delta.map(v=>v/length);return Math.min(...triangles.map(t=>hitTriangle(origin,direction,t)));}
function pointTriangleDistance(p,[a,b,c]){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return norm(ap);
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return norm(bp);
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const t=d1/(d1-d3);return norm(sub(ap,ab.map(v=>v*t)));}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return norm(cp);
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const t=d2/(d2-d6);return norm(sub(ap,ac.map(v=>v*t)));}
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const t=(d4-d3)/(d4-d3+d5-d6);return norm(sub(bp,sub(c,b).map(v=>v*t)));}
 const n=cross(ab,ac);return Math.abs(dot(ap,n))/norm(n);
}
function clearance(point){let distance=Infinity;for(const triangle of triangles){const lower=Math.hypot(...point.map((v,axis)=>Math.max(0,Math.min(...triangle.map(p=>p[axis]))-v,v-Math.max(...triangle.map(p=>p[axis])))));if(lower<distance)distance=Math.min(distance,pointTriangleDistance(point,triangle));}return distance;}

test('the canonical cabin and geometry receipt identify the same final exported asset',()=>{
 assert.equal(sha(drive.bytes),metrics.sha256);assert.deepEqual(read('public/assets/source-drive/drive.glb'),drive.bytes);
 assert.deepEqual(JSON.parse(read('public/assets/source-drive/geometry/metrics.json')),metrics);
 assert.equal(metrics.cabinRevision,'formed-working-van-v3');
 assert.equal(triangles.length,metrics.parts.find(p=>p.mesh==='drive_cabin').triangles);
 assert.equal(cabin.primitives.length,10,'broad material families do not add draw primitives');
 assert.ok(triangles.length<45000&&metrics.triangles<72000,'cabin and receiver construction stay within the bounded pack budget');
});

test('all control positions, other control meshes, world geometry and textures preserve the approved contracts',()=>{
 for(const[key,value]of Object.entries(before.contract))assert.deepEqual(metrics[key],value,key);
 assert.equal(drive.doc.meshes.length,Object.keys(before.meshes).length+1);
 for(const[name,hash]of Object.entries(before.meshes)){const mesh=drive.doc.meshes.find(m=>m.name===name);assert.ok(mesh,name);if(name!=='drive_radio')assert.equal(meshHash(mesh),hash,name);}
 assert.notEqual(meshHash(drive.doc.meshes.find(m=>m.name==='drive_radio')),before.meshes.drive_radio,'the receiver model is intentionally refined');
});

test('the seated eye has physical head clearance and a clear usable windscreen',()=>{
 assert.ok(clearance(metrics.eye)>.20,'the head is not embedded in trim, seat, roof or a door');
 const w=metrics.windscreenOpening;
 for(const x of[-.65,-.3,0,.3,.65])for(const y of[1.42,1.65,1.95]){
  const z=w.bottomZ+(y-w.bottomY)/(w.topY-w.bottomY)*(w.topZ-w.bottomZ),target=[x,y,z];
  assert.ok(firstHit(metrics.eye,target)>norm(sub(target,metrics.eye))+.02,`clear windshield ray ${x}/${y}`);
 }
});

test('the wheel rim retains full steering clearance from the new fascia, hood and door trim',()=>{
 const {center,tiltX,radius,rimTubeRadius}=metrics.wheel,c=Math.cos(tiltX),s=Math.sin(tiltX);
 for(let i=0;i<48;i++){const a=i*Math.PI/24,point=[center[0]+radius*Math.cos(a),center[1]+c*radius*Math.sin(a),center[2]+s*radius*Math.sin(a)];assert.ok(clearance(point)>rimTubeRadius+.018,`rim clearance ${i}`);}
});

test('the cabin cannot hide the fixed radio, recorder keys or gauge faces from the seated eye',()=>{
 const rc=metrics.recorder,c=Math.cos(rc.tiltX),s=Math.sin(rc.tiltX),points=[[-.065,1.10,-.36],...[-.0198,.025,.0698].map(x=>[x,1.07592,-.379])];
 for(let i=0;i<3;i++){const p=[.0340638587+i*99*.274/736,-.05547011,.0299];points.push([rc.center[0]+p[0],rc.center[1]+c*p[1]-s*p[2],rc.center[2]+s*p[1]+c*p[2]]);}
 points.push(...[.30,.48,.66].map(x=>[x,1.207,-.623]));
 for(const target of points)assert.ok(firstHit(metrics.eye,target)>=norm(sub(target,metrics.eye))-.012,`unobstructed operative face ${target}`);
});

test('the authored cabin contains dimensional construction rather than surface plaques',()=>{
 const features=metrics.cabinConstruction.features,find=name=>{const feature=features.find(f=>f.name===name);assert.ok(feature,name);return feature.bounds;};
 for(const name of['pressed sloping firewall','engine access doghouse','curved insulated headliner','open instrument hood','equipment shelf','door pocket bottom','shaped vinyl cushion','shaped vinyl back','bulkhead document rack lip'])find(name);
 for(const name of['heater control cartridge','heater lever slot','heater slide lever','heater thumb pad','equipment tray contact paint loss'])find(name);
 const hood=find('open instrument hood');assert.ok(hood.max[2]-hood.min[2]>.35,'the instrument hood has actual depth');
 const shelf=find('equipment shelf');assert.ok(shelf.max[2]-shelf.min[2]>.32);
 const back=find('shaped vinyl back');assert.ok(back.max[2]-back.min[2]>.15,'back cushion includes recline and side bolsters');
 const liner=find('curved insulated headliner');assert.ok(liner.max[1]-liner.min[1]>.07,'the headlining follows a real cross section');
});

test('receiver contact skins and supported construction match unchanged operative hand targets',()=>{
 const radio=drive.doc.meshes.find(m=>m.name==='drive_radio'),faces=[];
 for(const primitive of radio.primitives){const p=accessor(primitive.attributes.POSITION).values,indices=accessor(primitive.indices).values;for(let i=0;i<indices.length;i+=3)faces.push(indices.slice(i,i+3).map(index=>p.slice(index*3,index*3+3)));}
 const contacts=[{id:'power',point:[-.065,1.10,-.360]},...[-.0198,.025,.0698].map((x,i)=>({id:'preset-'+(i+1),point:[x,1.07592,-.379]}))];
 for(const{id,point}of contacts){const start=point.map((v,i)=>v+(i===2?.05:0)),distance=Math.min(...faces.map(t=>hitTriangle(start,[0,0,-1],t)));assert.ok(Math.abs(distance-.05)<.0007,`${id} contact error ${distance-.05}`);}
 const f=metrics.radioConstruction.features,find=name=>{const q=f.find(v=>v.name===name);assert.ok(q,name);return q.bounds;};
 const sleeve=find('receiver supported steel sleeve');assert.ok(sleeve.max[2]-sleeve.min[2]>.15);assert.ok(sleeve.min[2]<-.579,'sleeve physically overlaps existing fascia mounting block');
 const foot=find('receiver shelf isolation foot'),cleat=find('receiver steel support cleat');assert.ok(foot.min[1]<=1.0255&&foot.max[1]>=cleat.min[1],'isolators join shelf to sleeve cleats');
 const skin=find('receiver preset solid cap'),stem=find('receiver preset travel stem');assert.ok(stem.max[2]-stem.min[2]>=.0179&&stem.max[2]>=skin.min[2],'cap has actual travel stem behind its skin');
 const scale=find('receiver scale ivory enamel');assert.ok(metrics.radioNeedle.center[2]-.001>scale.max[2]+.001,'the actual moving pointer remains in front of its opaque enamel scale');
 for(const primitive of radio.primitives){const m=drive.doc.materials[primitive.material];assert.ok(!m.alphaMode||m.alphaMode==='OPAQUE','no alpha outlines on the receiver');}
});
