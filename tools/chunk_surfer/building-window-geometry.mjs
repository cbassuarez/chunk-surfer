import { BUILDING_WINDOWS } from '../../src/data/building-windows.js';
import { buildingWindowMeshName } from '../../src/data/building-window-fittings.js';

export const BUILDING_WINDOW_CUT_TUNNELS=Object.freeze(BUILDING_WINDOWS.map(w=>Object.freeze({
  id:w.id,min:Object.freeze([
    w.wall==='west'?48.5:w.physical.x0,
    w.sill,w.wall==='north'?w.physical.z0-1.5:w.physical.z0,
  ]),max:Object.freeze([
    w.physical.x1,
    w.head,w.wall==='south'?52:w.physical.z1,
  ]),
})));

export const BUILDING_WINDOW_HOST_ORIGINS=Object.freeze({
  conservatory_west_elevation:Object.freeze([50,0,7.5]),
  front_atrium_perimeter_relief:Object.freeze([85.5,0,15]),
});

const EPS=1e-9;
function subtractOne(box,cut) {
  const lo=box.min.map((v,i)=>Math.max(v,cut.min[i])),hi=box.max.map((v,i)=>Math.min(v,cut.max[i]));
  if(lo.some((v,i)=>v>=hi[i]-EPS))return [box];
  const out=[],push=(min,max)=>{if(min.every((v,i)=>max[i]-v>EPS))out.push({min,max});};
  // Six disjoint slabs. Each later axis uses the intersection interval on the
  // preceding axes, so no corner is duplicated and no remaining volume lost.
  push([...box.min],[lo[0],box.max[1],box.max[2]]);
  push([hi[0],box.min[1],box.min[2]],[...box.max]);
  push([lo[0],box.min[1],box.min[2]],[hi[0],lo[1],box.max[2]]);
  push([lo[0],hi[1],box.min[2]],[hi[0],box.max[1],box.max[2]]);
  push([lo[0],lo[1],box.min[2]],[hi[0],hi[1],lo[2]]);
  push([lo[0],lo[1],hi[2]],[hi[0],hi[1],box.max[2]]);
  return out;
}

// Input/output remain in the facade mesh's local coordinates. This helper is
// for unrotated boxes only; the caller retains material and other attributes.
export function subtractBuildingWindowBoxes(center,size,{origin=[50,0,7.5],cuts=BUILDING_WINDOW_CUT_TUNNELS}={}) {
  if(![center,size,origin].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))
    throw new TypeError('window subtraction requires three finite coordinates');
  if(size.some(v=>v<=0))return [];
  let boxes=[{min:center.map((v,i)=>v+origin[i]-size[i]/2),max:center.map((v,i)=>v+origin[i]+size[i]/2)}];
  if(!cuts.some(cut=>boxes[0].min.every((v,i)=>v<cut.max[i]-EPS&&boxes[0].max[i]>cut.min[i]+EPS)))
    return [{center:[...center],size:[...size]}];
  for(const cut of cuts)boxes=boxes.flatMap(box=>subtractOne(box,cut));
  return boxes.map(box=>({center:box.min.map((v,i)=>(v+box.max[i])/2-origin[i]),size:box.min.map((v,i)=>box.max[i]-v)}));
}

