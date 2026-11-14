import { HOME_VALLEY_TREES, HOME_MOUNTAIN_GRADES, homeMountainRise } from '../data/childhood-valley-trail.js';
import { HOME_VALLEY_GRADES, homeValleyRise } from '../data/childhood-valley.js';
import { HOME_APPROACH_DRIFTS, HOME_PILED_SNOW, HOME_LANE_SNOWBANKS, HOME_LANE_BANK_SECTION,
  homeApproachRise } from '../data/childhood-grounds.js';

const scalar = (value) => {
  const literal = String(Math.round(value * 1e5) / 1e5);
  return literal.includes('.') ? literal : `${literal}.0`;
};
const ground = (x, z) => homeApproachRise(x, z) + homeValleyRise(x, z) + homeMountainRise(x, z);
const gradeKernels = [...HOME_APPROACH_DRIFTS, ...HOME_PILED_SNOW, ...HOME_VALLEY_GRADES, ...HOME_MOUNTAIN_GRADES];

function shape(tree) {
  const phase = 2 * Math.PI * ((tree.seed * 1.61803398875) % 1);
  const alpine = Math.min(1, Math.max(0, (tree.z - 94) / 49));
  // Lower pasture spruce keeps a broader skirt. Exposed trees up the same
  // hillside vary towards narrow, drooping crowns and shorter outer growth.
  const form = Math.min(1, .68 * tree.seed + .40 * alpine);
  const spread = Math.max(tree.radius * 3, tree.height * (.255 - .104 * form));
  const edge = spread * 1.47 + .049 * tree.height + .21;
  // Collision owns the trunk. Keep all foliage over the snow and the player's
  // head even uphill. The gradient bound covers between the authoring samples.
  let crest = tree.y;
  const sampleSize = .10, samples = Math.ceil(edge / sampleSize);
  for (let i = -samples; i <= samples; i++) for (let j = -samples; j <= samples; j++) {
    if (Math.hypot(i, j) * sampleSize <= edge + sampleSize * .71)
      crest = Math.max(crest, ground(tree.x + i * sampleSize, tree.z + j * sampleSize));
  }
  const bound = gradeKernels.filter(({x,z,rx,rz})=>Math.abs(tree.x-x)<rx+edge+.1&&Math.abs(tree.z-z)<rz+edge+.1)
    .reduce((sum, { rx, rz, rise }) => sum + 8 / (3 * Math.sqrt(3)) * Math.abs(rise) / Math.min(rx, rz), 0);
  // Banks occupy only the main lane, far outside all of these stands.
  const { cut, apron } = HOME_LANE_BANK_SECTION;
  const bankGrade = Math.abs(tree.x) < 3.65 + edge && HOME_LANE_SNOWBANKS.some(({ start,end }) =>
    tree.z + edge > start && tree.z - edge < end) ? .44 * (2 / Math.min(cut,apron) + .4) : 0;
  const gradeClearance = crest - tree.y + (bound + bankGrade) * sampleSize * .71 + 2.06;
  const firstBough = Math.max(gradeClearance + .44, tree.height * (.265 + .097 * form + .036 * Math.sin(phase)));
  return {
    ...tree, firstBough, spread, phase, form,
    lo: [tree.x - edge, tree.y - .92, tree.z - edge],
    hi: [tree.x + edge, tree.y + tree.height + .13, tree.z + edge],
  };
}

function spatialBounds(trees) {
  const lo = [0, 1, 2].map((axis) => Math.min(...trees.map((tree) => tree.lo[axis])));
  const hi = [0, 1, 2].map((axis) => Math.max(...trees.map((tree) => tree.hi[axis])));
  return {
    centre: lo.map((value, axis) => (value + hi[axis]) * .5),
    half: lo.map((value, axis) => (hi[axis] - value) * .5 + .012),
  };
}

