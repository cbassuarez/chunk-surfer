// An isolated paint pack. It adds only ink strokes, never a new carrier panel
// or a rebuilt Source bus or wall. Coordinates are host-local metres.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.env.SOURCE_GRAFFITI_OUT_DIR || path.join(root, 'public/assets');
fs.mkdirSync(output, { recursive: true });
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('Paint on Source street supports');
const materials = [
  doc.createMaterial('worn chalk coloured paint').setBaseColorFactor([.57,.56,.46,1]).setRoughnessFactor(.96).setMetallicFactor(0).setDoubleSided(true),
  doc.createMaterial('oxidised red paint').setBaseColorFactor([.35,.105,.075,1]).setRoughnessFactor(.94).setMetallicFactor(0).setDoubleSided(true),
  doc.createMaterial('dirty pale paint').setBaseColorFactor([.66,.63,.52,1]).setRoughnessFactor(.94).setMetallicFactor(0).setDoubleSided(true),
];

// Every segment is a thin irregular quadrilateral, not a textured billboard.
// The authoring axes are z across the wall or bus, y up, x at its actual skin.
function makeMesh(name, strokes) {
  const groups = new Map();
  for (const { x, points, width, material } of strokes) {
    let g = groups.get(material);
    if (!g) groups.set(material, g = { vertices: [], normals: [], indices: [] });
    for (let i = 1; i < points.length; i++) {
      const [z0,y0] = points[i-1], [z1,y1] = points[i];
      const dz=z1-z0,dy=y1-y0,len=Math.hypot(dz,dy);
      if (len < .0001) continue;
      const hz=-dy/len*width/2,hy=dz/len*width/2,base=g.vertices.length/3;
      g.vertices.push(x,y0+hy,z0+hz,x,y0-hy,z0-hz,x,y1-hy,z1-hz,x,y1+hy,z1+hz);
      for(let n=0;n<4;n++)g.normals.push(Math.sign(x),0,0);
      if(x>0)g.indices.push(base,base+2,base+1,base,base+3,base+2);
      else g.indices.push(base,base+1,base+2,base,base+2,base+3);
    }
  }
  const mesh=doc.createMesh(name);
  for(const [material,g] of groups){
    const positions=doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(g.vertices));
    const normals=doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(g.normals));
    const indices=doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint16Array(g.indices));
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',positions).setAttribute('NORMAL',normals).setIndices(indices).setMaterial(materials[material]));
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
}

// Three quick, imperfect letters and a crossed underline sit between the wall
// piers. No author name, story clue or commercial sign is claimed.
const wallPaths=[
  [[-.70,.82],[-.63,1.15],[-.54,.84],[-.48,1.16]],
  [[-.39,1.15],[-.45,.82],[-.21,.84]],
  [[-.15,.84],[-.08,1.14],[.04,1.15],[.10,1.08],[.04,1.00],[-.10,1.00]],
  [[.00,1.00],[.11,.84]],
  [[.18,.86],[.25,1.14],[.43,.86],[.51,1.14]],
  [[-.68,.74],[-.23,.76],[.18,.72],[.63,.76]],
  [[.53,.92],[.63,1.07],[.68,.88]],
];
const wall=wallPaths.map((points,i)=>({x:.167,points,width:i===5?.026:.031,material:i===5?1:0}));
wall.push({x:.168,points:[[-.31,.82],[-.31,.75]],width:.010,material:0});
wall.push({x:.168,points:[[.23,.83],[.22,.78]],width:.009,material:0});
makeMesh('source_outskirts_wall_graffiti',wall);

// Both flanks stay on solid enamel: beyond the doorway, away from windows,
// wheels, destination and registration. The same shape follows either bus.
const busPaths=[
  [[-.90,.90],[-.83,1.25],[-.70,1.08],[-.57,1.26],[-.52,.92]],
  [[-.43,.91],[-.34,1.24],[-.23,.92],[-.12,1.24]],
  [[-.03,.92],[.04,1.25],[.21,1.25],[.27,1.17],[.17,1.08],[.01,1.08]],
  [[.15,1.08],[.29,.93]],
  [[.35,.93],[.42,1.24],[.61,1.23]],
  [[.40,1.08],[.56,1.09]],
  [[.37,.93],[.59,.94]],
  [[-.94,.84],[-.42,.81],[.13,.83],[.67,.80]],
];
const bus=[];
for (const x of [-1.257,1.257]) {
  for (const [i,points] of busPaths.entries()) bus.push({x,points,width:i===7?.024:.034,material:i===7?1:2});
  bus.push({x:x+Math.sign(x)*.001,points:[[-.31,.91],[-.32,.85]],width:.009,material:2});
  bus.push({x:x+Math.sign(x)*.001,points:[[.54,.94],[.53,.87]],width:.009,material:2});
}
makeMesh('source_outskirts_bus_graffiti',bus);
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));
fs.writeFileSync(path.join(output,'source-outskirts-graffiti.glb'),bytes);
console.log(`source-outskirts-graffiti.glb: ${bytes.length} bytes`);
