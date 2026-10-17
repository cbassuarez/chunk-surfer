// School-specific roof objects. Kept separate from the walkable roof shell so
// the ascent, glass collision and Ren can be revised without moving this set.
// The large forms carry identity at the game's one-bit field resolution; the
// small marks are only a close inspection reward, never a navigation cue.
export function buildAcademicRoofDressing({mesh,materials,MAT,addBox,addBeam,addEllipsoid,addCylinder,addQuad}){
  const material=(name,rgb,metallic=.4,roughness=.75,extras=null)=>{
    const id=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:metallic,roughnessFactor:roughness},
      ...(extras?{extras}:{})});
    return id;
  };
  const weathered={roofRole:'weathered-surface'};
  const quiet={fireEscapeRole:'quiet-metal'};
  const patina=material('roof bell and gutter patina',[.105,.165,.145],.04,.96,weathered);
  const wornBell=material('roof bell worn mouth',[.39,.29,.13],.04,.94);
  const bellFace=material('roof bell rain-dulled bronze',[.36,.29,.18],.02,.98);
  const weatheredLead=material('roof lead repair flashing',[.16,.185,.18],.02,.95,weathered);
  const oldEnamel=material('roof old cream enamel',[.34,.35,.29],.02,.96);
  const quietIron=material('roof dressing charcoal iron',[.026,.038,.040],0,1,quiet);
  const rainStone=material('roof dressing rain-dark stone',[.155,.175,.170],0,.98,weathered);
  const rainBrick=material('roof dressing soaked brick',[.105,.080,.066],0,1,weathered);
  const waterFilm=material('roof gutter-fed water film',[.030,.057,.065],.01,.36,weathered);
  const darkCloth=material('roof abandoned coat wool',[.062,.074,.080],0,1,weathered);
  const chairWood=material('roof institutional chair worn wood',[.125,.090,.058],0,.98,weathered);

  {
    const m=mesh('academic_roof_school_bell');
    // This is the former *school call* bell, not a ninth tower bell. It sits
    // against the north guard, off the continuous walk and left of the seated
    // city view. A missing rope makes it quiet without making it magical.
    // A single bent iron hanger leaves the bronze silhouette exposed. The
    // earlier paired uprights reduced to a door-shaped outline in the VFD.
    addBox(m,[-.26,.13,-.26],[.83,.26,.72],rainBrick);
    addBox(m,[-.26,.29,-.26],[.88,.07,.75],rainStone);
    addBeam(m,[-.48,.32,-.43],[-.48,2.42,-.43],.15,quietIron);
    addBeam(m,[-.48,2.42,-.43],[.08,2.42,.08],.13,quietIron);
    addBeam(m,[-.48,2.09,-.43],[-.18,2.40,-.16],.075,quietIron);
    addCylinder(m,[.08,2.35,.08],.125,.19,MAT.brass,12);
    // A wide flared mouth and broad body survive the one-bit dither at the
    // approach distance; the dark opening keeps it recognisably a bell.
    const rings=[[2.29,.13],[2.19,.28],[1.88,.33],[1.73,.45]];
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<16;i++){
      const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
      const [ya,ra]=rings[j],[yb,rb]=rings[j+1];
      // Outward winding is essential: the renderer culls the reverse face.
      addQuad(m,[.08+ra*Math.cos(a),ya,.08+ra*Math.sin(a)],
        [.08+ra*Math.cos(b),ya,.08+ra*Math.sin(b)],
        [.08+rb*Math.cos(b),yb,.08+rb*Math.sin(b)],
        [.08+rb*Math.cos(a),yb,.08+rb*Math.sin(a)],bellFace);
    }
    addEllipsoid(m,[.08,2.06,.08],[.26,.24,.26],bellFace,10,16);
    addCylinder(m,[.08,1.727,.08],.455,.055,wornBell,16);
    addCylinder(m,[.08,1.694,.08],.33,.008,MAT.black,16);
    addEllipsoid(m,[.08,1.67,.08],[.085,.10,.085],wornBell,8,12);
    // A visibly empty hanging eye where a rope used to be.
    addBeam(m,[.08,1.68,.08],[.08,1.51,.08],.035,quietIron);
  }

  {
    const m=mesh('academic_roof_listening_vent');
    // This caps the already-authored low vent stack at logical (211,292),
    // rather than adding an unrelated mechanical object to the new ascent.
    // Its open throat motivates a muffled practice-room sound at close range.
    addBox(m,[0,.68,0],[1.14,.16,.94],quietIron);
    addBox(m,[0,.94,0],[.78,.45,.63],MAT.black);
    for(const x of[-.49,.49])addBeam(m,[x,.67,-.32],[x,1.37,-.32],.085,quietIron);
    for(const x of[-.49,.49])addBeam(m,[x,.67,.32],[x,1.37,.32],.085,quietIron);
    // The pitched cowl projects toward the player. Its sheltered black mouth
    // stays large enough to read as an opening even in rain and VFD reduction.
    addBox(m,[0,1.38,-.09],[1.20,.11,.90],patina,0,-.20);
    addBox(m,[0,1.30,-.43],[1.01,.18,.13],weatheredLead);
    addBox(m,[0,1.055,-.344],[.68,.32,.03],MAT.black);
    for(const y of[.97,1.07,1.17])addBox(m,[0,y,-.370],[.78,.035,.06],oldEnamel);
    addBox(m,[0,.78,-.52],[.50,.085,.14],quietIron);
    addBox(m,[0,.76,-.602],[.12,.055,.045],MAT.brass);
  }

  {
    const m=mesh('academic_roof_guarantor_marks');
    // Two unlike workaday tokens, hanging from the east guard near Ren: an
    // older student's locker tag and a later cleaner's service key. Geometry
    // does not print names or reveal the seal before Ren earns that dialogue.
    // A dark, thin wear plate on the rail gives the two suspended tokens a
    // coherent negative-space ground through one-bit reduction.
    addBox(m,[.70,.93,0],[.09,.94,1.04],MAT.black);
    addBox(m,[.34,1.37,0],[.10,.09,1.14],quietIron);
    for(const z of[-.30,.30]){
      addBeam(m,[.34,1.47,z],[.34,1.29,z],.04,quietIron);
      addCylinder(m,[.34,1.29,z],.055,.03,MAT.brass,10);
    }
    // At gameplay distance these need DIFFERENT outer silhouettes, not two
    // near-identical little rectangles. A broad cream locker tag contrasts
    // with a ring-and-bit service key, both well below the bright guard rail.
    addBox(m,[.34,1.02,-.30],[.10,.50,.36],quietIron);
    addBox(m,[.28,1.02,-.30],[.014,.42,.28],oldEnamel);
    addBox(m,[.267,1.15,-.30],[.010,.055,.20],MAT.black);
    const keyCenter=[.34,1.04,.30],keyRadius=.16;
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
      addBeam(m,[keyCenter[0],keyCenter[1]+Math.cos(a)*keyRadius,keyCenter[2]+Math.sin(a)*keyRadius],
        [keyCenter[0],keyCenter[1]+Math.cos(b)*keyRadius,keyCenter[2]+Math.sin(b)*keyRadius],.055,wornBell);
    }
    addBeam(m,[.34,.88,.30],[.34,.62,.30],.09,wornBell);
    addBeam(m,[.34,.67,.30],[.34,.67,.52],.075,wornBell);
    addBeam(m,[.34,.62,.30],[.34,.62,.45],.070,wornBell);
    // Backing brackets disappear into the guard, so this is not a lectern or
    // a free-standing clue plinth in the roof walk.
    for(const z of[-.52,.52])addBeam(m,[.36,1.37,z],[1.48,1.37,z],.05,quietIron);
  }

  {
    const m=mesh('academic_roof_rehearsal_rest');
    // An ordinary folded practice chair, a coat and a collapsed music stand,
    // stored beside the listening vent. One low, compact human trace instead
    // of a new furnishing row between the glass and the city. This owns its
    // own honest blocking footprint rather than hiding in the flat weatherwork.
    for(const x of[-.16,.40]){
      addBeam(m,[x,.045,-.25],[x,.90,.08],.035,quietIron);
      addBeam(m,[x,.045,.25],[x,.69,.025],.030,quietIron);
    }
    addBox(m,[.12,.75,.025],[.60,.27,.055],chairWood,0,.18);
    addBox(m,[.12,.39,-.11],[.58,.055,.37],chairWood,0,.18);
    // Broad cloth surfaces carry the silhouette; tiny dangling folds would
    // turn into accidental VFD specks at the roof's normal approach distance.
    addBox(m,[.12,.56,-.145],[.64,.52,.065],darkCloth,0,.13);
    addBox(m,[.36,.28,-.11],[.15,.37,.09],darkCloth,0,-.12);
    addBox(m,[-.14,.31,-.09],[.14,.35,.10],darkCloth,0,.08);
    // Collapsed tripod and music tray lie below the sill of the chair.
    addBeam(m,[-.66,.06,.27],[.59,.09,.30],.033,quietIron);
    addBox(m,[-.41,.105,.20],[.51,.035,.34],chairWood,0,-.09);
    addBeam(m,[-.66,.055,.27],[-.40,.06,.40],.027,quietIron);
    addBeam(m,[-.66,.055,.27],[-.40,.06,.10],.027,quietIron);
  }

  {
    const m=mesh('academic_roof_weatherwork');
    // Original standing-seam zinc, patched with broad lead sheets. Repair is
    // a silhouette and material fact, not screen-sized decorative scratches.
    for(const [x,z,w,d] of[
      [-8.85,5.9,1.56,2.12],[-8.20,-4.15,1.92,1.45],
      [8.05,-3.35,2.13,1.64],[7.60,9.30,1.72,1.28],
    ]){
      addBox(m,[x,.010,z],[w,.020,d],weatheredLead);
      for(const dx of[-w/2+.08,w/2-.08])addBox(m,[x+dx,.026,z],[.045,.013,d-.14],quietIron);
      for(const dz of[-d/2+.08,d/2-.08])addBox(m,[x,.026,z+dz],[w-.14,.013,.045],quietIron);
    }
    // Broad irregular water catches follow the side gutters and low service
    // stacks. Every patch remains on zinc, leaving the supported glass clear.
    // Upward winding matters: rain catches must not vanish to face culling.
    for(const corners of[
      [[-10.15,-1.2],[-9.95,2.65],[-7.55,2.10],[-7.20,-.55]],
      [[6.85,6.35],[7.10,10.50],[9.90,10.05],[10.15,7.50]],
      [[5.20,-9.80],[5.55,-8.10],[9.95,-8.55],[10.10,-10.15]],
    ])addQuad(m,...corners.map(([x,z])=>[x,.004,z]),waterFilm);
    // Guttering follows the safe stone border around the lantern. The low
    // channel points to two scuppers on the outer edge; nothing crosses a
    // supported pane, narrows the loop, or stands up into the city horizon.
    for(const x of[-6.25,6.15]){
      addBox(m,[x,.021,-1],[.19,.043,13.3],patina);
      addBox(m,[x,.046,-1],[.12,.012,13.0],MAT.black);
    }
    for(const [x,z,ex] of[[-8.85,5.75,-11.10],[8.75,-7.55,11.08]]){
      addBox(m,[(x+ex)/2,.012,z],[Math.abs(ex-x),.021,.22],patina);
      addBox(m,[ex,.016,z],[.68,.03,.74],weatheredLead);
      for(const dz of[-.20,-.08,.04,.16])addBox(m,[ex,.036,z+dz],[.57,.028,.034],MAT.black);
    }
  }
}
