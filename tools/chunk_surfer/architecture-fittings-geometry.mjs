// A small shared kit: raised joinery, open radiator flutes and hardware recesses
// survive a close torch without turning every fitting into its own material.
export function buildArchitectureFittings({mesh,materials,addBox,addBeam,addCylinder,addEllipsoid}) {
  const material=(name,rgb,metallic=0,roughness=.85)=>{
    const id=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness}});
    return id;
  };
  const paint=material('fittings old warm enamel',[.54,.52,.42],.04,.76);
  const white=material('fittings porcelain',[.67,.65,.56],.02,.50);
  const iron=material('fittings rubbed dark steel',[.11,.13,.125],.20,.78);
  const brass=material('fittings tarnished brass',[.35,.25,.105],.50,.59);
  const timber=material('fittings dark polished oak',[.17,.10,.055],0,.65);
  const plaster=material('fittings patched plaster',[.43,.425,.36],0,.98);
  const dark=material('fittings recess and handling marks',[.035,.042,.039],0,.99);
  const red=material('fittings dead safety red',[.36,.055,.035],0,.83);
  const steel=material('fittings later galvanised metal',[.28,.31,.29],.30,.81);
  const screw=(m,x,y,z,mat=iron)=>{
    addEllipsoid(m,[x,y,z],[.006,.006,.0025],mat,4,6);
    addBox(m,[x,y,z+.0025],[.007,.0015,.001],dark);
  };
  const backplate=(m,w,h,d,mat)=>{
    addBox(m,[0,h/2,d/2],[w,h,d],mat);
    for(const y of[.018,h-.018])screw(m,0,y,d+.002);
  };
  for(const kind of['public','staff','service']) {
    const face=kind==='public'?brass:kind==='staff'?white:steel;
    const m=mesh(`arch_switch_${kind}`);
    backplate(m,.112,.165,.022,face);
    addBox(m,[0,.082,.027],[.043,.068,.012],dark);
    addBox(m,[0,.083,.040],[.025,.056,.024],white,0,-.17);
    if(kind==='service') {
      addBox(m,[0,.0885,.010],[.137,.177,.020],iron);
      addBeam(m,[0,.165,.017],[0,1.08,.017],.022,steel);
      for(const y of[.35,.84])addBox(m,[0,y,.030],[.055,.018,.017],iron);
      addBox(m,[0,1.065,.02],[.075,.07,.035],steel);
    }
    const s=mesh(`arch_socket_${kind}`);
    backplate(s,kind==='service'?.245:.225,.135,kind==='service'?.046:.023,face);
    for(const x of[-.055,.055]) {
      const z=kind==='service'?.049:.026;
      // Three actual dark recesses, rather than a printed black socket icon.
      addBox(s,[x,.091,z],[.012,.026,.006],dark);
      for(const dx of[-.020,.020])addBox(s,[x+dx,.052,z],[.014,.023,.006],dark);
      addBox(s,[x+.035,.102,z+.004],[.013,.018,.008],white);
    }
  }
  {
    const m=mesh('arch_fire_callpoint');backplate(m,.163,.195,.034,red);
    addBox(m,[0,.104,.037],[.116,.094,.012],dark);
    addBox(m,[0,.104,.045],[.098,.075,.005],white);
    // Break-glass pressure line is physical and remains unlit.
    addBox(m,[0,.104,.049],[.084,.003,.002],iron);
    for(const x of[-.019,.019])addBox(m,[x,.046,.044],[.012,.009,.004],white);
  }
  {
    const m=mesh('arch_alarm_sounder');backplate(m,.235,.245,.044,red);
    for(let i=0;i<7;i++)addBox(m,[-.084+i*.028,.133,.065],[.013,.138,.046],iron);
    addBox(m,[0,.026,.067],[.17,.020,.036],red);
  }
  {
    const m=mesh('arch_smoke_detector');
    addCylinder(m,[0,.073,0],.122,.021,white,16);
    addCylinder(m,[0,.046,0],.103,.043,paint,16);
    addCylinder(m,[0,.019,0],.086,.020,white,16);
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6;
      addBox(m,[Math.sin(a)*.103,.045,Math.cos(a)*.103],[.018,.016,.011],dark,-a);
    }
    addBox(m,[.034,.008,.023],[.014,.004,.009],iron);
  }
  for(const kind of['public','staff']) {
    const m=mesh(`arch_radiator_${kind}`),body=kind==='public'?paint:iron;
    for(const x of[-.52,.52]) {
      addBox(m,[x,.42,.025],[.06,.47,.05],iron);
      addBeam(m,[x,.09,.065],[x,.72,.065],.028,iron);
    }
    for(let i=0;i<12;i++) {
      const x=-.44+i*.08;
      addEllipsoid(m,[x,.43,.100],[.030,.285,.059],body,6,8);
      addBox(m,[x,.43,.125],[.019,.45,.065],body);
    }
    for(const y of[.18,.68])addBeam(m,[-.49,y,.102],[.49,y,.102],.055,body);
    for(const x of[-.565,.565]) {
      addBeam(m,[x,.025,.065],[x,.18,.065],.024,iron);
      addBeam(m,[x,.18,.065],[Math.sign(x)*.46,.18,.102],.024,iron);
      addCylinder(m,[x,.205,.065],.031,.050,brass,8);
      addCylinder(m,[x,.250,.065],.044,.021,paint,10);
    }
    addBox(m,[.455,.756,.099],[.025,.025,.027],brass);
  }
  {
    const m=mesh('arch_vent_grille');backplate(m,.71,.33,.021,paint);
    addBox(m,[0,.165,.026],[.64,.255,.010],dark);
    for(let i=0;i<7;i++)addBox(m,[0,.066+i*.034,.052],[.61,.014,.045],steel,0,.28);
    for(const x of[-.326,.326])for(const y of[.027,.303])screw(m,x,y,.026);
  }
  {
    const m=mesh('arch_access_hatch');backplate(m,.49,.53,.012,iron);
    addBox(m,[0,.265,.020],[.455,.49,.014],paint);
    for(const y of[.13,.40])addBox(m,[-.216,y,.033],[.025,.05,.014],steel);
    addBox(m,[.174,.266,.031],[.025,.065,.010],dark);
    addBox(m,[.181,.266,.038],[.009,.045,.006],steel);
  }
  for(const clearance of[false,true]) {
    const m=mesh(clearance?'arch_dado_public_fountain_clearance':'arch_dado_public');
    for(const [y,h,d] of[[.22,.045,.034],[1.045,.055,.043],[1.085,.025,.059],[2.095,.026,.045],[2.123,.015,.057]])
      if(!clearance||y<1||y>1.2)addBox(m,[0,y,d/2],[1,h,d],timber);
    if(!clearance)addBox(m,[0,1.072,.048],[1,.006,.010],brass);
  }
  {
    const m=mesh('arch_dado_staff');
    addBox(m,[0,.94,.017],[1,.055,.034],paint);
    addBox(m,[0,.978,.023],[1,.022,.044],timber);
  }
  {
    const m=mesh('arch_rubbing_strip_service');
    addBox(m,[0,.065,.009],[1,.12,.018],iron);
    addBox(m,[0,.116,.016],[1,.014,.014],steel);
  }
  for(const kind of['public','staff']) {
    const m=mesh(`arch_coving_${kind}`),n=kind==='public'?4:2;
    for(let i=0;i<n;i++) {
      const d=(kind==='public'?.12:.06)*(1-i/(n+1));
      addBox(m,[0,(i+.5)*.045,d/2],[1,.045,d],paint);
    }
  }
  for(const kind of['public','staff','service']) {
    const m=mesh(kind==='service'?'arch_wall_repair_service':`arch_wall_wear_${kind}`);
    if(kind==='service') {
      addBox(m,[0,.27,.003],[.60,.49,.006],plaster);
      addBox(m,[-.245,.30,.007],[.035,.43,.004],paint);
      for(const x of[-.22,.22])for(const y of[.10,.43])addBox(m,[x,y,.009],[.022,.022,.006],iron);
      addBox(m,[0,.415,.008],[.40,.014,.006],plaster);
    } else {
      // Broad contact-height rubs, an old fixing and a clean rectangle where
      // a former fitting sheltered the paint; no arbitrary scratch wallpaper.
      const mat=kind==='public'?timber:plaster;
      addBox(m,[-.08,.265,.002],[.47,.32,.004],mat);
      addBox(m,[.11,.225,.005],[.42,.045,.003],iron,0,.03);
      addBox(m,[-.16,.31,.005],[.31,.031,.003],dark);
      for(const y of[.09,.45])addBox(m,[.25,y,.005],[.016,.016,.005],dark);
    }
  }
  for(const kind of['public','staff','service']) {
    const m=mesh(`arch_threshold_${kind}`),mat=kind==='public'?brass:kind==='staff'?timber:steel;
    addBox(m,[0,.005,.0],[1,.010,.17],mat);
    for(const z of[-.06,.06])addBox(m,[0,.011,z],[1,.006,.012],kind==='service'?iron:mat);
  }
}
