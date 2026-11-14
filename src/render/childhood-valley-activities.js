import { HOME_MAUL_BLOCK } from '../data/childhood-valley-trail.js';

const { x,y,z }=HOME_MAUL_BLOCK;
const block=`vec3(${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)})`;

export const CHILDHOOD_VALLEY_ACTIVITY_GLSL = `
const vec3 homeMaulBlock=${block};
float ewHomeAngelShape(vec2 world){
  if(uHomeAngel.w<=0.0)return 0.0;
  vec2 q=world-uHomeAngel.xy;
  if(dot(q,q)>2.85)return 0.0;
  float s=sin(uHomeAngel.z),c=cos(uHomeAngel.z);
  q=vec2(dot(q,vec2(c,-s)),dot(q,vec2(s,c)));
  float head=1.0-smoothstep(.117,.174,length(q-vec2(0.0,.695)));
  float body=1.0-smoothstep(.79,1.08,length((q-vec2(0.0,.12))/vec2(.24,.47)));
  float radius=length(vec2(abs(q.x)-.13,q.y-.23));
  float angle=atan(q.y-.23,max(.001,abs(q.x)-.13));
  float sweep=mix(-.42,.38,uHomeAngel.w);
  float arm=(1.0-smoothstep(.68,.90,radius))*smoothstep(-.93,-.71,angle)
    *(1.0-smoothstep(sweep-.13,sweep+.08,angle))*smoothstep(.02,.18,abs(q.x));
  float skirtWidth=mix(.22,.64,smoothstep(.13,.94,-q.y));
  float skirt=(1.0-smoothstep(skirtWidth-.07,skirtWidth,abs(q.x)))
    *smoothstep(-1.03,-.89,q.y)*(1.0-smoothstep(-.14,.03,q.y));
  return max(max(head,body),max(arm*.94,skirt*.82));
}
float ewHomeMaulGeometry(vec3 p,float limit,out float material){
  material=62.0;
  float held=uHomeActivity.x,progress=uHomeActivity.y,split=uHomeActivity.z;
  vec3 q=p-homeMaulBlock;
  float d=limit;
  float blockBounds=max(max(abs(q.x)-.93,abs(q.z)-.83),abs(q.y)-.58);
  if(blockBounds<d){
    if(split<.5){
      float logD=max(length(q.xz)-.115,max(-q.y,q.y-.247));
      // A seam cut into the end grain stops short of the loaded base.
      float score=ewBox(q-vec3(.018,.231,0.0),vec3(.012,.041,.103));
      d=min(d,max(logD,-score));
    }else{
      // The two halves stay where they drop beside the block.
      vec3 first=q-vec3(.24,-.402,-.28),second=q-vec3(-.23,-.405,.28);
      float halfA=max(max(length(first.yz)-.108,abs(first.x)-.128),first.z+.018);
      float halfB=max(max(length(second.xy)-.106,abs(second.z)-.123),-second.x+.021);
      d=min(d,min(halfA,halfB));
    }
  }else d=min(d,blockBounds);
  // While held, the shaft follows the instrument hand's side of the view.
  vec3 up=vec3(0.0,1.0,0.0),front=uRealmView;
  vec3 side=normalize(vec3(front.z,0.0,-front.x)+vec3(.0001,0.0,0.0));
  vec3 grip=uHomeActivityEye+front*.62+side*.34-up*.38;
  vec3 readyHead=grip+up*.38+front*.16;
  vec3 readyEnd=grip-up*.30-front*.22;
  vec3 restHead=homeMaulBlock+vec3(.025,.276,.031);
  vec3 restEnd=homeMaulBlock+vec3(.55,.38,.28);
  if(split>.5){
    restHead=homeMaulBlock+vec3(.02,.053,.06);
    restEnd=homeMaulBlock+vec3(.56,.130,.27);
  }
  vec3 head=held>.5?readyHead:restHead,end=held>.5?readyEnd:restEnd;
  if(held>.5&&held<1.5){
    float lift=smoothstep(0.0,1.0,progress);
    head=mix(restHead,readyHead,lift);
    end=mix(restEnd,readyEnd,lift);
  }else if(held>2.5){
    float raise=smoothstep(0.0,.20,progress);
    float strike=smoothstep(.20,.484375,progress);
    float recover=smoothstep(.51,1.0,progress);
    head=mix(mix(readyHead,grip+up*.83-front*.15,raise),homeMaulBlock+vec3(.022,.235,.02),strike);
    end=mix(mix(readyEnd,grip+up*.29-front*.40,raise),homeMaulBlock+vec3(.57,.44,.26),strike);
    head=mix(head,readyHead,recover);end=mix(end,readyEnd,recover);
  }
  vec3 centre=(head+end)*.5;
  float bound=length(p-centre)-.63;
  if(bound>d)return d;
  float shaft=ewCapsule(p,head,end,.026);
  if(shaft<d){d=shaft;material=62.0;}
  vec3 iron=p-head;
  float steel=ewRoundBox(iron,vec3(.109,.040,.040),.012);
  if(steel<d){d=steel;material=63.0;}
  return d;
}
float ewHomeAngelSleeves(vec3 p,float limit,out float material){
  material=81.0;
  vec3 q=p-uHomeActivityEye;
  float bound=length(q)-1.05;
  if(bound>limit)return limit;
  float s=sin(uHomeAngel.z),c=cos(uHomeAngel.z);
  q.xz=vec2(dot(q.xz,vec2(c,-s)),dot(q.xz,vec2(s,c)));
  q.x=abs(q.x);
  float pose=uHomeActivity.w;
  vec3 shoulder=vec3(.19,-.075,-.24);
  vec3 elbow=mix(vec3(.35,-.045,-.21),vec3(.45,-.08,.02),pose);
  vec3 glove=mix(vec3(.63,-.016,-.04),vec3(.72,.03,.28),pose);
  float coat=min(ewCapsule(q,shoulder,elbow,.087),ewCapsule(q,elbow,glove,.067));
  float mitten=ewCapsule(q,glove,glove+vec3(.095,.014,.047),.059);
  if(mitten<coat){material=82.0;coat=mitten;}
  return min(coat,limit);
}
`;
