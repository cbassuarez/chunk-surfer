// Four idiosyncratic collegiate grotesques, carved as part of the belvedere.
// Their jaws, paws and folded wings are broad negative-space silhouettes;
// neither tiny surface noise nor emissive eyes carries their expression.
// These are ornamental beasts. No functioning rainwater drain is claimed.
export const ROOF_GROTESQUES=Object.freeze([
  {id:'rain-hound',kind:'hound',x:-11.5,z:-3,base:4.34,yaw:-Math.PI/2},
  {id:'squinting-lion',kind:'lion',x:11.5,z:-3,base:4.34,yaw:Math.PI/2},
  {id:'listening-rook',kind:'rook',x:-11.5,z:3,base:4.34,yaw:-Math.PI/2},
  {id:'vestry-owl',kind:'owl',x:11.5,z:3,base:4.34,yaw:Math.PI/2},
].map(Object.freeze));

export const ROOF_GROTESQUE_ENVELOPE=Object.freeze({
  halfWidth:.43,back:-.49,front:.49,height:1.34,
  // Above existing side columns, wholly on their capped cornice. Their heads
  // peer inward; the centre of each six-metre city-view bay stays open.
  northOpening:Object.freeze({x0:3,x1:5,z0:-13.5,z1:-12.5}),
});

export const ROOF_FOLIATE_HEAD=Object.freeze({
  // The west keystone's inward face is x=-11.12. Embed only the relief's
  // back; its leaf folds and carved recesses must stand ahead of that face.
  id:'west-arcade-foliate-head',x:-11.10,y:3.99,z:-6,yaw:-Math.PI/2,
  width:1.04,height:1.0,depth:.26,faces:'east toward the west promenade',
});

