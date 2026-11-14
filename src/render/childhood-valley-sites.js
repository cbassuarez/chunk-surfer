// A site's bounds limit work during every ray step, while the actual pieces
// supply its silhouette, material and depth. The same metric boxes can stop
// the player in the realm without a second placement table.
import { HOME_VALLEY_SITES } from '../data/childhood-valley.js';
import { HOME_VALLEY_LIFE_SITES } from '../data/childhood-valley-life.js';
import { HOME_MOUNTAIN_SITES } from '../data/childhood-valley-trail.js';
import { HOME_COMMONS_DRAINAGE } from '../data/childhood-valley-works.js';
import { HOME_VALLEY_SIGN_GROUPS, HOME_VALLEY_SIGN_PRINTS } from '../data/childhood-valley-signs.js';

const axes = ['x', 'y', 'z'];
const glf = (value) => {
  const rounded = Number(value.toFixed(6));
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
};
const vec = (values) => `vec3(${values.map(glf).join(',')})`;
const box = (piece) => ({
  center: axes.map((axis) => (piece[`${axis}0`] + piece[`${axis}1`]) / 2),
  half: axes.map((axis) => (piece[`${axis}1`] - piece[`${axis}0`]) / 2),
});

function siteBox(pieces) {
  const bounds = {};
  for (const axis of axes) {
    bounds[`${axis}0`] = Math.min(...pieces.map((piece) => piece[`${axis}0`])) - .005;
    bounds[`${axis}1`] = Math.max(...pieces.map((piece) => piece[`${axis}1`])) + .005;
  }
  return box(bounds);
}

// Render-only snow can rise above the authored bounds of these pieces.
const snowHeadroom = { roof:.37, 'shelter-roof':.37, 'field-wall':.09, 'lean-roof-snow':.14 };

const sites=[...HOME_VALLEY_SITES,...HOME_VALLEY_LIFE_SITES,...HOME_MOUNTAIN_SITES,...HOME_VALLEY_SIGN_GROUPS]
  .filter(({pieces})=>pieces.length);
const shapeCodes={gable:1,roof:2,trough:3,'round-x':4,'round-y':5,cloth:6,
  'lean-roof':7,'printed-sign':8,architecture:9,'open-cup':10,'cup-handle':11,'round-z':12,rill:13,
  'shelter-roof':14,'shelter-rainwater':15,'field-wall':16,'lean-roof-snow':17};
const packedPieces=[];
const packedBuildings=[];
const packedSigns=[];
const packedPaper=[];
const signFaces={'+x':0,'-x':1,'+z':2,'-z':3};
const packedSites=sites.map(({pieces})=>{
  const visible=pieces.filter(piece=>piece.rendering!==false);
  const {center,half}=siteBox(visible);
  const first=packedPieces.length;
  for(const piece of visible){
    const {center,half}=box(piece);
    let buildingIndex=0;
    if(piece.building){
      const {x,z,width,depth,base,eave,ridge,footing,style,face}=piece.building;
      buildingIndex=packedBuildings.length;
      packedBuildings.push([[x,base,z],[width/2,depth/2,eave-base],[ridge-base,footing-base,style*2+(face>0?1:0)]]);
    }
    if(piece.shape==='printed-sign'){
      const printIndex=HOME_VALLEY_SIGN_PRINTS.findIndex(({id})=>id===piece.print);
      const returnPrintIndex=piece.returnPrint
        ? HOME_VALLEY_SIGN_PRINTS.findIndex(({id})=>id===piece.returnPrint) : printIndex;
      if(printIndex<0||returnPrintIndex<0||!Object.hasOwn(signFaces,piece.face))throw Error(`Missing print or face for ${piece.id}`);
      buildingIndex=packedSigns.length;
      packedSigns.push([center,half,[signFaces[piece.face],printIndex,returnPrintIndex]]);
      const {angle=0,side=0,curl=0,tear=0}=piece.paper||{};
      packedPaper.push([angle,side,curl,tear]);
    }
    const margin=piece.paper ? .01+Math.abs(piece.paper.angle)*Math.max(half[0],half[1],half[2])+piece.paper.curl : 0;
    packedPieces.push([center,half,[piece.material,shapeCodes[piece.shape]||0,buildingIndex+margin]]);
  }
  const margin=visible.some(piece=>piece.paper) ? .065 : 0;
  half[1]+=Math.max(0,...visible.map(piece=>snowHeadroom[piece.shape]||0));
  return [center,half.map(size=>size+margin),[first,visible.length,0]];
});
const matrix=(rows)=>`mat3(${rows.map(vec).join(',')})`;

const atlasWidth=1536,atlasHeight=Math.ceil(HOME_VALLEY_SIGN_PRINTS.length/3)*256;
const printRects=HOME_VALLEY_SIGN_PRINTS.map(({width,height},index)=>
  `vec4(${glf(index%3*512+4)},${glf(Math.floor(index/3)*256+4)},${glf(width)},${glf(height)})`);
const printPolarity=HOME_VALLEY_SIGN_PRINTS.map(({finish})=>finish==='light-paint'?'2.0':'1.0');

