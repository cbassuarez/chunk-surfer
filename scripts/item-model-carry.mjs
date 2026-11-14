import * as THREE from 'three';
import sharp from 'sharp';
import { DOOR_WEDGE_GEOMETRY } from '../src/data/door-wedge.js';
import { sourceRecordingCassetteGeometry } from '../src/render/source-recording-cassette-model.js';
import { sourceRecordingCassetteMeshPayload } from '../src/render/source-recording-cassette.js';

function material(doc, name, color, roughness, metallic = 0, alpha = 1) {
  const m = doc.createMaterial(name)
    .setBaseColorFactor([...new THREE.Color(color).toArray(), alpha])
    .setRoughnessFactor(roughness)
    .setMetallicFactor(metallic);
  return alpha < 1 ? m.setAlphaMode('BLEND') : m;
}

function sharedMesh({ add, doc }, name, piece, texture = null) {
  const data = sourceRecordingCassetteMeshPayload(piece);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  const surface = doc.createMaterial(name)
    .setBaseColorFactor(piece.base)
    .setRoughnessFactor(piece.roughness)
    .setMetallicFactor(piece.metallic);
  if (texture) {
    // The recorder's mesh UVs count rows from the bottom. glTF uses the top.
    const uv = data.uvs.map((value, index) => index % 2 ? 1 - value : value);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    surface.setBaseColorFactor([1,1,1,1]).setBaseColorTexture(texture);
  }
  return add(geometry, surface).setName(name);
}

async function cartridgeStockLabel(doc) {
  const fontfile = 'public/assets/fonts/NimbusSans-Bold.otf';
  const rows = [
    ['AUDIOCORP', 32, 23, 9],
    ['FIELD CARTRIDGE', 33, 23, 50],
    ['DA-1000 RECORDING STOCK', 18, 24, 87],
    ['AUDIOCORP', 26, 23, 128],
    ['PROTECTED TAPE TRANSPORT', 22, 23, 169],
    ['FIELD CARTRIDGE', 18, 20, 233],
  ];
  const layers = await Promise.all(rows.map(async ([label, size, left, top]) => ({
    input: await sharp({ text: {
      text: `<span foreground="#262c23">${label}</span>`,
      font: `Nimbus Sans Bold ${size}`, fontfile, rgba: true,
    } }).png().toBuffer(), left, top,
  })));
  const paper = await sharp({ create: {
    width: 512, height: 256, channels: 3, background: '#c6bea0',
  } }).composite(layers).png().toBuffer();
  return doc.createTexture('AUDIOCORP field cartridge stock print').setImage(paper).setMimeType('image/png');
}

function outline(points, holes = []) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  for (const [x, y, radius] of holes) {
    const hole = new THREE.Path();
    hole.absarc(x, y, radius, 0, 2 * Math.PI, true);
    shape.holes.push(hole);
  }
  return shape;
}

const homeInk = {
  H: [[[0,0],[0,1]],[[1,0],[1,1]],[[0,.54],[1,.59]]],
  O: [[[.22,0],[.78,.03],[1,.27],[.94,.81],[.69,1],[.23,.94],[0,.67],[.04,.22],[.22,0]]],
  M: [[[0,0],[.08,1],[.53,.46],[.94,.97],[1,0]]],
  E: [[[1,0],[0,.02],[.03,1],[1,.94]],[[.01,.53],[.78,.56]]],
};

