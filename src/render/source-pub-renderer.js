// A temporary owner of the existing R3 renderer. The host rebuilds its Source
// scene on release; this module never allocates a canvas, GL context or RAF.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {assetUrl} from '../platform/paths.js';
import {SOURCE_PUB,sourcePubRound,sourcePubStretch,sourcePubFloorHoles,sourcePubFloorHeight,sourcePubTask} from '../data/source-pub.js';
import {SOURCE_PUB_SCENOGRAPHY as SET,SOURCE_PUB_SCENOGRAPHY_ASSET,SOURCE_PUB_SCENOGRAPHY_MESHES as MESH,sourcePubDeckRectangles} from '../data/source-pub-scenography.js';
import {PUB_ACTORS} from '../data/pub-population.js';
import {PUB_CHARACTER_DESIGNS,pubCharacterDescriptor,pubSeatedVigilDescriptor} from './pub-character-performance.js';
import {vigilCharacterDescriptor} from './vigil-character-performance.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';

const matrix=(x,y,z,yaw=0,sx=1,sy=1,sz=1)=>{
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]);
};
const placed=(id,mesh,m,extra={})=>({id,mesh,x:m[12],y:m[13],z:m[14],matrix:m,yaw:0,zone:ZONE.pub,structural:true,...extra});
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};

const clamp01=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=n=>{const p=clamp01(n);return p*p*(3-2*p);};
const layerFloor=layer=>SOURCE_PUB.floor-SOURCE_PUB.layerDrop*layer;

// Object motion is simulation-owned. It crosses the physical aperture before
// drifting to its dry landing mark; a carried object never substitutes for it.
export function sourcePubFallingItemPose(state){
  const f=state.itemFall;if(!f)return null;
  const p=clamp01(f.elapsed/f.duration),holeX=1.8*sourcePubStretch(state),from=layerFloor(f.fromLayer),to=layerFloor(f.toLayer);
  const atHole=smooth(p/.25),drop=clamp01((p-.18)/.82),land=smooth((p-.40)/.60);
  return{kind:f.kind,progress:p,x:holeX+(f.landing.x-holeX)*land,z:3.49+(1.25-3.49)*atHole,
    y:from+.93-(from+.93-to+(f.kind==='barrel'?0:.006))*drop*drop,yaw:p*1.8,tilt:Math.sin(p*Math.PI)*.52,layer:f.fromLayer};
}

