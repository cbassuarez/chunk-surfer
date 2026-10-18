import {ROOF_WATCHERS} from '../../src/data/roof-watchers.js';

// The selected parts are authored around real joints. Rest geometry is shared
// with the unsplit grotesque builder, so separating a mesh cannot change its
// expression, material, open jaw or relationship to the fixed stone body.
const anatomicalPivot=Object.freeze({hound:[0,.72,.12],owl:[0,.73,.025],foliate:[0,0,0]});

const finishes=({materials,carvedStone,recessStone})=>{
  const make=(name,rgb)=>{
    const index=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:.97}});
    return index;
  };
  let stone=carvedStone,recess=recessStone;
  if(stone==null){
    stone=materials.findIndex(m=>m.name==='roof carved rain-worn limestone');
    if(stone<0)stone=make('roof grotesque rain-worn limestone',[.355,.320,.255]);
  }
  if(recess==null){
    recess=materials.findIndex(m=>m.name==='roof grotesque deeply cut stone');
    if(recess<0)recess=make('roof grotesque deeply cut stone',[.055,.057,.050]);
  }
  return{stone,recess};
};

export function buildRoofWatcherPart({m,materials,kind,carvedStone,recessStone,
  addBox,addBeam,addEllipsoid,addQuad,at={x:0,y:0,z:0,yaw:0}}){
  const pivot=anatomicalPivot[kind];
  if(!pivot)throw new Error(`Unknown roof watcher part: ${kind}`);
  const{stone,recess}=finishes({materials,carvedStone,recessStone});
  const c=Math.cos(at.yaw),s=Math.sin(at.yaw);
  const p=([x,y,z])=>{
    x-=pivot[0];y-=pivot[1];z-=pivot[2];
    return[at.x+x*c-z*s,at.y+y,at.z+x*s+z*c];
  };
  const box=(centre,size,mat=stone)=>addBox(m,p(centre),size,mat,at.yaw);
  const beam=(a,b,w,mat=stone)=>addBeam(m,p(a),p(b),w,mat);
  const ell=(centre,r,mat=stone,lat=8,lon=12)=>addEllipsoid(m,p(centre),
    Math.abs(s)>.5?[r[2],r[1],r[0]]:r,mat,lat,lon);
  const face=(a,b,c,d,mat=stone)=>{
    addQuad(m,p(a),p(b),p(c),p(d),mat);addQuad(m,p(d),p(c),p(b),p(a),mat);
  };
  const eye=(x,y,z,slant=0)=>{
    ell([x,y,z],[.046,.034,.030],recess,6,8);
    beam([x-.070,y+.046,z-.008],[x+.070,y+.046+slant,z-.008],.055);
  };

  if(kind==='hound'){
    ell([0,.93,.12],[.205,.205,.18]);
    box([0,.79,.34],[.34,.12,.28]);
    box([0,.59,.33],[.34*.80,.08,.28]);
    for(const x of[-.34*.42,.34*.42])beam([x,.64,.17],[x,.76,.21],.070);
    box([0,.698,.184],[.34*.60,.10,.025],recess);
    for(const sign of[-1,1]){
      face([sign*.15,1.08,.06],[sign*.28,1.03,.07],
        [sign*.26,.65,.14],[sign*.18,.72,.20]);
      beam([sign*.22,1.00,.11],[sign*.235,.73,.15],.075);
    }
    eye(-.10,.96,.275,-.020);eye(.10,.96,.275,.020);
    box([0,.842,.465],[.16,.075,.035],recess);
  }else if(kind==='owl'){
    ell([0,.88,.025],[.31,.275,.235]);
    for(const sign of[-1,1]){
      ell([sign*.135,.91,.217],[.132,.153,.055]);
      ell([sign*.135,.925,.267],[.063,.064,.018],recess,6,8);
      beam([sign*.03,1.025,.247],[sign*.25,1.065,.19],.075);
    }
    face([-.08,.92,.262],[.08,.92,.262],[.035,.755,.325],[-.035,.755,.325]);
  }else{
    // Whole foliate relief: its fixed stone boss stays on the keystone while
    // this shallow, projecting carving can turn by a few unsettling degrees.
    ell([0,0,.035],[.22,.27,.10],stone,6,8);
    for(const sign of[-1,1]){
      box([sign*.105,.035,.142],[.080,.055,.023],recess);
      beam([sign*.025,.105,.158],[sign*.185,.155,.10],.065);
      for(const[root,tip,edge]of[
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

export function buildRoofWatchersGeometry({mesh,materials,carvedStone,recessStone,
  addBox,addBeam,addEllipsoid,addCylinder,addQuad}){
  const{stone,recess}=finishes({materials,carvedStone,recessStone});
  for(const watcher of ROOF_WATCHERS)buildRoofWatcherPart({m:mesh(watcher.mesh),
    materials,kind:watcher.kind,carvedStone:stone,recessStone:recess,
    addBox,addBeam,addEllipsoid,addCylinder,addQuad});
  return{recessStone:recess,meshes:ROOF_WATCHERS.map(w=>w.mesh)};
}
