import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as FP from '../../../src/world/floorplan.js';
import {conservatory} from '../../../src/data/floorplan/conservatory.js';
import * as PROPS from '../../../src/game/props.js';
import {PROP_BOUNDS} from '../../../src/data/generated/prop-geometry.js';
import {propWallPose} from '../../../src/world/prop-wall-pose.js';
import {wallContactAt} from '../../../src/world/wall-contact.js';

const paths=['src/game/props.js','src/world/prop-wall-pose.js','src/data/conservatory-props.js','src/data/generated/prop-geometry.js','public/assets/conservatory-props.glb'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const before=hashes();
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const instances=PROPS.propsInit(FP),rendered=new Map(PROPS.renderInstances().map(p=>[p.id,p]));
const plan={size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,
  materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
const report={date:new Date().toISOString(),hashes:before,
  convention:'Authored X/Y metres; runtime rendered X/Y/Z metres; wall contact normal is logical and local front is declared explicitly.',
  mounted:instances.filter(p=>p.mount==='wall').map(p=>{
    const contact=wallContactAt(plan,p.rx+.5,p.ry+.5,p.mountNormal?{prefer:p.mountNormal}:undefined);
    const pose=contact?propWallPose(p,PROP_BOUNDS[p.mesh],contact):null;
    return{id:p.id,mesh:p.mesh,frontAxis:p.frontAxis??'+z',rendered:rendered.get(p.id),
      bounds:PROP_BOUNDS[p.mesh],contact,backExtent:pose?.backExtent??null};
  }),
  readingLimits:'Real placement evidence, not human reading or full-route visual acceptance.'};
report.hashesAfter=hashes();report.sourcesUnchanged=JSON.stringify(report.hashes)===JSON.stringify(report.hashesAfter);
mkdirSync('artifacts/lettering-study/production',{recursive:true});
writeFileSync('artifacts/lettering-study/production/contact-transforms.json',`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({mounted:report.mounted.length,missing:report.mounted.filter(p=>!p.contact).map(p=>p.id),
  dock:report.mounted.filter(p=>p.mesh.startsWith('scene_dock_sign'))},null,2));
