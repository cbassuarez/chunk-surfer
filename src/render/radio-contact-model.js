// Original project geometry, in metres. The shoulder taper, lower speaker,
// keypad and paired top controls follow scripts/item-model-details.mjs:130.
// +Y is up; +Z is the face toward the player. Animation is supplied by the
// owning radio scene; this model does not install a clock or change game state.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number.isFinite(Number(v)) ? Number(v) : a));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const RADIO_CONTACT_STRAP_LENGTH = .315;
export const RADIO_CONTACT_BOUNDS = freeze({
  body: { width: .105, height: .180, depth: .055, min: [-.0525, -.09, -.0275], max: [.0525, .09, .0275] },
  total: { min: [-.059, -.116, -.049], max: [.070, .229, .039], width: .129, height: .345, depth: .088 },
});
export const RADIO_CONTACT_CONTROLS = freeze({
  ptt: { position: [-.058, .027, .001], normal: [-1, 0, 0], radius: .017 },
  // The fingers contact the top, while the pointer picks the visible fluted
  // body. These are intentionally different physical points on the same part.
  channel: { position: [.030, .111, .005], normal: [0, 1, 0], radius: .010,
    pickCenter: [.030, .101, .004], pickBounds: { min: [.0195, .0895, -.0065], max: [.0405, .1112, .0145] } },
  volume: { position: [.003, .107, .004], normal: [0, 1, 0], radius: .009,
    pickCenter: [.003, .097, .004], pickBounds: { min: [-.006, .0855, -.005], max: [.012, .1072, .013] } },
  battery: { position: [.034, -.072, -.044], normal: [0, 0, -1], radius: .021 },
  confirm: { position: [-.024, .019, .0322], normal: [0, 0, 1], radius: .010 },
  select: { position: [0, .019, .0322], normal: [0, 0, 1], radius: .010 },
  back: { position: [.024, .019, .0322], normal: [0, 0, 1], radius: .010 },
  previous: { position: [-.0553, -.007, 0], normal: [-1, 0, 0], radius: .008 },
  next: { position: [-.0553, -.025, 0], normal: [-1, 0, 0], radius: .008 },
  ...Object.fromEntries(['1','2','3','4','5','6','7','8','9','*','0','#'].map((key,i)=>[
    `key:${key}`,{position:[-.024+(i%3)*.024,-.001-Math.floor(i/3)*.015,.0322],normal:[0,0,1],radius:.010},
  ])),
});

const SEGMENTS = [[0,.0075,.008,.0021], [.0047,.0038,.002,.0056], [.0047,-.0038,.002,.0056], [0,-.0075,.008,.0021], [-.0047,-.0038,.002,.0056], [-.0047,.0038,.002,.0056], [0,0,.008,.0021]];
const DIGITS = ['1111110','0110000','1101101','1111001','0110011','1011011','1011111','1110000','1111111','1111011'];
const KEY_GLYPHS = {
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'],'3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'],'5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'],'7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'],'9':['111','101','111','001','111'],
  '*':['000','101','010','101','000'],'#':['101','111','101','111','101'],
  confirm:['001','001','101','110','010'],back:['010','100','111','100','010'],select:['000','010','111','010','000'],
  R:['110','101','110','101','101'],X:['101','101','010','101','101'],T:['111','010','010','010','010'],
};