export function buildBuildingWindows({mesh,materials,addBox,addBeam,addEllipsoid,addQuad}) {
  const material=(name,rgb,metallic=0,roughness=.8)=>{
    const id=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness}});
    return id;
  };
  const stone=material('window deep painted reveal',[.50,.49,.42],0,.96);
  const sill=material('window rubbed stone sill',[.39,.405,.36],0,.88);
  const oak=material('window dark varnished sash',[.16,.10,.055],0,.66);
  const enamel=material('window baths painted iron',[.48,.55,.49],.10,.72);
  const brass=material('window aged catches and poles',[.35,.26,.12],.48,.58);
  const cloth=material('window pulled green velvet',[.075,.12,.09],0,.99);
  const cord=material('window worn cotton cord',[.45,.42,.32],0,.98);
  const glassEdge=material('window clear pane edge',[.18,.25,.25],.02,.35);
  const water=material('window sparse rain marks',[.29,.34,.32],.01,.48);
  for(const w of BUILDING_WINDOWS) {
    const m=mesh(buildingWindowMeshName(w.id)),width=w.physical.to-w.physical.from,h=w.head-w.sill,d=w.physical.depth;
    const baths=w.wall==='south',timber=baths?enamel:oak,bays=w.bayCount;
    m.extras={buildingWindowId:w.id,glazingRepresentation:'edge-and-rain-lines',opticalRefraction:false,
      aperture:{width,height:h,depth:d},clearPane:true};
    // Deep jambs, soffit and sill line the actual cut. No broad back face is
    // inserted: the air interval remains open all the way to the exterior.
    for(const sign of[-1,1]) {
      addBox(m,[sign*(width/2+.045),h/2,-d/2],[.09,h+.10,d],stone);
      addBox(m,[sign*(width/2+.055),h/2,.025],[.13,h+.16,.05],timber);
    }
    addBox(m,[0,h+.035,-d/2],[width+.18,.07,d],stone);
    addBox(m,[0,-.045,-d/2+.07],[width+.26,.09,d+.28],sill);
    addBox(m,[0,-.004,.205],[width+.30,.032,.075],sill);
    const frameZ=-d+.16;
    const sash=(cx,bw,bottom,top)=>{
      const sh=top-bottom,cy=(top+bottom)/2;
      for(const sign of[-1,1])addBox(m,[cx+sign*(bw/2-.033),cy,frameZ],[.066,sh,.105],timber);
      for(const y of[bottom+.026,top-.026])addBox(m,[cx,y,frameZ],[bw,.052,.105],timber);
      // Thin, visible edges acknowledge a retained pane without covering the
      // view with opaque coloured geometry or claiming optical refraction.
      for(const sign of[-1,1])addBox(m,[cx+sign*(bw/2-.075),cy,frameZ+.008],[.008,Math.max(.05,sh-.10),.008],glassEdge);
      for(const y of[bottom+.062,top-.062])addBox(m,[cx,y,frameZ+.008],[Math.max(.1,bw-.14),.008,.008],glassEdge);
      addBeam(m,[cx-bw*.18,bottom+sh*.22,frameZ+.006],[cx-bw*.16,bottom+sh*.43,frameZ+.006],.004,water);
    };
    for(let i=0;i<bays;i++) {
      const bw=width/bays,cx=-width/2+(i+.5)*bw;
      if(i>0)addBox(m,[-width/2+i*bw,h/2,frameZ],[baths?.09:.10,h,.13],timber);
      sash(cx,bw,.035,h*.50);
      sash(cx,bw,h*.50,h-.035);
      const meeting=h*.50;
      addBox(m,[cx,meeting,frameZ+.075],[.083,.028,.025],brass);
      addBeam(m,[cx-.025,meeting+.015,frameZ+.08],[cx+.032,meeting+.040,frameZ+.08],.015,brass);
      if(!baths) {
        for(const sign of[-1,1]) {
          const x=cx+sign*(bw/2-.105);
          addBeam(m,[x,.15,frameZ+.095],[x,h-.12,frameZ+.095],.009,cord);
          addEllipsoid(m,[x,h-.10,frameZ+.095],[.023,.033,.018],brass,5,8);
        }
      }
    }
    if(!baths) {
      const poleY=h+.17,poleZ=.22;
      addBeam(m,[-width/2-.40,poleY,poleZ],[width/2+.40,poleY,poleZ],.032,brass);
      for(const sign of[-1,1]) {
        addEllipsoid(m,[sign*(width/2+.42),poleY,poleZ],[.045,.045,.045],brass,6,10);
        addBeam(m,[sign*(width/2+.17),poleY,.015],[sign*(width/2+.17),poleY,poleZ],.027,brass);
        const cx=sign*(width/2+.19);
        // Five folded cloth strips, pulled clear of the central opening. They
        // retain real side/hem geometry under torchlight rather than a sprite.
        for(let j=0;j<5;j++) {
          const xa=cx-.175+j*.07,xb=xa+.07,za=j%2?.25:.12,zb=j%2?.12:.25;
          const hem=.08+(j%3)*.025,shift=sign*.045;
          addQuad(m,[xa,h+.08,za],[xb,h+.08,zb],[xb+shift,hem+.02,zb],[xa+shift,hem,za],cloth);
          addQuad(m,[xa+shift,hem,za],[xb+shift,hem+.02,zb],[xb,h+.08,zb],[xa,h+.08,za],cloth);
        }
        addBeam(m,[cx-.18,.84,.19],[cx+.18,.84,.19],.025,brass);
      }
    } else {
      // Baths use washable iron and an uncurtained outlook; broad perimeter
      // seals and three metal catches distinguish them from drawing-room sashes.
      for(const sign of[-1,1])addBox(m,[sign*(width/2+.10),h/2,.045],[.045,h+.10,.045],enamel);
    }
  }
}