export function buildRoofGrotesques({m,materials,carvedStone,addBox,addBeam,
  addEllipsoid,addCylinder,addQuad,placements=ROOF_GROTESQUES,foliateHead=ROOF_FOLIATE_HEAD}){
  const material=(name,rgb)=>{
    const id=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],
      metallicFactor:0,roughnessFactor:.97}});
    return id;
  };
  const stone=carvedStone??material('roof grotesque rain-worn limestone',[.355,.320,.255]);
  const recess=material('roof grotesque deeply cut stone',[.055,.057,.050]);

  for(const at of placements){
    const c=Math.cos(at.yaw),s=Math.sin(at.yaw);
    const p=([x,y,z])=>[at.x+x*c-z*s,at.base+y,at.z+x*s+z*c];
    const box=(centre,size,mat=stone)=>addBox(m,p(centre),size,mat,at.yaw);
    const beam=(a,b,w,mat=stone)=>addBeam(m,p(a),p(b),w,mat);
    const ell=(centre,r,mat=stone,lat=8,lon=12)=>{
      // All four authored poses use cardinal rotations. Swap the horizontal
      // radii rather than pretending the primitive supports oriented axes.
      const quarter=Math.abs(s)>.5;
      addEllipsoid(m,p(centre),quarter?[r[2],r[1],r[0]]:r,mat,lat,lon);
    };
    const face=(a,b,c,d,mat=stone)=>{
      // Carved ear and wing returns need to survive either viewing side.
      addQuad(m,p(a),p(b),p(c),p(d),mat);
      addQuad(m,p(d),p(c),p(b),p(a),mat);
    };
    const paw=(x,z=.25)=>{
      box([x,.105,z],[.18,.13,.34]);
      box([x,.145,z+.10],[.20,.09,.16]);
    };
    const eye=(x,y,z,slant=0)=>{
      ell([x,y,z],[.046,.034,.030],recess,6,8);
      beam([x-.070,y+.046,z-.008],[x+.070,y+.046+slant,z-.008],.055);
    };
    const jaw=(width=.34)=>{
      // There is a real 10 cm gap between the front jaw stones. A black disc
      // painted across a closed muzzle would lose the silhouette in dither.
      box([0,.79,.34],[width,.12,.28]);
      box([0,.59,.33],[width*.80,.08,.28]);
      for(const x of[-width*.42,width*.42])
        beam([x,.64,.17],[x,.76,.21],.070);
      box([0,.698,.184],[width*.60,.10,.025],recess);
    };

    // A whole carved stool, not a statue hovering above a narrow cornice.
    box([0,.035,0],[.76,.07,.76]);
    box([0,.085,0],[.65,.04,.65]);

    if(at.kind==='hound'){
      // Long mournful ears, a tucked haunch and two outstretched paws: closer
      // to a stone yard dog watching a rehearsal than a heraldic monster.
      ell([0,.43,-.10],[.255,.28,.28]);
      ell([0,.67,.055],[.18,.29,.18]);
      ell([0,.93,.12],[.205,.205,.18]);
      jaw(.34);paw(-.20);paw(.20);
      for(const sign of[-1,1]){
        face([sign*.15,1.08,.06],[sign*.28,1.03,.07],
          [sign*.26,.65,.14],[sign*.18,.72,.20]);
        beam([sign*.22,1.00,.11],[sign*.235,.73,.15],.075);
      }
      eye(-.10,.96,.275,-.020);eye(.10,.96,.275,.020);
      box([0,.842,.465],[.16,.075,.035],recess);
      beam([-.12,.21,-.29],[.13,.18,-.40],.10);
      beam([.13,.18,-.40],[.25,.28,-.32],.09);
    }else if(at.kind==='lion'){
      ell([0,.43,-.10],[.285,.28,.28]);
      // A faceted horseshoe mane is carved around the face, leaving the
      // mouth open. It avoids the circular eye sockets of a generic skull.
      const mane=[[-.29,.57,.12],[-.33,.83,.09],[-.24,1.12,.07],
        [0,1.22,.04],[.24,1.12,.07],[.33,.83,.09],[.29,.57,.12]];
      for(let i=1;i<mane.length;i++)beam(mane[i-1],mane[i],.14);
      ell([0,.96,.14],[.215,.21,.17]);
      jaw(.39);paw(-.22);paw(.22);
      eye(-.105,1.00,.288,-.038);eye(.105,1.00,.288,.038);
      box([0,.852,.455],[.185,.075,.045],recess);
      for(const x of[-.20,.20])ell([x,1.11,.09],[.085,.095,.065]);
      // One heavy curled tail joins the rump instead of becoming loose wire.
      beam([.19,.20,-.28],[.28,.30,-.39],.09);
      beam([.28,.30,-.39],[.18,.39,-.34],.08);
    }else if(at.kind==='rook'){
      ell([0,.44,-.07],[.25,.31,.28]);
      ell([0,.72,.06],[.16,.27,.15]);
      ell([0,.99,.16],[.17,.17,.16]);
      // The bill is a broad tapered stone wedge; its open seam gives the
      // bird a sour, half-speaking expression without microscopic teeth.
      face([-.13,1.01,.27],[.13,1.01,.27],[.025,.96,.48],[-.025,.96,.48]);
      face([-.13,.93,.27],[-.025,.92,.48],[.025,.92,.48],[.13,.93,.27]);
      for(const sign of[-1,1]){
        face([sign*.13,.77,.01],[sign*.31,.62,-.12],
          [sign*.24,.20,-.40],[sign*.08,.32,-.31]);
        beam([sign*.25,.58,-.14],[sign*.17,.25,-.36],.095);
        box([sign*.11,.13,.14],[.15,.10,.27]);
        eye(sign*.10,1.025,.282,sign*.015);
      }
      face([-.13,.30,-.22],[.13,.30,-.22],[.10,.12,-.46],[-.10,.12,-.46]);
    }else if(at.kind==='owl'){
      ell([0,.43,-.04],[.255,.30,.24]);
      ell([0,.88,.025],[.31,.275,.235]);
      // Two broad facial discs surround small deeply recessed eyes. A heavy
      // joined brow is readable before the pupil or feather incisions are.
      for(const sign of[-1,1]){
        ell([sign*.135,.91,.217],[.132,.153,.055]);
        ell([sign*.135,.925,.267],[.063,.064,.018],recess,6,8);
        beam([sign*.03,1.025,.247],[sign*.25,1.065,.19],.075);
        face([sign*.17,.65,.05],[sign*.32,.52,-.09],
          [sign*.23,.19,-.27],[sign*.15,.30,.03]);
        beam([sign*.27,.49,-.11],[sign*.21,.22,-.23],.075);
        box([sign*.12,.12,.16],[.16,.10,.23]);
      }
      face([-.08,.92,.262],[.08,.92,.262],[.035,.755,.325],[-.035,.755,.325]);
      face([-.07,.27,-.17],[.07,.27,-.17],[.075,.13,-.35],[-.075,.13,-.35]);
    }else throw new Error(`Unknown roof grotesque kind: ${at.kind}`);
  }

  if(foliateHead){
    // A single large foliate head joins the stone order to the terrace's
    // living growth. It is a keystone relief, not another freestanding beast.
    const at=foliateHead,c=Math.cos(at.yaw),s=Math.sin(at.yaw);
    const p=([x,y,z])=>[at.x+x*c-z*s,at.y+y,at.z+x*s+z*c];
    const box=(centre,size,mat=stone)=>addBox(m,p(centre),size,mat,at.yaw);
    const beam=(a,b,w,mat=stone)=>addBeam(m,p(a),p(b),w,mat);
    const face=(a,b,c,d)=>{
      addQuad(m,p(a),p(b),p(c),p(d),stone);
      addQuad(m,p(d),p(c),p(b),p(a),stone);
    };
    addEllipsoid(m,p([0,0,.035]),[.10,.27,.22],stone,6,8);
    for(const sign of[-1,1]){
      box([sign*.105,.035,.142],[.080,.055,.023],recess);
      beam([sign*.025,.105,.158],[sign*.185,.155,.10],.065);
      // Each broad leaf has a folded central ridge and a deeply scalloped
      // outline. The dark gaps between leaves carry more than fine veins.
      for(const [root,tip,edge]of[
        [[.14,.13,.07],[.48,.37,.045],[.34,.04,.11]],
        [[.17,-.035,.07],[.50,-.11,.025],[.32,-.30,.09]],
        [[.09,-.18,.065],[.27,-.45,.035],[.02,-.32,.11]],
      ]){
        const a=[sign*root[0],root[1],root[2]],b=[sign*tip[0],tip[1],tip[2]],
          d=[sign*edge[0],edge[1],edge[2]],ridge=[sign*(root[0]+tip[0])*.54,(root[1]+tip[1])*.5,.15],
          shoulder=[sign*(root[0]+edge[0])*.55,(root[1]+tip[1])*.5+.07,.07];
        face(a,shoulder,b,ridge);face(b,d,a,ridge);
      }
    }
    face([-.065,.08,.16],[.065,.08,.16],[.045,-.09,.245],[-.045,-.09,.245]);
    box([0,-.15,.145],[.13,.055,.02],recess);
  }
}
