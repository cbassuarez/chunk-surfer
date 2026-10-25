// Publicity belongs to the existing institution: printed inserts in its three
// retained holders, programme cases, and paper fixed directly to real walls.
// Coordinates below are PHYSICAL metres. Upper-floor logical/save addresses
// remain distinct; no floorplan, collision or interaction is added here.
import {institutionPoster, INSTITUTION_POSTER_CASE_MESH} from './institution-posters.js';

const frozen=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(frozen);Object.freeze(value);
  }
  return value;
};
const hostSite=(id,hostId,design,center,widthM,extra={})=>({
  id,hostId,design,kind:'holder-insert',center,widthM,finish:'flat',...extra,
});
const paperSite=(id,design,position,yaw,widthM,group,support,observer)=>({
  id,design,kind:'wall-paper',position,yaw,widthM,finish:'taped',groups:[group],support,observer,
});

// Notice-board paper is on local -Z. The old two portal positions intersected
// the portal's projecting side returns. The north case now fits the exposed
// strip between honours boards and casing; the south case occupies the nearby
// south wall above its low radiator. Retained IDs and their inspections stay.
export const INSTITUTION_POSTER_HOST_CORRECTIONS=frozen({
  'hall-entrance-program-north':{yaw:-Math.PI/2,x:96.9742,z:22.5,scale:.86},
  'hall-entrance-program-south':{yaw:0,x:92.6,y:1.12,z:26.970},
});

export const INSTITUTION_POSTER_SITES=frozen([
  hostSite('hall-season','hall-entrance-program-north','season',[0,.45,-.0462],1,{
    localYaw:Math.PI,aperture:{widthM:1.03,heightM:.73},
    observer:{position:[95.6,1.62,22.5],yaw:Math.PI/2,pitch:.038},
  }),
  hostSite('hall-winter','hall-entrance-program-south','winter_programme',[0,.45,-.0462],1,{
    localYaw:Math.PI,aperture:{widthM:1.03,heightM:.73},
    observer:{position:[92.6,1.62,24.5],yaw:Math.PI,pitch:-.021},
  }),
  // Keep the existing last-night inspection and its gilt holder. The safe ink
  // width stays 10mm inside the stiles, over the old generic portrait plane.
  hostSite('foh-last-night','foh-poster-last-night','piano',[0,.51,.0322],.56,{
    localYaw:0,aperture:{widthM:.58,heightM:.81},
    observer:{position:[88.6,1.62,7],yaw:Math.PI/2,pitch:.25},
  }),
  {id:'outside-winter-case',design:'winter',kind:'new-case',finish:'flat',
    position:[74,1.82,-.002],yaw:Math.PI,widthM:.594,groups:['ground'],
    paperCenter:[0,0,.027],aperture:{widthM:.62,heightM:.88},
    support:{axis:'z',plane:0,normal:[0,0,-1],logicalAnchor:[122,337],face:'north street / Ellery wall'},
    observer:{position:[74,1.74,-3.4],yaw:Math.PI,pitch:.025}},
  paperSite('foyer-visiting','visiting',[85.5,1.75,3.174],0,.594,'ground',
    {axis:'z',plane:3.168,normal:[0,0,1],logicalAnchor:[85.5,4.5],windowId:'W3-foyer-north',face:'foyer north window, paper taped onto the inset lower pane'},
    {position:[85.5,1.62,5.668],yaw:0,pitch:.052}),
  paperSite('atrium-student-notice','students',[96.994,1.70,16.65],Math.PI/2,.297,'ground',
    {axis:'x',plane:97,normal:[-1,0,0],logicalAnchor:[96.5,16.65],face:'exposed strip above drinking fountain between the first two honours boards'},
    {position:[94.9,1.62,16.65],yaw:Math.PI/2,pitch:.038}),
  paperSite('practice-chamber','chamber',[54,6.55,43.506],0,.420,'upper',
    {axis:'z',plane:43.5,normal:[0,0,1],logicalAnchor:[54,53],floor:4.8,face:'practice-wing north wall'},
    {position:[54,6.42,46],yaw:0,pitch:.052}),
  paperSite('chapel-recital','chapel',[90.1,6.55,49.506],0,.297,'upper',
    {axis:'z',plane:49.5,normal:[0,0,1],logicalAnchor:[90.1,59],floor:4.8,face:'chapel narthex north wall'},
    {position:[90.1,6.42,51.8],yaw:0,pitch:.057}),
  paperSite('lyric-afterwards','lyric',[24.994,1.80,86.7],Math.PI/2,.420,'ground',
    {axis:'x',plane:25,normal:[-1,0,0],logicalAnchor:[74,286.7],floor:.12,face:'Lyric existing west side masonry'},
    {position:[22.7,1.74,86.7],yaw:Math.PI/2,pitch:.026}),
  // The recording room's three treated walls remain untouched. A modest
  // contemporary-music cluster inhabits its expressly bare south wall, clear
  // of the central doorway, Goldberg stand, patchbay and first-take surfaces.
  {id:'b3-loudspeaker-case',design:'loudspeakers',kind:'new-case',finish:'flat',
    position:[18,-2.22,18.998],yaw:Math.PI,widthM:.420,groups:['basement'],
    caseScale:.420/.594,paperCenter:[0,0,.027],
    aperture:{widthM:.62*.420/.594,heightM:.88*.420/.594},
    support:{axis:'z',plane:19,normal:[0,0,-1],logicalAnchor:[18,18.5],floor:-4,face:'recording studio B3 bare south wall'},
    observer:{position:[18,-2.38,16.3],yaw:Math.PI,pitch:.059}},
  paperSite('b3-tape-music','tape',[18.82,-2.35,18.994],Math.PI,.297,'basement',
    {axis:'z',plane:19,normal:[0,0,-1],logicalAnchor:[18.82,18.5],floor:-4,face:'recording studio B3 bare south wall'},
    {position:[18.82,-2.38,16.3],yaw:Math.PI,pitch:.011}),
  paperSite('b3-live-electronics','live_electronics',[19.58,-2.22,18.994],Math.PI,.420,'basement',
    {axis:'z',plane:19,normal:[0,0,-1],logicalAnchor:[19.58,18.5],floor:-4,face:'recording studio B3 bare south wall'},
    {position:[19.58,-2.38,16.3],yaw:Math.PI,pitch:.059}),
  paperSite('academic-composers','new_works',[60.994,11.75,16.9],Math.PI/2,.420,'academic',
    {axis:'x',plane:61,normal:[-1,0,0],logicalAnchor:[10.5,256.9],floor:10,face:'academic corridor exposed east wall, north of retained reading-list frame'},
    {position:[58.7,11.62,16.9],yaw:Math.PI/2,pitch:.057}),
  paperSite('foyer-graphic-score','graphic_score',[86.45,1.66,3.174],0,.297,'ground',
    {axis:'z',plane:3.168,normal:[0,0,1],logicalAnchor:[86.45,4.5],windowId:'W3-foyer-north',face:'foyer north window, smaller workshop paper taped onto the inset lower pane'},
    {position:[86.45,1.62,5.468],yaw:0,pitch:.017}),
  {id:'hall-prepared-piano-case',design:'prepared',kind:'new-case',finish:'flat',
    position:[96.998,1.70,19.475],yaw:Math.PI/2,widthM:.420,groups:['ground'],
    caseScale:.420/.594,paperCenter:[0,0,.027],
    aperture:{widthM:.62*.420/.594,heightM:.88*.420/.594},
    support:{axis:'x',plane:97,normal:[-1,0,0],logicalAnchor:[96.5,19.475],face:'exposed atrium east wall between honours boards, below picture rail'},
    observer:{position:[94.5,1.62,19.475],yaw:Math.PI/2,pitch:.032}},
]);

