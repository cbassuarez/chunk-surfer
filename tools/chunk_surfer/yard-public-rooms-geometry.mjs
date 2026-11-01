// Hollow lower spans for two retained service ranges. Their existing upper
// windows, drainage, pitched roofs and rear elevations remain build-props-owned.
import {EXTERIOR_PUB as PUB} from '../../src/data/exterior-pub.js';
import {YARD_CARETAKER as CARE,YARD_PUBLIC_ROOMS,yardPublicRoomForRange,yardRangePublicUse} from '../../src/data/yard-public-rooms.js';
const material=(name,color,roughness=.88,metallic=0)=>({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],roughnessFactor:roughness,metallicFactor:metallic}});
const palette={
  brick:material('yard conversion retained red brick',[.25,.095,.052]),
  stone:material('yard conversion worn limestone',[.29,.275,.235]),
  green:material('yard conversion deep green joinery',[.045,.085,.067]),
  timber:material('yard conversion oiled timber',[.17,.105,.055]),
  plaster:material('yard conversion warm lime plaster',[.38,.355,.28]),
  steel:material('yard conversion charcoal steel',[.050,.065,.057],.82,.08),
  brass:material('yard conversion handled brass',[.30,.225,.08],.48,.65),
  paper:material('yard conversion stacked cream paper',[.54,.49,.36]),
  mug:material('yard conversion caretaker ceramic',[.32,.39,.34],.44),
};
function context(api,m,origin=[0,0,0]){
  const ids={};
  for(const[k,v]of Object.entries(palette)){let i=api.materials.findIndex(p=>p.name===v.name);if(i<0){i=api.materials.length;api.materials.push(structuredClone(v));}ids[k]=i;}
  const parts=[];
  const box=(id,center,size,key='brick')=>{
    const local=center.map((v,i)=>v-origin[i]);api.addBox(m,local,size,ids[key]);
    parts.push({id,center:[...center],size:[...size],material:key});
  };
  const beam=(id,a,b,width,key='timber')=>{
    api.addBeam(m,a.map((v,i)=>v-origin[i]),b.map((v,i)=>v-origin[i]),width,ids[key]);
    parts.push({id,a,b,width,material:key});
  };
  return{box,beam,parts,ids};
}
const split=(low,high,holes)=>{
  let from=low;const out=[];
  for(const hole of[...holes].sort((a,b)=>a[0]-b[0])){
    if(hole[0]>from)out.push([from,hole[0]]);from=Math.max(from,hole[1]);
  }
  if(from<high)out.push([from,high]);return out;
};

export function buildYardPublicRangeBody(api,m,{range}){
  const use=yardRangePublicUse(range.id);if(!use)return null;
  const c=context(api,m,[range.physical.x,0,range.physical.y]),{box}=c;
  const x0=range.physical.x-range.w/2,x1=range.physical.x+range.w/2;
  const z0=range.physical.y-range.d/2,z1=range.physical.y+range.d/2,ceiling=3.52;
  box('retained-upper-occupied-range',[range.physical.x,(ceiling+range.height)/2,range.physical.y],[range.w,range.height-ceiling,range.d]);
  if(use==='lyric'){
    const back=PUB.bounds.z1;
    box('retained-rear-occupied-range',[range.physical.x,ceiling/2,(back+z1)/2],[range.w,ceiling,z1-back]);
    for(const[x,id]of[[x0+.05,'west'],[x1-.05,'east']])box('pub-'+id+'-return',[x,ceiling/2,(PUB.bounds.z0+back)/2],[.10,ceiling,back-PUB.bounds.z0]);
  }else{
    const room=yardPublicRoomForRange(range.id),back=room.bounds.x1;
    box('retained-east-stable-volume',[(back+x1)/2,ceiling/2,range.physical.y],[x1-back,ceiling,range.d]);
    for(const[z,id]of[[z0+.06,'south'],[z1-.06,'north']])box('caretaker-'+id+'-wall',[(x0+back)/2,ceiling/2,z],[back-x0,ceiling,.12]);
    const holes=[room.entrance,...(room.window?[room.window]:[])];
    const heights=[...new Set([0,ceiling,...holes.flatMap(h=>[room.floor+h.bottom,room.floor+h.top])])].sort((a,b)=>a-b);
    for(let i=1;i<heights.length;i++){
      const a=heights[i-1],b=heights[i],mid=(a+b)/2;
      const openings=holes.filter(h=>mid>room.floor+h.bottom&&mid<room.floor+h.top).map(h=>[h.z-h.width/2,h.z+h.width/2]);
      for(const[j,[lo,hi]]of split(z0,z1,openings).entries())box(`caretaker-west-masonry-${i}-${j}`,[x0+.10,mid,(lo+hi)/2],[.20,b-a,hi-lo]);
    }
  }
  const report={revision:1,use,rangeId:range.id,parts:c.parts,triangles:c.parts.length*12,retainedRoof:true,openGroundFloor:true};
  m.extras={...m.extras,yardPublicConversion:report};return report;
}