export function sourcePubRenderFrame(state){
  const round=sourcePubRound(state.stage),stretch=sourcePubStretch(state),origin=SOURCE_PUB.room.renderAnchor,time=state.elapsed||0,props=[],lights=[];
  const activeLayer=Math.max(0,Math.min(2,Number(state.layer)||0)),length=16*stretch,holes=sourcePubFloorHoles(state),floor=sourcePubFloorHeight(state);
  const add=(id,mesh,x,y,z,yaw=0,sx=1,sy=1,sz=1,extra={})=>{const p=placed(id,mesh,matrix(origin.x+x,y,origin.z+z,yaw,sx,sy,sz),extra);props.push(p);return p;};
  for(let layer=0;layer<3;layer++){
    const y=layerFloor(layer),hole=holes.find(h=>h.layer===layer)||null;
    add(`source-pub-fittings-${layer}`,MESH.fittings,0,y,0,0,stretch,1,1,{sourceLayer:layer});
    for(const[r,i]of sourcePubDeckRectangles(length,5.4,hole).map((r,i)=>[r,i])){
      add(`source-pub-deck-${layer}-${i}`,MESH.deck,(r.x0+r.x1)/2,y,(r.z0+r.z1)/2,0,r.x1-r.x0,1,r.z1-r.z0,{sourceLayer:layer,deckBounds:{...r},deckTop:y});
    }
    // Joists support the perimeter and bay divisions, with no hidden member
    // crossing either opening. Their cut ends remain visible during descent.
    for(let x=0;x<=length;x+=SET.baySpacing){
      if(hole&&Math.abs(x-hole.x)<hole.radius+.10){
        for(const[a,b]of[[0,hole.z-hole.radius],[hole.z+hole.radius,5.4]])if(b>a)add(`source-pub-joist-${layer}-${x}-${a}`,MESH.joist,x,y,(a+b)/2,0,.12,1,b-a,{sourceLayer:layer});
      }else add(`source-pub-joist-${layer}-${x}`,MESH.joist,x,y,2.7,0,.12,1,5.4,{sourceLayer:layer});
      if(x+SET.baySpacing/2<length)add(`source-pub-bay-${layer}-${x}`,MESH.bay,x+SET.baySpacing/2,y,0,0,1,1,1,{sourceLayer:layer});
    }
    if(hole){for(const dx of[-hole.radius-.05,hole.radius+.05])add(`source-pub-cut-edge-${layer}-${dx}`,MESH.joist,hole.x+dx,y,hole.z,0,.10,1,hole.radius*2+.20,{sourceLayer:layer,openingEdge:true});}
    // Detached finish boards lean outside the walkable aisle, exposing their
    // thickness and the uncompleted construction behind the former panelling.
    for(let k=0;k<3;k++){
      const p=add(`source-pub-loose-panel-${layer}-${k}`,MESH.panel,(5.4+k*2.1)*stretch,y+.67,5.14,.08*(k-1),1,1,1,{sourceLayer:layer});
      p.matrix[6]=-.13;p.matrix[10]=.991;
    }
    for(const[id,x,z,height]of[['table',1.8,3.98,2.05],['bar',10.1,3.35,2.22],['iona',11.3,3.90,2.04],['rear',14.3,1.65,2.60]]){
      const localX=x*stretch;add(`source-pub-practical-${layer}-${id}`,MESH.practical,localX,y+height,z,0,1,1,1,{sourceLayer:layer});
      if(layer===activeLayer||state.fall||layer===activeLayer+1)lights.push({id:`source-pub-cold-${layer}-${id}`,x:origin.x+localX,y:y+height-.02,z:origin.z+z,radius:id==='iona'?3.6:id==='bar'?6.5:4.8,intensity:layer===activeLayer?(id==='iona'?1.16:.93):.48,color:[.48,.66,.78],penetration:1});
    }
  }
  // Only the central Iona remains close and fully articulated. The first
  // table remembers its two customers; they are never multiplied by floors.
  const actors=PUB_ACTORS.filter(a=>a.id==='pub-bartender-iona'||state.stage<2&&['pub-patron-mavis','pub-patron-ed'].includes(a.id));
  for(const actor of actors){
    const layer=actor.id==='pub-bartender-iona'?activeLayer:0,design=PUB_CHARACTER_DESIGNS[actor.id];
    const pose=design?pubCharacterDescriptor(actor.id,{timeSec:time,seatY:Number.isFinite(actor.seatHeight)?actor.seatHeight-.012:undefined})
      :actor.posture==='seated'?pubSeatedVigilDescriptor(actor.mesh,null,{seatY:actor.seatHeight-.012})
        :vigilCharacterDescriptor(actor.mesh,{action:'photos-sort',elapsedMs:time%8*500,durationMs:4000});
    const x=(actor.local.z+32)*stretch,z=-actor.local.x,sx=design?.width||1,sy=design?design.height/(design.source==='male'?1.78:1.70):1,sz=design?.depth||1;
    const body=add(`source-pub-0-${actor.id}`,actor.mesh,x,layerFloor(layer)+.012,z,actor.yaw,sx,sy,sz,{character:pose,pubActorId:actor.id,pubCopy:0,sourceLayer:layer});
    for(const part of actor.parts||[])props.push({...body,id:`source-pub-0-${actor.id}-${part.id}`,mesh:part.mesh});
  }
  // Tower count is bounded independently of round length and room strata. A
  // single coopered-cask mesh is reused; no barrel tower spawns extra patrons.
  let casks=0;
  for(let layer=0;layer<3;layer++){
    const levelCount=layer===activeLayer?Math.min(18,6+state.stage*3):4;
    for(const[stack,baseX,z,columns]of[['rear',15.3,3.22,2],['back',4.5,6.08,2],['bar',9.4,6.08,2]]){
      if(stack!=='rear')add(`source-pub-stack-ledger-${layer}-${stack}`,MESH.deck,baseX*stretch-(columns-1)*.385,layerFloor(layer),z,0,columns*.79,1,1.0,{sourceLayer:layer,stackLedger:true});
      for(let col=0;col<columns;col++)for(let tier=0;tier<levelCount;tier++){
        if(casks>=SET.maximumVisibleCasks)break;
        // The rear array occupies the closed WC bay. Side arrays stand on
        // their own outside-ledger shelves, clear of the public service aisle.
        const x=baseX*stretch-(col*.77),zz=z+(tier%2)*.018;
        add(`source-pub-cask-${layer}-${stack}-${col}-${tier}`,MESH.cask,x,layerFloor(layer)+tier*SET.cask.stackPitch,zz,(col*.57+tier*.19),1,1,1,{sourceLayer:layer,cask:true,stack,tier});casks++;
      }
      if(stack==='back'||stack==='bar'){
        // A visible worklamp crosslights the public-facing side of each array. Its pool
        // catches separate stave bulges and iron hoops above the room lamps.
        // As each authored stack grows, its worklamp occupies the new upper
        // working tier; there is no camera-following or global exposure lift.
        const height=Math.min(11,Math.max(4.5,levelCount*SET.cask.stackPitch*.78)),x=baseX*stretch+2.4,z=4.60,y=layerFloor(layer)+height;
        add(`source-pub-stack-worklamp-${layer}-${stack}`,MESH.practical,x,y,z,0,1.25,1.25,1.25,{sourceLayer:layer,stackWorklamp:true,stack});
        if(layer===activeLayer||state.fall||layer===activeLayer+1)lights.push({id:`source-pub-cold-stack-${layer}-${stack}`,x:origin.x+x,y:y+.025,z:origin.z+z,
          radius:14,intensity:layer===activeLayer?1.85:.62,color:[.49,.65,.76],penetration:1,stackWorklamp:true,sourceLayer:layer,stack});
      }
    }
  }
  // A barrel at floor level is the literal pickup target even among towers.
  const task=sourcePubTask(state);
  if(task?.id==='barrel'&&state.carried!=='barrel')add('source-pub-pickup-cask',MESH.cask,14.3*stretch,layerFloor(activeLayer),1.65,0,1,1,1,{cask:true,pickup:true,sourceLayer:activeLayer});
  const door=doorAssembly('public-glazed-pair',{activeLeaves:'all'}),base=matrix(origin.x+1.25*stretch,layerFloor(activeLayer),origin.z+.20);
  props.push(placed('source-pub-door-frame-0',door.frameMesh,base,{sourceLayer:activeLayer}));
  if(door.freeStandingHeadMesh)props.push(placed('source-pub-door-head-0',door.freeStandingHeadMesh,base,{sourceLayer:activeLayer}));
  for(let i=0;i<door.leafCount;i++)props.push(placed(`source-pub-door-0-${i}`,door.leafMesh,multiply(base,doorLeafLocalMatrix(door,i,state.stage>=SOURCE_PUB.rounds.length?.8:0)),{sourceLayer:activeLayer}));
  let eyeX=state.x,eyeZ=state.z;
  const eye=[origin.x+eyeX,floor+SOURCE_PUB.eyeHeight,origin.z+eyeZ];
  if(state.carried){
    const barrel=state.carried==='barrel',mesh=barrel?MESH.cask:state.carried==='waters'?(state.stage===4?MESH.singleTray:'pub_service_tray_loaded'):MESH.emptyTray;
    add('source-pub-carried-order',mesh,eyeX+Math.sin(state.yaw)*.67,eye[1]-(barrel?1.0:.64),eyeZ-Math.cos(state.yaw)*.67,state.yaw,1,1,1,{serviceTray:!barrel,carried:true,cask:barrel});
  }else if(!state.itemFall&&!state.fallenItem&&task?.id==='collect'){
    add('source-pub-counter-order',task.carry==='waters'?(state.stage===4?MESH.singleTray:'pub_service_tray_loaded'):MESH.emptyTray,10.1*stretch,layerFloor(activeLayer)+1.14,3.20,0,1,1,1,{serviceTray:true});
  }
  const served=state.stage===0&&state.task>=2||state.stage===1&&state.task>=5||state.stage===4&&state.task>=4;
  if(served)for(const[dx,dz]of state.stage===4?[[0,0]]:[[-.075,-.015],[.075,.025]])add(`source-pub-served-water-${dx}`,MESH.waterGlass,1.8*stretch+dx,layerFloor(activeLayer)+.790,3.98+dz,0,1,1,1,{servedGlass:true,sourceLayer:activeLayer});
  const falling=sourcePubFallingItemPose(state);
  if(falling){
    const barrel=falling.kind==='barrel',p=add('source-pub-falling-order',barrel?MESH.cask:MESH.emptyTray,falling.x,falling.y,falling.z,falling.yaw,1,1,1,{fallingItem:true,cask:barrel,serviceTray:!barrel,fallProgress:falling.progress});
    const c=Math.cos(falling.tilt),s=Math.sin(falling.tilt);p.matrix=multiply(p.matrix,new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]));
  }
  if(state.fallenItem){const f=state.fallenItem,barrel=f.kind==='barrel';add('source-pub-fallen-order',barrel?MESH.cask:MESH.emptyTray,f.x,layerFloor(f.layer)-(barrel?0:.006),f.z,barrel?.16:0,1,1,1,{fallenItem:true,sourceLayer:f.layer,cask:barrel,serviceTray:!barrel});}
  // The shared prop pass has eight usable local-light slots on its common
  // path. Rank by the actual falling eye in three dimensions, so a lower
  // stratum never loses its lamps to an earlier layer's array order.
  const distance=l=>(l.x-eye[0])**2+(l.y-eye[1])**2+(l.z-eye[2])**2;
  const visibleLights=lights.sort((a,b)=>distance(a)-distance(b)).slice(0,8);
  return{props,lights:visibleLights,eye,yaw:state.yaw,pitch:state.pitch,stage:state.stage,orders:state.stage<SOURCE_PUB.rounds.length?round.orders:null,copies:1,stretch,layer:activeLayer,layers:3,casks,holes,falling:!!state.fall,floorH:floor};
}