// Same handedness as P3.modelMatrix: local +Z -> [-sin(yaw),0,cos(yaw)].
const transformedPoint=(host,p)=>{
  const s=host.scale||1,c=Math.cos(host.yaw||0),n=Math.sin(host.yaw||0);
  const x=p[0]*(host.scaleX??1)*s,y=p[1]*(host.scaleY??1)*s,z=p[2]*(host.scaleZ??1)*s;
  return [host.x+c*x-n*z,(host.y||0)+y,host.z+n*x+c*z];
};
const instance=(site,position,yaw,mesh,scale=1)=>({
  id:`institution-poster:${site.id}`,mesh,x:position[0],y:position[1],z:position[2],yaw,
  scale,blocks:false,interactive:false,structural:true,posterSiteId:site.id,
});

export function applyInstitutionPosters(hostInstances,{group='ground'}={}){
  const hosts=hostInstances.filter(host=>!String(host.id).startsWith('institution-poster:')).map(host=>{
    const fix=INSTITUTION_POSTER_HOST_CORRECTIONS[host.id];
    return fix?{...host,...fix}:host;
  });
  const byId=new Map(hosts.map(host=>[host.id,host]));
  const additions=[];
  for(const site of INSTITUTION_POSTER_SITES){
    const art=institutionPoster(site.design);if(!art)continue;
    const mesh=site.finish==='taped'?art.tapedMesh:art.flatMesh;
    if(site.hostId){
      const host=byId.get(site.hostId);if(!host)continue;
      additions.push({...instance(site,transformedPoint(host,site.center),
        (host.yaw||0)+(site.localYaw||0),mesh,(host.scale||1)*site.widthM/art.widthM),
        scaleX:host.scaleX,scaleY:host.scaleY,scaleZ:host.scaleZ,
        posterHostId:host.id,zone:host.zone||0});
    }else if(site.groups.includes(group)){
      if(site.kind==='new-case'){
        const carrier=instance(site,site.position,site.yaw,INSTITUTION_POSTER_CASE_MESH,site.caseScale||1);
        carrier.id+=':case';additions.push(carrier);
        additions.push(instance(site,transformedPoint(carrier,site.paperCenter),site.yaw,mesh,site.widthM/art.widthM));
      }else additions.push(instance(site,site.position,site.yaw,mesh,site.widthM/art.widthM));
    }
  }
  return [...hosts,...additions];
}

export const INSTITUTION_POSTER_CAPTURE_POINTS=frozen(INSTITUTION_POSTER_SITES.map(site=>({
  id:site.id,group:site.groups?.[0]||'ground',...site.observer,
})));