export function addYardPublicRangeFrontage(api,m,{range}){
  const use=yardRangePublicUse(range.id);if(!use)return null;
  const c=context(api,m,[range.physical.x,0,range.physical.y]),{box}=c;
  if(use!=='lyric'){
    const room=yardPublicRoomForRange(range.id),d=room.entrance,w=room.window,face=room.bounds.x0;
    for(const side of[-1,1]){
      box(room.id+'-door-stone-jamb-'+side,[face-.045,(room.floor+d.top)/2,d.z+side*(d.width/2+.075)],[.28,room.floor+d.top,.15],'stone');
    }
    box(room.id+'-door-head',[face-.045,room.floor+d.top+.09,d.z],[.28,.18,d.width+.30],'stone');
    if(w){
      const bottom=room.floor+w.bottom,top=room.floor+w.top,centre=(bottom+top)/2;
      for(const side of[-1,1])box(room.id+'-window-jamb-'+side,[face-.035,centre,w.z+side*(w.width/2+.065)],[.24,top-bottom+.20,.13],'stone');
      box(room.id+'-window-sill',[face-.12,bottom-.04,w.z],[.42,.12,w.width+.30],'stone');
      box(room.id+'-window-head',[face-.04,top+.06,w.z],[.27,.17,w.width+.30],'stone');
      box(room.id+'-window-mullion',[face+.035,centre,w.z],[.09,top-bottom,.055],'green');
      box(room.id+'-window-transom',[face+.035,centre+.26,w.z],[.09,.06,w.width],'green');
    }
    const signY=Math.max(2.97,room.floor+d.top+.43),copy=use==='caretaker'?'CARETAKER':use==='laundry'?'BATHS / LAUNDRY':'COVERED STORES';
    box(room.id+'-entry-nameplate',[face-.065,signY,d.z],[.06,.26,2.10],'green');
    // A complete face, to be lettered by the shared physical-print pipeline.
    c.signFaces=[{id:room.id+'-sign',copy,center:[face-.10-range.physical.x,signY,d.z-range.physical.y],
      readerRight:[0,0,1],up:[0,1,0],widthM:1.95,heightM:.20,capHeightM:.14}];
  }
  m.extras={...m.extras,yardPublicFrontage:{use,parts:c.parts,signFaces:c.signFaces||[]}};
  return{use,parts:c.parts,signFaces:c.signFaces||[]};
}

