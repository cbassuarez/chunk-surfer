import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cross,printedFaceGeometry,railingBannerSurface,railingBannerPatch,railingBannerHemLift,RAILING_BANNER_CLOTH} from '../tools/chunk_surfer/lettering/face-geometry.mjs';
import {createSignAssemblies,RAILING_BANNER_REPAIRS} from '../tools/chunk_surfer/lettering/sign-assemblies.mjs';
const frame={center:[0,.56,-.248],readerRight:[-1,0,0],up:[0,1,0],widthM:3.8,heightM:1.02};
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
function meshPoint(mesh,u,v,window=[0,0,1,1]){
 const [nx,ny]=mesh.grid,a=(u-window[0])/(window[2]-window[0])*nx,b=(v-window[1])/(window[3]-window[1])*ny;
 const i=Math.min(nx-1,Math.max(0,Math.floor(a))),j=Math.min(ny-1,Math.max(0,Math.floor(b))),x=a-i,y=b-j;
 const ids=x+y<=1?[j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i]:[j*(nx+1)+i+1,(j+1)*(nx+1)+i,(j+1)*(nx+1)+i+1];
 const weights=x+y<=1?[1-x-y,x,y]:[1-y,1-x,x+y-1];
 return[0,1,2].map(k=>ids.reduce((n,id,q)=>n+mesh.positions[id*3+k]*weights[q],0));
}
test('railing cloth retains its four supports and keeps gravity clear of the ground',()=>{
 const g=printedFaceGeometry({...frame,shape:'railing-banner'}),spec=RAILING_BANNER_CLOTH;
 for(const [u,v]of[[0,0],[1,0],[0,1],[1,1]]){
  const s=railingBannerSurface({...frame,u,v}),expected=frame.center.map((q,k)=>q+frame.readerRight[k]*(u-.5)*frame.widthM+frame.up[k]*(.5-v)*frame.heightM);
  assert.ok(Math.hypot(...sub(s.position,expected))<1e-10);
 }
 assert.ok(Math.abs(railingBannerSurface({...frame,u:.5,v:0}).sagM-.035)<1e-10);
 assert.ok(Math.abs(railingBannerSurface({...frame,u:.5,v:1}).sagM-.015)<1e-10);
 const ys=g.positions.filter((_,i)=>i%3===1);assert.ok(Math.min(...ys)>.0349,'The free lower span cannot drag through the ground');
 assert.ok(Math.max(...g.positions.filter((_,i)=>i%3===2))-Math.min(...g.positions.filter((_,i)=>i%3===2))>.055,'The cloth needs visible depth rather than a flat-board proxy');
 for(let i=0;i<g.indices.length;i+=3){
  const ids=g.indices.slice(i,i+3),points=ids.map(id=>g.positions.slice(id*3,id*3+3)),n=unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
  for(const id of ids)assert.ok(dot(n,g.normals.slice(id*3,id*3+3))>.98,'Actual triangle normals and shared surface normals must agree through each fold');
 }
 assert.equal(spec.segmentsX,g.grid[0]);assert.equal(spec.segmentsY,g.grid[1]);
});
test('hems and repair tape sit on the same tessellated cloth, away from required words',()=>{
 const body=printedFaceGeometry({...frame,shape:'railing-banner'}),spec=RAILING_BANNER_CLOTH,hv=spec.hemWidthM/frame.heightM;
 for(const repair of RAILING_BANNER_REPAIRS){
  const top=repair.window[3]<.1,hemWindow=top?[0,0,1,hv]:[0,1-hv,1,1];
  const hem=railingBannerPatch({...frame,materialWindow:hemWindow,segmentsX:spec.segmentsX,segmentsY:3,offset:(u,v)=>railingBannerHemLift(u,v,frame.widthM,frame.heightM)});
  const tape=railingBannerPatch({...frame,materialWindow:repair.window,segmentsX:24,segmentsY:3,
   offset:(u,v)=>railingBannerHemLift(u,v,frame.widthM,frame.heightM)+spec.tapeThicknessM});
  assert.ok(top?repair.window[3]<.02:repair.window[1]>.98,'Repairs belong on the existing folded hem, not through ELLERY or STANDING');
  for(let y=0;y<=12;y++)for(let x=0;x<=48;x++){
   const u=repair.window[0]+x/48*(repair.window[2]-repair.window[0]),v=repair.window[1]+y/12*(repair.window[3]-repair.window[1]);
   const point=meshPoint(tape,u,v,repair.window),normal=railingBannerSurface({...frame,u,v}).normal;
   const bodyGap=dot(sub(point,meshPoint(body,u,v)),normal),hemGap=dot(sub(point,meshPoint(hem,u,v,hemWindow)),normal);
   assert.ok(bodyGap>.0001&&bodyGap<.0016,`Tape must stay attached above cloth; gap ${bodyGap}`);
   assert.ok(hemGap>.00005&&hemGap<.0011,`Tape must not clip through its curved hem; gap ${hemGap}`);
  }
 }
});
test('the reverse, returns and tape form finite closed assemblies without straight support beams',()=>{
 const materials=Array.from({length:11},(_,i)=>({name:`material-${i}`,pbrMetallicRoughness:{baseColorFactor:[.5,.4,.3,1],metallicFactor:0,roughnessFactor:.7}}));
 const MAT={dark:0,wood:1,black:2,steel:3,ivory:4,brass:5,cloth:6,paper:7,agedWhite:8,terracotta:9,slate:10};
 const group=(m,i)=>{if(!m.groups.has(i))m.groups.set(i,{positions:[],normals:[],uvs:[],indices:[]});return m.groups.get(i);};
 const kit=createSignAssemblies({materials,group,MAT}),m={name:'vigil_part_banner',groups:new Map()};kit.railingBanner(m,frame);
 assert.equal(m.extras.signAssemblies.filter(r=>r.kind==='curved-folded-cloth-hem').length,4);
 assert.equal(m.extras.signAssemblies.filter(r=>r.kind==='adhered-cloth-hem-repair').length,2);
 assert.equal(m.extras.signAssemblies.some(r=>r.kind==='fabricated-member'),false,'No rigid rod/box can be hidden behind the cloth');
 for(const g of m.groups.values()){
  assert.ok(g.positions.every(Number.isFinite)&&g.normals.every(Number.isFinite));
  for(let i=0;i<g.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...g.normals.slice(i,i+3))-1)<1e-8);
 }
 const main=[...m.groups.values()][0],vertices=(RAILING_BANNER_CLOTH.segmentsX+1)*(RAILING_BANNER_CLOTH.segmentsY+1);
 for(let i=0;i<vertices;i++){
  const a=main.positions.slice(i*3,i*3+3),b=main.positions.slice((i+vertices)*3,(i+vertices)*3+3),n=main.normals.slice(i*3,i*3+3);
  assert.ok(Math.abs(dot(sub(a,b),n)-RAILING_BANNER_CLOTH.clothThicknessM)<1e-10,'The reverse must retain real cloth thickness through every fold');
 }
});
