// A second, coherent carved order for the existing belvedere: deep cornices,
// coarse dentils, full leafy capitals and shell-and-swag relief. Everything
// is ordinary opaque geometry in the existing roof owner and material stack.
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
export const ROOF_PALATIAL_STONEWORK=freeze({
  triangleBudget:16000,
  sideCornices:[
    {id:'west',x:-11.30,sign:-1,ranges:[[-9.40,-6.80],[-5.20,9.40]]},
    {id:'east',x:11.30,sign:1,ranges:[[-9.40,9.40]]},
  ],
  southCornice:{z:12.82,ranges:[[-7.35,-1.95],[-.05,5.35]]},
  capitals:[
    ...[-1,1].flatMap(sign=>[-9,-3,3,9].map(z=>({
      id:`${sign<0?'west':'east'}-capital-${z}`,x:sign*11.13,z,yaw:sign*Math.PI/2,
    }))),
    ...[-7,5].map(x=>({id:`south-capital-${x}`,x,z:12.62,yaw:Math.PI})),
  ],
  cartouches:[
    {id:'west-shell',x:-10.75,y:3.77,z:0,yaw:-Math.PI/2,scale:1},
    {id:'east-shell',x:10.75,y:3.77,z:0,yaw:Math.PI/2,scale:1},
    {id:'south-shell',x:-1,y:3.77,z:12.33,yaw:Math.PI,scale:1.16},
  ],
  protectedFoliate:{x0:-11.22,x1:-10.80,y0:3.49,y1:4.42,z0:-6.70,z1:-5.30},
  protectedLyre:{x0:-1.85,x1:-.15,y0:4.225,y1:5.65,z0:12.56,z1:12.90},
  sideTop:4.34,
  southTop:4.69,
  minimumHeight:2.75,
});