// Pub frontage owns just the converted public ground floor. The annex owns
// the upper mass and pitched roof, so the new room cannot create a second roof.
export function buildPubAnnexFrontage(api,m){
  const c=context(api,m),{box}=c,face=-.20;
  const openings=[...PUB.doors.map(d=>({id:d.id,z:d.x-PUB.facadeAnchor.x,width:d.width,bottom:0,top:3.4})),
    ...PUB.windows.map(w=>({...w,z:w.x-PUB.facadeAnchor.x,bottom:1.10,top:3.02}))];
  for(const[a,b]of[[0,1.10],[1.10,3.02],[3.02,3.4]]){
    const mid=(a+b)/2,holes=openings.filter(o=>mid>o.bottom&&mid<o.top).map(o=>[o.z-o.width/2,o.z+o.width/2]);
    for(const[j,[lo,hi]]of split(-8,8,holes).entries())box(`pub-ground-masonry-${a}-${j}`,[face,mid,(lo+hi)/2],[.20,b-a,hi-lo]);
  }
  for(const w of openings.filter(o=>o.id.includes('window'))){
    for(const s of[-1,1])box(w.id+'-jamb-'+s,[face+.12,2.06,w.z+s*(w.width/2+.055)],[.22,2.00,.11],'green');
    box(w.id+'-sill',[face+.16,1.08,w.z],[.38,.11,w.width+.25],'stone');
    box(w.id+'-head',[face+.10,3.06,w.z],[.25,.13,w.width+.23],'green');
    box(w.id+'-mullion',[face+.10,2.07,w.z],[.11,1.83,.055],'green');
    box(w.id+'-transom',[face+.10,2.65,w.z],[.12,.055,w.width],'green');
    box(w.id+'-stall-riser',[face+.10,.59,w.z],[.12,.84,w.width],'green');
  }
  const signFaces=[];
  for(const[i,z]of[-4,4].entries()){
    box('pub-annex-sign-carrier-'+i,[.045,3.68,z],[.09,.49,7.0],'green');
    for(const y of[3.39,3.97])box('pub-annex-sign-moulding-'+i+'-'+y,[.12,y,z],[.28,.10,7.65],'stone');
    signFaces.push({id:'pub-lyric-fascia-'+(i?'east':'west'),copy:i?'PUBLIC HOUSE':'THE LYRIC',
      center:[.096,3.68,z],readerRight:[0,0,-1],up:[0,1,0],widthM:6.75,heightM:.35,capHeightM:.25});
  }
  for(const d of openings.filter(o=>o.id.includes('entry')))for(const s of[-1,1])
    box(d.id+'-pilaster-'+s,[face+.16,1.70,d.z+s*(d.width/2+.095)],[.28,3.40,.19],'green');
  const report={parts:c.parts,triangles:c.parts.length*12,signFaces,upperRangeOwner:PUB.building.id,noSecondRoof:true};
  m.extras={...m.extras,pubAnnexFrontage:report};return report;
}

