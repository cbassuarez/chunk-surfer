// Editable anatomical construction; the heart adapts the credited HuBMAP
// external chamber surfaces. +Y is posterior, -Z cranial,
// -X anatomical left. The anterior chest has been opened along the road.
// Surviving rib ends remain rooted; this is an impossible breathing dissection,
// not a claim that an open human chest can maintain normal pleural pressure.
import {fitActualHeart,projectToActualHeartSurface} from './thorax-organ-source.mjs';
import {CUT_HEART_CENTER} from '../../../src/game/source-drive/cut/anatomy-layout.js';
const TAU=Math.PI*2, mix=(a,b,t)=>a+(b-a)*t;
export const THORAX_ORGAN_MESHES=['cut_lungs','cut_heart','cut_great_vessels','cut_coronary_vessels','cut_diaphragm','cut_wet_blood','cut_airway'];
export const THORAX_EXTRA_FRAME_MESHES=['cut_costal_cartilage','cut_intercostal_vessels'];
export function buildThoraxAnatomy({all,geom,vertex,tri,quad,tube,curve,patch,bone,spine,depth,sheet,peri,remnant}){
 const extra=(name,family)=>{const g=geom(name,family,true);g.anatomical=true;all.push(g);return g;};
 const cartilage=extra('cut_costal_cartilage','cartilage'),vessels=extra('cut_intercostal_vessels','artery');
 const lungs=extra('cut_lungs','lung'),heart=extra('cut_heart','myocardium'),great=extra('cut_great_vessels','artery'),coronary=extra('cut_coronary_vessels','vein'),diaphragm=extra('cut_diaphragm','muscle'),blood=extra('cut_wet_blood','blood'),airway=extra('cut_airway','cartilage');sheet.family='muscle';
 for(const g of[bone,spine,depth,sheet,peri,cartilage,vessels])g.anatomical=true;
 const profile=side=>curve([[side*9.6,-.55,0],[side*11.8,2.6,.1],[side*13.3,7.0,.8],[side*13.0,12.5,1.4],[side*10.2,17.2,1.6],[side*6.1,19.4,.8],[side*2.2,20.0,-.35],[0,19.65,-.85]]);
 const ribPoint=(side,t,z)=>{const p=profile(side)(t);p[2]+=z+5.8*(1-t)-1.25*Math.sin(t*Math.PI);return p;};
 // Broad, thin, curved blades. A rib has a neck/head at the vertebra, an
 // angle behind the flank, and a cartilage transition at its anterior end.
 for(const z of[-7.4,7.4])for(const side of[-1,1]){
  const p=[],r=[],start=bone.p.length/3;
  for(let j=0;j<=48;j++){const t=.085+.915*j/48;p.push(ribPoint(side,t,z));r.push(.53+.20*Math.sin(t*Math.PI)+.17*Math.exp(-(((t-.84)/.075)**2))+.18*Math.exp(-(((t-.985)/.032)**2)));}
  tube(bone,p,r,16,.32);for(let v=start;v<bone.p.length/3;v++)bone.foldSides[v]=side;
  const cp=[],cr=[];for(let j=0;j<=12;j++){const t=.145*j/12;cp.push(ribPoint(side,t,z));cr.push(.64-.06*j/12);}tube(cartilage,cp,cr,12,.44);
  // Real articular/tubercular masses and paired short transverse processes.
  const head=curve([ribPoint(side,.93,z),[side*1.3,20.03,z-.7],[side*.52,19.7,z-.85]]);
  tube(bone,Array.from({length:13},(_,j)=>head(j/12)),Array.from({length:13},(_,j)=>.29+.16*Math.sin(j/12*Math.PI)),12,.64);
  const a=[],b=[];for(let j=0;j<=36;j++){const t=.14+.77*j/36,q=ribPoint(side,t,z);a.push([q[0]-side*.22,q[1]-.12,q[2]+.64]);b.push(.13+.07*Math.sin(t*Math.PI));}tube(vessels,a,b,10,.8);
  // Torn periosteal cuffs belong to bone rather than a second curtain.
  for(const[lo,hi]of[[.19,.30],[.58,.72]]){const p=[],r=[];for(let j=0;j<=14;j++){const t=mix(lo,hi,j/14),q=ribPoint(side,t,z);p.push([q[0]-side*.24,q[1]-.10,q[2]-.20]);r.push(.16+.09*Math.sin(j/14*Math.PI));}tube(peri,p,r,10,.42,t=>Math.sin(t*Math.PI));}
 }
 // Vertebral bodies, pedicles and spinous processes are distinct. The old
 // asset name stays stable for saves/loaders; it is explicitly NOT a sternum.
 for(const z of[-7.4,7.4]){
  tube(spine,[[0,19.65,z-6.9],[0,19.8,z],[0,19.65,z+6.9]],[.83,1.05,.86],14,.85);
  for(const side of[-1,1])tube(spine,[[side*.44,20.1,z],[side*1.6,20.4,z+.12],[side*2.4,19.85,z+.5]],[.43,.32,.17],10,.7);
  tube(spine,[[0,20.35,z],[0,21.35,z+.7],[0,21.8,z+1.7]],[.47,.31,.10],10,.65);
 }
 // Open intercostal musculature: oblique fibres bridge neighbouring blades,
 // with missing tissue on the anterior side. It never closes the aperture.
 for(const side of[-1,1]){
  patch(sheet,24,22,(u,v)=>{const t=.19+.66*u,q=ribPoint(side,t,mix(-7.4,7.4,v));return[q[0]+side*(.10+.24*Math.sin(v*Math.PI)),q[1]+.08*Math.sin(u*20+v*7),q[2]];},{thickness:.20,skip:(u,v)=>(u<.26&&v>.18&&v<.83)||(u>.62&&v>.29&&v<.67),mask:(u,v)=>Math.sin(v*Math.PI)**2});
  patch(depth,18,18,(u,v)=>{const q=ribPoint(side,.34+.47*u,mix(-7.3,7.3,v));return[q[0]+side*.28,q[1]-.2,q[2]];},{thickness:.33,skip:(u,v)=>(u<.2&&v>.35&&v<.75)||(u>.7&&v>.3&&v<.8)});
  // Split anterior sternum margins and a raw costal edge, outside the road.
  tube(cartilage,[[side*9.6,.12,-14.8],[side*9.45,.3,0],[side*9.8,.08,14.8]],[.43,.59,.36],14,.48);
  for(let k=0;k<5;k++){const z=-5.5+k*2.65,p=[],r=[];for(let j=0;j<=18;j++){const t=j/18,q=ribPoint(side,.24+.49*t,z+1.6*t);p.push([q[0]-side*.08,q[1]-.05,q[2]]);r.push(.11+.045*Math.sin(t*Math.PI));}tube(peri,p,r,8,.48);}
 }
 const rp=[],rr=[];for(let j=0;j<=34;j++){rp.push(ribPoint(1,j/34*.84,0));rr.push(.6+.14*Math.sin(j/34*Math.PI));}tube(remnant,rp,rr,16,.34);
 // Closed outward-facing parametric organ surfaces with physical fissures.
 function organ(g,fn,U=48,V=30,mirror=false){const firstFace=g.ids.length,first=g.p.length/3;for(let j=0;j<=V;j++)for(let i=0;i<=U;i++){const u=i/U,v=j/V,p=fn(u,v);vertex(g,p,[u*5,v*7],1);if(i&&j){const k=first+j*(U+1)+i;quad(g,k-U-2,k-1,k,k-U-1);}}for(const end of[0,V]){const ring=first+end*(U+1),centre=[0,0,0];for(let k=0;k<U;k++)for(let c=0;c<3;c++)centre[c]+=g.p[(ring+k)*3+c]/U;const at=vertex(g,centre,[.5,end/V],1);for(let k=0;k<U;k++)if(end===0)tri(g,at,ring+k+1,ring+k);else tri(g,at,ring+k,ring+k+1);}if(mirror)for(let k=firstFace;k<g.ids.length;k+=3)[g.ids[k+1],g.ids[k+2]]=[g.ids[k+2],g.ids[k+1]];}
 // Separately closed lobes, with actual oblique gaps between volumes. The
 // broad concave base and narrowing cranial apex replace the former sausages.
 for(const side of[-1,1]){
  const oblique=a=>.50+.15*Math.sin(a),gap=.008;
  const lobes=side<0?[[()=>0,a=>oblique(a)-gap],[a=>oblique(a)+gap,()=>1]]:
   [[()=>0,a=>oblique(a)-gap],[a=>oblique(a)+gap,a=>Math.max(oblique(a)+.018,.62-gap)],[a=>Math.max(oblique(a),.62)+gap,()=>1]];
  for(const[lo,hi]of lobes)organ(lungs,(u,t)=>{
   const a=u*TAU,v=mix(lo(a),hi(a),t),ca=Math.cos(a),sa=Math.sin(a),section=Math.sqrt(Math.max(.0003,1-v))*(.88+.18*Math.sin(v*Math.PI)),rough=1+.012*Math.sin(a*7+v*13);
   const medial=Math.max(0,-ca),notch=side<0?1-.32*Math.exp(-(((v-.50)/.16)**2))*medial**4:1;
   const pleural=ca<0?.83+.17*Math.abs(sa):1;
   return[side*(9.6+3.5*section*ca*notch*pleural*rough),8.8+5.25*section*sa*rough,-5+27*(1-2*v)+.7*ca*(1-v)];
  },48,22,side<0);
 }

 // Preserve the source's proportions with a single uniform scale. The
 // chamber asymmetry and interventricular groove survive the CPU LOD.
 // The original high, near placement hid the chamber face behind the actual
 // Transit windshield header. Lower it 1.6 m and carry it 8 m cranially without
 // changing its source proportions; proximal vessels follow, hila stay fixed.
 const [hx,hy,hz]=CUT_HEART_CENTER,cardiacShift=[hx+2,hy-7.8,hz+7];
 const cardiacPoint=(p,weight=1)=>p.map((v,k)=>v+cardiacShift[k]*weight);
 const actualHeart=fitActualHeart({center:CUT_HEART_CENTER,maxRadii:[3.45,3,5.5]}),heartStart=heart.p.length/3;
 for(let i=0;i<actualHeart.positions.length;i+=3){const p=actualHeart.positions.slice(i,i+3);vertex(heart,p,[(Math.atan2(p[1]-hy,p[0]-hx)/TAU+.5)*5,(p[2]-hz+3)/2],1);}
 for(let i=0;i<actualHeart.indices.length;i+=3)tri(heart,...actualHeart.indices.slice(i,i+3).map(v=>v+heartStart));
 heart.provenance={source:actualHeart.source,sourceSha256:actualHeart.sourceSha256,license:actualHeart.license,requiredCredit:actualHeart.requiredCredit,uniformScale:actualHeart.scale,parts:actualHeart.parts.map(p=>p.name),adaptation:'External cardiac chambers selected; CPU LOD and local boundary repair; axis conversion, uniform monumental scale and animated surface treatment.'};
 const path=(g,points,r0,r1,segments=12)=>{const f=curve(points),p=[],r=[];for(let j=0;j<=30;j++){const t=j/30;p.push(f(t));r.push(mix(r0,r1,t));}tube(g,p,r,segments,.86);};
 // Aortic arch returns to the posterior-left spine. It does not feed lungs.
 path(great,[cardiacPoint([-2.7,8.9,-10]),cardiacPoint([-3.0,14.3,-12],.5),[-2,18.3,-8],[-1.2,18.8,-4],[-1.7,18.6,13],[-1.8,18.2,28]],.74,.56,14);
 for(const side of[-1,1]){
  // Pulmonary branches leave the central mediastinum at the restrained hila.
  path(great,[cardiacPoint([-.3,9.0,-9]),cardiacPoint([side*3.8,12.8,-9],.6),cardiacPoint([side*7.1,10.3,-5],.25),[side*8,9.6,-7]],.55,.27);
  path(great,[[side*8.0,8.3,-4],cardiacPoint([side*6.3,8.6,-5],.5),cardiacPoint([-1.3,8.7,-7.5])],.34,.49);
  for(const z of[-19,-11,2,13]){const y=10.6-Math.abs(z)*.045;path(great,[[side*8,9.5,-6],[side*7.3,y,z*.6],[side*9.2,y,z]],.19,.07,8);}
  // Bronchial roots have cartilage rings and branch, rather than red pipes.
  path(airway,[[0,17.1,-25],[0,16.7,-13],[side*3.2,15.3,-8],[side*7.6,11.2,-7]],.72,.39,12);
 }
 // Coronary vessels hug the epicardium: large paths first, then tributaries.
 for(const sign of[-1,1])for(const k of[0,1,2]){const p=[],r=[];for(let j=0;j<=24;j++){const t=j/24,a=3.3+sign*(.28+k*.55),b=.45+t*2.05,s=Math.sin(b);p.push(projectToActualHeartSurface([hx+3.48*s*Math.cos(a)*(1-.30*Math.max(0,Math.cos(b))),hy+3.04*s*Math.sin(a)+.7*Math.cos(b),hz+5.56*Math.cos(b)],{center:CUT_HEART_CENTER}));r.push(.15-.09*t);}tube(coronary,p,r,8,.78);}
 // Inferior diaphragm has a pale central tendon and radial muscular skirt.
 // Its anterior opening is torn away; the driving aperture is never skinned.
 patch(diaphragm,38,22,(u,v)=>{const x=(u-.5)*27,edge=Math.abs(x)/13.5,z=22+v*8;return[x,10.0+5.0*(1-edge*edge)-2.2*v,z];},{thickness:.22,skip:(u,v)=>Math.abs(u-.5)<.24&&v>.37,mask:(u,v)=>v});
 // Blood is actual adherent volume/runnels on torn pleura, not diffuse red
 // paint everywhere. Diameters are broad enough to survive final sampling.
 for(const side of[-1,1])for(const k of[0,1,2,3]){const z=-18+k*11;path(blood,[[side*8.1,9.9,z],[side*8.0,8.8,z+.24],[side*8.25,7.1,z+.5],[side*8.35,6.4,z+.6]],.18,.08,8);}
 return{organMeshes:THORAX_ORGAN_MESHES,frameMeshes:THORAX_EXTRA_FRAME_MESHES,heartSource:heart.provenance,heartCenter:CUT_HEART_CENTER,lungs:'Original authored five-lobe surfaces; not acquired scans.',orientation:{posterior:'+Y',cranial:'-Z',anatomicalLeft:'-X',anteriorOpening:'split at the road'},organMountDistance:829};
}