function buildHomeCassette({ doc, root, box, cyl, ring, group, plate, cable }) {
  root.setExtras({ item: 'ren-home-cassette', widthMetres: .120, caseClosed: true, markedSpine: 'HOME' });
  // The cassette and J-card are behind the clear closed case. The rear and
  // lower edges keep the flat underside needed for the existing hand cradle.
  const clear = material(doc, 'scuffed clear polystyrene', '#b1b6a1', .28, 0, .17);
  const edge = material(doc, 'moulded clear case edge', '#919984', .36, 0, .52);
  const scratch = material(doc, 'light scattered by crazing', '#afad97', .67, 0, .45);
  const shell = material(doc, 'charcoal cassette ABS', '#363931', .65);
  const hub = material(doc, 'pale nylon hubs', '#bfb99f', .53);
  const tape = material(doc, 'brown oxide tape winding', '#544336', .55);
  const card = material(doc, 'warm aged paper J-card', '#c1ad80', .88);
  const ink = material(doc, 'black pencil on paper', '#211c16', .89);
  const stripe = material(doc, 'faded red ruling', '#975b4b', .92);
  const named = (node, name) => node.setName(name);
  const lettering = (x, y, z, unit) => {
    for (const [letter, glyph] of [...'HOME'].entries()) {
      for (const stroke of homeInk[glyph]) {
        for (let i = 1; i < stroke.length; i++) {
          const [[u, v], [a, b]] = [stroke[i-1], stroke[i]];
          const length = Math.hypot(a-u, b-v) * unit;
          box([x+(letter*1.26+(u+a)/2)*unit, y+(v+b)/2*unit, z],
            [length+.00046, .00096, .00016], ink, [0,0,Math.atan2(b-v,a-u)], .00016);
        }
      }
    }
  };
  // Lay the cassette flat in the same metric orientation as the retained prop.
  group([0,.011,0], [-Math.PI/2,0,0], () => {
    named(box([0,0,-.0097],[.119,.077,.0026], 'dark', undefined,.0025), 'case rear tray');
    named(box([0,0,.010],[.119,.077,.0014], clear, undefined,.0013), 'closed clear lid');
    for (const x of [-.0581,.0581]) box([x,0,.0011],[.0024,.076,.020],edge,undefined,.0007);
    for (const y of [-.0378,.0378]) box([0,y,.0011],[.118,.0024,.020],edge,undefined,.0007);
    for (const x of [-.043,.043]) {
      named(cyl([x,.037,.0001],.00165,.021,edge,[0,0,Math.PI/2],16), 'case hinge knuckle');
      box([x*.73,-.0372,.0077],[.011,.002,.004],edge,undefined,.0007);
    }
    const contour = [[-.05,-.028],[.05,-.028],[.05,.027],[.047,.030],[-.047,.030],[-.05,.027]];
    const hubs = [[-.022,0,.0095],[.022,0,.0095]];
    for (const z of [-.0058,.0058]) {
      named(plate(outline(contour, hubs),.0018,[0,0,z],shell,undefined,.00035),'cassette moulding with hub apertures');
    }
    for (const x of [-.049,.049]) box([x,0,0],[.0015,.055,.011],shell,undefined,.00045);
    box([0,.029,0],[.098,.0014,.011],shell,undefined,.0004);
    for (const x of [-.039,.039]) box([x,-.027,0],[.019,.002,.011],shell,undefined,.0004);
    // Transport mouth between the stepped edge cheeks. Tape spans the
    // head opening behind the separate ivory pressure pad.
    for (const x of [-.027,.027]) box([x,-.0285,0],[.011,.005,.0115],shell,undefined,.001);
    box([0,-.0282,-.0007],[.044,.0009,.003],tape,undefined,.0003);
    box([0,-.0269,.0001],[.008,.0016,.0034],'ivory',undefined,.00035);
    for (const [x, winding] of [[-.022,.0085],[.022,.0069]]) {
      named(ring([x,0,.002],winding,.0015,tape),'tape winding');
      for (const z of [-.0055,.0055]) {
        named(ring([x,0,z],.0063,.001,hub),'nylon drive hub');
        for (let tooth = 0; tooth < 6; tooth++) {
          const angle = tooth*Math.PI/3;
          box([x+Math.cos(angle)*.0047,Math.sin(angle)*.0047,z],
            [.0042,.00155,.0017],hub,[0,0,angle],.00035);
        }
      }
      for (const y of [-.023,.023]) {
        cyl([x*1.92,y,.007],.0013,.00065,'steel',undefined,12);
        box([x*1.92,y,.0074],[.00165,.00035,.0002],ink,[0,0,.42],0);
      }
    }
    named(box([0,.0169,.00705],[.087,.0107,.0004],card,undefined,.00045),'hand-labelled cassette face');
    box([0,.0117,.0073],[.086,.0006,.00015],stripe,undefined,0);
    lettering(-.016,.014,.0075,.0056);
    named(box([0,-.032,.002],[.112,.008,.012],card,undefined,.00035),'folded J-card spine');
    box([0,-.035,.0084],[.104,.00055,.00019],stripe,undefined,0);
    lettering(-.017,-.0348,.0086,.0046);
    group([0,-.0366,.0031], [Math.PI/2,0,0], () => lettering(-.017,-.003,.00015,.0046));
    // A fracture in the case, with branching hairlines at the hinge corner.
    cable([[.056,.036,.0109],[.049,.031,.0109],[.043,.030,.0109],[.037,.020,.0109],[.031,.017,.0109]],.00028,scratch);
    cable([[.043,.030,.0109],[.039,.032,.0109],[.034,.035,.0109]],.00019,scratch);
    cable([[-.054,-.019,.0109],[-.050,-.015,.0109],[-.046,-.009,.0109]],.00015,scratch);
  });
}

