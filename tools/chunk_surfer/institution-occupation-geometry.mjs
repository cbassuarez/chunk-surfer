// Small, shared-material assemblies for the existing institutional rooms.
// All dimensions are metres, Y-up. Wall objects have their rear at -depth/2
// and a +Z front, matching the runtime's explicit wall-contact contract.
export function buildInstitutionOccupation({mesh,MAT,addBox,addBeam,addCylinder,addEllipsoid,addQuad}){
  const made=[];
  const make=name=>{made.push(name);return mesh(name);};
  const line=(m,points,w,mat)=>{
    for(let i=1;i<points.length;i++)addBeam(m,points[i-1],points[i],w,mat);
  };
  const arc=(m,center,r,start,end,steps,w,mat,plane='xy')=>{
    line(m,Array.from({length:steps+1},(_,i)=>{
      const a=start+(end-start)*i/steps,c=Math.cos(a)*r,s=Math.sin(a)*r;
      return plane==='xy'?[center[0]+c,center[1]+s,center[2]]:
        [center[0]+c,center[1],center[2]+s];
    }),w,mat);
  };
  // Open spun vessels: a shell, a dark interior and a genuine annular rim.
  // Their silhouette remains useful when tiny handles disappear in the dither.
  const vessel=(m,[x,y,z],r,h,mat)=>{
    const n=12,inner=r*.80;
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
      const p=(angle,radius,dy)=>[x+Math.cos(angle)*radius,y+dy,z+Math.sin(angle)*radius];
      addQuad(m,p(a,r*.76,0),p(a,r,h),p(b,r,h),p(b,r*.76,0),mat);
      addQuad(m,p(a,r,h),p(a,inner,h),p(b,inner,h),p(b,r,h),mat);
      addQuad(m,p(a,inner,h),p(a,inner,h*.15),p(b,inner,h*.15),p(b,inner,h),MAT.black);
    }
    addCylinder(m,[x,y+h*.12,z],inner,h*.02,MAT.black,12);
  };
  const key=(m,x,y,z)=>{
    arc(m,[x,y,z],.023,0,Math.PI*2,10,.009,MAT.brass);
    addBeam(m,[x,y-.02,z],[x,y-.102,z],.012,MAT.brass);
    addBeam(m,[x,y-.09,z],[x+.025,y-.09,z],.012,MAT.brass);
  };
  const wheel=(m,x,y,z)=>{
    addEllipsoid(m,[x,y,z],[.035,.075,.075],MAT.black,6,10);
    addEllipsoid(m,[x-.038,y,z],[.006,.032,.032],MAT.steel,4,8);
  };
  const pencil=(m,x,y,z,yaw=0)=>{
    const dx=Math.cos(yaw)*.10,dz=Math.sin(yaw)*.10;
    addBeam(m,[x-dx,y,z-dz],[x+dx,y,z+dz],.007,MAT.wood);
    addBeam(m,[x+dx,y,z+dz],[x+dx*1.10,y,z+dz*1.10],.005,MAT.black);
  };

  {
    const m=make('occupation_cleaning_cupboard');
    // A vented steel cupboard with an open tall bay for broom/mop handles,
    // fitted shelves on the other side and a removable bucket at its foot.
    addBox(m,[0,.91,-.255],[.90,1.82,.03],MAT.agedWhite);
    for(const x of[-.445,.075,.445])addBox(m,[x,.91,0],[.025,1.82,.52],MAT.steel);
    for(const y of[.025,1.795])addBox(m,[0,y,0],[.90,.05,.54],MAT.steel);
    for(const y of[.44,.83,1.20,1.57])addBox(m,[.26,y,0],[.34,.025,.49],MAT.agedWhite);
    addBox(m,[.26,1.11,.247],[.35,1.32,.025],MAT.agedWhite);
    for(const y of[.61,.68,.75,1.57,1.64])addBox(m,[.26,y,.264],[.22,.018,.009],MAT.black);
    line(m,[[.13,1.02,.265],[.13,1.02,.283],[.13,1.15,.283],[.13,1.15,.265]],.016,MAT.steel);
    addBeam(m,[-.32,.10,.04],[-.23,1.69,-.09],.024,MAT.wood);
    addBox(m,[-.32,.085,.04],[.22,.08,.15],MAT.wood);
    for(let i=0;i<7;i++)addBeam(m,[-.41+i*.029,.055,.04],[-.41+i*.029,.005,.055],.015,MAT.cloth);
    addBeam(m,[-.08,.12,.02],[-.05,1.72,-.10],.023,MAT.steel);
    for(let i=0;i<6;i++)line(m,[[-.08,.16,.02],[-.18+i*.034,.08,.10],[-.17+i*.033,.015,.15]],.018,MAT.cloth);
    vessel(m,[-.23,.04,.05],.145,.23,MAT.poolBlue);
    arc(m,[-.23,.265,.05],.13,0,Math.PI,10,.012,MAT.steel);
  }
  {
    const m=make('occupation_maintenance_shelf');
    for(const x of[-.51,.51])for(const z of[-.19,.19])addBeam(m,[x,0,z],[x,1.48,z],.027,MAT.steel);
    for(const y of[.08,.55,1.02,1.44])addBox(m,[0,y,0],[1.08,.035,.44],MAT.wood);
    line(m,[[-.50,.10,-.20],[.50,1.42,-.20],[-.50,1.42,-.20],[.50,.10,-.20]],.018,MAT.steel);
    // Coiled lead, two lubricant tins, folded cloth and a spanner tray.
    for(const r of[.10,.125,.15])arc(m,[-.25,.575,.01],r,0,Math.PI*2,14,.014,MAT.black,'xz');
    for(const x of[.13,.32]){
      addCylinder(m,[x,.71,0],.065,.28,MAT.agedWhite,10);
      addCylinder(m,[x,.855,0],.029,.015,MAT.black,8);
    }
    addBox(m,[-.25,1.055,0],[.38,.035,.28],MAT.cloth);
    addBox(m,[-.22,1.082,.015],[.32,.025,.25],MAT.cloth);
    for(const [x,z]of[[.1,-.07],[.24,.06],[.36,-.03]]){
      addBeam(m,[x-.05,1.05,z],[x+.04,1.05,z+.05],.018,MAT.steel);
      arc(m,[x+.045,1.05,z+.055],.025,.2,Math.PI*1.7,8,.010,MAT.steel,'xz');
    }
    addCylinder(m,[-.25,.25,0],.13,.30,MAT.agedWhite,12);
    addCylinder(m,[.20,.22,0],.12,.24,MAT.steel,12);
  }
  {
    const m=make('occupation_cloak_rail');
    for(const x of[-.60,.60]){
      line(m,[[x,.025,-.20],[x,.025,.20],[x,.025,0],[x,1.57,0]],.038,MAT.steel);
    }
    addBeam(m,[-.64,1.57,0],[.64,1.57,0],.038,MAT.brass);
    for(const x of[-.43,-.15,.14,.42]){
      arc(m,[x,1.53,0],.045,0,Math.PI*1.8,10,.012,MAT.brass);
      line(m,[[x,1.49,0],[x-.115,1.40,0],[x+.115,1.40,0],[x,1.49,0]],.012,MAT.steel);
      addBox(m,[x+.05,1.33,.025],[.048,.07,.005],MAT.paper);
    }
    // One folded scarf, not another full costume rail or phantom occupant.
    addBox(m,[.40,1.17,.025],[.15,.48,.045],MAT.cloth);
    addBox(m,[.43,1.17,-.025],[.15,.43,.04],MAT.cloth);
  }
  {
    const m=make('occupation_arrival_book');
    addBox(m,[-.105,.014,0],[.39,.028,.30],MAT.dark);
    addBox(m,[-.105,.034,0],[.365,.018,.275],MAT.paper);
    addBox(m,[-.108,.045,0],[.012,.008,.275],MAT.cloth);
    for(const z of[-.085,-.035,.015,.065,.115])for(const x of[-.205,-.015])addBox(m,[x,.045,z],[.11,.001,.003],MAT.wood);
    // The bell has a flared rim and rounded dome, separate from the book.
    addCylinder(m,[.20,.015,.02],.082,.025,MAT.black,16);
    addEllipsoid(m,[.20,.050,.02],[.074,.045,.074],MAT.brass,8,14);
    addCylinder(m,[.20,.10,.02],.013,.055,MAT.brass,8);
    addEllipsoid(m,[.20,.132,.02],[.028,.012,.028],MAT.brass,4,10);
    // Cloak-check halves remain unnumbered: no new performance or place lore.
    for(let i=0;i<3;i++)addBox(m,[.17,.005+i*.004,-.115],[.12,.003,.055],MAT.paper);
    pencil(m,-.11,.052,-.125,.10);
  }
  {
    const m=make('occupation_umbrella_contents');
    for(const[x,z,h,mat]of[[-.07,-.025,.92,MAT.black],[.055,.04,1.01,MAT.navy],[.01,-.055,.82,MAT.cloth]]){
      // The lower bundle sits inside the already-existing wastebasket.
      addEllipsoid(m,[x,.51,z],[.036,.32,.036],mat,7,10);
      addBeam(m,[x,.30,z],[x,h-.055,z],.013,MAT.steel);
      arc(m,[x+.035,h-.055,z],.035,0,Math.PI*1.5,9,.014,MAT.wood);
    }
  }
  {
    const m=make('occupation_entry_mat');
    addBox(m,[0,.007,0],[2.1,.014,1.0],MAT.cloth);
    for(let x=-.93;x<1;x+=.09)addBox(m,[x,.016,0],[.018,.004,.86],MAT.black);
  }
  {
    const m=make('occupation_desk_phone');
    addBox(m,[0,.034,0],[.28,.045,.22],MAT.black,0,-.10);
    for(const x of[-.092,.092])addBox(m,[x,.073,-.045],[.032,.055,.035],MAT.black);
    addBeam(m,[-.112,.114,-.045],[.112,.114,-.045],.041,MAT.black);
    for(const x of[-.11,.11])addEllipsoid(m,[x,.105,-.045],[.038,.030,.047],MAT.black,6,8);
    for(let row=0;row<4;row++)for(let col=0;col<3;col++)addBox(m,[-.035+col*.035,.074,.005+row*.028],[.024,.011,.018],MAT.agedWhite);
    // A coiled handset lead has a recognisable curved return, not a black box.
    line(m,Array.from({length:25},(_,i)=>[.12+Math.sin(i*Math.PI/2)*.008,.06-i*.001,.01+i*.0036]),.006,MAT.black);
  }
  {
    const m=make('occupation_pigeonholes');
    addBox(m,[0,.28,-.082],[1.08,.56,.016],MAT.dark);
    for(const x of[-.53,-.176,.176,.53])addBox(m,[x,.28,0],[.018,.56,.18],MAT.wood);
    for(const y of[.01,.19,.37,.55])addBox(m,[0,y,0],[1.08,.018,.18],MAT.wood);
    for(const[x,y]of[[-.35,.205],[0,.025],[.35,.385]]){
      addBox(m,[x,y+.018,.01],[.27,.032,.13],MAT.paper);
      addBox(m,[x+.035,y+.037,.025],[.23,.009,.12],MAT.paper,0,.035);
    }
  }
  {
    const m=make('occupation_key_hooks');
    addBox(m,[0,.14,-.035],[.64,.28,.02],MAT.wood);
    for(const x of[-.23,-.075,.075,.23]){
      line(m,[[x,.21,-.02],[x,.21,.025],[x,.24,.025]],.012,MAT.steel);
      if(x!==.075)key(m,x,.19,.035);
      addBox(m,[x,.055,-.02],[.09,.025,.004],MAT.paper);
    }
  }
  {
    const m=make('occupation_wall_clock');
    addEllipsoid(m,[0,.17,-.008],[.17,.17,.024],MAT.black,10,24);
    addEllipsoid(m,[0,.17,.009],[.151,.151,.012],MAT.paper,10,24);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      addBeam(m,[Math.sin(a)*.126,.17+Math.cos(a)*.126,.024],[Math.sin(a)*.141,.17+Math.cos(a)*.141,.024],.008,MAT.black);
    }
    line(m,[[.064,.20,.027],[0,.17,.027],[-.018,.276,.027]],.011,MAT.black);
  }
  {
    const m=make('occupation_instrument_dolly');
    for(const x of[-.36,.36])for(const z of[-.23,.23])wheel(m,x,.077,z);
    addBox(m,[0,.19,0],[.80,.06,.57],MAT.wood);
    for(const x of[-.36,.36])line(m,[[x,.22,-.25],[x,.63,-.25],[x,.65,-.19]],.032,MAT.steel);
    addBeam(m,[-.36,.65,-.20],[.36,.65,-.20],.032,MAT.steel);
    for(const x of[-.23,.23])addBox(m,[x,.231,0],[.09,.022,.54],MAT.cloth);
    // Retaining strap lies loose on the padded platform.
    line(m,[[-.25,.25,.18],[.04,.27,.16],[.25,.25,-.04]],.026,MAT.cloth);
  }
  {
    const m=make('occupation_case_cradle');
    for(const x of[-.47,0,.47])line(m,[[x,.03,-.20],[x,.03,.20],[x,.03,0],[x,1.10,-.13]],.030,MAT.steel);
    for(const y of[.12,.67,1.08])addBeam(m,[-.53,y,-.13],[.53,y,-.13],.030,MAT.steel);
    for(const x of[-.27,.27]){
      line(m,[[x-.14,.14,.13],[x-.14,.20,.18],[x+.14,.20,.18],[x+.14,.14,.13]],.037,MAT.cloth);
      addEllipsoid(m,[x,.51,-.015],[.16,.32,.10],MAT.black,8,12);
      addEllipsoid(m,[x,.92,-.025],[.075,.27,.065],MAT.black,8,10);
      addBox(m,[x+.14,.52,.01],[.025,.13,.035],MAT.steel);
      addBox(m,[x,.70,.091],[.09,.035,.012],MAT.brass);
    }
  }
  {
    const m=make('occupation_corner_guard');
    addBox(m,[-.036,.56,-.015],[.046,1.12,.025],MAT.steel);
    addBox(m,[.023,.56,.010],[.070,1.12,.025],MAT.steel);
    for(const y of[.10,.58,1.04])addEllipsoid(m,[.022,y,.026],[.009,.009,.003],MAT.black,4,8);
  }
  {
    const m=make('occupation_vocal_mirror');
    addBox(m,[0,.67,-.011],[.54,1.34,.023],MAT.wood);
    addBox(m,[0,.67,.006],[.49,1.28,.010],MAT.steel);
    // A repaired retaining clip is hardware, not an invented reflection.
    for(const[x,y]of[[-.23,.06],[.23,.06],[-.23,1.28],[.23,1.28]])addBox(m,[x,y,.016],[.032,.030,.010],MAT.black);
  }
  {
    const m=make('occupation_water_shelf');
    addBox(m,[0,.018,0],[.40,.036,.18],MAT.wood);
    for(const x of[-.14,.14])line(m,[[x,.00,-.075],[x,.14,-.075],[x,.035,.065]],.015,MAT.steel);
    vessel(m,[.055,.038,.005],.043,.15,MAT.roofGlass);
    addCylinder(m,[.055,.12,.005],.033,.002,MAT.poolBlue,12);
    addBox(m,[-.10,.041,.015],[.10,.007,.12],MAT.paper);
  }
  {
    const m=make('occupation_theory_tools');
    addBox(m,[-.065,.021,0],[.16,.042,.075],MAT.wood);
    addBox(m,[-.065,.010,0],[.17,.019,.082],MAT.cloth);
    for(const[x,z,yaw]of[[.065,.04,.1],[.085,-.02,-.1]])addBox(m,[x,.012,z],[.065,.016,.013],MAT.ivory,yaw);
    pencil(m,.035,.01,-.075,.1);
  }
  {
    const m=make('occupation_string_tools');
    addBox(m,[-.060,.012,0],[.09,.024,.075],MAT.dark);
    addEllipsoid(m,[-.060,.033,0],[.032,.015,.028],MAT.brass,5,10);
    addQuad(m,[.005,.006,-.06],[.11,.006,-.05],[.09,.006,.06],[.015,.006,.045],MAT.cloth);
    pencil(m,.005,.009,.060,-.12);
  }
  {
    const m=make('occupation_reed_tools');
    addBox(m,[-.02,.009,0],[.20,.018,.15],MAT.dark);
    addBox(m,[-.02,.021,-.062],[.20,.008,.020],MAT.wood);
    for(const x of[-.075,-.025,.025,.075]){
      addBox(m,[x,.025,.01],[.022,.008,.105],MAT.ivory);
      addBox(m,[x,.030,-.030],[.018,.005,.028],MAT.wood);
    }
    addBox(m,[.02,.034,.069],[.10,.006,.023],MAT.paper);
  }
  {
    const m=make('occupation_caster_wear');
    for(const x of[-.64,.64]){
      // Paired short wheel arcs, not an arbitrary large circular decal.
      for(const d of[-.012,.012])arc(m,[x,.003,0],.13+d,-.7,1.9,14,.007,MAT.wood,'xz');
      addBox(m,[x+.06,.003,-.08],[.055,.003,.24],MAT.wood,0);
    }
  }
  {
    const m=make('occupation_refit_patch');
    addBox(m,[0,.51,-.006],[.64,1.02,.006],MAT.plaster);
    // A chased vertical cable route and two removed-box screw patterns.
    addBox(m,[-.16,.57,.002],[.070,.84,.010],MAT.agedWhite);
    for(const y of[.20,.57])for(const x of[.12,.23])addEllipsoid(m,[x,y,.008],[.008,.008,.002],MAT.dark,4,8);
    for(const y of[.31,.73])addBox(m,[.02,y,.003],[.52,.022,.006],MAT.stone);
  }
  {
    const m=make('occupation_service_glands');
    addBox(m,[0,.48,-.055],[.54,.72,.03],MAT.steel);
    for(const[x,h]of[[-.16,.99],[.12,1.10]]){
      addCylinder(m,[x,.10,.026],.027,.18,MAT.black,8);
      addBeam(m,[x,.18,.026],[x,h,.026],.025,MAT.steel);
      for(const y of[.26,.84])addBox(m,[x,y,.045],[.09,.026,.035],MAT.steel);
      addEllipsoid(m,[x,.68,.035],[.047,.047,.030],MAT.black,6,10);
    }
    addBox(m,[.00,.60,.054],[.13,.07,.008],MAT.paper);
  }
  {
    const m=make('occupation_baths_rainwater_completion');
    // The original builder owns the 75mm-radius pipe at local (0,0). This
    // half-round channel drops to its surviving open head at y7.05.
    const segments=10,r=.115;
    for(let i=0;i<segments;i++){
      const a=Math.PI+i/segments*Math.PI,b=Math.PI+(i+1)/segments*Math.PI;
      const p=(x,angle,rad=r)=>[x,7.19+Math.sin(angle)*rad,-.015+Math.cos(angle)*rad];
      addQuad(m,p(-1.02,a),p(1.02,a),p(1.02,b),p(-1.02,b),MAT.steel);
      addQuad(m,p(-1.02,a,r-.006),p(-1.02,b,r-.006),p(1.02,b,r-.006),p(1.02,a,r-.006),MAT.steel);
    }
    for(const z of[-.130,.100])addBeam(m,[-1.02,7.19,z],[1.02,7.19,z],.012,MAT.steel);
    vessel(m,[0,6.99,0],.115,.15,MAT.steel);
    for(const y of[.30,2.20,4.60,6.82]){
      arc(m,[0,y,0],.085,0,Math.PI*2,12,.016,MAT.steel,'xz');
      addBeam(m,[0,y,.08],[0,y,.16],.022,MAT.steel);
    }
    // Open receiving gully under the existing shoe. Removable slotted grate,
    // rim and settlement stain are visible; no new solid drainage wall.
    addBox(m,[0,.018,-.20],[.42,.028,.43],MAT.black);
    for(const x of[-.22,.22])addBox(m,[x,.045,-.20],[.035,.055,.48],MAT.stone);
    for(const z of[-.43,.03])addBox(m,[0,.045,z],[.46,.055,.035],MAT.stone);
    for(let x=-.16;x<.2;x+=.055)addBox(m,[x,.046,-.20],[.018,.018,.36],MAT.steel);
  }
  return {meshes:made,newMaterials:0};
}