export const CHILDHOOD_VALLEY_SITES_GLSL = `
// The maximum axis distance is a conservative lower bound. Beyond the detailed
// evaluation range it is itself a safe ray advance, never a surface hit.
float hvBoxBound(vec3 p,vec3 b){
  vec3 q=abs(p)-b;
  return max(q.x,max(q.y,q.z));
}
void hvUnion(float piece,float tag,inout float nearest,inout float material){
  if(piece<nearest){nearest=piece;material=tag;}
}

// Ridge parallel to X. Use the normalized signed distance to both planes so a
// pitched roof cannot skip a surface at a glancing angle.
float hvGable(vec3 q,vec3 b){
  float slope=2.0*b.y/b.z;
  float upper=(q.y-b.y+slope*abs(q.z))*inversesqrt(1.0+slope*slope);
  return max(hvBoxBound(q,b),upper);
}
float hvTrough(vec3 q,vec3 b){
  vec2 rim=min(vec2(.10),b.xz*.26);
  float cavityDepth=min(.17,b.y*1.15);
  vec3 opening=vec3(b.x-rim.x,cavityDepth,b.z-rim.y);
  return max(ewBox(q,b),-ewBox(q-vec3(0.0,b.y,0.0),opening));
}
float hvRill(vec3 q,vec3 b){
  float grade=b.y-.092*(.5-.5*q.z/b.z);
  float top=grade-.018*(1.0-smoothstep(.083,.114,abs(q.x)));
  return max(hvBoxBound(q,b),q.y-top);
}
float hvRoundX(vec3 q,vec3 b){return max(abs(q.x)-b.x,(length(q.yz/b.yz)-1.0)*min(b.y,b.z));}
float hvRoundY(vec3 q,vec3 b){return max(abs(q.y)-b.y,(length(q.xz/b.xz)-1.0)*min(b.x,b.z));}
float hvOpenCup(vec3 q,vec3 b){
  float outer=hvRoundY(q,b);
  float inner=hvRoundY(q-vec3(0.0,.018,0.0),b-vec3(.009,0.0,.009));
  return max(outer,-inner);
}
float hvCupHandle(vec3 q,vec3 b){
  const float wire=.012;
  vec2 loop=b.xy-wire;
  float oval=(length(q.xy/loop)-1.0)*min(loop.x,loop.y);
  return max(hvBoxBound(q,b),length(vec2(oval,q.z))-wire);
}
float hvCloth(vec3 q,vec3 b){
  float sway=sin(q.x*19.0+q.y*4.1)*b.z*.64;
  float hem=-b.y+.017*(1.0+cos(q.x*13.0));
  return max(hvBoxBound(q,b),max((abs(q.z-sway)-b.z*.28)*.75,(hem-q.y)*.91));
}
float hvLeanRoof(vec3 q,vec3 b,bool snowCap,inout float material){
  float slope=max(.08,b.y/b.x);
  float plane=(q.y+slope*q.x-.022)*inversesqrt(1.0+slope*slope);
  float deck=max(hvBoxBound(q,b),abs(plane)-.072);
  if(!snowCap)return deck;
  float gust=ewNoise(vec2(q.x*.89,q.z*.97));
  float broken=ewNoise(q.xz*vec2(3.6,3.1));
  float lee=q.x*.61+q.z*.78;
  float outline=max(max(abs(q.x)-b.x+.13,abs(q.z)-b.z+.075),.08+.41*gust+.16*broken-lee);
  float depth=(.044+.095*gust)*smoothstep(0.0,.32,-outline);
  float snow=max(outline,max(plane-.078-depth,.049-plane))*.75;
  hvUnion(snow,57.0,deck,material);
  return deck;
}
// The raymarch records a sign's physical face. Its printed artwork is sampled
// once at the resolved surface, before snow light, weather and final dither.
uniform sampler2D uValleySignAtlas;
uniform float uValleySignReady;
uniform float uHomeOldvReturn;
const mat3 hvSignFaces[${packedSigns.length}]=mat3[${packedSigns.length}](${packedSigns.map(matrix).join(',')});
const vec4 hvPaperShape[${packedPaper.length}]=vec4[${packedPaper.length}](
  ${packedPaper.map(shape=>`vec4(${shape.map(glf).join(',')})`).join(',')}
);
const vec4 hvSignRects[${printRects.length}]=vec4[${printRects.length}](${printRects.join(',')});
const float hvSignPolarity[${printPolarity.length}]=float[${printPolarity.length}](${printPolarity.join(',')});
float hvSignDirection(vec3 q,float face){
  return face<.5?q.x:face<1.5?-q.x:face<2.5?q.z:-q.z;
}
// Local paper coordinates use x to the reader's right, y toward the floor,
// and z toward the reader. Print and silhouette use the same coordinates.
vec3 hvSignLocal(vec3 q,float face,float angle){
  vec3 local=vec3(face<.5?q.z:face<1.5?-q.z:face<2.5?-q.x:q.x,-q.y,hvSignDirection(q,face));
  if(angle!=0.0)local.xy=ewRot(local.xy,-angle);
  return local;
}
float hvPaperCurl(vec2 uv,vec4 shape){
  float across=clamp((uv.x*shape.y-.18)/.82,0.0,1.0);
  float down=clamp((uv.y-.14)/.86,0.0,1.0);
  return shape.z*across*across*down*down;
}
float hvPinnedPaper(vec3 q,vec3 b,float face,vec4 shape,out bool front){
  vec3 local=hvSignLocal(q,face,shape.x);
  vec2 halfSize=vec2(face<1.5?b.z:b.x,b.y);
  vec2 uv=local.xy/halfSize;
  local.z-=hvPaperCurl(uv,shape);
  float freeCorner=clamp((uv.x*shape.y-.54)/.46,0.0,1.0);
  float split=shape.w*halfSize.x*2.0*freeCorner*freeCorner*(.64+.36*sin(uv.x*29.0));
  float edge=max(abs(local.x)-halfSize.x,max(-local.y-halfSize.y,local.y-halfSize.y+split));
  float depth=face<1.5?b.x:b.z;
  front=local.z>0.0&&local.z-depth>=edge-.003;
  return max(edge,abs(local.z)-depth)*.78;
}
vec3 hvSignAlbedo(vec3 p,float tag,float distanceM,out vec2 surfacePrint){
  int signIndex=int(tag-100.0+.5);
  mat3 face=hvSignFaces[signIndex];
  vec3 q=p-face[0],b=face[1];
  float dir=face[2].x;
  vec4 paper=hvPaperShape[signIndex];
  vec2 local=hvSignLocal(q,dir,paper.x).xy/vec2(dir<1.5?b.z:b.x,b.y);
  int printIndex=int(uHomeOldvReturn>.5?face[2].z:face[2].y);
  vec4 rect=hvSignRects[printIndex];
  vec2 uv=(rect.xy+vec2(.5)+clamp(local*.5+.5,0.0,1.0)*(rect.zw-1.0))
    /vec2(${glf(atlasWidth)},${glf(atlasHeight*2)});
  float texelsPerMetre=rect.z/(2.0*(dir<1.5?b.z:b.x));
  float level=clamp(log2(max(1.0,distanceM*texelsPerMetre/480.0)),0.0,2.0);
  vec3 ink=uValleySignReady>.5?textureLod(uValleySignAtlas,uv,level).rgb:vec3(.60,.59,.56);
  float coverage=uValleySignReady>.5?textureLod(uValleySignAtlas,uv+vec2(0.0,.5),level).r:0.0;
  surfacePrint=uValleySignReady>.5?vec2(hvSignPolarity[printIndex],coverage):vec2(0.0);
  float exposure=smoothstep(.25,.78,ewNoise(p.xz*5.0+p.y*.31));
  // A turned corner loses the soft light reflected by the backing board.
  float curled=hvPaperCurl(local,paper);
  float liftShade=1.0-.17*smoothstep(.002,.028,curled);
  return ink*(.94+.08*exposure)*liftShade;
}

// Openings are cut into an otherwise closed envelope. Even from the lee, a
// glimpse along the jamb gives depth without opening a playable interior.
void hvWindow(vec3 q,vec2 size,bool vent,inout float d,inout float material){
  if(hvBoxBound(q-vec3(0.0,0.0,-.075),vec3(size+.18,.27))>max(d,0.0))return;
  d=max(d,-ewBox(q-vec3(0.0,0.0,-.074),vec3(size,.203)));
  float bead=min(
    ewBox(vec3(abs(q.x)-size.x+.031,q.y,q.z+.086),vec3(.036,size.y,.052)),
    ewBox(vec3(q.x,abs(q.y)-size.y+.035,q.z+.086),vec3(size.x,.039,.052)));
  float frame=vent?70.0:72.0;
  hvUnion(bead,frame,d,material);
  if(vent){
    float slat=abs(fract((q.y+.027)/.121)-.5)*.121-.021;
    float louvers=max(max(slat,abs(q.x)-size.x+.05),abs(q.z+.069)-.038);
    hvUnion(louvers,70.0,d,material);
  }else{
    float bar=ewBox(q+vec3(0.0,0.0,.098),vec3(.031,size.y-.040,.027));
    bar=min(bar,ewBox(q-vec3(0.0,size.y*.31,-.099),vec3(size.x-.036,.026,.025)));
    hvUnion(bar,72.0,d,material);
  }
  hvUnion(ewBox(q+vec3(0.0,0.0,.188),vec3(size-.027,.022)),53.0,d,material);
  hvUnion(ewBox(q-vec3(0.0,-size.y-.035,.013),vec3(size.x+.084,.052,.142)),71.0,d,material);
  hvUnion(ewBox(q-vec3(0.0,size.y+.043,.002),vec3(size.x+.106,.070,.065)),71.0,d,material);
}

void hvDoor(vec3 q,float halfWidth,bool utility,bool broad,inout float d,inout float material){
  float height=broad?1.13:1.04;
  if(hvBoxBound(q-vec3(0.0,0.0,-.08),vec3(halfWidth+.23,height+.15,.28))>max(d,0.0))return;
  d=max(d,-ewBox(q-vec3(0.0,0.0,-.089),vec3(halfWidth,height,.226)));
  vec3 leaf=q+vec3(0.0,0.0,.150);
  hvUnion(ewBox(leaf,vec3(halfWidth-.038,height-.037,.045)),utility?70.0:72.0,d,material);
  float jamb=ewBox(vec3(abs(q.x)-halfWidth+.035,q.y,q.z+.049),vec3(.068,height,.093));
  float head=ewBox(q-vec3(0.0,height+.040,-.028),vec3(halfWidth+.106,.071,.110));
  hvUnion(min(jamb,head),71.0,d,material);
  hvUnion(ewBox(q-vec3(0.0,-height-.033,.011),vec3(halfWidth+.122,.052,.176)),71.0,d,material);
  if(utility){
    float brace=min(ewBox(q-vec3(0.0,-.46,-.087),vec3(halfWidth-.064,.052,.038)),
      ewBox(q-vec3(0.0,.43,-.087),vec3(halfWidth-.064,.047,.038)));
    if(broad)brace=min(brace,ewBox(q+vec3(0.0,0.0,.084),vec3(.039,height-.053,.037)));
    hvUnion(brace,72.0,d,material);
  }else{
    float panel=ewBox(vec3(abs(q.x)-halfWidth*.43,q.y+.25,q.z+.082),vec3(halfWidth*.33,.47,.025));
    hvUnion(panel,70.0,d,material);
    hvUnion(ewBox(q-vec3(0.0,.59,-.086),vec3(halfWidth-.17,.21,.029)),53.0,d,material);
  }
  hvUnion(ewBox(q-vec3(halfWidth*.66,-.13,-.051),vec3(.075,.031,.060)),76.0,d,material);
}

void hvShopWindow(vec3 q,vec2 size,float trade,inout float d,inout float material){
  if(hvBoxBound(q+vec3(0.0,0.0,.20),vec3(size+.14,.28))>max(d,0.0))return;
  d=max(d,-ewBox(q+vec3(0.0,0.0,.205),vec3(size,.30)));
  vec3 opening=vec3(abs(q.x)-size.x+.045,abs(q.y)-size.y+.040,q.z+.054);
  float frame=min(ewBox(vec3(opening.x,q.y,opening.z),vec3(.044,size.y,.063)),
    ewBox(vec3(q.x,opening.y,opening.z),vec3(size.x,.040,.066)));
  frame=min(frame,ewBox(q+vec3(0.0,0.0,.058),vec3(.029,size.y-.046,.050)));
  hvUnion(frame,trade==1.0?72.0:70.0,d,material);
  hvUnion(ewRoundBox(q-vec3(0.0,-size.y-.05,-.044),vec3(size.x+.078,.041,.132),.008),71.0,d,material);
  hvUnion(ewBox(q+vec3(0.0,0.0,.465),vec3(size-.044,.027)),trade==1.0?87.0:53.0,d,material);
  if(trade==0.0){
    hvUnion(ewBox(q+vec3(0.0,.29,.258),vec3(size.x-.064,.022,.175)),70.0,d,material);
    vec3 jars=q+vec3(0.0,.175,.29);
    float slot=abs(fract((jars.x+.01)/.182)-.5)*.182;
    float tins=max(length(vec2(slot,jars.z))-.057,max(abs(jars.y)-.095,abs(q.x)-size.x+.107));
    hvUnion(tins,76.0,d,material);
    hvUnion(max(tins,abs(jars.y)-.039)-.001,71.0,d,material);
  }else if(trade==2.0){
    vec3 slots=q+vec3(0.0,.062,.26);
    float rest=ewBox(slots+vec3(0.0,.33,0.0),vec3(size.x-.057,.038,.17));
    hvUnion(rest,72.0,d,material);
    float tilt=slots.x+.13*slots.y;
    float pair=max(abs(abs(tilt+.014)-.128)-.044,max(abs(slots.y)-size.y+.12,abs(slots.z)-.021));
    hvUnion(pair,56.0,d,material);
    hvUnion(ewBox(slots-vec3(-.32,-.13,-.016),vec3(.17,.062,.112)),76.0,d,material);
  }
}

// Low-frequency joints and actual profile changes are authored in metres.
// The fabric stays readable from the lane even after fine grain disappears.
vec2 hvBond(vec2 p,vec2 unitSize,float stagger){
  float course=floor(p.y/unitSize.y);
  float run=p.x+mod(course,2.0)*unitSize.x*stagger;
  vec2 phase=fract(vec2(run,p.y)/unitSize);
  vec2 gap=min(phase,1.0-phase)*unitSize;
  return vec2(min(gap.x,gap.y),ewHash(vec2(floor(run/unitSize.x),course)));
}
float hvBedJoint(vec2 p){
  float y=p.y+.018*sin(p.x*7.3)+.009*sin(p.x*18.0);
  float course=floor(y/.23);
  float x=p.x+.095*sin(course*3.17)+.023*sin(p.y*26.0);
  return hvBond(vec2(x,y),vec2(.47,.23),.48).x;
}

float hvFieldWall(vec3 q,vec3 b,out float material){
  // The broad body still blocks to the same plan. Irregular facing stone
  // sits on a heavier foot, with separate coping and a sheltered snow edge.
  bool xRun=b.x>b.z;
  vec3 a=xRun?q:q.zyx;
  vec3 halfSize=xRun?b:b.zyx;
  float rise=clamp((a.y+halfSize.y)/(2.0*halfSize.y),0.0,1.0);
  float face=halfSize.z-.042*rise;
  float bedding=hvBedJoint(a.xy);
  float capY=halfSize.y-.13;
  float rough=.016*(1.0-smoothstep(.006,.031,bedding));
  float body=max(abs(a.x)-halfSize.x,max(abs(a.z)-face+rough,max(-a.y-halfSize.y,a.y-capY)))*.85;
  material=50.0;
  float course=floor((a.x+.13)/.49);
  float head=abs(fract((a.x+.13)/.49)-.5)*.49;
  float crown=capY+.044+.041*ewHash1(course+floor(b.x*10.0));
  float coping=max(max(abs(a.x)-halfSize.x,abs(a.z)-halfSize.z+.025),
    max(a.y-crown,capY-.034-a.y));
  coping=max(coping,.009-head);
  hvUnion(coping*.86,71.0,body,material);
  // On the sheltered shoulder, snow spans the coping joints and curls over
  // the edge. The broken windward edge leaves the projecting stone exposed.
  float lee=a.z*sign(xRun?homeWind.y:homeWind.x);
  float load=ewNoise(vec2(a.x*.92+halfSize.x*.21,2.6));
  float broken=ewNoise(vec2(a.x*3.7,halfSize.x*1.9));
  float snowEdge=max(abs(a.x)-halfSize.x+.047,
    max(-lee-halfSize.z+.12+.13*load,lee-halfSize.z+.009));
  float held=smoothstep(-.024,.089,-snowEdge);
  float lip=smoothstep(halfSize.z-.065,halfSize.z,lee)*held;
  float top=capY+.050+held*(.03+.078*load+.021*broken);
  float bottom=capY+.026-.112*lip;
  float snow=max(snowEdge,max(a.y-top,bottom-a.y))*.75;
  hvUnion(snow,57.0,body,material);
  return body;
}

// q.x runs along the ridge and q.z across it. The roof face facing away from
// the wind retains a deeper snow load. Each section follows the roof plane
// depth to bury the slates in the lee and leave courses exposed downhill.
float hvRoofSnow(vec3 q,vec2 span,float plane,float relief,vec2 wind,float shed,vec3 obstacle){
  float side=abs(q.z);
  float leeside=smoothstep(-.16,.63,q.z*wind.y);
  float cross=q.x-q.z*wind.x*.25;
  float dune=ewNoise(vec2(cross*.86+span.y,span.x*.64));
  float broken=ewNoise(vec2(cross*2.9+span.x,.94));
  vec2 wake=q.xz-obstacle.xy;
  float downwind=dot(wake,wind);
  float shoulder=abs(dot(wake,vec2(-wind.y,wind.x)));
  float trapped=obstacle.z*smoothstep(-.13,.26,downwind)
    *(1.0-smoothstep(.64,1.64,downwind))*(1.0-smoothstep(.28,.79,shoulder));
  float melt=(.14+.30*dune+.11*broken)*shed;
  float edge=span.y-mix(.51,.15,leeside)-melt+.24*trapped;
  float verge=span.x-(.047+.12*dune);
  float outline=max(side-edge,abs(q.x+.031*(broken-.5))-verge);
  float feather=smoothstep(0.0,.32,-outline);
  float ridgeRoll=1.0-smoothstep(.04,.69,abs(q.z-wind.y*.37));
  float scallop=ewNoise(vec2(cross*.57,side*1.43));
  float depth=(mix(.055,.159,leeside)+.051*scallop+.078*ridgeRoll+.094*trapped)
    *mix(.77,1.05,dune)*feather;
  float lower=relief-.025;
  return max(outline,max(plane-.013-depth,lower-plane))*.74;
}

void hvRoofCover(vec3 q,float w,float l,float ridge,float slope,float normalScale,bool metal,vec3 obstacle,
  inout float d,inout float material){
  vec3 bound=vec3(w+.35,ridge+.50,l+.35);
  if(hvBoxBound(q,bound)>max(d,0.0))return;
  float side=abs(q.z),plane=(q.y-ridge+slope*side-.093)*normalScale;
  float panel=max(abs(q.x)-w-.346,side-l-.344);
  if(max(panel,max(plane-.44,-plane-.24))>max(d,0.0))return;
  float relief;
  if(metal){
    float rib=abs(fract((q.x+.05)/.225)-.5)*.225;
    relief=.029*(1.0-smoothstep(.016,.063,rib));
  }else{
    // The next course covers the head of the one downhill. The lower lip
    // stands proud. Alternating side joints keep gaps from aligning.
    float run=side/normalScale;
    float row=floor(run/.284);
    float lap=smoothstep(.06,.94,fract(run/.284));
    float joint=hvBond(vec2(q.x,run),vec2(.32,.284),.5).x;
    relief=.027*lap-.011*(1.0-smoothstep(.004,.019,joint));
    relief+=.004*ewHash(vec2(floor(q.x/.32+row*.5),row));
  }
  float deck=max(panel,max(plane-relief,-plane-.102))*.82;
  hvUnion(deck,metal?73.0:52.0,d,material);
  float roll=max(length(vec2(q.z,q.y-ridge-.108))-.123,abs(q.x)-w-.34);
  float ridgeJoint=abs(fract((q.x+.14)/.46)-.5)*.46;
  roll+=.012*(1.0-smoothstep(.006,.028,ridgeJoint));
  hvUnion(roll,metal?73.0:85.0,d,material);

  hvUnion(hvRoofSnow(q,vec2(w+.346,l+.344),plane,relief,homeWind,metal?1.30:.86,obstacle),57.0,d,material);
}

void hvRainGoods(vec3 q,float w,float l,float eave,float slope,float face,bool store,
  inout float d,inout float material){
  float spoutX=w-.32;
  float projectedZ=l+.292,wallZ=l+.105;
  float gutterY=eave-slope*.292-.013;
  float fall=clamp((q.x+w)/(w*2.0),0.0,1.0)*.047;
  vec3 g=vec3(q.x,q.y-gutterY-.047+fall,face*q.z-projectedZ);
  if(hvBoxBound(g,vec3(w+.34,.11,.105))<max(d,.02)){
    float curve=length(g.yz);
    float trough=max(max(curve-.075,.059-curve),max(g.y-.012,abs(g.x)-w-.305));
    float bead=min(length(g.yz-vec2(.009,.071)),length(g.yz-vec2(.009,-.071)))-.013;
    bead=max(bead,abs(g.x)-w-.305);
    float edge=max(abs(abs(g.x)-w-.297)-.009,max(curve-.072,g.y-.012));
    float hangerX=abs(fract((g.x+w+.11)/.71)-.5)*.71;
    float hanger=max(abs(curve-.080)-.008,max(hangerX-.013,max(g.y-.026,abs(g.x)-w-.29)));
    hvUnion(min(min(trough,bead),min(edge,hanger)),76.0,d,material);
  }
  float lowest=store?.31:.235;
  vec3 r=vec3(q.x-spoutX,q.y,face*q.z);
  if(hvBoxBound(r-vec3(0.0,(gutterY+lowest)*.5,l+.27),
    vec3(.12,(gutterY-lowest)*.5+.13,.32))>max(d,.03))return;
  float pipeR=length(r.xz-vec2(0.0,wallZ));
  float startY=gutterY-.35;
  float stopY=lowest+.13;
  float shaft=max(pipeR-.042,max(r.y-startY,stopY-r.y));
  float upperY=gutterY-.052;
  float elbows=min(ewCapsule(r,vec3(0.0,upperY,projectedZ),vec3(0.0,upperY-.125,projectedZ),.047),
    ewCapsule(r,vec3(0.0,upperY-.125,projectedZ),vec3(0.0,startY,wallZ),.043));
  const float storeDischarge=59.0-${glf(HOME_COMMONS_DRAINAGE.pipeMouth[2])};
  vec3 mouth=vec3(0.0,lowest,store?storeDischarge:l+.194);
  vec3 toe=vec3(0.0,stopY,wallZ);
  float shoe=ewCapsule(r,toe,mouth,.045);
  // The open shoe has a visible metal rim and a dark bore.
  vec3 shoeAxis=normalize(mouth-toe);
  shoe=max(shoe,-ewCapsule(r,mouth-shoeAxis*.065,mouth+shoeAxis*.072,.031));
  float bandHeight=abs(fract((r.y-.56)/.77)-.5)*.77;
  float collars=max(max(pipeR-.057,bandHeight-.023),max(r.y-startY+.10,stopY+.08-r.y));
  float clip=max(abs(r.x)-.074,max(bandHeight-.015,max(l-.006-r.z,r.z-wallZ)));
  hvUnion(min(min(shaft,elbows),min(shoe,min(collars,clip))),76.0,d,material);
}

float hvShelterRoof(vec3 q,vec3 b,out float material){
  float rise=2.0*b.y-.14;
  float slope=rise/b.x;
  float inverse=inversesqrt(1.0+slope*slope);
  float side=abs(q.x),plane=(q.y-b.y+.080+slope*side)*inverse;
  float step=smoothstep(.08,.93,fract(side/(.29*inverse)));
  float joint=hvBond(vec2(q.z,side/inverse),vec2(.37,.29),.5).x;
  float profile=.025*step-.008*(1.0-smoothstep(.004,.019,joint));
  float deck=max(hvBoxBound(q,b),max(plane-profile,-plane-.117))*.81;
  material=52.0;
  float ridge=max(length(vec2(q.x,q.y-b.y+.073))-.080,abs(q.z)-b.z);
  hvUnion(ridge,85.0,deck,material);
  hvUnion(hvRoofSnow(q.zyx,b.zx,plane,profile,homeWind.yx,.80,vec3(0.0)),57.0,deck,material);
  // Rafter ends and the fascia are actual profiles along the slope.
  float tail=abs(fract((q.z+.06)/.67)-.5)*.67;
  float end=max(max(tail-.053,side-b.x+.023),max(abs(plane+.128)-.065,b.x-.30-side));
  hvUnion(end,86.0,deck,material);
  vec3 fascia=vec3(side-b.x+.064,plane+.093,q.z);
  hvUnion(ewRoundBox(fascia,vec3(.034,.073,b.z-.014),.008),72.0,deck,material);
  return deck;
}

float hvShelterRainwater(vec3 q){
  // The rear eave has an open channel on fall to the north end. From
  // there an offset brings the round pipe against the windbreak.
  float fall=clamp((q.z+2.61)/5.22,0.0,1.0)*.049;
  vec2 section=vec2(q.x+.142,q.y-1.073+fall);
  float bend=length(section);
  float channel=max(max(bend-.059,.046-bend),max(section.y-.006,abs(q.z)-2.61));
  float hangerZ=abs(fract((q.z+.17)/.64)-.5)*.64;
  float hanger=max(abs(bend-.065)-.007,max(hangerZ-.013,max(section.y-.018,abs(q.z)-2.59)));
  float pipe=ewCapsule(q,vec3(-.142,.98,2.49),vec3(-.070,.80,2.45),.039);
  pipe=min(pipe,ewCapsule(q,vec3(-.070,.80,2.45),vec3(-.070,-.90,2.45),.036));
  pipe=min(pipe,ewCapsule(q,vec3(-.070,-.90,2.45),vec3(-.088,-1.09,2.63),.041));
  float ringY=abs(fract((q.y+.18)/.64)-.5)*.64;
  float collars=max(length(q.xz-vec2(-.070,2.45))-.051,max(ringY-.018,abs(q.y)-.77));
  return min(min(channel,hanger),min(pipe,collars));
}

const mat3 hvBuildings[${packedBuildings.length}]=mat3[${packedBuildings.length}](
  ${packedBuildings.map(matrix).join(',\n  ')}
);

float hvArchitecture(vec3 p,int index,out float material){
  mat3 spec=hvBuildings[index];
  vec3 q=p-spec[0];
  float w=spec[1].x,l=spec[1].y,eave=spec[1].z,ridge=spec[2].x,foot=spec[2].y;
  float style=floor(spec[2].z*.5),face=mod(spec[2].z,2.0)*2.0-1.0;
  bool hay=style==1.0,wash=style==2.0,bakery=style==5.0,workshop=style==6.0;
  bool domestic=style==3.0||style==4.0||workshop;
  float wall=hay?70.0:((style==4.0||workshop)?75.0:((wash||bakery)?74.0:58.0));
  float slope=(ridge-eave)/l;
  float roofY=ridge-slope*abs(q.z);
  float roofNormal=inversesqrt(1.0+slope*slope);
  vec3 foundationPoint=q-vec3(0.0,(foot+.61)*.5,0.0);
  float foundation=ewRoundBox(foundationPoint,vec3(w+.075,(.61-foot)*.5-.014,l+.065),.014);
  if(abs(foundation)<.16&&q.y<.55){
    float along=abs(q.x)/(w+.09)>abs(q.z)/(l+.08)?q.z:q.x;
    foundation=(foundation+.020*(1.0-smoothstep(.004,.025,hvBedJoint(vec2(along,q.y)))))*.84;
  }
  float envelope=max(hvBoxBound(q-vec3(0.0,(.52+ridge)*.5,0.0),vec3(w,(ridge-.52)*.5,l)),
    (q.y-roofY)*roofNormal);
  float d=min(envelope,foundation);material=envelope<foundation?wall:50.0;
  hvUnion(ewBox(q-vec3(0.0,.63,0.0),vec3(w+.12,.075,l+.10)),71.0,d,material);

  float chimneyX=w*(domestic?.51:.47),chimneyZ=-face*l*.31;
  hvRoofCover(q,w,l,ridge,slope,roofNormal,hay||wash,vec3(chimneyX,chimneyZ,hay?0.0:1.0),d,material);
  float roofTop=(q.y-roofY-.090)*roofNormal;
  // Soffit boards, spaced tails and the dark fascia each cast a geometrical
  // line under the bright roof. No repeating tiny pieces enter the site list.
  vec3 eaves=vec3(q.x,q.y-eave+.13,abs(q.z)-l-.16);
  hvUnion(ewBox(eaves,vec3(w+.22,.041,.183)),70.0,d,material);
  vec3 fascia=vec3(q.x,q.y-eave+slope*.308-.01,abs(q.z)-l-.308);
  hvUnion(ewBox(fascia,vec3(w+.30,.091,.058)),72.0,d,material);
  float tailX=abs(fract((q.x+w+.04)/.62)-.5)*.62-.041;
  float tails=max(abs(q.x)-w+.06,max(tailX,max(abs(eaves.y+.042)-.058,abs(eaves.z)-.145)));
  hvUnion(tails,70.0,d,material);
  float verge=max(abs(abs(q.x)-w-.23)-.067,max(abs(q.z)-l-.29,abs(roofTop+.113)-.052));
  hvUnion(verge,72.0,d,material);
  if(!hay)hvRainGoods(q,w,l,eave,slope,face,style==0.0,d,material);

  vec3 front=vec3(q.x,q.y,face*q.z-l);
  float doorX=bakery?-.90:(domestic?-.20*w:0.0);
  float doorY=bakery?1.22:(workshop?1.23:1.60);
  hvDoor(front-vec3(doorX,doorY,0.0),hay?1.01:(bakery?.58:(workshop?.91:(domestic?.54:.73))),!domestic||workshop,hay||workshop,d,material);
  if(bakery||workshop||style==0.0){
    float displayX=bakery?.85:(workshop?1.41:1.69);
    float displayY=bakery?1.62:(workshop?1.35:1.86);
    hvShopWindow(front-vec3(displayX,displayY,0.0),vec2(bakery?.83:(workshop?1.04:.85),bakery?.54:.56),
      bakery?1.0:(workshop?2.0:0.0),d,material);
  }else{
  float windowX=hay?.61*w:.56*w;
  hvWindow(front-vec3(windowX,hay?2.28:2.13,0.0),vec2(hay?.40:.56,hay?.29:.47),hay,d,material);
  }
  if(domestic){
    hvWindow(front-vec3(-.72*w,workshop?2.86:2.16,0.0),vec2(.43,.50),false,d,material);
    if(workshop)hvWindow(front-vec3(.52*w,2.87,0.0),vec2(.45,.48),false,d,material);
    vec3 rear=vec3(q.x,q.y,-face*q.z-l);
    hvWindow(rear-vec3(-.36*w,2.20,0.0),vec2(.53,.55),false,d,material);
    hvWindow(rear-vec3(.46*w,2.14,0.0),vec2(.44,.52),false,d,material);
  }
  // The main walking route sees each gable obliquely. Give the wash house its
  // high side light and the pasture store an actual airing louvre.
  vec3 endWall=vec3(q.z,q.y,-q.x-w);
  hvWindow(endWall-vec3(0.0,eave+(ridge-eave)*.34,0.0),vec2(hay?.56:.42,hay?.34:.28),
    hay||!domestic,d,material);
  if(wash)hvWindow(endWall-vec3(-l*.36,2.11,0.0),vec2(.53,.39),false,d,material);

  if(!hay){
    float roofAtStack=ridge-slope*abs(chimneyZ);
    float stackY=roofAtStack-.19,stackTop=ridge+(domestic?.73:.59);
    vec3 stack=q-vec3(chimneyX,(stackY+stackTop)*.5,chimneyZ);
    float core=ewRoundBox(stack,vec3(.224,(stackTop-stackY)*.5-.010,.274),.010);
    if(abs(core)<.12){
      float wallU=abs(stack.x)/.235>abs(stack.z)/.285?stack.z:stack.x;
      float joints=hvBond(vec2(wallU,q.y),vec2(.227,.081),.5).x;
      core=(core+.009*(1.0-smoothstep(.002,.013,joints)))*.87;
    }
    hvUnion(core,77.0,d,material);
    float flashing=max(max(abs(stack.x)-.32,abs(stack.z)-.37),abs(roofTop-.018)-.027);
    float upstand=max(max(abs(stack.x)-.25,abs(stack.z)-.302),abs(roofTop-.08)-.088);
    hvUnion(min(flashing,upstand),76.0,d,material);
    hvUnion(ewRoundBox(q-vec3(chimneyX,stackTop-.018,chimneyZ),vec3(.270,.048,.315),.011),71.0,d,material);
    if(domestic){
      vec3 pot=q-vec3(chimneyX,stackTop+.12,chimneyZ);
      pot.z=abs(pot.z)-.103;
      hvUnion(max(length(pot.xz)-.079,abs(pot.y)-.13),77.0,d,material);
    }
  }
  return d;
}

const mat3 hvPieces[${packedPieces.length}]=mat3[${packedPieces.length}](
  ${packedPieces.map(matrix).join(',\n  ')}
);
const mat3 hvSites[${packedSites.length}]=mat3[${packedSites.length}](
  ${packedSites.map(matrix).join(',\n  ')}
);
float ewHomeValleySites(vec3 p,float limit,out float material){
  float nearest=limit;
  material=50.0;
  for(int i=0;i<${packedSites.length};i++){
    mat3 group=hvSites[i];
    float bound=hvBoxBound(p-group[0],group[1]);
    if(bound>=nearest)continue;
    if(bound>.42){nearest=bound;continue;}
    int first=int(group[2].x),end=first+int(group[2].y);
    for(int j=first;j<end;j++){
      mat3 prop=hvPieces[j];
      vec3 q=p-prop[0],b=prop[1];
      float tag=prop[2].x,mode=prop[2].y,shapeD;
      float margin=mode==8.0?fract(prop[2].z):0.0;
      float snowAllowance=mode==2.0||mode==14.0?.185:(mode==16.0?.045:(mode==17.0?.07:0.0));
      vec3 headroom=vec3(0.0,snowAllowance,0.0);
      if(hvBoxBound(q-headroom,b+headroom)-margin>=nearest)continue;
      if(mode==1.0)shapeD=hvGable(q,b);
      else if(mode==2.0){
        shapeD=1e5;
        float slope=2.0*b.y/b.z;
        hvRoofCover(q,b.x-.348,b.z-.347,b.y-.14,slope,inversesqrt(1.0+slope*slope),false,vec3(0.0),shapeD,tag);
      }
      else if(mode==3.0)shapeD=hvTrough(q,b);
      else if(mode==4.0)shapeD=hvRoundX(q,b);
      else if(mode==5.0)shapeD=hvRoundY(q,b);
      else if(mode==6.0)shapeD=hvCloth(q,b);
      else if(mode==7.0||mode==17.0)shapeD=hvLeanRoof(q,b,mode==17.0,tag);
      else if(mode==8.0){
        int signIndex=int(prop[2].z);
        float face=hvSignFaces[signIndex][2].x;
        vec4 paper=hvPaperShape[signIndex];
        bool front=false;
        if(paper.y!=0.0)shapeD=hvPinnedPaper(q,b,face,paper,front);
        else{
          shapeD=ewBox(q,b);
          float projection=hvSignDirection(q,face);
          float halfDepth=face<1.5?b.x:b.z;
          float signedEdge=face<1.5?abs(q.z)-b.z:abs(q.x)-b.x;
          front=projection>0.0&&projection-halfDepth>=max(signedEdge,abs(q.y)-b.y)-.003;
        }
        if(front)tag=100.0+float(signIndex);
      }
      else if(mode==9.0)shapeD=hvArchitecture(p,int(prop[2].z),tag);
      else if(mode==10.0)shapeD=hvOpenCup(q,b);
      else if(mode==11.0)shapeD=hvCupHandle(q,b);
      else if(mode==12.0)shapeD=hvRoundX(q.zyx,b.zyx);
      else if(mode==13.0)shapeD=hvRill(q,b);
      else if(mode==14.0)shapeD=hvShelterRoof(q,b,tag);
      else if(mode==15.0)shapeD=hvShelterRainwater(q);
      else if(mode==16.0)shapeD=hvFieldWall(q,b,tag);
      else shapeD=ewBox(q,b);
      hvUnion(shapeD,tag,nearest,material);
    }
  }
  return nearest;
}

// Broad finish differences survive the dither at walking distance. Weathered
// wood and slate keep enough grain to read close without busy random dots.
vec3 hvHeldSnow(vec3 p,vec3 n,float detail){
  float crust=ewNoise(p.xz*vec2(1.42,.92)+p.y*.29);
  float grain=ewNoise(p.xz*vec2(12.0,9.0)+p.y*.77);
  float facing=smoothstep(.08,.85,n.y);
  vec3 older=vec3(.565,.603,.623),powder=vec3(.74,.776,.792);
  return mix(older,powder,.28+.52*facing+.17*crust)*(.98+.04*(grain-.5)*detail);
}

vec3 ewHomeValleyAlbedo(vec3 p,vec3 n,float m,float distanceM){
  float along=abs(n.x)>abs(n.z)?p.z:p.x;
  float closeDetail=1.0-smoothstep(4.0,17.0,distanceM);
  float middleDetail=1.0-smoothstep(11.0,34.0,distanceM);
  if(m<50.5){
    float joint=hvBedJoint(vec2(along,p.y));
    float mortar=1.0-smoothstep(.008,.027,joint);
    float aggregate=ewNoise(vec2(along*.97,p.y*4.4));
    float shale=ewNoise(vec2(along*3.3,p.y*15.0));
    vec3 stone=mix(vec3(.29,.317,.321),vec3(.452,.455,.426),aggregate);
    stone*=.92+.17*shale*closeDetail;
    // Lime mortar sits back in the joint. Below exposed steps and wet
    // shoulders, saturation darkens the feet instead of coating whole walls.
    return mix(stone,vec3(.28,.29,.276),mortar*(.62+.30*middleDetail));
  }
  if(m<51.5||(m>55.5&&m<56.5)){
    float board=abs(fract(p.y/.18)-.5)*.18;
    float seam=1.0-smoothstep(.008,.019,board);
    float wood=ewNoise(vec2(along*.6,p.y*15.0));
    vec3 color=m<51.5?vec3(.217,.197,.169):vec3(.34,.273,.194);
    return color*(1.0+(.21*wood-.105)*closeDetail)*(1.0-.29*seam*middleDetail);
  }
  if(m<52.5){
    float course=floor(p.z/.32);
    float joint=min(abs(fract(p.z/.32)-.5)*.32,abs(fract((p.x+course*.205)/.41)-.5)*.41);
    float lap=1.0-smoothstep(.009,.033,joint);
    float courseShade=ewNoise(vec2(floor(p.x/.41)*.7,course*.54));
    return vec3(.304,.337,.353)*(.83+.28*courseShade*middleDetail)*(1.0-.20*lap*middleDetail);
  }
  if(m<53.5){
    float coldSky=max(0.0,n.y)*.05+ewNoise(vec2(along*.33,p.y*.8))*.035;
    return vec3(.048,.071,.092)+vec3(.69,.86,1.0)*coldSky;
  }
  if(m<54.5){
    float rust=ewNoise(vec2(along*2.1,p.y*2.4));
    return mix(vec3(.235,.26,.27),vec3(.24,.16,.10),smoothstep(.55,.81,rust)*.65);
  }
  if(m<55.5){
    float frost=ewNoise(p.xz*3.5);
    return mix(vec3(.20,.29,.34),vec3(.60,.72,.78),smoothstep(.33,.79,frost));
  }
  if(m<57.5)return hvHeldSnow(p,n,closeDetail);
  if(m<58.5){
    float aggregate=ewNoise(vec2(along*3.6,p.y*4.5));
    return vec3(.52,.50,.45)*(.88+.17*aggregate);
  }
  if(m<59.5)return m<59.125?vec3(.70,.69,.62):vec3(.15,.18,.17);
  float wear=ewNoise(vec2(along*4.1,p.y*3.5));
  if(m<60.5)return vec3(.22,.35,.36)*(.89+.18*wear);
  if(m<61.5)return mix(vec3(.49,.51,.43),vec3(.67,.65,.54),wear);
  if(m<62.5){
    float fiber=ewNoise(vec2(p.x*2.8,p.z*14.0+p.y*21.0));
    float end=max(abs(n.x),smoothstep(.55,.85,n.y)*.75);
    return mix(vec3(.16,.115,.075),vec3(.46,.34,.207),end)*(.80+.30*fiber);
  }
  if(m<63.5)return mix(vec3(.105,.113,.118),vec3(.31,.205,.126),smoothstep(.50,.83,wear)*.56);
  if(m<70.5){
    // Vertical tarred boards wear along the grain. The darker seams are wider
    // than the grain and remain visible further from the hay store.
    float plank=along/.235,row=floor(plank);
    float seam=1.0-smoothstep(.005,.025,abs(fract(plank)-.5)*.235);
    float boardValue=ewNoise(vec2(row*.78,1.25));
    return vec3(.232,.212,.174)*(.91+.16*boardValue-.19*seam*middleDetail)
      *(1.0+(.08*wear-.04)*closeDetail);
  }
  if(m<71.5){
    float aggregate=ewNoise(vec2(along*2.6,p.y*3.2));
    return vec3(.414,.414,.387)*(.88+.16*aggregate*middleDetail);
  }
  if(m<72.5){
    float exposed=middleDetail*smoothstep(.51,.76,ewNoise(vec2(along*2.1,p.y*5.2)));
    return mix(vec3(.245,.312,.311),vec3(.346,.302,.229),exposed*.54);
  }
  if(m<73.5){
    float corrugation=.5+.5*sin(p.x*28.0);
    float rust=smoothstep(.47,.77,ewNoise(p.xz*.74));
    return mix(vec3(.257,.274,.277),vec3(.365,.254,.178),rust*.66)*(.92+.10*corrugation*middleDetail);
  }
  if(m<75.5){
    float lime=ewNoise(vec2(along*.67,p.y*1.1));
    float washWear=ewNoise(vec2(along*3.6,p.y*4.5));
    vec3 color=m<74.5?vec3(.576,.550,.475):vec3(.407,.483,.479);
    return color*(.86+.20*lime+.07*(washWear-.5)*closeDetail);
  }
  if(m<76.5){
    float reflected=.095*(1.0-abs(n.y))+.095*max(n.y,0.0);
    return vec3(.245,.279,.291)+vec3(.69,.82,.86)*reflected;
  }
  if(m<77.5){
    vec2 bond=hvBond(vec2(along,p.y),vec2(.227,.081),.5);
    float mortar=1.0-smoothstep(.005,.017,bond.x);
    vec3 clay=mix(vec3(.37,.195,.129),vec3(.60,.364,.235),bond.y);
    clay*=1.0+.11*(wear-.5)*closeDetail;
    return mix(clay,vec3(.49,.466,.415),mortar*.83*middleDetail);
  }
  if(m<78.5)return vec3(.74,.56,.16)*(.88+.13*wear);
  if(m<79.5)return vec3(.52,.21,.13)*(.89+.12*wear);
  if(m<80.5)return m<80.125?vec3(.70,.69,.59):vec3(.075,.081,.077);
  if(m<81.5)return vec3(.23,.27,.274);
  if(m<82.5)return vec3(.31,.275,.22);
  if(m<85.5)return vec3(.402,.310,.252)*(.91+.17*wear);
  if(m<86.5)return vec3(.384,.313,.235)*(.86+.19*wear);
  return vec3(.47,.32,.18);
}
vec3 ewHomeValleyAlbedo(vec3 p,vec3 n,float m){
  return ewHomeValleyAlbedo(p,n,m,0.0);
}
`;
