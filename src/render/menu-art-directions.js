// Authored menu treatments share the source, history and finishing contract.
// Residual architecture is the selected production direction.
import {MENU_SIGNAL_FRAGMENT_GLSL} from './menu-signal-treatments.js';

export const MENU_ART_DIRECTIONS=Object.freeze([
  Object.freeze({id:'residual',name:'Residual architecture',mode:4,damage:.84,registration:20,feedback:.93,exposure:.15,vignette:.43,colorA:'#9bbab4',colorB:'#c16743',historySteps:42}),
  Object.freeze({id:'rupture',name:'Carrier rupture',mode:5,damage:.88,registration:28,feedback:.86,exposure:-.05,vignette:.48,colorA:'#bac6b4',colorB:'#dc5938',historySteps:42}),
]);

// Separate the recording's coarse architectural values from its fine hatch.
// The latter stays as emulsion, rather than seeding a full-screen noise tunnel.
const helpers=`
float sceneY(vec2 p){
  vec2 d=vec2(1.)/sourceSize;
  float y=yAt(p)*.12;
  y+=yAt(p+vec2(3.1,1.7)*d)*.11+yAt(p-vec2(3.1,1.7)*d)*.11;
  y+=yAt(p+vec2(1.7,-3.1)*d)*.11+yAt(p-vec2(1.7,-3.1)*d)*.11;
  y+=yAt(p+vec2(7.3,4.7)*d)*.11+yAt(p-vec2(7.3,4.7)*d)*.11;
  y+=yAt(p+vec2(4.7,-7.3)*d)*.11+yAt(p-vec2(4.7,-7.3)*d)*.11;
  return y;
}
float architectureEdge(vec2 p){
  vec2 d=vec2(5.)/sourceSize;
  return clamp(length(vec2(sceneY(p+vec2(d.x,0.))-sceneY(p-vec2(d.x,0.)),sceneY(p+vec2(0.,d.y))-sceneY(p-vec2(0.,d.y))))*1.55,0.,1.);
}
float lockLoss(float t){
  float phase=mod(t,12.);
  return smoothstep(2.2,4.8,phase)*(1.-smoothstep(7.,10.8,phase));
}
vec3 previousPlate(vec2 p){return texture(historyImage,clamp(vec2(p.x,1.-p.y),0.,1.)).rgb;}
`;

const proposals=`  if(mode==4){
    float loss=lockLoss(time);
    vec2 px=vec2(1.)/sourceSize;
    // A stable exposure gradually comes out of registration, then finds lock.
    p.x+=sin(uv.y*4.1+time*.09)*registration*px.x*loss*.55*damage*presence;
    vec2 registrationVector=vec2(registration,-registration*.29)*px*(.35+loss*.9)*damage*presence;
    float y=sceneY(p),edge=architectureEdge(p);
    float left=sceneY(p-registrationVector),right=sceneY(p+registrationVector);
    float reversal=(1.-smoothstep(.205,.230,uv.x))*.96*presence;
    float photographic=mix(pow(y,.72),pow(1.-y,1.3),reversal);
    float tone=smoothstep(.02,.22,photographic)*.24+smoothstep(.24,.52,photographic)*.32+smoothstep(.54,.75,photographic)*.20;
    vec3 ink=mix(vec3(.009,.019,.021),colorA*.92,tone);
    ink+=colorA*edge*.28;
    // Two actual exposures: warm displaced density, cool intact architecture.
    float displaced=clamp(abs(left-y)*1.6+abs(right-y)*.35,0.,1.);
    ink+=colorB*displaced*(.35+.36*loss)*damage*presence;
    float hatch=clamp(yAt(p)-y,-.3,.3);
    ink+=colorA*hatch*.045;
    vec2 drift=vec2(.48+.46*sin(uv.y*3.6),-.16)*px*damage*presence;
    vec3 old=previousPlate(uv-drift);
    vec3 memory=max(ink,old*feedback);
    c=mix(ink,memory,(.30+.55*loss)*damage*presence);
    // A small recoverable tracking fault, only during the loss of lock.
    float splice=1.-smoothstep(1.5,6.,abs((uv.y-(.76-.035*loss))*sourceSize.y));
    c*=1.-splice*loss*.36*damage*presence;
    c=clamp(c,0.,.76);
  }else if(mode==5){
    float loss=lockLoss(time),lane=floor(uv.y*6.);
    vec2 px=vec2(1.)/sourceSize;
    float shift=(hash(lane+4.)-.5)*registration*px.x*(.35+loss*3.2)*damage;
    p.x+=shift;
    p.y+=(hash(lane+18.)-.5)*.024*loss*damage;
    float y=sceneY(p),edge=architectureEdge(p);
    // A few wide dropped fields; no full-frame strobing or random blink.
    float reversed=(lane==1.||lane==4.?1.:0.)*(.70+.20*loss);
    float plate=mix(y,1.-y,reversed);
    float density=smoothstep(.07,.28,plate)*.27+smoothstep(.31,.58,plate)*.36;
    vec3 ink=mix(vec3(.009,.013,.014),colorA,density);
    vec2 offset=vec2(registration*px.x*(.6+loss),0.);
    float displaced=abs(sceneY(p+offset)-sceneY(p-offset));
    ink=mix(ink,colorB*.72,clamp(displaced*1.7,0.,.83)*damage);
    ink+=colorA*edge*.13;
    float seam=1.-smoothstep(1.,3.,min(fract(uv.y*6.),1.-fract(uv.y*6.))*sourceSize.y/6.);
    ink*=1.-seam*.65;
    float dropout=(1.-smoothstep(.002,.012,abs(uv.y-(.834-loss*.022))))*loss;
    ink*=1.-dropout*.75*damage;
    vec3 old=previousPlate(uv-vec2(1.6*px.x,0.));
    c=mix(ink,max(ink,old*feedback),loss*.3*damage);
    c=clamp(c,0.,.76);
  }else if(mode==1){`;

export const MENU_ART_DIRECTION_FRAGMENT_GLSL=MENU_SIGNAL_FRAGMENT_GLSL
  .replace('void main(){',helpers+'\nvoid main(){')
  .replace('  if(mode==1){',proposals);