export function createSourcePubRenderer({onRelease=()=>{},renderer=R3,props=P3,resolveAsset=assetUrl}={}){
  let initialized=false,released=false,loading=null,loadError=null,lastFrameFalling=false,residencyLoad=null,residencyError=null;
  const requiredCharacters=Object.values(PUB_CHARACTER_DESIGNS).map(d=>d.mesh),requiredDoor=doorAssembly('public-glazed-pair',{activeLeaves:'all'});
  const requiredStatics=[...Object.values(MESH),requiredDoor.frameMesh,requiredDoor.leafMesh,requiredDoor.freeStandingHeadMesh,'pub_service_tray_loaded'].filter(Boolean);
  const sceneryResident=()=>{const catalog=new Set(props.propMeshCatalog?.()||[]);return [...requiredStatics,...requiredCharacters].every(mesh=>catalog.has(mesh));};
  function clearSource(){
    renderer.r3dSetHorizon?.(null);renderer.r3dSetSourceShore?.(null);renderer.r3dSetSourceEmergency?.(0);renderer.r3dSetSourceWhiteout?.(0);renderer.r3dSetSourceFault?.(0);
    renderer.r3dSetLocalLights?.([]);renderer.r3dSetEmergencyShadows?.([]);renderer.r3dSetSourcePortals?.([]);renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetSourceOpenings?.([]);
    renderer.r3dSetSourceDoorLights?.([]);renderer.r3dSetSourceCrossing?.(null);renderer.r3dSetSourceReflection?.(null);renderer.r3dSetIndoorRain?.(0);props.setPressureInstances?.([]);
    renderer.r3dSetSourceTextInstances?.([]);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetProps?.([]);
  }
  async function loadIfMissing(meshes,url,character=false){
    const catalog=()=>{const actual=props.propMeshCatalog?.()||[];return character?(props.characterStats?.()?.meshes||[]).filter(mesh=>actual.includes(mesh)):actual;};
    const known=new Set(catalog());if(meshes.every(mesh=>known.has(mesh)))return;
    await(character?props.addCharacterPack(resolveAsset(url)):props.addPropPack(resolveAsset(url)));
    if(released)return false;
    const loaded=new Set(catalog()),missing=meshes.filter(mesh=>!loaded.has(mesh));
    if(missing.length)throw Error(`The Source bar asset is missing ${missing.join(', ')}.`);
  }
  function initialize(){
    if(loading)return loading;
    loading=(async()=>{
      if(released)return false;
      const baseReady=await renderer.r3dBasePropsReady?.();if(released)return false;
      if(baseReady===false)throw Error('The Source bar base prop catalog could not be loaded.');
      await loadIfMissing(Object.values(MESH),SOURCE_PUB_SCENOGRAPHY_ASSET);if(released)return false;
      await loadIfMissing(Object.values(PUB_CHARACTER_DESIGNS).map(d=>d.mesh),'assets/pub-characters.glb',true);if(released)return false;
      const door=doorAssembly('public-glazed-pair',{activeLeaves:'all'});
      await loadIfMissing([door.frameMesh,door.leafMesh,door.freeStandingHeadMesh].filter(Boolean),'assets/conservatory-doors.glb');if(released)return false;
      await loadIfMissing(['pub_service_tray_loaded'],'assets/pub-quest-props.glb');if(released)return false;
      clearSource();
      const width=256,height=256,rgba=new Uint8Array(width*height*4),material=new Uint8Array(width*height).fill(MATERIAL.woodVelvet);
      // The plan supplies neutral light occlusion only. The common room-memory
      // path draws these finite GLB decks over absence, never an opaque plan floor.
      for(let i=0;i<width*height;i++)rgba.set([0,0,0,ZONE.pub],i*4);
      renderer.r3dSetPlan(rgba,width,height,material);
      renderer.r3dSetSourceScene({key:'source:the-lyric',look:{roomMemoryActive:true,chroma:.72,paper:0},weather:{rain:0,moon:0,clouds:0},staticInstances:[],dynamicInstances:[],corpus:[]});
      renderer.r3dSetLookProfile?.('explore',{transitionMs:0});
      renderer.r3dSetLightingContext?.({ambientColor:[.46,.59,.69],ambientIntensity:.060,captureExposure:4.8,whitePointScale:1,screen:'stochastic'});
      renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
    })().catch(error=>{loadError=String(error?.message||error);throw error;});return loading;
  }
  function render(state){
    if(!initialized||released)return false;
    if(residencyError)throw residencyError;
    // Host base-pack loading can finish after this optional scene acquires
    // the shared renderer. loadPropPack replaces the static catalog; keep our
    // isolated room resident rather than leaving only its surviving people.
    if(!sceneryResident()){
      if(!residencyLoad)residencyLoad=(async()=>{
          await loadIfMissing(Object.values(MESH),SOURCE_PUB_SCENOGRAPHY_ASSET);if(released)return;
          // A base replacement may retain fallback body names while severing
          // their anatomical entries. Reinstall the actual skin palette too.
          await props.addCharacterPack(resolveAsset('assets/pub-characters.glb'));if(released)return;
          await loadIfMissing([requiredDoor.frameMesh,requiredDoor.leafMesh,requiredDoor.freeStandingHeadMesh].filter(Boolean),'assets/conservatory-doors.glb');if(released)return;
          await loadIfMissing(['pub_service_tray_loaded'],'assets/pub-quest-props.glb');if(released)return;
          renderer.r3dSnapCameraOnNextFrame?.();
        })()
        .catch(error=>{residencyError=error;loadError=String(error?.message||error);})
        .finally(()=>{residencyLoad=null;});
      renderer.r3dClearScreen?.();return true;
    }
    const frame=sourcePubRenderFrame(state);renderer.r3dSetProps(frame.props);renderer.r3dSetDynamicProps?.([]);
    renderer.r3dSetLocalLights(frame.lights);renderer.r3dSetLookAngles({yaw:frame.yaw,pitch:frame.pitch,immediate:true});
    // A scripted fall already has its own bounded easing. Do not apply the
    // walking camera's second height filter to those physical coordinates.
    if(frame.falling||lastFrameFalling)renderer.r3dSnapCameraOnNextFrame?.();
    lastFrameFalling=frame.falling;
    renderer.r3dFrame({px:frame.eye[0]/CELL-.5,py:frame.eye[2]/CELL-.5,floorH:frame.eye[1]-SOURCE_PUB.eyeHeight,tileW:256,tileH:256,worldCount:0,
      worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false});
    return true;
  }
  function dispose(){if(released)return false;released=true;initialized=false;clearSource();onRelease();return true;}
  return{initialize,load:initialize,render,ready:()=>initialized&&!released&&sceneryResident(),clear:()=>renderer.r3dClearScreen?.(),dispose,diagnostics:()=>({ready:initialized&&!released&&sceneryResident(),released,error:loadError,sceneryResident:sceneryResident(),restoringScenery:!!residencyLoad})};
}