export function buildRadioContactModel() {
  const group = new THREE.Group(); group.name = 'carried channel radio';
  const geometries = new Set(), materials = new Set(), cache = new Map();
  let disposed = false, revision = 0, channel = 2, lastFrame = {};
  const physical = (color, roughness = .8, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); materials.add(m); return m;
  };
  const mat = {
    rubber: physical('#283329', .94), shell: physical('#56634b', .79, .09), edge: physical('#7b866e', .65, .16),
    dark: physical('#101a13', .84), steel: physical('#a6ad99', .4, .72), brass: physical('#a68d52', .48, .65),
    ink: physical('#d5d4b5', .85), screen: physical('#101c14', .90),
    segment: physical('#9eaf76', .65), dormant: physical('#19261a', .92), lens: physical('#b2c39c', .28),
    button: physical('#4e5b46', .9), red: physical('#8e5145', .86), green: physical('#82926a', .8),
    led: physical('#a9c78a', .38), strap: physical('#202b24', 1),
  };
  mat.led.emissive.set('#7f9e5e'); mat.led.emissiveIntensity = .15;
  mat.screen.emissive.set('#233723');
  mat.segment.emissive.set('#b2e283');
  mat.lens.transparent=true;mat.lens.opacity=.045;mat.lens.depthWrite=false;
  function geo(key, build) { if (!cache.has(key)) { const g = build(); cache.set(key, g); geometries.add(g); } return cache.get(key); }
  function add(name, geometry, material, position = [0,0,0], parent = group, rotation) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function box(name, size, position, material, radius = .001, parent = group, rotation) {
    const r = Math.min(radius, ...size.map(v => v / 3));
    return add(name, geo(`box:${size}:${r}`, () => r > 0 ? new RoundedBoxGeometry(...size, 1, r) : new THREE.BoxGeometry(...size)), material, position, parent, rotation);
  }
  function cylinder(name, radius, height, position, material, parent = group, radiusTop = radius, rotation) {
    return add(name, geo(`cyl:${radius}:${height}:${radiusTop}`, () => new THREE.CylinderGeometry(radiusTop, radius, height, 20, 1)), material, position, parent, rotation);
  }
  function plate(name, points, depth, z, material, bevel = .001, parent = group) {
    const shape = new THREE.Shape(); points.forEach(([x,y], i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y)); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: bevel > 0, bevelThickness: bevel,
      bevelSize: bevel, bevelSegments: 2, curveSegments: 8 }); g.translate(0,0,-depth/2); geometries.add(g);
    return add(name, g, material, [0,0,z], parent);
  }
  function keyLegend(key,id) {
    const cubes=[];KEY_GLYPHS[id].forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1'){
      const cube=new THREE.BoxGeometry(.00105,.00105,.0002);cube.translate((x-1)*.0014,(2-y)*.0014,.0022);cubes.push(cube);
    }}));
    const geometry=mergeGeometries(cubes);cubes.forEach(g=>g.dispose());geometries.add(geometry);
    add(`engraved key legend ${id}`,geometry,mat.ink,[0,0,0],key);
  }
  const shell = plate('shoulder-tapered moulded chassis', [[-.044,-.088],[-.051,-.070],[-.051,.063],[-.040,.085],[.035,.085],[.048,.062],[.050,-.069],[.042,-.088]], .044, 0, mat.rubber, .002);
  plate('olive faceplate rolled lip', [[-.039,-.080],[-.041,.058],[-.031,.073],[.030,.073],[.039,.056],[.040,-.080]], .004, .024, mat.edge, .0012);
  plate('inset enamel front', [[-.035,-.076],[-.037,.055],[-.028,.067],[.027,.067],[.035,.053],[.036,-.076]], .0015, .027, mat.shell, .0005);
  // The front lip masks the recessed substrate at an angle. The polarizer,
  // electrodes and cover are independent planes carried by the same chassis.
  const apertureY=.046, apertureWidth=.058, apertureHeight=.023, inkZ=.0308, coverZ=.0338;
  const outline=(w,h)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
  const [outer,inner]=[outline(.069,.034),outline(apertureWidth,apertureHeight)];
  const wall=outer.flatMap(([x,y],i)=>{
    const j=(i+1)%outer.length;
    const a=[x,y,coverZ],b=[...outer[j],coverZ],c=[...inner[j],inkZ],d=[...inner[i],inkZ];
    return [a,b,c,a,c,d].flat();
  });
  const gasket=new THREE.BufferGeometry();
  gasket.setAttribute('position',new THREE.Float32BufferAttribute(wall,3));
  const uv=[];
  for(let i=0;i<wall.length;i+=3)uv.push(wall[i]/.069+.5,wall[i+1]/.034+.5);
  gasket.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  gasket.computeVertexNormals();geometries.add(gasket);
  add('LCD rubber gasket',gasket,mat.dark,[0,apertureY,0]);
  const screen = box('channel LCD substrate', [apertureWidth+.001,apertureHeight+.001,.0013], [0,apertureY,.0299], mat.screen, .0005);
  const lens = box('LCD front cover', [apertureWidth,apertureHeight,.0005], [0,apertureY,coverZ-.00025], mat.lens, 0);
  lens.castShadow=false;lens.receiveShadow=false;
  const display = new THREE.Group(); display.name = 'physical channel LCD segments'; group.add(display);
  const dormant=new THREE.Group();dormant.name='unlit LCD electrodes';display.add(dormant);
  const digits = [];
  for (const x of [-.003,.010]) {
    const segments = SEGMENTS.map(([dx,dy,w,h], i) => {
      box('unlit LCD segment',[w,h,.00016],[x+dx,apertureY+dy,inkZ-.00003],mat.dormant,0,dormant);
      return box(`LCD digit segment ${digits.length}:${i}`,[w,h,.0002],[x+dx,apertureY+dy,inkZ+.00008],mat.segment,0,display);
    });
    digits.push(segments);
  }
  const glyphs = { C:['111','100','100','100','111'], H:['101','101','111','101','101'] };
  for (const [letter,x] of [['C',-.024],['H',-.0175]]) glyphs[letter].forEach((row,y) => [...row].forEach((v,col) => { if (v==='1') box(`LCD CH ${letter}`, [.00105,.0011,.0002], [x+col*.0015,.049-y*.0016,inkZ], mat.segment, 0, display); }));
  for (let i=0;i<4;i++) box('LCD battery segment', [.0022,.0011,.0002], [.020+i*.0022,.053,inkZ], mat.segment, 0, display);
  function statusMark(text) {
    const state=new THREE.Group();state.name=`LCD ${text} carrier mark`;display.add(state);const cubes=[];
    [...text].forEach((letter,i)=>KEY_GLYPHS[letter].forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1'){
      const cube=new THREE.BoxGeometry(.00065,.00065,.0002);cube.translate(-.024+i*.0035+x*.00085,.038-y*.00085,inkZ);cubes.push(cube);
    }})));
    const geometry=mergeGeometries(cubes);cubes.forEach(g=>g.dispose());geometries.add(geometry);add(`LCD ${text} ink`,geometry,mat.segment,[0,0,0],state);return state;
  }
  const receiveMark=statusMark('RX'),transmitMark=statusMark('TX');
  const keys = [],keyNames=[];
  for (const [i,x] of [-.024,0,.024].entries()) {
    const key = box(`function key ${i+1}`, [.017,.010,.004], [x,.019,.030], i===0 ? mat.green : i===2 ? mat.red : mat.dark, .0018); keys.push(key);const id=i===0?'confirm':i===2?'back':'select';keyNames.push(id);keyLegend(key,id);
  }
  for (let row=0;row<4;row++) for (let col=0;col<3;col++) {
    const x=-.024+col*.024, y=-.001-row*.015;
    box(`keypad recess ${row*3+col+1}`, [.021,.012,.002], [x,y,.028], mat.dark, .0018);
    const key=box(`keypad rubber key ${row*3+col+1}`, [.018,.010,.004], [x,y,.030], mat.button, .0017);keys.push(key);
    const id=['1','2','3','4','5','6','7','8','9','*','0','#'][row*3+col];keyNames.push(`key:${id}`);keyLegend(key,id);
  }
  box('lower speaker recessed cavity', [.064,.026,.003], [0,-.067,.029], mat.dark, .002);
  for (let i=0;i<5;i++) box(`lower speaker moulded bridge ${i}`, [.056-i*.002,.0014,.002], [0,-.056-i*.005,.031], mat.rubber, .0004);
  for (const x of [-.039,.039]) for (const y of [-.076,.065]) {
    cylinder('recessed chassis screw', .0018,.001,[x,y,.028], mat.steel,group,.0018,[Math.PI/2,0,0]);
    box('screw slot', [.0024,.0004,.0002],[x,y,.0287],mat.dark,0);
  }
  // Rubber antenna has a broad seated collar and a restrained tapered shaft.
  cylinder('antenna threaded seating collar', .010,.012,[-.029,.092,0],mat.edge);
  cylinder('antenna rubber shoulder', .009,.024,[-.029,.107,0],mat.rubber,group,.007);
  cylinder('tapered rubber antenna', .0067,.106,[-.029,.170,0],mat.rubber,group,.0042,[0,0,-.018]);
  const antennaTip = cylinder('rounded antenna terminal',.0042,.006,[-.028,.225,0],mat.rubber);
  for(let i=0;i<4;i++) cylinder('antenna collar moulding',.0095,.0011,[-.029,.092+i*.003,0],mat.dark);
  function knob(name,x,r,y) {
    const pivot=new THREE.Group();pivot.name=name;pivot.position.set(x,y,.004);group.add(pivot);
    cylinder(`${name} body`,r,.018,[0,0,0],mat.dark,pivot);
    for(let i=0;i<14;i++){const a=i/14*Math.PI*2;box(`${name} fluting`,[.0012,.013,.0015],[Math.cos(a)*r,0,Math.sin(a)*r],mat.edge,.0003,pivot,[0,-a,0]);}
    box(`${name} index`,[.0015,.0005,r*.95],[0,.0094,r*.25],mat.ink,.0002,pivot);
    cylinder(`${name} bottom collar`,r+.0015,.003,[0,-.010,0],mat.edge,pivot);
    return pivot;
  }
  const volumeKnob=knob('volume and power knob',.003,.0075,.097);
  const channelKnob=knob('detented channel knob',.030,.009,.101);
  cylinder('carrier lamp bezel',.0035,.0018,[.044,.083,.020],mat.dark,group,.0035,[Math.PI/2,0,0]);
  const indicator=cylinder('carrier indicator lens',.0026,.002,[.044,.083,.0213],mat.led,group,.0026,[Math.PI/2,0,0]);
  box('side PTT recessed border',[.004,.042,.027],[-.053,.027,.001],mat.dark,.002);
  const ptt=box('side PTT moving keycap',[.0045,.037,.023],[-.056,.027,.001],mat.button,.002);
  for(let i=0;i<6;i++)box('PTT rubber ribs',[.0006,.0012,.019],[-.0024,-.013+i*.005,0],mat.rubber,.0002,ptt);
  const auxiliaryKeys=[-.007,-.025].map((y,i)=>box(`side ${i===0?'previous':'next'} key`,[.0035,.010,.019],[-.0535,y,0],mat.edge,.0012));
  box('accessory connector cover',[.003,.048,.030],[.052,.012,0],mat.dark,.002);
  box('belt clip mount',[.026,.021,.005],[0,.045,-.027],mat.edge,.0015);
  box('belt spring clip',[.024,.084,.004],[0,.008,-.037],mat.steel,.002,group,[.045,0,0]);
  box('belt clip thumb lip',[.025,.012,.010],[0,-.036,-.039],mat.rubber,.0015);
  // The battery is a separate complete shell with a seating tongue, latch,
  // exposed contact pads and a seam that can actually open at one corner.
  const battery=new THREE.Group();battery.name='removable rear battery and lower shoe';battery.position.set(-.035,-.012,-.026);group.add(battery);
  box('battery rear shell',[.087,.136,.014],[.035,-.012,-.009],mat.dark,.004,battery);
  box('battery bottom shoe',[.096,.016,.053],[.035,-.071,.008],mat.rubber,.0025,battery);
  box('battery seating tongue',[.068,.007,.005],[.035,.059,-.001],mat.edge,.001,battery);
  const latch=box('battery release latch',[.024,.007,.004],[.035,.063,-.014],mat.button,.001,battery);
  for(const x of [.014,.035,.056]) box('battery brass contact pad',[.007,.010,.0008],[x,-.054,-.0165],mat.brass,.0005,battery);
  // Original lanyard follows the inventory asset's lower corner, with a
  // woven rectangular section rather than a wire loop or floating tube.
  const strapGroup=new THREE.Group();strapGroup.name='wrist lanyard';group.add(strapGroup);
  const strapGeometry=new THREE.BufferGeometry(),strapSegments=48,strapPositions=new Float32Array((strapSegments+1)*4*3),strapIndices=[];
  for(let i=0;i<strapSegments;i++)for(let edge=0;edge<4;edge++){const a=i*4+edge,b=i*4+(edge+1)%4,c=(i+1)*4+edge,d=(i+1)*4+(edge+1)%4;strapIndices.push(a,c,b,b,c,d);}
  strapGeometry.setAttribute('position',new THREE.BufferAttribute(strapPositions,3).setUsage(THREE.DynamicDrawUsage));strapGeometry.setIndex(strapIndices);geometries.add(strapGeometry);
  const strapBand=add('wrist lanyard woven cloth band',strapGeometry,mat.strap,[0,0,0],strapGroup);
  const strapRest=[[.044,-.075,-.015],[.062,-.087,-.018],[.027,-.094,-.017],[.061,-.102,-.016],[.025,-.113,-.017],[.010,-.099,-.018],[.046,-.091,-.016],[.039,-.077,-.015]];
  let strapShapeKey='';
  function updateStrap(release, suppliedTarget) {
    const supplied=Array.isArray(suppliedTarget)&&suppliedTarget.length===3&&suppliedTarget.every(Number.isFinite);
    const target=supplied?new THREE.Vector3(...suppliedTarget):new THREE.Vector3(.035,.035,.015);
    const key=[release,...target.toArray()].join(':');if(key===strapShapeKey)return;strapShapeKey=key;
    const hanging=[[.044,-.075,-.015],[.054,-.030,-.003],[target.x+.018,target.y-.012,target.z],[target.x+.018,target.y+.007,target.z-.002],[target.x-.018,target.y+.009,target.z-.004],[target.x-.018,target.y-.012,target.z-.003],[.025,-.030,-.010],[.039,-.077,-.015]];
    const points=strapRest.map((p,i)=>new THREE.Vector3(...p).lerp(new THREE.Vector3(...hanging[i]),release));
    const curve=new THREE.CatmullRomCurve3(points,true,'centripetal'),front=new THREE.Vector3(0,0,1);
    const base=Array.from({length:strapSegments+1},(_,i)=>curve.getPoint(i/strapSegments));
    // The cloth is folded behind its lower attachment while held. Letting the
    // body go removes those folds; the band must not become an elastic tube.
    const folded=amount=>base.map((p,i)=>p.clone().addScaledVector(front,-amount*(1-Math.cos(i/strapSegments*Math.PI*10))*.5));
    const pathLength=list=>list.slice(1).reduce((n,p,i)=>n+p.distanceTo(list[i]),0);
    let lo=0,hi=.065;for(let i=0;i<18;i++){const mid=(lo+hi)*.5;if(pathLength(folded(mid))<RADIO_CONTACT_STRAP_LENGTH)lo=mid;else hi=mid;}
    const bandPoints=folded((lo+hi)*.5);
    const widthDirection=new THREE.Vector3(),normal=new THREE.Vector3();
    for(let i=0;i<=strapSegments;i++){
      const point=bandPoints[i],tangent=bandPoints[Math.min(strapSegments,i+1)].clone().sub(bandPoints[Math.max(0,i-1)]).normalize();
      widthDirection.crossVectors(tangent,front);if(widthDirection.lengthSq()<1e-8)widthDirection.set(1,0,0);widthDirection.normalize();normal.crossVectors(tangent,widthDirection).normalize();
      for(let corner=0;corner<4;corner++){const ws=corner===0||corner===3?-1:1,ts=corner<2?-1:1;
        const v=point.clone().addScaledVector(widthDirection,ws*.0021).addScaledVector(normal,ts*.00035),index=(i*4+corner)*3;strapPositions.set(v.toArray(),index);}
    }
    strapGeometry.attributes.position.needsUpdate=true;strapGeometry.computeVertexNormals();strapGeometry.computeBoundingSphere();strapGeometry.computeBoundingBox();
  }
  box('lanyard anchor ferrule',[.006,.009,.007],[.044,-.074,-.015],mat.steel,.001);

  const controls=structuredClone(RADIO_CONTACT_CONTROLS);
  const parts={shell,screen,lens,display,indicator,ptt,battery,latch,channelKnob,volumeKnob,strap:strapGroup,strapBand,receiveMark,transmitMark,antennaTip,keys,auxiliaryKeys};
  // Batch only fixed construction. Moving keys, LCD segments, PTT and battery
  // remain independent parts; their transforms and control targets stay real.
  const dynamic = new Set([shell,screen,lens,indicator,ptt,latch,strapBand,...keys,...auxiliaryKeys,...digits.flat()]);
  const authoredNames=[];group.traverse(node=>{if(node.isMesh)authoredNames.push(node.name);});group.userData.authoredPartNames=authoredNames;
  function batchFixed(parent) {
    for(const child of [...parent.children])if(!child.isMesh||child===ptt)batchFixed(child);
    const batches=new Map();for(const child of parent.children){if(!child.isMesh||dynamic.has(child))continue;const list=batches.get(child.material)||[];list.push(child);batches.set(child.material,list);}
    for(const [material,meshes]of batches){if(meshes.length<2)continue;
      const copies=meshes.map(mesh=>{mesh.updateMatrix();const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return g.applyMatrix4(mesh.matrix);});
      const geometry=mergeGeometries(copies);copies.forEach(g=>g.dispose());if(!geometry)continue;geometries.add(geometry);
      const merged=add(`fixed ${parent.name} construction`,geometry,material,[0,0,0],parent);merged.userData.authoredPartNames=meshes.map(m=>m.name);
      for(const mesh of meshes)parent.remove(mesh);
    }
  }
  batchFixed(group);
  function update(frame = {}) {
    if(disposed)return;
    const dead=!!frame.dead, pressure=clamp(frame.ptt), gap=clamp(frame.batteryGap)*(1-clamp(frame.batteryPress));
    channel=Math.round(clamp(frame.channel??2,1,16));
    ptt.position.x=-.056+pressure*.0016;
    controls.ptt.position[0]=RADIO_CONTACT_CONTROLS.ptt.position[0]+pressure*.0016;
    channelKnob.rotation.y=-(channel-1)*Math.PI*2/16;
    volumeKnob.rotation.y=-.9+clamp(frame.volume??.55)*2.6;
    battery.rotation.y=gap*.095; battery.rotation.x=gap*.035; battery.position.z=-.026-gap*.0018;
    latch.position.y=.063-clamp(frame.batteryPress)*.0012;
    battery.updateMatrix();
    const point=new THREE.Vector3(.069,-.060,-.018).applyMatrix4(battery.matrix);
    controls.battery.position=point.toArray();
    const text=String(channel).padStart(2,'0');digits.forEach((segments,i)=>segments.forEach((mesh,s)=>{mesh.visible=!dead&&DIGITS[Number(text[i])][s]==='1';}));
    display.visible=!dead;mat.screen.color.set(dead?'#131b14':'#101c14');
    mat.screen.emissiveIntensity=dead?0:.07;
    mat.segment.emissiveIntensity=dead?0:1.8;
    const carrier=dead?'off':frame.carrier;
    const isTx=carrier==='tx'||(carrier===true&&pressure>.5), isRx=carrier==='rx'||(carrier===true&&pressure<=.5);
    mat.led.color.set(isTx?'#cc9062':isRx?'#b5ce8b':carrier==='weak'?'#6d7c50':'#1c291d');
    mat.led.emissive.set(isTx?'#9b5933':isRx?'#7f9e5e':'#000000');mat.led.emissiveIntensity=dead ? 0 : (isTx||isRx) ? .22 : 0;
    receiveMark.visible=!dead&&isRx;transmitMark.visible=!dead&&isTx;
    // Key feedback is geometry travel; it never invents a gameplay action.
    const keyId=typeof frame.interaction==='string'?frame.interaction:frame.interaction?.id||frame.interaction?.control;
    const keyPressure=clamp(frame.interaction?.pressure??1);
    keys.forEach((key,i)=>{const id=keyNames[i],travel=keyId===id&&frame.interaction?.pressed!==false ? .0009*keyPressure : 0;key.position.z=.030-travel;if(controls[id])controls[id].position[2]=RADIO_CONTACT_CONTROLS[id].position[2]-travel;});
    auxiliaryKeys.forEach((key,i)=>{const id=i===0?'previous':'next',pressed=keyId===id&&frame.interaction?.pressed!==false;key.position.x=-.0535+(pressed ? .0011*keyPressure : 0);controls[id].position[0]=RADIO_CONTACT_CONTROLS[id].position[0]+(pressed ? .0011*keyPressure : 0);});
    const release=clamp(frame.release);updateStrap(release,frame.strapTarget);
    lastFrame={dead,channel,ptt:pressure,batteryGap:gap,carrier:carrier||'off',release};revision++;
  }
  function diagnostics(){let triangles=0,draws=0;group.traverse(node=>{if(!node.isMesh)return;draws++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;});return{disposed,revision,channel,triangles,draws,geometryCount:geometries.size,materialCount:materials.size,strapLength:RADIO_CONTACT_STRAP_LENGTH,frame:{...lastFrame},controls:structuredClone(controls)};}
  function dispose(){if(disposed)return;disposed=true;for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();group.clear();}
  update({channel:2,volume:.55,carrier:'rx'});
  return{group,parts,controls,bounds:RADIO_CONTACT_BOUNDS,update,dispose,diagnostics};
}
