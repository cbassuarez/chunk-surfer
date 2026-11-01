// Authored metre-scale geometry for the Source II listening place. These
// meshes give its near surfaces thickness, rounded edges and material relief.
import {LEAF_SHAPES,leafOutline} from '../world/leaf-species.js';
const box=(a,b,c,d,e,f)=>({p:[a,c,e,b,c,e,b,c,f,a,c,f,a,d,e,b,d,e,b,d,f,a,d,f],i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]});
const join=(items)=>{const p=[],i=[];for(const g of items){const o=p.length/3;p.push(...g.p);i.push(...g.i.map(n=>n+o));}return{p,i};};
function foliage(){const p=[],i=[],rings=[[0,.27],[.20,.48],[.68,.35],[1,.018]];for(const[y,r]of rings)for(let k=0;k<9;k++){const a=k*Math.PI*2/9;p.push(Math.cos(a)*r,y,Math.sin(a)*r);}for(let j=0;j<3;j++)for(let k=0;k<9;k++){const a=j*9+k,b=j*9+(k+1)%9,c=a+9,d=b+9;i.push(a,c,b,b,c,d);}for(let k=1;k<8;k++)i.push(0,k,k+1);return{p,i};}
function rainRing(){const p=[],i=[];for(let k=0;k<16;k++){const a=k*Math.PI*2/16;for(const r of[.83,1])p.push(Math.cos(a)*r,0,Math.sin(a)*r);}for(let k=0;k<16;k++){const a=k*2,b=(k+1)%16*2;i.push(a,a+1,b+1,a,b+1,b);}return{p,i};}
function weatherLeaf(shape){const p=[],i=[],rows=leafOutline(shape);for(const row of rows)p.push(Math.sin((row.along+.5)*Math.PI)*shape.curl*.09,row.along,row.lower,Math.sin((row.along+.5)*Math.PI)*shape.curl*.09,row.along,row.upper);for(let n=0;n<rows.length-1;n++){const a=n*2,b=a+2;i.push(a,a+1,b+1,a,b+1,b);}return{p,i};}
function gardenArch(){
  const pieces=[box(-.5,.5,0,2.5,-4.05,-3.30),box(-.5,.5,0,2.5,3.30,4.05)];
  for(let k=0;k<20;k++){
    const a=k*Math.PI/20,b=(k+1)*Math.PI/20,p=[];
    for(const x of[-.5,.5])for(const[r,t]of[[3.30,a],[4.05,a],[4.05,b],[3.30,b]])p.push(x,2.5+Math.sin(t)*r,Math.cos(t)*r);
    pieces.push({p,i:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]});
  }
  return join(pieces);
}
function bevel(a,b,c,d,e,f,r=.03){
  const p=[],i=[],outline=(inset,y)=>{const x0=a+inset,x1=b-inset,z0=e+inset,z1=f-inset,q=Math.max(.001,r-inset);
    return [[x0+q,y,z0],[x1-q,y,z0],[x1,y,z0+q],[x1,y,z1-q],[x1-q,y,z1],[x0+q,y,z1],[x0,y,z1-q],[x0,y,z0+q]];};
  const rings=[outline(r*.45,c),outline(0,c+r),outline(0,d-r),outline(r*.45,d)];p.push(...rings.flat(2));
  for(let n=0;n<3;n++)for(let k=0;k<8;k++){const a=n*8+k,b=n*8+(k+1)%8,c=(n+1)*8+k,d=(n+1)*8+(k+1)%8;i.push(a,c,b,b,c,d);}
  for(let k=1;k<7;k++){i.push(0,k,k+1);i.push(24,24+k+1,24+k);}return{p,i};
}
const leg=(x,z)=>bevel(x-.045,x+.045,.02,.45,z-.055,z+.055,.014);
const frame=join([
  ...[-.24,.25].flatMap(x=>[-.77,.77].map(z=>leg(x,z))),
  bevel(-.34,.37,.34,.43,-.88,.88,.025),
  bevel(-.35,-.26,.43,.97,-.88,.88,.025),
  ...[-1,1].map(s=>bevel(-.32,.40,.63,.71,s<0?-.94:.83,s<0?-.83:.94,.025)),
  ...[-1,1].flatMap(s=>[box(.25,.30,.42,.65,s*.89-.035,s*.89+.035),box(-.29,-.24,.43,.65,s*.89-.035,s*.89+.035)]),
  ...[-.61,0,.61].map(z=>bevel(-.385,-.345,.52,.92,z-.018,z+.018,.006)),
]);
const cushions=join([
  ...[-1,1].map(s=>bevel(-.24,.35,.43,.57,s<0?-.80:.025,s<0?-.025:.80,.05)),
  ...[-1,1].map(s=>bevel(-.26,-.15,.59,.92,s<0?-.79:.025,s<0?-.025:.79,.035)),
]);
const piping=join([...[-1,1].flatMap(s=>[box(-.215,.325,.545,.555,s<0?-.77:.035,s<0?-.76:.045),box(-.215,.325,.545,.555,s<0?-.045:.76,s<0?-.035:.77)]),
  ...[-.40,.40].map(z=>bevel(-.15,-.14,.735,.762,z-.014,z+.014,.004))]);
const model=(geometry,material,base,extra={})=>({...geometry,material,base:[...base,1],...extra});
export function sourceRestGeometryLibrary(){return{
  'rest-settle-frame':model(frame,'wood',[.68,.48,.27]),
  'rest-settle-cloth':model(cushions,'case-lining',[.46,.55,.39]),
  'rest-settle-piping':model(piping,'linen',[.67,.59,.38]),
  'rest-oak':model(bevel(-.5,.5,0,1,-.5,.5,.035),'wood',[.66,.48,.29]),
  'rest-stone':model(bevel(-.5,.5,0,1,-.5,.5,.045),'linen',[.78,.73,.61]),
  'rest-vista-arch':model(gardenArch(),'linen',[.82,.76,.61]),
  'rest-copper':model(bevel(-.5,.5,0,1,-.5,.5,.025),'worn-metal',[.58,.39,.22]),
  'rest-green':model(foliage(),'linen',[.32,.43,.28]),
  'rest-water':model(box(-.5,.5,0,.012,-.5,.5),'dark',[.27,.38,.39]),
  'rest-light-strip':model(box(-.5,.5,0,1,-.5,.5),'linen',[.74,.59,.37],{emissive:[.24,.14,.045]}),
  'rest-rain':model(join([box(-.5,.5,0,1,-.035,.035),box(-.035,.035,0,1,-.5,.5)]),'linen',[.61,.70,.69],{emissive:[.07,.10,.095]}),
  'rest-rain-ring':model(rainRing(),'linen',[.53,.64,.63],{emissive:[.035,.05,.045]}),
  'rest-roof-glass':model(bevel(-.5,.5,0,1,-.5,.5,.025),'linen',[.44,.52,.49],{roughness:.42}),
  'rest-rain-wet':model(box(-.5,.5,0,.006,-.5,.5),'dark',[.20,.31,.31],{roughness:.40}),
  'rest-weather-sheet':model({p:[0,-.5,-.35,.055,-.5,0,0,-.5,.35,0,.5,-.35,.055,.5,0,0,.5,.35],i:[0,1,4,0,4,3,1,2,5,1,5,4]},'linen',[.78,.72,.55]),
  ...Object.fromEntries(LEAF_SHAPES.map(shape=>['rest-weather-leaf-'+shape.id,model(weatherLeaf(shape),'linen',[.62,.46,.24])])),
};}