export function buildYardCaretakerInterior(api){
  const m=api.mesh('yard_caretaker_room'),c=context(api,m,[33,CARE.floor,18]),{box,beam}=c;
  box('caretaker-east-plaster',[35.84,1.86,18],[.07,3.30,7.72],'plaster');
  for(const z of[14.16,21.84])box('caretaker-end-plaster-'+z,[33,1.86,z],[5.70,3.30,.07],'plaster');
  box('caretaker-ceiling',[33,3.48,18],[5.75,.08,7.76],'plaster');
  for(let x=30.25;x<35.80;x+=.28)box('caretaker-floorboard-'+x,[x,.132,18],[.271,.024,7.74],'timber');
  for(const f of CARE.furniture){
    if(f.id.endsWith('desk')){
      box(f.id+'-top',[f.x,.86,f.z],[f.width,.08,f.depth],'timber');
      for(const dx of[-.64,.64])for(const dz of[-.24,.24])box(f.id+'-leg-'+dx+'-'+dz,[f.x+dx,.49,f.z+dz],[.07,.74,.07],'timber');
      box('caretaker-paper-stack',[f.x-.24,.92,f.z],[.32,.04,.25],'paper');
      api.addCylinder(m,[f.x+.40-33,.95-CARE.floor,f.z-18],.065,.15,c.ids.mug,10);
    }else if(f.id.endsWith('chair')){
      box(f.id+'-seat',[f.x,.57,f.z],[.48,.07,.48],'timber');
      for(const dx of[-.19,.19])for(const dz of[-.19,.19])box(f.id+'-leg-'+dx+'-'+dz,[f.x+dx,.34,f.z+dz],[.055,.44,.055],'timber');
      box(f.id+'-back',[f.x-.22,.86,f.z],[.055,.55,.48],'timber');
    }else if(f.id.endsWith('bench')){
      box(f.id+'-seat',[f.x,.59,f.z],[f.width,.08,f.depth],'timber');
      for(const dx of[-.97,.97])box(f.id+'-support-'+dx,[f.x+dx,.35,f.z],[.08,.46,.40],'timber');
      box(f.id+'-back',[f.x,.86,f.z+.20],[f.width,.42,.075],'timber');
    }else if(f.id.endsWith('cabinet')){
      box(f.id,[f.x,1.10,f.z],[f.width,1.96,f.depth],'steel');
      for(const z of[f.z-.37,f.z+.37])box(f.id+'-handle-'+z,[f.x-.34,1.12,z],[.065,.19,.035],'brass');
    }else{
      for(const y of[.32,.94,1.56,2.18])box(f.id+'-shelf-'+y,[f.x,y,f.z],[f.width,.065,f.depth],'timber');
      for(const x of[f.x-f.width/2+.05,f.x+f.width/2-.05])box(f.id+'-upright-'+x,[x,1.18,f.z],[.08,2.12,f.depth],'timber');
      for(let i=0;i<7;i++)box('caretaker-folded-store-'+i,[31.15+i*.57,1.08,14.27],[.40,.20,.27],i%2?'paper':'plaster');
    }
  }
  for(const z of[18.4,18.9,19.4])beam('caretaker-coat-hook-'+z,[35.75,1.75,z],[35.58,1.68,z],.04,'brass');
  box('caretaker-practical-carrier',[35.71,2.45,17.7],[.18,.24,.36],'brass');
  m.extras={...m.extras,caretakerRoom:{buildingId:CARE.buildingId,parts:c.parts,furnished:true}};
  const report={mesh:m.name,parts:c.parts,triangles:c.parts.length*12+40};
  // The public entry point installs the complete bounded service row, so a
  // caller cannot hollow its laundry/stores without also furnishing them.
  for(const room of YARD_PUBLIC_ROOMS.filter(room=>room!==CARE))buildYardUtilityInterior(api,room);
  return report;
}

