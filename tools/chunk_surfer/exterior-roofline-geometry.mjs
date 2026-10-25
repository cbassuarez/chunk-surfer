// The old west wall skin stood .56–.74m forward of its own coping. This small
// construction bridges that real gap and closes the four existing roof bands.
// Existing gables, lanterns, tower, roof garden and neighbourhood roofs remain.
import {EXTERIOR_ROOFLINE as C,EXTERIOR_ROOFLINE_MESH} from '../../src/data/exterior-roofline.js';
export const EXTERIOR_ROOFLINE_MATERIALS=[
  {name:'roofline rain-worn limestone',rgb:[.31,.30,.265],roughness:.94,metallic:0},
  {name:'roofline dressed stone shadow bed',rgb:[.16,.17,.155],roughness:.97,metallic:0},
  {name:'roofline dull sheet lead',rgb:[.15,.18,.18],roughness:.86,metallic:.08},
  {name:'roofline weathered zinc',rgb:[.135,.17,.18],roughness:.88,metallic:.06},
  {name:'roofline bonded asphalt',rgb:[.055,.065,.068],roughness:.95,metallic:0},
];
export function exteriorRooflineGeometry(){
  const mesh={name:EXTERIOR_ROOFLINE_MESH,primitives:[],parts:[],bands:[]};
  const stock=material=>mesh.primitives.find(p=>p.material===material)||(mesh.primitives.push({material,positions:[],normals:[],uvs:[],indices:[]}),mesh.primitives.at(-1));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const quad=(id,points,material)=>{
    const g=stock(material),base=g.positions.length/3,u=points[1].map((v,k)=>v-points[0][k]),v=points[2].map((v,k)=>v-points[0][k]),n=cross(u,v),len=Math.hypot(...n);if(len<1e-10)throw Error(`Degenerate roof quad ${id}`);
    const normal=n.map(v=>v/len),major=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=major===0?[2,1]:major===1?[0,2]:[0,1];
    for(const p of points){g.positions.push(...p);g.normals.push(...normal);g.uvs.push(p[axes[0]],p[axes[1]]);}g.indices.push(base,base+1,base+2,base,base+2,base+3);
  };
  const box=(id,c,size,material)=>{
    const h=size.map(v=>v/2),p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+(i&(1<<k)?h[k]:-h[k])));
    for(const face of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(id,face.map(i=>p[i]),material);
    mesh.parts.push({id,kind:'box',center:c,size,material});
  };
  for(const band of C.bands){
    const {height:h,z0,z1}=band,length=z1-z0,material={lead:2,zinc:3,asphalt:4}[band.finish],roofY=x=>h+C.frontRoofRise+(x-C.roofX0)/(C.roofX1-C.roofX0)*(C.rearRoofRise-C.frontRoofRise),a=C.roofX0,b=C.roofX1;
    // A closed, subtly drained tray overlaps the original thin skin and sits
    // above the grid's solid top, below the existing coping. Six opaque faces
    // retain a real underside from oblique street views.
    const upper=[[a,roofY(a),z0],[b,roofY(b),z0],[b,roofY(b),z1],[a,roofY(a),z1]],lower=upper.map(p=>[p[0],p[1]-C.roofThickness,p[2]]);
    quad(`${band.id}-roof-top`,[upper[0],upper[3],upper[2],upper[1]],material);
    quad(`${band.id}-roof-soffit`,lower,material);
    for(let j=0;j<4;j++){const k=(j+1)%4;quad(`${band.id}-roof-edge-${j}`,[lower[j],lower[k],upper[k],upper[j]],material);}
    mesh.parts.push({id:`${band.id}-closed-roof`,kind:'closed-tray',upper,lower,material});
    // Broad carved courses carry the same restrained institutional order as
    // the retained roof/stair work. Protected necks stay darker than the cap.
    for(const section of C.corniceSections){
      const divisions=Math.max(1,Math.ceil(length/1.08));
      for(let j=0;j<divisions;j++){
        const lo=z0+j*length/divisions,hi=z0+(j+1)*length/divisions,joint=section.id==='coping'?.006:0;
        box(`${band.id}-${section.id}-${j}`,[(section.x0+section.x1)/2,h+(section.y0+section.y1)/2,(lo+hi)/2],[section.x1-section.x0,section.y1-section.y0,hi-lo-joint],section.id==='neck'?1:0);
      }
    }
    // Stone joints are filled bedding, not open slits through the crown. A
    // recessed continuous mortar core keeps the 6mm joints dark and solid.
    box(`${band.id}-coping-mortar-bed`,[-.505,h+.145,(z0+z1)/2],[.97,.14,length],1);
    // Solid end returns close the profile at each change in phase height. No
    // freestanding teeth, heraldry, new towers, or extended skyline is added.
    for(const side of[-1,1]){
      const z=side<0?z0+.04:z1-.04;
      box(`${band.id}-coping-return-${side}`,[-.51,h+.145,z],[1.02,.15,.08],0);
    }
    // Standing folds are geometry at an honest 25mm seam height. They follow
    // drainage; the large tray and cap carry the view when these reduce away.
    if(band.finish!=='asphalt')for(let z=z0+.58;z<z1-.3;z+=.72){
      const width=.022,y0=roofY(a+.08),y1=roofY(b-.08);
      quad(`${band.id}-seam-left`,[[a+.08,y0,z-width/2],[b-.08,y1,z-width/2],[b-.08,y1+.025,z-width/2],[a+.08,y0+.025,z-width/2]],material);
      quad(`${band.id}-seam-right`,[[a+.08,y0+.025,z+width/2],[b-.08,y1+.025,z+width/2],[b-.08,y1,z+width/2],[a+.08,y0,z+width/2]],material);
      quad(`${band.id}-seam-top`,[[a+.08,y0+.025,z-width/2],[a+.08,y0+.025,z+width/2],[b-.08,y1+.025,z+width/2],[b-.08,y1+.025,z-width/2]],material);
    }
    mesh.bands.push({...band,roofX0:a,roofX1:b,roofTopRange:[roofY(a),roofY(b)],minimumStockY:h-.50,maximumStockY:h+.22});
  }
  mesh.bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const g of mesh.primitives)for(let i=0;i<g.positions.length;i++){const k=i%3;mesh.bounds.min[k]=Math.min(mesh.bounds.min[k],g.positions[i]);mesh.bounds.max[k]=Math.max(mesh.bounds.max[k],g.positions[i]);}
  mesh.triangles=mesh.primitives.reduce((n,p)=>n+p.indices.length/3,0);if(mesh.triangles>C.maximumTriangles)throw Error('Roof closure exceeds bounded geometry budget');
  return mesh;
}
