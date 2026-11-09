// Original night-office dressing. Local +Z is the repaired public window.
export function buildBoothWorkplace({mesh,root,accessor}){
  const g=mesh('yard_booth_workplace');
  // Supported CRT shelf, bracket returns, vents and Bakelite tuning controls.
  g.box([.62,1.695,-.64],[.83,.055,.62],'worn wood');
  for(const x of[.30,.94]){g.box([x,1.56,-.91],[.035,.25,.035],'painted steel');g.box([x,1.57,-.69],[.035,.035,.44],'painted steel');}
  for(let i=0;i<9;i++)g.box([.97,1.84+i*.026,-.68],[.012,.010,.23],'dark wood');
  for(const y of[1.86,1.95])g.box([.896,y,-.383],[.045,.045,.023],'black lacquer');
  g.box([.90,1.786,-.384],[.07,.025,.024],'ivory');
  for(const x of[.35,.81])g.box([x,2.0133,-.373],[.033,.36,.045],'black lacquer');
  for(const y of[1.8383,2.1883])g.box([.58,y,-.373],[.49,.03,.045],'black lacquer');
  // Two-drawer pedestal with label holders, handles and the shift clipboard.
  g.box([-1.01,.66,-.74],[.51,.91,.57],'painted steel');
  for(const y of[.47,.88]){g.box([-1.01,y,-.446],[.46,.36,.023],'aged white paint');g.box([-1.01,y+.08,-.415],[.19,.028,.027],'black lacquer');g.box([-1.01,y-.02,-.417],[.14,.055,.008],'paper label');}
  g.box([-.85,1.155,-.63],[.32,.025,.39],'dark wood');g.box([-.85,1.172,-.63],[.27,.008,.33],'paper label');g.box([-.85,1.184,-.77],[.09,.014,.04],'painted steel');
  // Rear rota and incident sheets with actual pin heads and inset writing.
  g.box([-.72,2.28,-1.165],[.91,.62,.045],'worn wood');
  for(const[x,y,w,h]of[[-.95,2.34,.27,.31],[-.62,2.26,.22,.35],[-.39,2.35,.18,.24]]){g.box([x,y,-1.134],[w,h,.007],'paper label');g.box([x,y+h*.41,-1.125],[.011,.011,.007],'brass');for(let k=0;k<4;k++)g.box([x,y+.04-k*.035,-1.129],[w*.65,.004,.003],'dark wood');}
  // Hooked oilskin, folded inward so it never cuts the working guard's body.
  for(const y of[1.82,2.12])g.box([-1.235,y,-.57],[.07,.025,.07],'brass');
  g.box([-1.17,1.61,-.63],[.18,.72,.15],'dark wood');g.box([-1.18,1.97,-.65],[.27,.16,.17],'dark wood');
  // Biscuit tin and flask stand on the original work desk, not the window.
  g.box([.12,.935,-.70],[.26,.05,.16],'aged white paint');g.box([.12,.967,-.70],[.24,.012,.14],'safety red');
  g.lathe([[0,.91],[.065,.91],[.072,.94],[.072,1.18],[.060,1.20],[.06,1.24],[0,1.24]],'painted steel',{cx:.42,cz:-.78,segments:16});
  // Floor mat and wastebasket clear the guard's planted feet and hand routes.
  g.box([-.15,.207,.55],[1.48,.014,.67],'black lacquer');
  g.lathe([[.16,.205],[.19,.21],[.20,.56],[.185,.57],[.17,.23]],'painted steel',{cx:1.04,cz:.19,segments:16});
  for(const[x,z]of[[.98,.19],[1.06,.13],[1.10,.22]])g.box([x,.54,z],[.08,.05,.07],'paper label');
  g.finish();
  // A real slightly convex 4:3 phosphor face. No overlay or mirror surface.
  const face=mesh('yard_booth_tv_screen'),cx=.58,cy=2.0133333333,w=.4266666667,h=.32,z=-.356;
  for(let y=0;y<8;y++)for(let x=0;x<12;x++){
    const p=(u,v)=>{const dx=(u-.5)*2,dy=(v-.5)*2;return[cx+(u-.5)*w,cy+(v-.5)*h,z+.005*(1-dx*dx)*(1-dy*dy)];};
    face.quad([p(x/12,y/8),p((x+1)/12,y/8),p((x+1)/12,(y+1)/8),p(x/12,(y+1)/8)],'black lacquer');
  }
  face.finish();
  const m=root.listMeshes().find(m=>m.getName()==='yard_booth_tv_screen');
  for(const p of m.listPrimitives()){
    const pos=p.getAttribute('POSITION').getArray(),uv=[];
    for(let i=0;i<pos.length;i+=3)uv.push((pos[i]-(cx-w/2))/w,(pos[i+1]-(cy-h/2))/h);
    p.setAttribute('TEXCOORD_0',accessor(uv,'VEC2'));
  }
  m.setExtras({worldVideo:'booth-night-road',support:'CRT fascia on bracketed shelf',facing:'+Z'});
}
