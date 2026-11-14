// The skyline uses three nested, world-space strips. The authored heights
// are metre offsets around each range, clockwise from north, five degrees
// apart. Long shoulders, deep cols and isolated needles share their vertices
// with the walls beneath them.
const crests = [
  [
    48,55,60, 66,62,78, 97,92,105, 126,111,117,
    97,82,88, 69,58,71, 68,76,87, 103,110,97,
    115,103,91, 72,77,68, 57,54,50, 43,56,49,
    38,49,56, 68,59,74, 83,99,86, 71,82,89,
    100,113,94, 122,126,105, 145,137,119, 125,99,106,
    89,80,90, 118,108,98, 91,83,69, 63,59,48,
  ],
  [
    107,124,119, 135,142,128, 112,126,142, 129,118,133,
    149,136,157, 170,187,166, 206,192,175, 165,144,148,
    151,163,136, 118,131,113, 101,109,117, 141,125,132,
    148,154,137, 162,150,123, 119,109,125, 143,137,154,
    171,157,181, 194,163,187, 173,198,213, 201,223,198,
    192,183,171, 158,167,154, 142,133,157, 139,121,117,
  ],
  [
    259,267,278, 295,274,281, 306,319,298, 345,323,299,
    312,274,268, 253,263,245, 238,213,234, 256,247,280,
    299,318,296, 334,355,312, 294,306,282, 267,251,274,
    246,260,239, 230,209,228, 243,239,256, 272,299,280,
    310,295,288, 277,259,276, 254,229,241, 268,256,285,
    301,322,310, 335,369,351, 342,320,332, 306,283,267,
  ],
];
const count = crests[0].length * 2;
const number = value => Number(value).toFixed(5);
const literal = (type, values) => `${type}(${values.map(number).join(',')})`;
const spokes = Array.from({ length: count }, (_, index) => {
  const angle = index * 2 * Math.PI / count;
  return literal('vec2', [Math.sin(angle), Math.cos(angle)]);
});
const profile = crests.map((heights, range) => Array.from({ length: count }, (_, index) => {
  const across = index * 2 * Math.PI / count;
  const roughness = Math.sin(across * 43 + range * 3.1) * Math.sin(across * 73 - range);
  const at = offset => heights[(Math.floor(index / 2) + heights.length + offset) % heights.length];
  const spur = index % 2 === 0;
  const height = spur ? at(0) : (at(0) + at(1)) * .5 + roughness * (3.4 + range * .7);
  // The incisions run all the way off the crest. Their ends retreat into the
  // face, and the neighbouring ribs project forward from the same strip.
  const cut = Math.max(0, Math.min(1, spur
    ? ((at(-1) + at(1)) * .5 - height + 3) / 24
    : ((at(0) + at(1)) * .5 - height + 1.4) / 10));
  const bend = .5 + .5 * Math.sin(across * 5 + range * 1.4);
  const shoulderRadius = .816 + bend * .066 + cut * .095 + roughness * .012;
  const shoulderHeight = height * (.56 + bend * .11 - cut * .17 + roughness * .033);
  const toeRadius = .651 + .028 * Math.sin(across * 3 + range) + .026 * cut;
  return literal('vec4', [height, shoulderRadius, shoulderHeight, toeRadius]);
}));

