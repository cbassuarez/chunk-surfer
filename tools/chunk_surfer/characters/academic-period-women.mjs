// Dated clothing for the existing canonical 1.70m female skeleton. These dates
// describe costume references, never the characters' lives or deaths.
// The full court trains/hoops are deliberately adapted to compact, stationary
// indoor silhouettes. Faces, body proportions and original rig are untouched.
export const ACADEMIC_PERIOD_WOMEN_CUTS=Object.freeze({
  celeste:Object.freeze({label:'1690–1700 mantua and petticoat',
    sources:['https://www.metmuseum.org/art/collection/search/81718','https://media.vam.ac.uk/media/documents/schools/v%26a-jacquelinewilson-map.pdf'],
    adaptation:'Compact winter mantua; shallow turned-back folds, no trailing train or court-width hoops. The Met object is catalogued late 17th century; the V&A comparative ensemble is dated 1690–1700.'}),
  agathe:Object.freeze({label:'1775–1785 caraco and petticoat',
    sources:['https://emuseum.colonialwilliamsburg.org/objects/9849/jacket-caraco'],
    adaptation:'Plain teal adaptation of the extant fitted chintz caraco: squared front, false stomacher, open thigh-length skirts, rounded tabs, kerchief and cuffed sleeves.'}),
  odette:Object.freeze({label:'1840–1845 day dress, apron and day cap',
    sources:['https://www.metmuseum.org/art/collection/search/108039','https://www.metmuseum.org/art/collection/search/102523'],
    adaptation:'Practical cotton day-dress interpretation with a separate waist apron and small linen cap; not a claim that either museum object was a staff uniform.'}),
  sabine:Object.freeze({label:'1809–1815 pelisse',
    sources:['https://www.metmuseum.org/art/collection/search/82141'],
    adaptation:'Slim ankle-length Empire coat, tabbed cape collar, puffed oversleeves and long undersleeves. The museum heading dates the object ca.1815 while its essay says about1809.'}),
});

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const mix=(a,b,t)=>a+(b-a)*t;
const pointMix=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