export function buildYardUtilityInterior(api,room){
  const b=room.bounds,cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2;
  const m=api.mesh(room.mesh),c=context(api,m,[cx,room.floor,cz]),{box,beam}=c;
  box(room.id+'-back-finish',[b.x1-.16,1.86,cz],[.07,3.30,b.z1-b.z0-.24],'plaster');
  for(const z of[b.z0+.16,b.z1-.16])box(room.id+'-end-finish-'+z,[cx,1.86,z],[b.x1-b.x0-.24,3.30,.07],'plaster');
  box(room.id+'-ceiling',[cx,3.48,cz],[b.x1-b.x0-.24,.08,b.z1-b.z0-.24],'plaster');
  for(const f of room.furniture){
    const legs=(top,material='steel')=>{
      box(f.id+'-top',[f.x,room.floor+top-.035,f.z],[f.width,.07,f.depth],material);
      for(const dx of[-f.width/2+.08,f.width/2-.08])for(const dz of[-f.depth/2+.08,f.depth/2-.08])
        box(f.id+'-leg-'+dx+'-'+dz,[f.x+dx,room.floor+top/2,f.z+dz],[.055,top-.07,.055],material);
    };
    if(f.kind==='sink'){
      for(const x of[f.x-.22,f.x+.22])box(f.id+'-rim-'+x,[x,.98,f.z],[.10,.16,f.depth],'mug');
      for(const z of[f.z-.88,f.z+.88])box(f.id+'-end-'+z,[f.x,.98,z],[.54,.16,.10],'mug');
      box(f.id+'-basin-bottom',[f.x,.77,f.z],[.54,.08,f.depth-.16],'mug');
      for(const z of[f.z-.6,f.z+.6]){
        beam(f.id+'-water-pipe-'+z,[f.x+.20,1.32,z],[f.x+.20,.30,z],.05,'brass');
        beam(f.id+'-tap-'+z,[f.x+.20,1.30,z],[f.x-.02,1.30,z],.05,'brass');
      }
      for(const z of[f.z-.72,f.z+.72])box(f.id+'-leg-'+z,[f.x,.44,z],[.42,.64,.09],'steel');
    }else if(f.kind==='linen-shelves'||f.kind==='rack'){
      for(const y of[.36,1.08,1.80,...(f.height>2.5?[2.52]:[])]){
        box(f.id+'-shelf-'+y,[f.x,y,f.z],[f.width,.065,f.depth],f.kind==='rack'?'steel':'timber');
        for(let i=0;i<5;i++)box(f.id+'-stored-'+y+'-'+i,[f.x-f.width/2+.5+i*(f.width-.8)/5,y+.17,f.z],[.52,.27,f.depth-.15],f.kind==='rack'?'timber':i%2?'paper':'plaster');
      }
      for(const x of[f.x-f.width/2+.05,f.x+f.width/2-.05])for(const z of[f.z-f.depth/2+.03,f.z+f.depth/2-.03])
        box(f.id+'-upright-'+x+'-'+z,[x,room.floor+f.height/2,z],[.055,f.height,.055],f.kind==='rack'?'steel':'timber');
    }else if(f.kind==='table'){
      legs(f.height);
      if(room.id==='yard-laundry')for(let i=0;i<3;i++)box(f.id+'-folded-linen-'+i,[f.x-.50+i*.48,room.floor+f.height+.075,f.z],[.40,.15,.54],'plaster');
      else box(f.id+'-paper-roll',[f.x,room.floor+f.height+.11,f.z],[.76,.19,.32],'paper');
    }else if(f.kind==='plant-bank'){
      for(const z of[f.z-.76,f.z,f.z+.76]){
        beam(f.id+'-riser-'+z,[f.x,.25,z],[f.x,2.57,z],.13,'steel');
        box(f.id+'-valve-'+z,[f.x-.12,1.12,z],[.30,.25,.25],'brass');
        beam(f.id+'-valve-handle-'+z,[f.x-.29,.99,z],[f.x-.29,1.25,z],.035,'green');
      }
      beam(f.id+'-header',[f.x,2.50,f.z-1.04],[f.x,2.50,f.z+1.04],.13,'steel');
    }else if(f.kind==='linen-bin'){
      box(f.id+'-body',[f.x,.55,f.z],[f.width,.86,f.depth],'steel');
      box(f.id+'-linen',[f.x,1.00,f.z],[f.width-.12,.12,f.depth-.12],'plaster');
      for(const dx of[-.43,.43])for(const dz of[-.27,.27])box(f.id+'-castor-'+dx+'-'+dz,[f.x+dx,.16,f.z+dz],[.10,.12,.08],'steel');
    }else if(f.kind==='flightcases'){
      for(const offset of[-.53,.53]){
        box(f.id+'-body-'+offset,[f.x,.12+f.height/2,f.z+offset],[f.width,f.height,1.0],'steel');
        for(const y of[.23,.12+f.height-.12])box(f.id+'-band-'+offset+'-'+y,[f.x-.01,y,f.z+offset],[f.width+.025,.045,1.035],'brass');
        for(const z of[f.z+offset-.45,f.z+offset+.45])box(f.id+'-edge-'+z,[f.x-.01,.12+f.height/2,z],[f.width+.025,f.height,.035],'brass');
      }
    }else if(f.kind==='handtruck'){
      for(const z of[f.z-.19,f.z+.19]){
        beam(f.id+'-upright-'+z,[f.x,.28,z],[f.x+.1,1.51,z],.055,'steel');
        box(f.id+'-wheel-'+z,[f.x+.14,.22,z],[.20,.28,.10],'steel');
      }
      box(f.id+'-toe',[f.x-.15,.15,f.z],[.45,.06,.50],'steel');
      beam(f.id+'-handle',[f.x+.1,1.49,f.z-.19],[f.x+.1,1.49,f.z+.19],.055,'green');
    }
  }
  m.extras={...m.extras,yardUtilityInterior:{buildingId:room.buildingId,parts:c.parts,furnished:true}};
  return{mesh:m.name,parts:c.parts,triangles:c.parts.length*12};
}