export function buildRoofPalatialStonework({m,materials,carvedStone,oldBronze,
  quietIron,addBox,addBeam,addEllipsoid,addCylinder,addQuad}){
  const mat=(name,rgb)=>{
    const index=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],
      metallicFactor:0,roughnessFactor:.96}});
    return index;
  };
  const stone=carvedStone??mat('roof palatial carved wet limestone',[.355,.320,.255]);
  // No additional finish or emitter is needed. Supplied bronze is confined to
  // isolated centre studs, rather than outlining the whole terrace in gold.
  const bronze=oldBronze??stone;
  let shapeCount=0,triangles=0;
  const components=[];
  const part=(id,build)=>{
    const first=shapeCount,before=triangles;build();
    components.push({id,first,end:shapeCount,triangles:triangles-before});
  };
  const box=(c,size,material=stone,yaw=0)=>{shapeCount++;triangles+=12;addBox(m,c,size,material,yaw);};
  const beam=(a,b,w,material=stone)=>{shapeCount++;triangles+=12;addBeam(m,a,b,w,material);};
  const ell=(c,r,material=stone,lat=6,lon=10)=>{
    shapeCount++;triangles+=lat*lon*2;addEllipsoid(m,c,r,material,lat,lon);
  };
  const quad=(a,b,c,d,material=stone)=>{shapeCount++;triangles+=2;addQuad(m,a,b,c,d,material);};
  const face=(a,b,c,d,material=stone)=>{
    quad(a,b,c,d,material);quad(d,c,b,a,material);
  };
  const line=(points,width,material=stone)=>{
    for(let i=1;i<points.length;i++)beam(points[i-1],points[i],width,material);
  };
  const frame=at=>{
    const c=Math.cos(at.yaw),s=Math.sin(at.yaw),originY=at.y||0;
    const p=([x,y,z])=>[at.x+x*c-z*s,originY+y,at.z+x*s+z*c];
    return{
      p,
      box:(centre,size,material=stone)=>box(p(centre),size,material,at.yaw),
      beam:(a,b,w,material=stone)=>beam(p(a),p(b),w,material),
      face:(a,b,c,d,material=stone)=>face(p(a),p(b),p(c),p(d),material),
      ell:(centre,r,material=stone,lat=6,lon=10)=>ell(p(centre),
        Math.abs(s)>.5?[r[2],r[1],r[0]]:r,material,lat,lon),
    };
  };

  for(const side of ROOF_PALATIAL_STONEWORK.sideCornices){
    part(`${side.id}-deep-entablature`,()=>{
      for(const[z0,z1]of side.ranges){
        const z=(z0+z1)/2,d=z1-z0;
        for(const[y,w,h]of[[3.84,1.05,.12],[4.035,.90,.37],[4.19,1.14,.12],[4.27,1.34,.14]])
          box([side.x,y,z],[w,h,d]);
        // Coarse teeth read as a rhythm of light and shadow at ordinary FOV.
        for(let zz=z0+.25;zz<z1-.12;zz+=.58)
          box([side.sign*10.88,3.755,zz],[.28,.25,.25]);
      }
    });
  }
  part('south-deep-entablature',()=>{
    const south=ROOF_PALATIAL_STONEWORK.southCornice;
    for(const[x0,x1]of south.ranges){
      const x=(x0+x1)/2,w=x1-x0;
      for(const[y,d,h]of[[4.30,.94,.12],[4.455,1.02,.24],[4.60,1.17,.12],[4.66,1.28,.06]])
        box([x,y,south.z],[w,h,d]);
      for(let xx=x0+.27;xx<x1-.12;xx+=.58)
        box([xx,4.18,12.26],[.26,.26,.28]);
    }
  });

  for(const at of ROOF_PALATIAL_STONEWORK.capitals){
    part(at.id,()=>{
      const f=frame(at);
      f.box([0,3.14,.04],[1.20,.15,.42]);
      f.box([0,3.02,.07],[1.04,.14,.40]);
      // Three folded acanthus tongues grow from the neck into the abacus.
      // Broad lobes and deep returns carry the carving, rather than veins.
      for(const x of[-.36,0,.36]){
        const a=[x-.10,2.80,.035],b=[x-.19,3.10,.11],
          c=[x,3.27,.22],d=[x+.19,3.10,.11],ridge=[x,3.025,.34];
        f.face(a,b,c,ridge);f.face(c,d,[x+.10,2.80,.035],ridge);
      }
      for(const sign of[-1,1]){
        const points=Array.from({length:13},(_,i)=>{
          const angle=-.35+i/12*Math.PI*1.70;
          const radius=.235*(1-.42*i/12);
          return f.p([sign*(.41+Math.cos(angle)*radius),3.08+Math.sin(angle)*radius,.22]);
        });
        line(points,.115);
      }
    });
  }

  for(const at of ROOF_PALATIAL_STONEWORK.cartouches){
    part(at.id,()=>{
      const f=frame(at),scale=at.scale;
      const p=([x,y,z])=>[x*scale,y,z];
      f.box([0,-.08,-.035],[1.72*scale,.58,.19]);
      if(at.id==='south-shell')
        // The pendant shell is visibly forward of the arch. A short stone
        // hanger joins its back to the underside of the existing lyre plinth,
        // finishing below the musical crest rather than burying that crest.
        f.box([0,.30,-.25],[.32,.30,.50]);
      // The shell is a complete projecting fan with a folded field behind
      // the broad ribs. It overlaps its substrate at the back, while every
      // rib and the centre stud stand ahead of the new entablature face.
      const rays=Array.from({length:11},(_,i)=>{
        const a=i/10*Math.PI;
        return[Math.cos(a)*.95*scale,-.18+Math.sin(a)*.52,.12];
      });
      for(let i=1;i<rays.length;i++){
        const a=rays[i-1],b=rays[i];
        f.face([-.055*scale,-.30,.095],a,b,[.055*scale,-.30,.095]);
      }
      for(const tip of rays)f.beam([0,-.28,.22],tip,.105);
      f.ell([0,-.31,.20],[.17*scale,.12,.09],bronze,6,10);
      for(const sign of[-1,1]){
        const points=Array.from({length:13},(_,i)=>{
          const a=i/12*Math.PI*1.68,r=.20*(1-i/12*.37);
          return f.p(p([sign*(.90+Math.cos(a)*r),-.19+Math.sin(a)*r,.17]));
        });
        line(points,.105);
      }
    });
  }

  const swag=(id,at,halfSpan)=>part(id,()=>{
    const f=frame(at);
    const points=Array.from({length:15},(_,i)=>{
      const t=-1+2*i/14;
      return f.p([t*halfSpan,4.085-.235*(1-t*t),.10]);
    });
    line(points,.16);
    for(const sign of[-1,1]){
      f.box([sign*halfSpan,4.085,-.055],[.26,.27,.24]);
      f.ell([sign*halfSpan,4.075,.12],[.16,.17,.085],stone,6,8);
    }
    // A heavy central leaf belongs to the carved festoon, not a dangling
    // object or paper-thin decorative string.
    f.face([-.18,3.86,.10],[0,3.64,.17],[.18,3.86,.10],[0,3.99,.20]);
  });
  for(const side of[-1,1]){
    const yaw=side*Math.PI/2,x=side*10.70;
    for(const z of[-6,6]){
      if(side<0&&z<0)continue; // the existing foliate head owns this whole bay
      swag(`${side<0?'west':'east'}-swag-${z}`,{x,z,yaw},2.28);
    }
    // Paired shorter drapes lead into the centre shell without covering it.
    for(const z of[-1.84,1.84])swag(`${side<0?'west':'east'}-centre-swag-${z}`,
      {x,z,yaw},.70);
  }
  for(const x of[-4.45,2.45])swag(`south-swag-${x}`,{x,y:.25,z:12.20,yaw:Math.PI},1.42);

  if(triangles>ROOF_PALATIAL_STONEWORK.triangleBudget)
    throw new Error(`Roof palatial stonework exceeds its ${ROOF_PALATIAL_STONEWORK.triangleBudget} triangle budget: ${triangles}`);
  return{shapeCount,triangles,components};
}
