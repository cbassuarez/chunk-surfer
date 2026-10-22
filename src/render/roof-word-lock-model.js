const TAU=Math.PI*2,LETTERS=26;
const dimensions=Object.freeze({width:.64,height:.27,drumRadius:.10,drumWidth:.052,drumPitch:.069,drumZ:.04,faceZ:.155,apertureHeight:.046});

function surface(width,height){
  const canvas=typeof document!=='undefined'?document.createElement('canvas'):new OffscreenCanvas(width,height);
  canvas.width=width;canvas.height=height;return canvas;
}
function random(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function paintTexture(THREE,{seed=1,door=false}={}){
  const canvas=surface(256,256),ctx=canvas.getContext('2d'),rng=random(seed);
  ctx.fillStyle=door?'#394238':'#586052';ctx.fillRect(0,0,256,256);
  for(let i=0;i<4200;i++){
    const light=rng()>.53,x=rng()*256,y=rng()*256;
    ctx.fillStyle=light?'rgba(169,170,137,.045)':'rgba(5,17,10,.055)';
    ctx.fillRect(x,y,.6+rng()*2,.5+rng()*2);
  }
  // Soft vertical streaks; paint wear is subordinate to the metal silhouette.
  for(let i=0;i<35;i++){
    const x=rng()*256,y=rng()*256;
    ctx.fillStyle='rgba(13,21,13,.035)';ctx.fillRect(x,y,.5+rng(),10+rng()*53);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}
function letterTexture(THREE){
  const tileW=128,tileH=128,canvas=surface(tileW*LETTERS,tileH),ctx=canvas.getContext('2d'),rng=random(6947);
  for(let i=0;i<LETTERS;i++){
    const x=i*tileW;
    ctx.fillStyle=i%3===0?'#d9d1b4':'#dcd5ba';ctx.fillRect(x,0,tileW,tileH);
    ctx.fillStyle='rgba(68,57,31,.07)';ctx.fillRect(x,0,tileW,2);ctx.fillRect(x,tileH-2,tileW,2);
    for(let n=0;n<50;n++){
      ctx.fillStyle=n%4?'rgba(72,65,36,.035)':'rgba(255,249,211,.18)';
      ctx.fillRect(x+rng()*tileW,rng()*tileH,.5+rng()*1.3,.5+rng()*1.5);
    }
    // Real faces on the drum: the cap height is 17 mm, width at most 21 mm.
    const letter=String.fromCharCode(65+i);ctx.save();ctx.translate(x+tileW/2,tileH*.52);
    ctx.font='600 112px Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const measured=ctx.measureText(letter).width;ctx.scale(Math.min(1,52/Math.max(1,measured)),1);
    ctx.fillStyle='#f4edd0';ctx.fillText(letter,.6,1);
    ctx.fillStyle='#192119';ctx.fillText(letter,0,0);ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=8;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  return texture;
}
function facets(THREE,width,radius){
  const positions=[],normals=[],uv=[],indices=[];
  for(let k=0;k<LETTERS;k++){
    const theta=-k*TAU/LETTERS,lo=theta-Math.PI/LETTERS,hi=theta+Math.PI/LETTERS;
    const y0=radius*Math.sin(lo),z0=radius*Math.cos(lo),y1=radius*Math.sin(hi),z1=radius*Math.cos(hi),at=positions.length/3;
    positions.push(-width/2,y0,z0,width/2,y0,z0,width/2,y1,z1,-width/2,y1,z1);
    for(let i=0;i<4;i++)normals.push(0,Math.sin(theta),Math.cos(theta));
    const l=(k+.007)/LETTERS,r=(k+.993)/LETTERS;
    uv.push(l,0,r,0,r,1,l,1);indices.push(at,at+1,at+2,at,at+2,at+3);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function combined(THREE,parts){
  const positions=[],normals=[],uv=[];
  for(const part of parts){
    let geometry=part.geometry.clone();if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    const transform=new THREE.Matrix4().compose(new THREE.Vector3(...(part.at||[0,0,0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation||[0,0,0]))),new THREE.Vector3(1,1,1));
    geometry.applyMatrix4(transform);
    const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),u=geometry.getAttribute('uv');
    for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));uv.push(u?.getX(i)||0,u?.getY(i)||0);}
    geometry.dispose();
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// A door-mounted mechanism in metres, facing +Z. The drums are real 26-facet
// cylinders, never planes carrying a UI. Rotate each returned wheel about X by
// -detents * 2π/26: an upward drag brings the next letter up to the sightline.
// The returned handle pivots about local Z at its spindle. Invisible picking
// meshes remain raycastable and carry {kind,index}; their surfaces do not draw.
export function buildRoofWordLockModel(THREE,{RoundedBoxGeometry}={}){
  const group=new THREE.Group();group.name='north-gallery-service-lock';
  const textures=new Set(),materials=new Set(),geometries=new Set(),sources=new Set();
  const texture=value=>(textures.add(value),value);
  const material=options=>{const value=new THREE.MeshStandardMaterial(options);materials.add(value);return value;};
  const paintMap=texture(paintTexture(THREE,{seed:38})),doorMap=texture(paintTexture(THREE,{seed:123,door:true}));
  const paint=material({color:0xaaaaaa,map:paintMap,metalness:.34,roughness:.66});
  const doorPaint=material({color:0x9caa9f,map:doorMap,metalness:.27,roughness:.77});
  const dark=material({color:0x121a16,metalness:.55,roughness:.64});
  const edge=material({color:0x7b806d,metalness:.76,roughness:.4});
  const brass=material({color:0x9d8960,metalness:.86,roughness:.36});
  const brassDark=material({color:0x514a33,metalness:.75,roughness:.55});
  const steel=material({color:0x8c9286,metalness:.85,roughness:.3});
  const oxide=material({color:0x483b29,metalness:.13,roughness:.93});
  const enamel=material({color:0xffffff,map:texture(letterTexture(THREE)),metalness:.09,roughness:.61});
  const hitMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});materials.add(hitMaterial);
  const box=(w,h,d,r=0)=>{const g=RoundedBoxGeometry&&r?new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/2,h/2,d/2)):new THREE.BoxGeometry(w,h,d);sources.add(g);return g;};
  const cylinder=(r,h,segments=24)=>{const g=new THREE.CylinderGeometry(r,r,h,segments,1,false);sources.add(g);return g;};
  const batch=(parent,name)=>{
    const entries=new Map();
    return {
      add(geometry,mat,at=[0,0,0],rotation=[0,0,0]){const parts=entries.get(mat)||[];parts.push({geometry,at,rotation});entries.set(mat,parts);},
      finish(){for(const [mat,parts]of entries){const g=combined(THREE,parts);geometries.add(g);const m=new THREE.Mesh(g,mat);m.name=`${name}-${mat===paint?'paint':mat===brass?'brass':mat===dark?'recess':mat===doorPaint?'door':mat===steel?'steel':'metal'}`;parent.add(m);}},
    };
  };
  const fixed=batch(group,'fixed');
  // Architectural backing closes wide camera frusta behind the actual door;
  // the inspection can never reveal the frozen room through an alpha sliver.
  fixed.add(box(8,5,.08),dark,[0,0,-.235]);
  // The door extends beyond the inspection camera, with an actual welded stile,
  // recessed seam, hinge leaves and old fixing holes rather than a card border.
  fixed.add(box(2.04,2.20,.056,.004),doorPaint,[0,0,-.123]);
  for(const x of[-.88,.88]){
    fixed.add(box(.045,2.20,.026,.003),paint,[x,0,-.084]);
    fixed.add(box(.004,2.17,.005),dark,[x+(x<0?.026:-.026),0,-.068]);
  }
  for(const y of[-.92,.92])fixed.add(box(1.79,.042,.019,.002),paint,[0,y,-.082]);
  for(const y of[-.66,.65]){
    fixed.add(box(.092,.13,.008,.003),edge,[-.884,y,-.061]);
    fixed.add(cylinder(.013,.16,20),dark,[-.94,y,-.047]);
  }
  // Oxide follows water and fasteners. The broad panel retains its paint.
  for(let i=0;i<12;i++)fixed.add(box(.0015,.035+(i%3)*.012,.0005),oxide,[.87+(i%3)*.002,-.61+i*.109,-.0675]);
  for(const x of[-.294,.294])for(const y of[-.105,.105]){
    fixed.add(cylinder(.0105,.0014,16),oxide,[x,y,.156],[Math.PI/2,0,0]);
    fixed.add(cylinder(.0072,.0045,20),steel,[x,y,.160],[Math.PI/2,0,0]);
    fixed.add(box(.0083,.0013,.0005),dark,[x,y,.1626],[0,0,x>0?.37:-.21]);
  }
  // Housing/backplate, side cheeks and separate pressed cover strips leave
  // physically open apertures. They mask the drums' hidden circumference.
  fixed.add(box(.653,.283,.009,.004),dark,[0,0,-.081]);
  fixed.add(box(.64,.27,.014,.003),paint,[0,0,-.071]);
  for(const x of[-.314,.314])fixed.add(box(.012,.27,.225,.003),paint,[x,0,.0435]);
  const openingH=dimensions.apertureHeight,stripH=(dimensions.height-openingH)/2;
  for(const sign of[-1,1]){
    fixed.add(box(.64,stripH,.021,.003),paint,[0,sign*(openingH/2+stripH/2),.145]);
    fixed.add(box(.632,.004,.006,.001),edge,[0,sign*(openingH/2+.002),.158]);
    fixed.add(box(.64,.011,.204,.002),paint,[0,sign*.1295,.036]);
  }
  // Solid right-hand cover and narrow webs around each drum opening.
  fixed.add(box(.197,openingH,.021,.002),paint,[.2155,0,.145]);
  fixed.add(box(.016,openingH,.021,.001),paint,[-.312,0,.145]);
  const wheels=[],targets=[],first=-.2625;
  const drumGeometry=facets(THREE,dimensions.drumWidth,dimensions.drumRadius);geometries.add(drumGeometry);
  const wheelParts=[];
  for(const x of[-.0295,.0295]){
    wheelParts.push({geometry:cylinder(.103,.0045,52),at:[x,0,0],rotation:[0,0,Math.PI/2]});
    for(let k=0;k<52;k++){
      const theta=k*TAU/52;
      wheelParts.push({geometry:box(.0045,.0035,.0028),at:[x,.103*Math.sin(theta),.103*Math.cos(theta)],rotation:[-theta,0,0]});
    }
  }
  const rimGeometry=combined(THREE,wheelParts);geometries.add(rimGeometry);
  const axleGeometry=cylinder(.017,.066,20);
  for(let i=0;i<6;i++){
    const x=first+i*dimensions.drumPitch,pivot=new THREE.Group();pivot.name=`alphabet-drum-${i+1}`;pivot.position.set(x,0,dimensions.drumZ);
    const faces=new THREE.Mesh(drumGeometry,enamel);faces.name=`enamel-faces-${i+1}`;pivot.add(faces);
    const rims=new THREE.Mesh(rimGeometry,brass);rims.name=`knurled-brass-rims-${i+1}`;pivot.add(rims);group.add(pivot);wheels.push(pivot);
    fixed.add(axleGeometry,brassDark,[x,0,dimensions.drumZ],[0,0,Math.PI/2]);
    if(i<5)fixed.add(box(.008,openingH,.022,.001),paint,[x+dimensions.drumPitch/2,0,.147]);
    // A small three-dimensional witness tooth meets the central inscription.
    const shape=new THREE.Shape();shape.moveTo(0,-.0032);shape.lineTo(.0048,0);shape.lineTo(0,.0032);shape.closePath();
    const tooth=new THREE.ExtrudeGeometry(shape,{depth:.0012,bevelEnabled:false});sources.add(tooth);
    fixed.add(tooth,dark,[x-.033,0,.160]);
    const hit=new THREE.Mesh(box(.056,.060,.003),hitMaterial);hit.position.set(x,0,.161);hit.name=`wheel-hit-${i}`;
    hit.userData={kind:'wheel',index:i,axis:'x',detentRadians:TAU/LETTERS};group.add(hit);targets.push(hit);geometries.add(hit.geometry);
  }
  // Lever spindle, escutcheon and hand-polished grip are a separate mechanism.
  fixed.add(box(.080,.209,.013,.009),brassDark,[.236,0,.165]);
  fixed.add(box(.066,.195,.005,.006),steel,[.236,0,.173]);
  for(const y of[-.081,.081]){
    fixed.add(cylinder(.0047,.003,16),brass,[.236,y,.178],[Math.PI/2,0,0]);
    fixed.add(box(.0058,.0012,.0004),dark,[.236,y,.1796]);
  }
  const handle=new THREE.Group();handle.name='service-lock-handle';handle.position.set(.236,.044,.190);group.add(handle);
  const moving=batch(handle,'lever');
  moving.add(cylinder(.018,.024,32),steel,[0,0,0],[Math.PI/2,0,0]);
  moving.add(box(.020,.111,.020,.007),steel,[0,-.049,.020]);
  moving.add(box(.059,.024,.027,.009),steel,[0,-.105,.023]);
  moving.add(box(.037,.003,.002,.001),brass,[0,-.109,.037]);moving.finish();
  const handleTarget=new THREE.Mesh(box(.115,.228,.074),hitMaterial);handleTarget.name='handle-hit';handleTarget.position.set(.236,0,.211);handleTarget.userData={kind:'handle'};group.add(handleTarget);geometries.add(handleTarget.geometry);
  // A sliding brass index tab makes keyboard/controller selection visible on
  // the mechanism itself. It rides below the windows, never over the letters.
  const indexShape=new THREE.Shape();indexShape.moveTo(-.005,-.003);indexShape.lineTo(.005,-.003);indexShape.lineTo(0,.006);indexShape.closePath();
  const indexGeometry=new THREE.ExtrudeGeometry(indexShape,{depth:.002,bevelEnabled:false});geometries.add(indexGeometry);
  const selection=new THREE.Mesh(indexGeometry,brass);selection.name='selected-wheel-index';selection.position.set(first,-.049,.160);group.add(selection);
  fixed.finish();
  // Temporary primitives have been baked into material batches. Hit geometries
  // remain live, and shared wheel geometry is disposed exactly once.
  for(const source of sources)if(!geometries.has(source))source.dispose();
  group.updateMatrixWorld(true);
  let triangles=0,meshes=0;group.traverse(object=>{if(object.isMesh){meshes++;if(object.material!==hitMaterial)triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;}});
  const diagnostics={dimensions:{...dimensions},wheelCentres:wheels.map(w=>w.position.toArray()),wheelAxis:'x',handleAxis:'z',lettersPerDrum:LETTERS,
    atlasSize:[128*LETTERS,128],triangles,visibleMeshes:meshes-7,hitMeshes:7,materials:materials.size,textures:textures.size,
    aperture:{height:openingH,frontZ:.155,letterFrontZ:dimensions.drumZ+dimensions.drumRadius},doorBounds:{width:2.04,height:2.20,frontZ:-.095}};
  let disposed=false;
  return {group,wheels,handle,targets,handleTarget,selection,diagnostics,dispose(){
    if(disposed)return;disposed=true;for(const geometry of geometries)geometry.dispose();for(const value of materials)value.dispose();for(const value of textures)value.dispose();
  }};
}
