// Retained masonry chambers and bronze locks, rather than coloured toy faces.
const box=(x0,x1,y0,y1,z0,z1)=>({p:[x0,y0,z0,x1,y0,z0,x1,y0,z1,x0,y0,z1,x0,y1,z0,x1,y1,z0,x1,y1,z1,x0,y1,z1],
  i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]});
const join=items=>{const p=[],i=[];for(const g of items){const offset=p.length/3;p.push(...g.p);i.push(...g.i.map(n=>n+offset));}return{p,i};};
const orient=(g,axis,sign)=>({...g,p:g.p.map((_,i)=>{const at=Math.floor(i/3)*3,k=i%3,p=g.p.slice(at,at+3),q=axis===0?[sign*p[0],p[1],sign*p[2]]:axis===1?[p[1],sign*p[0],-sign*p[2]]:[-sign*p[2],p[1],sign*p[0]];return q[k];})});
const move=(g,x,y,z)=>({...g,p:g.p.map((v,i)=>v+[x,y,z][i%3])});
const spin=(g,a)=>({...g,p:g.p.map((_,i)=>{const at=Math.floor(i/3)*3,k=i%3,p=g.p.slice(at,at+3);return[p[0],Math.cos(a)*p[1]-Math.sin(a)*p[2],Math.sin(a)*p[1]+Math.cos(a)*p[2]][k];})});
function eyeBand(width=.56,height=.27){
  const p=[],i=[],steps=12;
  for(let n=0;n<steps;n++){
    const a=n*Math.PI*2/steps,s=Math.sin(a),c=Math.cos(a);
    for(const[x,w,h]of[[.055,width,height],[.055,width-.075,height-.075],[-.035,width,height],[-.035,width-.075,height-.075]])
      p.push(x,h*s*Math.abs(s),w*c);
  }
  for(let n=0;n<steps;n++)for(const[a,b]of[[0,1],[2,0],[1,3],[3,2]]){
    const j=n*4,k=(n+1)%steps*4;i.push(j+a,k+a,k+b,j+a,k+b,j+b);
  }
  return{p,i};
}
function pupil(radius=.145){
  // A deep, genuinely concave socket. No flat painted pupil floats in front
  // of the lid: the centre recedes 16cm behind its real annular opening.
  const p=[-.16,0,0],i=[],steps=12;
  for(let n=0;n<steps;n++){const a=n*Math.PI*2/steps;p.push(.005,Math.sin(a)*radius,Math.cos(a)*radius);}
  for(let n=0;n<steps;n++){const a=n+1,b=(n+1)%steps+1;i.push(0,a,b);}return{p,i};
}
const face=[box(.76,1,-1,1,-1,-.66),box(.76,1,-1,1,.66,1),box(.76,1,-1,-.66,-.66,.66),box(.76,1,.66,1,-.66,.66)];
const cell=join([0,1,2].flatMap(axis=>[-1,1].flatMap(sign=>[...face,move(eyeBand(),1.025,0,0)].map(g=>orient(g,axis,sign)))));
const watch=join([0,1,2].flatMap(axis=>[-1,1].map(sign=>orient(move(pupil(),1.025,0,0),axis,sign))));
const chamber=join([
  // Broad risers keep their exact identity when a former floor becomes wall.
  ...Array.from({length:5},(_,i)=>box(-.68+i*.27,-.37+i*.27,-.66,-.51+i*.19,-.57,.57)),
  box(.40,.68,.17,.39,-.66,.66),box(-.69,-.58,-.50,.52,-.56,-.43),
  box(-.69,-.58,.40,.53,-.43,.55),box(-.68,.66,-.68,-.58,-.68,-.56),
  box(-.68,.66,-.68,-.58,.56,.68),
  ...[-1,1].flatMap(sign=>[box(.995,1.018,-.15,.15,sign*.80-.045,sign*.80+.045),
    box(-.15,.15,.995,1.018,sign*.80-.045,sign*.80+.045)])]);
const core=join([box(-.43,.43,-.92,.92,-.43,.43),box(-.92,.92,-.43,.43,-.43,.43),box(-.43,.43,-.43,.43,-.92,.92),
  ...[-1,1].flatMap(s=>[box(s*.71-.08,s*.71+.08,-.51,.51,-.51,.51),box(-.51,.51,s*.71-.08,s*.71+.08,-.51,.51)])]);
