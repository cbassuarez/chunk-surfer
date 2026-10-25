// Human-scale window contents, authored in one real shallow shop bay. The
// builder owns positioning/materials; nothing here becomes a separate prop or
// an interaction. Broad forms survive the actual street camera and dither.
export function addShopDisplay({box,beam,cylinder,quad},use,{z=0,width=4.22}={}){
  const prefix=`shop-${use.id}`,back=-.84,front=-.30;
  // Baked bounce belongs to stock inside an occupied bay. The facade, floor,
  // backing and closed shops keep their ordinary materials and real depth.
  const litStock={paper:'litPaper',wood:'litWood',steel:'litSteel',green:'litGreen',terracotta:'litTerracotta'};
  const stock=mat=>use.lit?(litStock[mat]??mat):mat;
  const put=(id,x,y,dz,sx,sy,sz,mat,illuminate=true)=>box(`${prefix}-${id}`,[x,y,z+dz],[sx,sy,sz],illuminate?stock(mat):mat);
  const line=(id,a,b,w,mat)=>beam(`${prefix}-${id}`,[a[0],a[1],z+a[2]],[b[0],b[1],z+b[2]],w,stock(mat));
  const cyl=(id,x,y,dz,r,h,mat,sides=10)=>cylinder(`${prefix}-${id}`,[x,y,z+dz],r,h,stock(mat),sides);
  const ellipsoid=(id,c,r,mat)=>{
    const lat=6,lon=10,point=(a,b)=>[c[0]+Math.cos(a)*Math.cos(b)*r[0],c[1]+Math.sin(a)*r[1],z+c[2]+Math.cos(a)*Math.sin(b)*r[2]];
    // Avoid singular polar quads: caps have a deliberately small flat crown.
    for(let row=0;row<lat;row++)for(let col=0;col<lon;col++){
      const a0=-Math.PI*.46+row/lat*Math.PI*.92,a1=-Math.PI*.46+(row+1)/lat*Math.PI*.92,b0=col/lon*Math.PI*2,b1=(col+1)/lon*Math.PI*2;
      quad(`${prefix}-${id}-${row}-${col}`,point(a0,b0),point(a1,b0),point(a1,b1),point(a0,b1),stock(mat));
    }
    for(const sign of[-1,1])for(let col=0;col<lon;col+=2){
      const a=point(sign*Math.PI*.46,col/lon*Math.PI*2),b=point(sign*Math.PI*.46,(col+1)/lon*Math.PI*2),d=point(sign*Math.PI*.46,(col+2)/lon*Math.PI*2),top=[c[0],c[1]+sign*r[1],z+c[2]];
      quad(`${prefix}-${id}-cap-${sign}-${col}`,...(sign>0?[top,d,b,a]:[top,a,b,d]),stock(mat));
    }
  };
  put('interior-floor',-.52,1.025,0,.82,.06,width-.18,'wood',false);
  put('room-back',back,1.98,0,.06,1.90,width-.12,use.lit?'interior':'black');
  put('ceiling',-.53,2.91,0,.82,.06,width-.12,use.lit?'interior':'black');
  if(use.lit){
    // The small hidden luminaire establishes a lit room; the entire rear wall
    // is not an emissive white rectangle.
    put('ceiling-light',-.58,2.865,0,.26,.025,.82,'warm');
    put('light-reflector',-.61,2.89,0,.36,.025,.98,'white');
  }
  if(use.display==='books'||use.display==='scores'){
    for(const[row,y]of[1.14,1.72,2.30].entries()){
      put(`shelf-${row}`,-.53,y,0,.48,.06,width-.40,'wood');
      if(use.display==='books')for(let n=0;n<11;n++){
        const dz=-1.62+n*.31,h=.28+(n%4)*.055;
        put(`book-${row}-${n}`,-.45,y+.04+h/2,dz,.22,h,.13+(n%3)*.035,n%4===0?'green':n%4===1?'paper':n%4===2?'wood':'brick');
        put(`book-label-${row}-${n}`,-.328,y+.10+h*.25,dz,.008,.045,.09,'paper');
      }
      else for(let n=0;n<4;n++){
        const dz=-1.40+n*.92;
        put(`folio-${row}-${n}`,-.46,y+.22,dz,.065,.39,.55,'paper');
        put(`folio-spine-${row}-${n}`,-.418,y+.22,dz+.23,.016,.40,.035,'black');
        for(let staff=0;staff<3;staff++)put(`folio-staff-${row}-${n}-${staff}`,-.421,y+.20+staff*.045,dz,.008,.007,.36,'black');
      }
    }
  }else if(use.display==='instruments'){
    for(const[n,dz]of[-1.13,.24,1.32].entries()){
      const large=n===0,k=large?1:.63,cy=1.44;
      ellipsoid(`instrument-lower-${n}`,[-.49,cy,dz],[.12,.26*k,.22*k],'wood');
      ellipsoid(`instrument-upper-${n}`,[-.49,cy+.32*k,dz],[.10,.19*k,.18*k],'wood');
      put(`instrument-waist-${n}`,-.46,cy+.17*k,dz,.16,.23*k,.21*k,'wood');
      put(`instrument-neck-${n}`,-.45,cy+.73*k,dz,.065,.72*k,.065,'black');
      ellipsoid(`instrument-scroll-${n}`,[-.45,cy+1.10*k,dz],[.065,.09*k,.065],'wood');
      put(`instrument-bridge-${n}`,front-.04,cy+.10*k,dz,.02,.04,.19*k,'paper');
      line(`instrument-stand-left-${n}`,[-.57,1.06,dz-.24],[-.55,1.32,dz],.035,'black');
      line(`instrument-stand-right-${n}`,[-.57,1.06,dz+.24],[-.55,1.32,dz],.035,'black');
    }
  }else if(use.display==='flowers'){
    for(const[n,dz]of[-1.42,-.47,.58,1.45].entries()){
      cyl(`vase-${n}`,-.48,1.23,dz,.11,.32,n%2?'green':'paper');
      for(let j=0;j<3;j++){
        const side=(j-1)*.11,h=1.69+(n%2)*.15+j*.055;
        line(`stem-${n}-${j}`,[-.48,1.37,dz],[-.48,h,dz+side],.015,'green');
        ellipsoid(`bloom-${n}-${j}`,[-.48,h,dz+side],[.11,.10,.12],n%3===0?'paper':n%3===1?'terracotta':'green');
      }
    }
  }else if(use.display==='tailor'){
    cyl('dress-form-base',-.48,1.11,-.86,.24,.05,'black');
    cyl('dress-form-pole',-.48,1.45,-.86,.028,.68,'steel');
    ellipsoid('dress-form-torso',[-.48,1.96,-.86],[.16,.38,.26],'paper');
    cyl('dress-form-neck',-.48,2.37,-.86,.073,.18,'wood');
    for(const[n,dz]of[.35,.80,1.25].entries()){
      cyl(`cloth-roll-${n}`,-.52,1.55,dz,.145,.88,n%2?'green':'wood');
      put(`cloth-roll-band-${n}`,-.36,1.64,dz,.02,.13,.22,'paper');
    }
    put('folded-lengths',-.48,1.15,.73,.45,.20,1.30,'paper');
  }else if(use.display==='tea'){
    put('counter',-.59,1.22,0,.48,.32,width-.42,'wood');
    put('coffee-machine',-.58,1.64,-1.13,.35,.49,.66,'steel');
    put('coffee-machine-face',-.385,1.65,-1.13,.035,.32,.51,'black');
    for(const dz of[-1.27,-1.01])cyl(`coffee-control-${dz}`,-.35,1.70,dz,.033,.06,'brass',8);
    for(const[n,dz]of[-.10,.35,.80,1.25].entries()){
      cyl(`cup-${n}`,-.45,1.46,dz,.077,.15,'paper');
      cyl(`saucer-${n}`,-.45,1.375,dz,.11,.022,'paper');
    }
    // Two inverted chairs communicate closing without promising another room.
    for(const[n,dz]of[.30,1.17].entries()){
      put(`chair-seat-${n}`,-.54,2.05,dz,.34,.055,.39,'wood');
      for(const side of[-1,1])line(`chair-legs-${n}-${side}`,[-.68,2.08,dz+side*.15],[-.68,2.49,dz+side*.15],.025,'wood');
    }
  }else if(use.display==='bindery'){
    put('press-bed',-.50,1.38,-.85,.40,.10,.82,'black');
    for(const side of[-1,1])cyl(`press-post-${side}`,-.50,1.77,-.85+side*.32,.035,.76,'steel');
    put('press-crown',-.50,2.14,-.85,.36,.10,.82,'black');
    cyl('press-screw',-.50,1.91,-.85,.045,.40,'brass');
    put('press-board',-.50,1.63,-.85,.38,.06,.67,'wood');
    for(let n=0;n<6;n++)put(`paper-stack-${n}`,-.49,1.10+n*.045,.78,.42,.035,.72,n%2?'paper':'wood');
    for(let n=0;n<3;n++)put(`bound-volume-${n}`,-.44,1.50,.20+n*.42,.25,.66,.22,n%2?'green':'wood');
  }else if(use.display==='print'){
    put('duplicator-body',-.52,1.42,-.73,.43,.54,1.20,'steel');
    put('duplicator-roller',-.28,1.54,-.73,.05,.16,.92,'black');
    put('paper-in-tray',-.47,1.78,-.73,.38,.04,.75,'paper');
    put('out-tray',-.27,1.20,-.73,.12,.04,.95,'steel');
    for(let n=0;n<7;n++)put(`paper-ream-${n}`,-.50,1.10+n*.075,1.04,.44,.065,.70,'paper');
    put('type-drawer',-.49,1.20,.30,.40,.12,.55,'wood');
    for(let n=0;n<3;n++)put(`drawer-divider-${n}`,-.48,1.28,.10+n*.16,.32,.04,.022,'black');
  }
  if(use.closedForVigil){
    put('lowered-roller-blind',-.11,2.62,0,.035,.54,width-.18,'wood');
    for(let n=0;n<5;n++)put(`blind-slat-${n}`,-.084,2.40+n*.10,0,.01,.012,width-.20,'black');
  }
}