function forestBranch(trees) {
  const bounds = spatialBounds(trees);
  if (trees.length <= 4) return { ...bounds, trees };
  const { half } = bounds;
  const axis = half[0] >= half[2] ? 'x' : 'z';
  const ordered = [...trees].sort((a, b) => a[axis] - b[axis]);
  const midpoint = Math.floor(ordered.length * .5);
  return { ...bounds, children: [forestBranch(ordered.slice(0, midpoint)), forestBranch(ordered.slice(midpoint))] };
}

const trees = HOME_VALLEY_TREES.map(shape);
const treeOrder = [], treeNodes = [];
function packBranch(branch) {
  const index=treeNodes.length;
  const node={...branch,first:0,count:0,next:0};
  treeNodes.push(node);
  if(branch.trees){
    node.first=treeOrder.length;
    node.count=branch.trees.length;
    treeOrder.push(...branch.trees);
  }else branch.children.forEach(packBranch);
  node.next=treeNodes.length;
}
if(trees.length)packBranch(forestBranch(trees));

export const CHILDHOOD_VALLEY_FOREST_GLSL = `
float ewHomeForestBound(vec3 p,vec3 halfSize){
  vec3 delta=abs(p)-halfSize;
  // Expanded boxes already contain crown lean and needle flex. Into empty
  // gaps, their geometric face distance is a conservative stride by itself.
  return .89*max(max(delta.x,delta.y),delta.z);
}

// Flattened sprays grow along each twig. Their width rises away from
// the wood joint, then narrows towards the youngest pair of shoots.
float ewFirSpray(float across,float over,float lateral,float droop){
  return (length(vec2(across/lateral,over/droop))-1.0)*min(lateral,droop);
}

void ewFirBough(vec3 p,vec2 axis,float lift,float width,float spacing,float variation,
  float second,float form,float tier,float gust,float shootDetail,inout float d,inout float material){
  vec2 across=vec2(-axis.y,axis.x);
  vec2 q=vec2(dot(p.xz,axis),dot(p.xz,across));
  float reach=width*mix(.68,1.22,variation);
  // In a crowded crown the next tier sometimes shades a branch out.
  // The scar remains attached to the stem and does not repeat as a gap.
  bool retired=variation<.106&&tier<4.0;
  if(retired)reach*=.37+second*.25;
  float broad=.45*max(max(-q.x-width*.052,q.x-reach),
    max(abs(q.y)-width*.55,max(lift-p.y-spacing*.72-width*.32,p.y-lift-spacing*.37-width*.27)));
  if(broad>=max(d,0.0))return;
  if(broad>.12){d=min(d,broad);return;}
  float end=clamp(q.x/reach,0.0,1.0);
  float lee=smoothstep(-.45,.62,dot(axis,homeWind));
  float load=smoothstep(.29,.74,.61*second+.29*lee+.11*(1.0-form));
  // A loaded bough bends down and keeps most of its mass close to its
  // main stem. New high branches aim away from the hanging old skirt.
  float dip=spacing*mix(.66,.19,tier/6.0)+width*(.065*load+.055*form);
  float upturn=spacing*mix(.18,.42,second);
  float grade=-dip*end+upturn*end*end;
  float crook=width*(second-.5)*.24;
  float tip=end*end;
  float flex=gust*tip*mix(1.0,.45,load)*(.022+.036*width);
  float centre=lift+grade+flex*.35;
  float sweep=(crook+flex*dot(across,homeWind))*tip;
  vec2 radial=vec2(q.y-sweep,p.y-centre);
  float stemWidth=max(.006,width*(.052-.046*end));
  float trunkJoint=max(max(-q.x-width*.047,q.x-reach),
    length(radial)-stemWidth)*.62;
  if(trunkJoint<d){d=trunkJoint;material=66.0;}
  if(retired)return;

  // The primary branch holds a rough triangular fan. Leave the hinge
  // visibly woody with separate shoots descending along its sides.
  float fan=(1.0-end)*mix(1.0,1.52,end)*smoothstep(.06,.34,end);
  float rag=1.0-.19*(.5+.5*cos(end*31.0+variation*6.5))*(.38+.62*end);
  float lateral=max(.018,width*mix(.36,.305,shootDetail)*fan*rag);
  float depth=max(.023,(width*.163+spacing*.12)*fan);
  float limits=max(reach*.12-q.x,q.x-reach);
  float foliage=max(limits,ewFirSpray(radial.x,radial.y+depth*.48,lateral,depth));

  // Both secondary sprays emerge from wood and bow away at different,
  // discernible angles. They overlap at the hinge, then open daylight
  // between the ends. These resolve as branch masses at ordinary view.
  if(shootDetail>0.0)for(int i=0;i<2;i++){
    float side=i==0?-1.0:1.0;
    float setting=i==0?second:variation;
    float joint=mix(.24,.46,setting);
    float shootSpan=mix(.36,.56,1.0-setting);
    float along=max(joint*reach-q.x,q.x-(joint+shootSpan)*reach);
    if(along*.47>=max(d,.005))continue;
    float u=clamp((end-joint)/shootSpan,0.0,1.0);
    float profile=(.70+.65*u)*(1.0-.89*u);
    float offset=side*width*mix(.17,.39,setting)*u;
    float pendant=width*(.035+.140*form+.105*load)*u;
    float sideWidth=max(.014,width*mix(.093,.14,setting)*profile);
    float sideDepth=max(.020,(width*.14+spacing*.067)*profile);
    float spray=ewFirSpray(radial.x-offset,radial.y+pendant+sideDepth*.47,sideWidth,sideDepth);
    float detailBias=(1.0-shootDetail)*width*.14;
    float fork=max(along,spray)+detailBias;
    foliage=min(foliage,fork);
    float twig=max(max((joint-.058)*reach-q.x,q.x-(joint+shootSpan*.85)*reach),
      length(vec2(radial.x-offset,radial.y+pendant))-(.011+stemWidth*.55)*(1.0-.76*u))*.59;
    twig+=detailBias;
    if(twig<d){d=twig;material=66.0;}
  }
  foliage*=.47;
  if(foliage<d){d=foliage;material=65.0;}

  // Keep cap and bough in the same posed frame. Snow builds over the
  // broad needle bed, with gaps in exposed tips and short shed sections.
  if(load<.045||end>.94)return;
  float snowStart=mix(.32,.19,load)+.07*variation;
  float snowEnd=mix(.62,.88,load)-.054*second;
  float snowEdge=max(reach*snowStart-q.x,q.x-reach*snowEnd);
  if(snowEdge*.43>max(d,0.0))return;
  float capWidth=lateral*mix(.59,.91,load);
  float thickness=max(.014,depth*mix(.29,1.03,load));
  float crest=depth*.33+thickness*.23;
  float scallop=.76+.24*cos(end*(14.0+8.0*second)+variation*12.0);
  float cap=ewFirSpray(radial.x-width*.036*(second-.5),radial.y-crest,capWidth*scallop,thickness);
  float snow=max(snowEdge,cap)*.43;
  if(load>.57){
    float offset=width*mix(-.12,.14,second);
    float rollWidth=max(.014,capWidth*.62);
    float rollDepth=max(.014,thickness*.67);
    float pocket=max(max(reach*.30-q.x,q.x-reach*.61),
      ewFirSpray(radial.x-offset,radial.y-crest*.53,rollWidth,rollDepth))*.43;
    snow=min(snow,pocket);
  }
  if(snow<d){d=snow;material=67.0;}
}

void ewHomeConifer(vec3 p,float height,float radius,float firstBough,float spread,
  float phase,float form,float weatherTime,float shootDetail,inout float d,inout float material){
  // Low trunk and root flare stay upright through the collision ownership.
  // The leader leans first; individual fans bend later in the same gust.
  float lowestSpray=firstBough-.40;
  if(p.y<lowestSpray-.14){
    float trunkWidth=radius*(1.0-.94*smoothstep(.2,height,p.y)+.24*(1.0-smoothstep(-.03,.42,p.y)));
    float wood=max(length(p.xz)-trunkWidth,-.92-p.y)*.76;
    if(wood<d){d=wood;material=66.0;}
    float toCrown=max(lowestSpray-p.y,length(p.xz)-spread*1.45-.049*height-.21);
    d=min(d,toCrown*.84);
    return;
  }
  float high=smoothstep(firstBough,height,p.y);
  float time=weatherTime*(1.0-uCalm);
  float flowPhase=time*.69+phase*.42;
  float gust=(sin(flowPhase)+.23*sin(time*1.39+phase*1.27))*(1.0-uCalm);
  vec2 restLean=.046*height*vec2(cos(phase),sin(phase));
  vec2 drive=homeWind*gust*(.083+.019*height);
  vec2 lean=high*(restLean+drive*high);
  vec2 canopy=p.xz-lean;
  float r=length(canopy);
  float trunkWidth=radius*(1.0-.94*smoothstep(.2,height,p.y)+.24*(1.0-smoothstep(-.03,.42,p.y)));
  float wood=max(r-trunkWidth,p.y-height)*.76;
  if(wood<d){d=wood;material=66.0;}

  float reach=spread*1.45;
  float crownBound=.47*max(max(r-reach,lowestSpray-p.y),p.y-height-.06);
  if(crownBound>max(d,0.0))return;
  if(crownBound>.14){d=min(d,crownBound);return;}
  // Preserve a slender irregular top so distant crowns remain continuous.
  float leaderBase=mix(firstBough,height,.63);
  float terminal=smoothstep(leaderBase,height,p.y);
  float leaderWidth=spread*mix(.157,.012,terminal);
  float leader=.53*max(r-leaderWidth,max(leaderBase-p.y,p.y-height-.025));
  if(leader<d){d=leader;material=65.0;}

  float az=r>.0001?atan(canopy.y,canopy.x):0.0;
  float spacing=(height-firstBough)/6.68;
  float row=clamp(floor((p.y-firstBough)/spacing),0.0,6.0);
  for(int adjacent=-1;adjacent<=1;adjacent++){
    float tier=row+float(adjacent);
    if(tier<0.0||tier>6.0)continue;
    float lower=firstBough+tier*spacing;
    float u=tier/6.0;
    float skirt=(1.0-u*.93)*(1.0+(1.0-form)*.30*u);
    float irregular=1.0+.104*sin(tier*2.64+phase)+.071*cos(tier*1.47+phase*2.1);
    float width=spread*skirt*irregular*mix(1.0,.78,smoothstep(4.0,6.0,tier));
    float vertical=max(lower-.41-p.y,p.y-(lower+spacing*1.24+.09));
    float tierBound=.43*max(r-width*1.32,vertical);
    if(tierBound>max(d,0.0))continue;
    if(tierBound>.105){d=min(d,tierBound);continue;}
    float fanCount=tier>4.0||fract(phase*.777+tier*.414)>.49?5.0:6.0;
    float step=6.283185307/fanCount;
    float rotation=phase+tier*.685+sin(phase*.7+tier*1.66)*.29;
    float sector=floor((az-rotation)/step);
    for(int neighbour=0;neighbour<=1;neighbour++){
      float slot=sector+float(neighbour);
      float side=mod(slot,fanCount);
      float first=fract((side+.3)*.713+tier*.379+phase*.42);
      float second=fract((side+.7)*.587+tier*.737+phase*.879);
      float direction=rotation+slot*step+(second-.5)*.16;
      // Lift the hinge just enough to keep pendant shoots over the lowest
      // branch level. Their side-to-side weight remains distinct.
      float lift=max(lower+.13+width*.14,
        lower+spacing*(.52+.33*first+.13*sin(tier*2.04+phase)));
      vec3 local=vec3(canopy.x,p.y,canopy.y);
      ewFirBough(local,vec2(cos(direction),sin(direction)),lift,width,spacing,first,
        second,form,tier,gust+.29*sin(flowPhase-1.05+side*.23)*(1.0-uCalm),shootDetail,d,material);
    }
  }
  // The nearest unseen tier and neighboring fan constrain the next step.
  float omitted=1e5;
  if(row>=2.0)omitted=min(omitted,p.y-(firstBough+(row-.76)*spacing));
  if(row<=3.0)omitted=min(omitted,firstBough+(row+1.70)*spacing-p.y);
  if(r>spread*.39)omitted=min(omitted,r*.47-spread*.11);
  d=min(d,.43*max(r-reach,omitted));
}

${treeOrder.length ? `
const mat3 ewHomeTreeData[${trees.length}]=mat3[${trees.length}](
  ${treeOrder.map(({x,y,z,height,radius,firstBough,spread,phase,form}) =>
    `mat3(${[x,y,z,height,radius,firstBough,spread,phase,form].map(scalar).join(',')})`).join(',\n  ')}
);