function wheel(){
  const p=[],i=[],segments=72,sides=6,radius=6.05;
  for(let a=0;a<segments;a++)for(let b=0;b<sides;b++){
    const t=a*Math.PI*2/segments,u=b*Math.PI*2/sides,r=radius+Math.cos(u)*.095;
    p.push(Math.sin(u)*.095,Math.sin(t)*r,Math.cos(t)*r);
  }
  for(let a=0;a<segments;a++)for(let b=0;b<sides;b++){
    const j=a*sides+b,k=(a+1)%segments*sides+b,l=(a+1)%segments*sides+(b+1)%sides,m=a*sides+(b+1)%sides;i.push(j,k,l,j,l,m);
  }
  return join([{p,i},...Array.from({length:24},(_,n)=>{const a=n*Math.PI/12;return move(spin(eyeBand(.40,.23),-a-Math.PI/2),.13,Math.sin(a)*radius,Math.cos(a)*radius);})]);
}
const wheelWatch=join(Array.from({length:24},(_,n)=>{const a=n*Math.PI/12;return move(pupil(.115),.15,Math.sin(a)*6.05,Math.cos(a)*6.05);}));
function feather(y,z,tipY,tipZ,width){
  const dy=tipY-y,dz=tipZ-z,length=Math.hypot(dy,dz),normal=[dz/length,-dy/length],boundary=[];
  for(const[t,w]of[[0,0],[.18,.55],[.52,1],[.82,.55],[1,0],[.82,-.55],[.52,-1],[.18,-.55]])
    boundary.push([y+dy*t+normal[0]*width*w,z+dz*t+normal[1]*width*w]);
  const p=[.14,y+dy*.48,z+dz*.48,-.045,y+dy*.48,z+dz*.48],i=[];
  for(const v of boundary)p.push(0,...v);
  for(let n=0;n<boundary.length;n++){const a=n+2,b=(n+1)%boundary.length+2;i.push(0,a,b,1,b,a);}return{p,i};
}
function leadingMantle(){
  const p=[],i=[],steps=8;
  for(let n=0;n<=steps;n++){
    const z=n/steps*2.8,y=.20+Math.sin(n/steps*Math.PI)*.38;
    for(const[x,h]of[[-.08,-.07],[.08,-.07],[.08,.07],[-.08,.07]])p.push(x,y+h,z);
  }
  for(let n=0;n<steps;n++)for(let side=0;side<4;side++){
    const a=n*4+side,b=n*4+(side+1)%4,c=b+4,d=a+4;i.push(a,b,c,a,c,d);
  }
  i.push(0,2,1,0,3,2,steps*4,steps*4+1,steps*4+2,steps*4,steps*4+2,steps*4+3);return{p,i};
}
const wing=join([
  leadingMantle(),
  // Swept primaries make a broad flight surface instead of a narrow comb.
  // The overlapping covert layer hides the quill roots, not the feather tips.
  ...Array.from({length:13},(_,n)=>{const t=n/12,z=.12+n*.19,y=.25+Math.sin(t*Math.PI)*.42;
    return feather(y,z,y-1.25-1.55*Math.sin((.16+t*.75)*Math.PI),z+.80+.35*t,.16+.09*Math.sin(t*Math.PI));}),
  ...Array.from({length:8},(_,n)=>{const t=n/7,z=.05+n*.30,y=.29+Math.sin(t*Math.PI)*.45;
    return feather(y,z,y-.75-.65*Math.sin(t*Math.PI),z+.70,.24);})]);
export function sourceRestCubeGeometryLibrary(){return{
  'rest-note-cube-cell':{...cell,material:'linen',base:[.70,.71,.64,1]},
  'rest-note-cube-chamber':{...chamber,material:'wood',base:[.43,.34,.22,1]},
  'rest-note-cube-watch':{...watch,material:'dark',roughness:1,base:[0,0,0,1]},
  'rest-note-cube-core':{...core,material:'worn-metal',base:[.30,.28,.20,1]},
  'rest-note-cube-wheel':{...wheel(),material:'worn-metal',base:[.54,.43,.25,1]},
  'rest-note-cube-wheel-watch':{...wheelWatch,material:'dark',roughness:1,base:[0,0,0,1]},
  'rest-note-cube-wing':{...wing,material:'linen',base:[.76,.72,.59,1]},
};}