export const CHILDHOOD_VALLEY_MOUNTAINS_GLSL = `
const int ewRidgeCount=${count};
const float ewRidgeSectors=${number(count / (2 * Math.PI))};
const vec2 ewRidgeSpokes[${count}]=vec2[${count}](
  ${spokes.join(',\n  ')}
);
const vec4 ewRidgeProfiles[${count * crests.length}]=vec4[${count * crests.length}](
  ${profile.flat().join(',\n  ')}
);

struct EwHomeRidgeHit {
  float distanceM;
  vec3 normal;
  vec2 slope;
};

float ewRidgeOuterCross(vec2 origin,vec2 ray,float radius,float a){
  float b=dot(origin,ray),c=dot(origin,origin)-radius*radius;
  float discriminant=b*b-a*c;
  return discriminant<0.0?0.0:max(0.0,(sqrt(discriminant)-b)/a);
}

vec3 ewRidgeVertex(vec2 radial,vec2 footOffset,float radius,float height){
  vec2 plan=radial*radius+footOffset;
  return vec3(plan.x,height,plan.y);
}

void ewRidgeTriangle(vec3 ro,vec3 rd,vec3 a,vec3 b,vec3 c,vec2 ca,vec2 cb,vec2 cc,
  inout EwHomeRidgeHit nearest){
  vec3 first=b-a,second=c-a;
  vec3 face=cross(first,second);
  float facing=dot(rd,face);
  if(abs(facing)<.0001)return;
  vec3 fromA=ro-a;
  float depth=-dot(fromA,face)/facing;
  if(depth<=.01||depth>=nearest.distanceM)return;
  vec3 area=cross(rd,fromA);
  vec2 inside=vec2(dot(area,second),-dot(area,first))/facing;
  if(min(inside.x,inside.y)<-.0001||inside.x+inside.y>1.0001)return;
  nearest.distanceM=depth;
  nearest.normal=normalize(face)*sign(face.y);
  nearest.slope=ca+(cb-ca)*inside.x+(cc-ca)*inside.y;
}

EwHomeRidgeHit ewHomeRidge(vec3 ro,vec3 rd,vec2 centre,vec2 radius,int range){
  EwHomeRidgeHit hit=EwHomeRidgeHit(1e4,vec3(0.0,1.0,0.0),vec2(0.0));
  vec2 o=(ro.xz-centre)/radius,ray=rd.xz/radius;
  float a=dot(ray,ray);
  if(a<1e-10)return hit;
  float crestT=ewRidgeOuterCross(o,ray,1.004,a);
  if(crestT<=0.0)return hit;
  float footT=ewRidgeOuterCross(o,ray,.615,a);
  // Limit intersection work to the sectors actually crossed between the
  // inner foot envelope and the outer crest, including the edge neighbours.
  vec2 crest=o+ray*crestT,foot=o+ray*footT;
  float bearing=atan(crest.x,crest.y);
  float firstBearing=dot(foot,foot)>.0001?atan(foot.x,foot.y):bearing;
  float turn=atan(sin(firstBearing-bearing),cos(firstBearing-bearing));
  float atCrest=bearing*ewRidgeSectors;
  float atFoot=atCrest+turn*ewRidgeSectors;
  int start=int(floor(min(atCrest,atFoot)))-1;
  int end=int(floor(max(atCrest,atFoot)))+1;
  vec3 origin=ro-vec3(centre.x,0.0,centre.y);
  for(int i=0;i<32;i++){
    int sector=start+i;
    if(sector>end)break;
    int index=(sector+ewRidgeCount)%ewRidgeCount,next=(index+1)%ewRidgeCount;
    vec4 left=ewRidgeProfiles[range*ewRidgeCount+index],right=ewRidgeProfiles[range*ewRidgeCount+next];
    if(min(ro.y+rd.y*footT,ro.y+rd.y*crestT)>max(left.x,right.x)+.1)continue;
    vec2 aPlan=ewRidgeSpokes[index]*radius,bPlan=ewRidgeSpokes[next]*radius;
    vec3 aFoot=ewRidgeVertex(aPlan,vec2(0.0),left.w,-9.0);
    vec3 bFoot=ewRidgeVertex(bPlan,vec2(0.0),right.w,-9.0);
    vec3 aLedge=ewRidgeVertex(aPlan,homeWind*max(0.0,1.1-left.y)*10.0,left.y,left.z);
    vec3 bLedge=ewRidgeVertex(bPlan,homeWind*max(0.0,1.1-right.y)*10.0,right.y,right.z);
    vec3 aTop=ewRidgeVertex(aPlan,vec2(0.0),1.0,left.x);
    vec3 bTop=ewRidgeVertex(bPlan,vec2(0.0),1.0,right.x);
    float aCut=smoothstep(.882,.974,left.y),bCut=smoothstep(.882,.974,right.y);
    vec3 aScree=mix(aFoot,aLedge,.40),bScree=mix(bFoot,bLedge,.40);
    vec3 aHead=mix(aLedge,aTop,.63),bHead=mix(bLedge,bTop,.63);
    // Erosion flares the talus runout and puts a step below the headwall.
    // Offsets are vertex-local so adjacent sectors still meet exactly.
    aScree.xz-=aPlan*(.018+.036*aCut);bScree.xz-=bPlan*(.018+.036*bCut);
    aHead.xz-=aPlan*.020*(1.0-aCut);bHead.xz-=bPlan*.020*(1.0-bCut);
    vec2 af=vec2(aCut*.64,0.0),bf=vec2(bCut*.64,0.0);
    vec2 as=vec2(aCut*.83,.22),bs=vec2(bCut*.83,.22);
    vec2 al=vec2(aCut,.55),bl=vec2(bCut,.55);
    vec2 ah=vec2(aCut*.95,.83),bh=vec2(bCut*.95,.83);
    vec2 ac=vec2(aCut*.82,1.0),bc=vec2(bCut*.82,1.0);
    ewRidgeTriangle(origin,rd,aFoot,bFoot,bScree,af,bf,bs,hit);
    ewRidgeTriangle(origin,rd,aFoot,bScree,aScree,af,bs,as,hit);
    ewRidgeTriangle(origin,rd,aScree,bScree,aLedge,as,bs,al,hit);
    ewRidgeTriangle(origin,rd,bScree,bLedge,aLedge,bs,bl,al,hit);
    ewRidgeTriangle(origin,rd,aLedge,bLedge,bHead,al,bl,bh,hit);
    ewRidgeTriangle(origin,rd,aLedge,bHead,aHead,al,bh,ah,hit);
    ewRidgeTriangle(origin,rd,aHead,bHead,aTop,ah,bh,ac,hit);
    ewRidgeTriangle(origin,rd,bHead,bTop,aTop,bh,bc,ac,hit);
  }
  return hit;
}

vec3 ewHomeRidgeStone(EwHomeRidgeHit hit,vec3 ro,vec3 rd,vec3 sky,int range,float weather){
  vec3 point=ro+rd*hit.distanceM;
  vec3 normal=hit.normal;
  vec2 plane=point.xz+vec2(point.y*.32,-point.y*.19);
  float broad=ewNoise(plane*.031);
  float joint=ewNoise(plane*vec2(.091,.048)+vec2(8.3,-4.1));
  float cold=smoothstep(11.0,78.0,point.y);
  float downwind=dot(normal.xz,homeWind);
  float scoured=smoothstep(.16,.77,-downwind);
  float shelf=smoothstep(.52,.90,normal.y);
  float bowl=hit.slope.x;
  float upper=smoothstep(.66,.97,hit.slope.y);
  // The same incision that recedes into the wall stores its snow. Broad
  // benches can keep soft snow below steep exposed rock on either flank.
  float catchment=bowl*.97+shelf*.37+(broad-.5)*.35+(joint-.5)*.21
    +cold*.15+max(0.0,downwind)*.17-scoured*.22-upper*(.19-.13*bowl);
  float driftEdge=smoothstep(.32,.70,broad+.24*joint);
  float snow=smoothstep(.36+.09*driftEdge,.56+.09*driftEdge,catchment);
  float dip=point.y+point.x*.29-point.z*.18+broad*10.0;
  float bedding=ewNoise(vec2(dip*.117,dot(point.xz,vec2(-.07,.021))))
    *(1.0-smoothstep(.22,.75,normal.y))*(1.0-smoothstep(230.0,635.0,hit.distanceM));
  float fractures=smoothstep(.33,.77,ewNoise(vec2(plane.x*.080+plane.y*.062,.031*point.y)));
  float sun=max(0.0,dot(normal,normalize(homeCloudLight)));
  float coolFace=.73+.24*sun;
  vec3 granite=mix(vec3(.206,.226,.241),vec3(.416,.403,.376),broad*.43+joint*.25+fractures*.32);
  granite*=1.0-.23*bedding;
  vec3 powder=mix(vec3(.535,.586,.623),vec3(.699,.736,.764),.61*broad+.39*sun);
  vec3 stone=mix(granite*coolFace,powder*(.85+.17*sun),snow);
  float basin=exp(-max(0.0,point.y)*.042);
  float air=hit.distanceM*(.00052+.00049*float(range)+weather*.00125)
    +basin*(.59+weather*.43);
  vec3 scattered=mix(vec3(.646,.684,.713),sky,.37);
  return mix(stone,scattered,1.0-exp(-air));
}

vec3 ewHomeMountainHorizon(vec3 ro,vec3 rd,vec3 sky,float weather,out float surfaceDepth){
  surfaceDepth=460.0;
  EwHomeRidgeHit hit=ewHomeRidge(ro,rd,vec2(2.0,49.0),vec2(189.0,222.0),0);
  int range=0;
  if(hit.distanceM>=1e4){
    range=1;
    hit=ewHomeRidge(ro,rd,vec2(-22.0,22.0),vec2(308.0,368.0),1);
  }
  if(hit.distanceM>=1e4){
    range=2;
    hit=ewHomeRidge(ro,rd,vec2(35.0,59.0),vec2(590.0,680.0),2);
  }
  if(hit.distanceM>=1e4)return sky;
  surfaceDepth=hit.distanceM;
  return ewHomeRidgeStone(hit,ro,rd,sky,range,weather);
}
`;