function buildCells({ doc, root, cyl, ring, box }, quantity, wrapper) {
  const jacket = material(doc,'alkaline cell black printed sleeve','#465047',.76);
  const collar = material(doc,'warm brown cell collar','#a36743',.54,.25);
  const seal = material(doc,'folded paper sleeve','#b3a279',.94);
  const ink = material(doc,'batch ink on sleeve','#596457',.88);
  root.setExtras({quantity, sealed: wrapper, stock: 'torch cells'});
  for (let i = 0; i < quantity; i++) {
    const x = (i-(quantity-1)/2)*.029;
    cyl([x,0,0],.0127,.048,jacket,[0,0,0],32);
    cyl([x,.0185,0],.01275,.011,collar,[0,0,0],32);
    cyl([x,.0244,0],.0112,.0014,'steel',[0,0,0],32);
    cyl([x,.0271,0],.0044,.0048,'steel',[0,0,0],24);
    ring([x,-.0241,0],.0107,.00135,'steel',[Math.PI/2,0,0]);
    box([x,.009,.0128],[.011,.0024,.0008],'ivory',undefined,0);
    box([x,.009,.013],[.0024,.011,.0008],'ivory',undefined,0);
  }
  if (wrapper) {
    const width = quantity*.029+.0016;
    box([0,-.004,0],[width,.024,.0272],seal,undefined,.0011);
    box([width*.32,-.004,.0137],[.0014,.021,.001],ink,undefined,0);
    for (let i=0;i<5;i++) box([-.009+i*.003,.0006,.0137],[.001,.006+i%2*.002,.001],ink,undefined,0);
  }
}

function buildPatchLead({ doc, cable, cyl, ring, group }) {
  const flex = material(doc,'faded ochre flexible insulation','#9b744a',.82);
  const rubber = material(doc,'moulded dark strain relief','#45473b',.94);
  const nickel = material(doc,'nickel jack terminals','#b8b6a1',.35,.65);
  cable([[-.060,-.012,.003],[-.036,-.004,.004],[-.028,.026,.010],[.005,.043,-.004],[.038,.022,.004],
    [.028,-.008,.013],[-.011,-.013,.014],[-.028,-.038,.005],[.004,-.047,-.002],[.043,-.034,.002]],.0038,flex);
  for (const [x,y,angle] of [[-.061,-.012,1.18],[.043,-.034,-1.15]]) {
    group([x,y,.003],[0,0,angle],() => {
      cyl([0,.009,0],.0063,.021,rubber,[0,0,0],20);
      for (let k=0;k<4;k++) ring([0,.001+k*.003,0],.0061,.0007,rubber,[Math.PI/2,0,0]);
      cyl([0,.024,0],.0041,.010,nickel,[0,0,0],20);
      cyl([0,.031,0],.0031,.006,nickel,[0,0,0],20);
      cyl([0,.0301,0],.0032,.001,rubber,[0,0,0],20);
    });
  }
}

export async function buildCarriedItemModels(model, extract) {
  await model('ren-home-cassette', buildHomeCassette);
  await model('recording-cassette', async g => {
    const geometry = sourceRecordingCassetteGeometry();
    const label = await cartridgeStockLabel(g.doc);
    for (const suffix of ['shell','inset','steel','wear','ribbon','index','shutter','label']) {
      const name = `source_recording_cassette_${suffix}`;
      sharedMesh(g,name,geometry[name],suffix === 'label' ? label : null);
    }
  });
  await model('door-wedge', g => sharedMesh(g, DOOR_WEDGE_GEOMETRY[0].name, DOOR_WEDGE_GEOMETRY[0]));
  await model('patch-leads', buildPatchLead);
  await model('sealed-cells-b3', g => buildCells(g,1,true));
  await model('sealed-cells-pool', g => buildCells(g,2,true));
  await model('sealed-cells-rig', g => buildCells(g,2,false));
  const props = 'public/assets/conservatory-props.glb';
  await extract('b3-session-card',props,[{mesh:'b3_session_card'}],[Math.PI/2-.36,0,.07]);
  await extract('vale-guarantor-slip',props,[{mesh:'loose_note'}],[Math.PI/2-.38,0,-.10]);
  await extract('lyle-music-box','public/assets/source-drive/coastal-memory/coastal-memory.glb',
    [{mesh:'cm_broken_music_box'},{mesh:'cm_broken_music_box_key'}]);
  const pub = 'public/assets/pub-quest-props.glb';
  await extract('pub-opener',pub,[{mesh:'pub_bottle_opener'}],[Math.PI/2-.42,0,-.87]);
  await extract('pub-orderbook',pub,[{mesh:'pub_order_book'}],[Math.PI/2-.43,0,.13]);
  for (const [id,mesh] of [['pub-service-tray','pub_service_tray_loaded'],['pub-tray-empties','pub_service_tray_empty'],['pub-tray-bare','pub_service_tray_bare']]) {
    await extract(id,pub,[{mesh}],[.26,-.15,.04]);
  }
}