export function buildAcademicPeriodWoman(source,d,H){
  const cut=(d.id==='attendant'||d.id==='unfinished-visitor')?'agathe':d.id;
  if(!ACADEMIC_PERIOD_WOMEN_CUTS[cut])return[];
  const {geometry,tube,ellipsoid,normals,torsoWeights,retargetMesh,masters,clean}=H;
  const bones=new Map(source.bones.map((bone,index)=>[bone.name,{...bone,index}]));
  for(const name of ['pelvis','chest','head','upperarm_L','forearm_L','hand_L','upperarm_R','forearm_R','hand_R'])
    if(!bones.has(name))throw Error(`Period woman's clothing requires ${name}`);
  const pelvis=bones.get('pelvis').index,chest=bones.get('chest').index,head=bones.get('head').index;
  const meshes=[],push=(mesh,role)=>{mesh.role=role;meshes.push(mesh);return mesh;};
  const weighted=(mesh)=>torsoWeights(mesh,source);
  let fittedTorso=null;
  const frontSurface=(x,y,offset=.005)=>{
    if(!fittedTorso)return-.20-offset;
    const nearest=[];
    for(let i=0;i<fittedTorso.positions.length;i+=3){
      const [px,py,z]=fittedTorso.positions.slice(i,i+3);if(z>.025)continue;
      const distance=(px-x)**2+(py-y)**2;
      if(nearest.length<4||distance<nearest.at(-1).distance){
        nearest.push({distance,z});nearest.sort((a,b)=>a.distance-b.distance);if(nearest.length>4)nearest.pop();
      }
    }
    let sum=0,result=0;for(const p of nearest){const weight=1/(p.distance+.000001);sum+=weight;result+=p.z*weight;}
    return result/sum-offset;
  };

  // A ring skirt is one continuous cloth surface on pelvis/spine weights,
  // never split between thighs. Its high waist follows the bodice as it turns.
  function skirt(name,{top=1.06,hem=.105,waist=.176,waistDepth=.151,width=.28,depth=.224,fold=.008,backGather=0,opening=0,raisedFront=0,role='trouser'}={}){
    const p=[],indices=[],rows=16,segments=64;
    for(let j=0;j<=rows;j++)for(let k=0;k<=segments;k++){
      const t=j/rows,a=opening+(Math.PI*2-opening*2)*k/segments;
      const back=Math.max(0,-Math.cos(a)),pleat=1+fold*Math.cos(a*18)*smooth(t)*(backGather?back:1);
      const r=mix(waist,width,Math.pow(t,.72))*pleat;
      const z=mix(waistDepth,depth,Math.pow(t,.72))*pleat*(1+backGather*back*t);
      const frontLift=raisedFront*Math.pow(Math.max(0,Math.cos(a)),2)*t*t;
      p.push([Math.sin(a)*r,mix(top,hem,t)+frontLift,-Math.cos(a)*z+.008]);
      if(j&&k){const a=(j-1)*(segments+1)+k-1,b=j*(segments+1)+k-1;indices.push(a,a+1,b+1,a,b+1,b);}
    }
    return push(weighted(geometry(name,p,indices,pelvis)),role);
  }

  // The retained fitted torso gives actual shoulder/underarm coverage. Only
  // its cloth is recut; the anatomical shape and bind weights remain original.
  function bodice(name,{waist=1.07,hem=.99,neckline='closed',openBelowWaist=false,waistScale=.98}={}){
    const donor=clean.options[0].meshes.find(mesh=>mesh.name==='option1-continuous-tailored-coat');
    if(!donor)throw Error('Missing retained continuous torso for period recut');
    const mesh=retargetMesh(donor,clean,source,{height:source.height,width:1,depth:1});
    const original=mesh.positions.slice(),minY=Math.min(...original.filter((_,i)=>i%3===1));
    for(let i=0;i<mesh.positions.length;i+=3){
      const x=original[i],y=original[i+1],z=original[i+2],front=smooth((-z-.015)/.12);
      const lower=clamp((waist-y)/(waist-minY));
      const cinch=Math.exp(-(((y-waist)/.14)**2));
      mesh.positions[i]*=mix(1,.18/.22*waistScale,cinch);
      mesh.positions[i+2]=mix(z,(z-.023)*(.153/.223)+.008,cinch);
      if(y<waist){
        mesh.positions[i+1]=mix(waist,hem,lower);
        const a=Math.atan2(x,-(z-.023)),flare=cut==='agathe'?.040:cut==='celeste'?.012:.002;
        mesh.positions[i]=Math.sin(a)*(.18+flare*Math.pow(lower,.75));
        mesh.positions[i+2]=-Math.cos(a)*(.153+flare*.8*Math.pow(lower,.75))+.008;
      }
      if(neckline==='square'&&y>1.35){
        const lift=clamp((y-1.35)/.128),edge=1-.45*smooth((Math.abs(x)-.07)/.075);
        mesh.positions[i+1]-=.095*front*lift*edge;
      }
      if(cut==='odette'&&y<1.15&&y>waist-.025)
        mesh.positions[i+1]-=.032*front*Math.exp(-((x/.085)**2));
      if(cut==='agathe'&&lower>.7)
        mesh.positions[i+1]+=.018*Math.cos(Math.atan2(x,-z)*7)*smooth((lower-.7)/.3);
    }
    if(openBelowWaist){
      const filtered=[];
      for(let i=0;i<mesh.indices.length;i+=3){
        const tri=mesh.indices.slice(i,i+3),p=mul(tri.reduce((s,v)=>add(s,mesh.positions.slice(v*3,v*3+3)),[0,0,0]),1/3);
        if(p[1]<waist+.005&&p[2]<-.06&&Math.abs(p[0])<.075)continue;
        filtered.push(...tri);
      }mesh.indices=filtered;
    }
    mesh.name=name;fittedTorso=mesh;return push(normals(weighted(mesh)),'coat');
  }

  function band(name,y,rx,rz,role='trim',radius=.0045,bone=null){
    const mesh=tube(name,Array.from({length:65},(_,i)=>{
      const a=i*Math.PI*2/64;return[Math.sin(a)*rx,y,-Math.cos(a)*rz+.008];
    }),radius,bone??pelvis);
    return push(bone==null?weighted(mesh):mesh,role);
  }

  // Individual upper/lower arm weights follow the actual speaking IK. No
  // rigid torso-bone sleeves or unattached cuffs masquerade as historical cut.
  function sleeves(name,{length=1,puff=0,wideCuff=0,role='coat'}={}){
    for(const side of ['L','R']){
      const upper=bones.get(`upperarm_${side}`),fore=bones.get(`forearm_${side}`),hand=bones.get(`hand_${side}`);
      const radiusAt=t=>t<=1?mix(.066,.043,t)+puff*Math.sin(Math.PI*clamp(t/.7))**2:mix(.043,.031,t-1);
      const samples=[0,.12,.28,.46,.65,.82,1,1.1,1.3,1.55,1.8,1.98].filter(t=>t<=1+length);
      if(samples.at(-1)!==1+length)samples.push(1+length);
      const p=[],indices=[],weights=[],joints=[],segments=24;
      for(let row=0;row<samples.length;row++){
        const t=samples[row],isUpper=t<=1,along=isUpper?t:t-1;
        const a=isUpper?upper.head:fore.head,b=isUpper?fore.head:hand.head,center=pointMix(a,b,along);
        const direction=unit(sub(b,a)),right=unit(cross(direction,[0,0,1])),up=unit(cross(direction,right));
        const radius=radiusAt(t);
        const foreWeight=t<.82?0:t<=1?smooth((t-.82)/.18)*.5:mix(.5,1,smooth((t-1)/.16));
        for(let k=0;k<=segments;k++){
          const theta=k*Math.PI*2/segments,r=radius*(1+.015*Math.cos(theta*6));
          p.push(add(center,add(mul(right,Math.cos(theta)*r),mul(up,Math.sin(theta)*r))));
          joints.push(upper.index,fore.index,0,0);weights.push(1-foreWeight,foreWeight,0,0);
          if(row&&k){const q=(row-1)*(segments+1)+k-1,s=row*(segments+1)+k-1;indices.push(q,q+1,s+1,q,s+1,s);}
        }
      }
      const mesh=geometry(`${name} ${side}`,p,indices,upper.index);mesh.skinIndex=joints;mesh.skinWeight=weights;push(mesh,role);
      const last=1+length,end=last<=1?pointMix(upper.head,fore.head,last):pointMix(fore.head,hand.head,length);
      const direction=unit(last<=1?sub(fore.head,upper.head):sub(hand.head,fore.head));
      const right=unit(cross(direction,[0,0,1])),up=unit(cross(direction,right));
      const cuffRadius=radiusAt(last)+wideCuff;
      const ring=Array.from({length:49},(_,k)=>{
        const theta=k*Math.PI*2/48,ruffle=1+wideCuff*2*Math.cos(theta*12);
        return add(end,add(mul(right,Math.cos(theta)*cuffRadius*ruffle),mul(up,Math.sin(theta)*cuffRadius*ruffle)));
      });
      push(tube(`${name} bound cuff ${side}`,ring,wideCuff?.004:.003,last<=1?upper.index:fore.index),'trim');
    }
  }

  // The retained skin contains hands and only a short wrist underlap. A short
  // historical sleeve therefore needs real forearm skin, not just a sleeve
  // ending above a disconnected hand. Extend the actual open wrist boundary:
  // its final contour and four influences are identical to the original hand.
  function forearmContinuations(){
    const skin=source.meshes.find(mesh=>/anatomical-skin|ordinary-face-neck-anatomical-hands/.test(mesh.name));
    if(!skin)throw Error('Missing retained wrist anatomy for mantua forearms');
    const edges=new Map();
    for(let i=0;i<skin.indices.length;i+=3){
      const tri=skin.indices.slice(i,i+3);
      for(let j=0;j<3;j++){
        const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
        const record=edges.get(key);if(record)record.count++;else edges.set(key,{a,b,count:1});
      }
    }
    for(const side of ['L','R']){
      const fore=bones.get(`forearm_${side}`),hand=bones.get(`hand_${side}`),axis=unit(sub(hand.head,fore.head));
      const length=Math.hypot(...sub(hand.head,fore.head)),point=v=>skin.positions.slice(v*3,v*3+3);
      const along=p=>dot(sub(p,fore.head),axis)/length;
      const boundary=[...edges.values()].filter(edge=>edge.count===1&&[edge.a,edge.b].every(v=>{
        const p=point(v),t=along(p);return t>.85&&t<1.10&&Math.sign(p[0])===Math.sign(hand.head[0]);
      }));
      if(boundary.length<12||boundary.length>64)throw Error(`Invalid retained ${side} wrist boundary`);
      const next=new Map(boundary.map(edge=>[edge.a,edge.b])),loop=[boundary[0].a];
      while(loop.length<boundary.length){
        const v=next.get(loop.at(-1));if(v==null||loop.includes(v))throw Error(`Open ${side} wrist boundary`);
        loop.push(v);
      }
      if(next.get(loop.at(-1))!==loop[0])throw Error(`Unclosed ${side} wrist boundary`);
      const rows=[0,.08,.17,.28,.44,.62,.78,.90,1],p=[],indices=[],skinIndex=[],skinWeight=[];
      for(let row=0;row<rows.length;row++)for(let k=0;k<loop.length;k++){
        const t=rows[row],v=loop[k],wrist=point(v),wristT=along(wrist);
        const radial=sub(wrist,add(fore.head,mul(axis,wristT*length)));
        const scale=1+.65*Math.sin(t*Math.PI),radius=Math.hypot(...radial)*scale;
        const maxRadius=.036+.008*Math.sin(t*Math.PI),factor=radius>maxRadius?scale*maxRadius/radius:scale;
        const center=add(fore.head,mul(axis,mix(.10,wristT,t)*length));
        p.push(t===1?[...wrist]:add(center,mul(radial,factor)));
        const originalIndices=skin.skinIndex.slice(v*4,v*4+4),originalWeights=skin.skinWeight.slice(v*4,v*4+4);
        if(t===1){skinIndex.push(...originalIndices);skinWeight.push(...originalWeights);}
        else{
          const blend=smooth((t-.78)/.22),weights=new Map([[fore.index,1-blend]]);
          for(let slot=0;slot<4;slot++)if(originalWeights[slot]>0)
            weights.set(originalIndices[slot],(weights.get(originalIndices[slot])||0)+originalWeights[slot]*blend);
          const influences=[...weights].filter(([,weight])=>weight>0);
          if(influences.length>4)throw Error(`Too many ${side} forearm influences`);
          while(influences.length<4)influences.push([0,0]);
          skinIndex.push(...influences.map(([bone])=>bone));skinWeight.push(...influences.map(([,weight])=>weight));
        }
        if(row){
          const a=(row-1)*loop.length+k,b=(row-1)*loop.length+(k+1)%loop.length;
          const c=row*loop.length+(k+1)%loop.length,d=row*loop.length+k;
          indices.push(a,b,c,a,c,d);
        }
      }
      const mesh=geometry(`1690–1700 anatomical forearm continuation ${side}`,p,indices,fore.index);
      mesh.skinIndex=skinIndex;mesh.skinWeight=skinWeight;
      mesh.wristJoin={side,sourceMesh:skin.name,sourceVertexIndices:[...loop],
        continuationVertexIndices:loop.map((_,k)=>(rows.length-1)*loop.length+k),
        cuffUnderlapFraction:.10,cuffEndFraction:.23};
      push(mesh,'skin');
    }
  }

  function kerchief(name,{point=1.245,width=.168,z=-.213,role='shirt'}={}){
    const p=[[-.062,1.452,-.071],[-width,1.365,-.105],[0,point,z],
      [width,1.365,-.105],[.062,1.452,-.071],[0,1.414,-.152]];
    for(const v of p)v[2]=frontSurface(v[0],v[1],.006);
    const mesh=geometry(name,p,[2,1,0,5,2,0,3,2,5,4,3,5],chest);
    return push(weighted(mesh),role);
  }

  function stomacher(name,{top=1.355,bottom=1.063,width=.068,role='shirt'}={}){
    const middle=(top+bottom)/2;
    const p=[[-width,top,0],[width,top,0],[width*.9,middle,0],[width*.7,bottom+.015,0],
      [0,bottom-.035,0],[-width*.7,bottom+.015,0],[-width*.9,middle,0]];
    for(const v of p)v[2]=frontSurface(v[0],v[1],.007);
    push(weighted(geometry(name,p,[0,1,2,0,2,6,2,3,5,2,5,6,3,4,5],chest)),role);
    for(const sign of [-1,1]){
      const edge=[[sign*width,top,0],[sign*width*.9,middle,0],[sign*width*.7,bottom+.015,0],[0,bottom-.035,0]];
      for(const v of edge)v[2]=frontSurface(v[0],v[1],.010);
      push(weighted(tube(`${name} edge binding`,edge,.0026,chest)),'trim');
    }
  }

  function waistApron(){
    const p=[],indices=[],rows=12,columns=32;
    for(let j=0;j<=rows;j++)for(let k=0;k<=columns;k++){
      const t=j/rows,u=k/columns*2-1,a=u*.82,r=mix(.181,.276,Math.pow(t,.72)),depth=mix(.15,.229,Math.pow(t,.72));
      p.push([Math.sin(a)*r,mix(1.065,.205,t),-Math.cos(a)*(depth+.009)+.008]);
      if(j&&k){const a=(j-1)*(columns+1)+k-1,b=j*(columns+1)+k-1;indices.push(a,a+1,b+1,a,b+1,b);}
    }
    push(weighted(geometry('1840–1845 separate broad cotton waist apron',p,indices,pelvis)),'shirt');
    band('1840–1845 apron waist tie',1.068,.183,.158,'shirt',.006);
    const y=.202,hem=[];for(let k=0;k<=32;k++){const a=(k/32*2-1)*.82;hem.push([Math.sin(a)*.276,y,-Math.cos(a)*.238+.008]);}
    push(tube('1840–1845 apron turned bottom hem',hem,.0032,pelvis),'trim');
  }

  function dayCap(){
    const origin=bones.get('head').head,p=[[origin[0],origin[1]+.173,origin[2]+.008]],indices=[],segments=64,rows=14;
    for(let j=1;j<=rows;j++)for(let k=0;k<segments;k++){
      const a=k*Math.PI*2/segments,front=Math.max(0,Math.cos(a)),end=1.93-.73*front,t=end*j/rows;
      p.push([origin[0]+Math.sin(a)*Math.sin(t)*.086,origin[1]+.082+Math.cos(t)*.091,
        origin[2]+.008-Math.cos(a)*Math.sin(t)*.087]);
      const v=1+(j-1)*segments+k,n=1+(j-1)*segments+(k+1)%segments;
      if(j===1)indices.push(0,n,v);else{const b=v-segments,bn=n-segments;indices.push(b,bn,n,b,n,v);}
    }
    push(geometry('1840–1845 fitted linen day cap crown',p,indices,head),'shirt');
    const edge=p.slice(-segments).map((v,i)=>add(v,[0,.002*Math.sin(i*Math.PI*2/4),0]));edge.push(edge[0]);
    push(tube('1840–1845 narrow gathered cap edging',edge,.004,head),'trim');
  }

  function tabbedCapeCollar(){
    const p=[],indices=[],segments=64,profiles=[{y:1.457,x:.071,z:.062},{y:1.391,x:.177,z:.12},{y:1.327,x:.239,z:.16}];
    for(let j=0;j<profiles.length;j++)for(let k=0;k<=segments;k++){
      const a=.30+(Math.PI*2-.60)*k/segments,r=profiles[j];
      const tab=j===2?(.010*Math.sign(Math.cos(a*8))):0;
      p.push([Math.sin(a)*r.x,r.y+tab,-Math.cos(a)*r.z+.006]);
      if(j&&k){const q=(j-1)*(segments+1)+k-1,s=j*(segments+1)+k-1;indices.push(q,q+1,s+1,q,s+1,s);}
    }
    push(geometry('1809–1815 pelisse short tabbed cape collar',p,indices,chest),'coat');
    push(tube('1809–1815 cape collar contrasting bound edge',p.slice(-65),.003,chest),'trim');
  }

  if(cut==='celeste'){
    skirt('1690–1700 mantua contrasting continuous petticoat',{top:1.068,width:.278,depth:.225,fold:.009});
    bodice('1690–1700 winter mantua fitted upper robe',{hem:.995,neckline:'square'});
    skirt('1690–1700 turned-back mantua skirts adapted without a train',{
      top:1.075,hem:.135,width:.285,depth:.239,fold:.016,opening:.56,raisedFront:.27,role:'coat'});
    sleeves('1690–1700 elbow-length mantua sleeve',{length:.23,puff:.014,wideCuff:.016});
    forearmContinuations();
    kerchief('1690–1700 modest linen neckcloth',{point:1.325,width:.160,z:-.221});
    band('1690–1700 mantua waist binding',1.074,.184,.155,'trim',.004);
  }else if(cut==='agathe'){
    skirt('1775–1785 caraco separate compact petticoat',{top:1.075,width:.267,depth:.214,fold:.008});
    bodice('1775–1785 fitted caraco with open thigh-length rounded skirts',{
      waist:1.083,hem:.815,neckline:'square',openBelowWaist:true,waistScale:.975});
    sleeves('1775–1785 fitted long caraco sleeve',{length:.91,wideCuff:.004});
    stomacher('1775–1785 sewn-in caraco false stomacher',{top:1.361,bottom:1.076});
    kerchief('1775–1785 caraco kerchief retained across squared neckline',{point:1.267,width:.171,z:-.227});
    band('1775–1785 caraco natural waist binding',1.085,.181,.155,'trim',.004);
    if(d.id==='agathe'){
      // A modest three-bow arrangement, not the five modern front coat buttons.
      for(const y of [1.30,1.23,1.16]){
        const z=frontSurface(0,y,.013);
        const knot=[[0,y+.004,z],[0,y-.004,z],[-.005,y,z],[.005,y,z],[0,y,z-.004],[0,y,z+.004]];
        push(weighted(geometry('1775–1785 small stomacher ribbon knot',knot,
          [0,3,4,0,5,3,0,2,5,0,4,2,1,4,3,1,3,5,1,5,2,1,2,4],chest)),'trim');
        for(const side of [-1,1])push(weighted(tube('1775–1785 short ribbon loop',[[0,y,z],[side*.016,y+.005,z-.002],[side*.021,y,z-.003],[0,y,z-.001]],.0026,chest)),'trim');
      }
    }
  }else if(cut==='odette'){
    skirt('1840–1845 compact full cotton day-dress skirt',{top:1.065,width:.269,depth:.228,fold:.010});
    bodice('1840–1845 long pointed day-dress bodice',{waist:1.075,hem:1.025,waistScale:.98});
    sleeves('1840–1845 fitted long day-dress sleeve',{length:.95,puff:.002,wideCuff:.002});
    kerchief('1840–1845 small plain linen collar',{point:1.364,width:.145,z:-.209});
    waistApron();dayCap();
  }else if(cut==='sabine'){
    skirt('1809–1815 high-waisted gored pelisse skirt gathered at back',{
      top:1.235,hem:.13,waist:.177,width:.250,depth:.210,fold:.010,backGather:.08,role:'coat'});
    bodice('1809–1815 fitted pelisse upper bodice',{waist:1.235,hem:1.213,waistScale:.995});
    sleeves('1809–1815 long fitted pelisse undersleeve',{length:.98,puff:0,wideCuff:.001});
    sleeves('1809–1815 short puffed pelisse oversleeve',{length:-.43,puff:.026,wideCuff:.006,role:'coat'});
    tabbedCapeCollar();
    kerchief('1809–1815 pale inset above pelisse front opening',{point:1.355,width:.105,z:-.202});
    push(weighted(tube('1809–1815 raised Empire waist piping',Array.from({length:65},(_,k)=>{
      const a=k*Math.PI*2/64;return[Math.sin(a)*.182,1.239,-Math.cos(a)*.151+.008];
    }),.006,chest)),'trim');
    push(weighted(tube('1809–1815 contrasting centre-front pelisse piping',[[0,1.24,-.15],[0,.98,-.172],[0,.64,-.197],[0,.132,-.208]],.003,chest)),'trim');
  }
  for(const mesh of meshes){
    mesh.role=mesh.role.trim();
    if(mesh.positions.some(v=>!Number.isFinite(v)))throw Error(`Non-finite ${mesh.name}`);
    // Remove the donor vertices discarded by an open caraco front. Unused
    // vertices otherwise enlarge bounds and retain meaningless zero normals.
    const used=[...new Set(mesh.indices)],map=new Map(used.map((v,i)=>[v,i]));
    for(const [field,width]of [['positions',3],['normals',3],['skinIndex',4],['skinWeight',4]])
      mesh[field]=used.flatMap(v=>mesh[field].slice(v*width,v*width+width));
    mesh.indices=mesh.indices.map(v=>map.get(v));
    if(mesh.wristJoin)mesh.wristJoin.continuationVertexIndices=mesh.wristJoin.continuationVertexIndices.map(v=>map.get(v));
    mesh.costumeReference=ACADEMIC_PERIOD_WOMEN_CUTS[cut].label;
  }
  return meshes;
}