const mat3 ewHomeTreeNodes[${treeNodes.length}]=mat3[${treeNodes.length}](
  ${treeNodes.map(({centre,half,next,first,count})=>`mat3(${[...centre,...half,next,first,count].map(scalar).join(',')})`).join(',\n  ')}
);

void ewHomeForestGroup(vec3 p,int first,int count,float weatherTime,float shootDetail,inout float d,inout float material){
  for(int i=0;i<count;i++){
    mat3 tree=ewHomeTreeData[first+i];
    vec3 q=p-tree[0],size=tree[1],crown=tree[2];
    float height=size.x,edge=crown.x*1.47+.049*height+.21;
    float bound=ewHomeForestBound(q-vec3(0.0,(height-.79)*.5,0.0),vec3(edge,(height+1.05)*.5,edge));
    if(bound>1.65)d=min(d,bound);
    else if(bound<max(d,0.0)){
      ewHomeConifer(q,height,size.y,size.z,crown.x,crown.y,crown.z,weatherTime,shootDetail,d,material);
    }
  }
}` : ''}

float ewHomeForest(vec3 p,float limit,out float material,float weatherTime,float viewDistance){
  float d=limit;
  material=65.0;
  // At village distance the dither cannot resolve every secondary twig.
  // Taper them into the main spray while keeping branch and snow profiles.
  float shootDetail=1.0-smoothstep(14.0,26.0,viewDistance);
${treeNodes.length ? `
  int index=0;
  for(int visit=0;visit<${treeNodes.length};visit++){
    if(index>=${treeNodes.length})break;
    mat3 node=ewHomeTreeNodes[index];
    float bound=ewHomeForestBound(p-node[0],node[1]);
    if(bound>2.4){d=min(d,bound);index=int(node[2].x);continue;}
    if(bound>=max(d,0.0)){index=int(node[2].x);continue;}
    int count=int(node[2].z);
    if(count>0)ewHomeForestGroup(p,int(node[2].y),count,weatherTime,shootDetail,d,material);
    index++;
  }` : ''}
  return d;
}

vec3 ewHomeForestAlbedo(vec3 p,vec3 n,float m){
  if(m>65.5&&m<66.5){
    float seam=ewNoise(vec2(p.x*6.9+p.z*10.2,p.y*.88));
    float mottling=ewNoise(vec2(p.x*2.3+p.z*1.9,p.y*2.6));
    return mix(vec3(.128,.142,.134),vec3(.255,.251,.211),seam*.67+mottling*.33);
  }
  float grain=ewNoise(p.xz*2.1+vec2(p.y*.8,-p.y*.53));
  float cover=m>66.5?mix(.69,1.0,smoothstep(.01,.66,n.y+(grain-.50)*.26)):
    smoothstep(.59,.91,n.y+(grain-.50)*.20)*.29;
  vec3 needles=mix(vec3(.090,.157,.143),vec3(.161,.252,.213),grain);
  vec3 snow=mix(vec3(.51,.60,.64),vec3(.75,.80,.80),grain);
  return mix(needles,snow,cover);
}
`;
