// The physical eyes have one definition from basin through bag to gallery.
// This module supplies both the full prop builder and the scoped update tool.
import fs from 'node:fs';
import {
  createCanonicalEyeGeometry, createReliquaryPortraitGeometry,
  RELIQUARY_MATERIALS, reliquaryGeometry,
} from './reliquary-geometry.mjs';
import {BUST_RELIQUARY_RIG} from '../../src/data/bust-reliquary-rig.js';

export const GALLERY_BUST_SCALE = .515 / (6.5 - 3.393271);
export const CANONICAL_EYE_RADIUS = BUST_RELIQUARY_RIG.eyeRadius * GALLERY_BUST_SCALE;
export const RELIQUARY_PROP_NAMES = Object.freeze([
  'park_marble_eyes', 'park_fountain_coins',
  'academic_bust_socketed', 'academic_bust_socketed_returned',
]);
export const RELIQUARY_PROP_MATERIALS = RELIQUARY_MATERIALS;

function transformed(data, scale=1, offset=[0,0,0], rotation=[0,0,0]) {
  const [rx,ry,rz]=rotation, cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
  const rotate=([x,y,z])=>{const yy=y*cx-z*sx,zz=y*sx+z*cx,xx=x*cy+zz*sy,zzz=-x*sy+zz*cy;return [xx*cz-yy*sz,xx*sz+yy*cz,zzz];};
  const positions=[], normals=[];
  for(let i=0;i<data.positions.length;i+=3){positions.push(...rotate(data.positions.slice(i,i+3)).map((v,k)=>v*scale+offset[k]));normals.push(...rotate(data.normals.slice(i,i+3)));}
  return {positions,normals,indices:[...data.indices]};
}
function groups() { return new Map(); }
function add(target,material,data) {
  if(!target.has(material))target.set(material,reliquaryGeometry());
  target.get(material).append(data);
}
function eyes(target,{center=[0,0,0],radius=CANONICAL_EYE_RADIUS,side,rotation=[0,0,0]}) {
  for(const [part,data] of Object.entries(createCanonicalEyeGeometry({radius,side})))
    add(target,part==='stone'?'eye':part,transformed(data,1,center,rotation));
}

export function createReliquaryPropGeometry() {
  const out=new Map();
  const water=groups();
  eyes(water,{center:[-.045,.025,-.025],side:'L',rotation:[-Math.PI/2+.12,.14,.16]});
  eyes(water,{center:[.047,.025,.027],side:'R',rotation:[-Math.PI/2-.10,-.12,-.13]});
  out.set('park_marble_eyes',water);

  const coins=groups(), coin=reliquaryGeometry();
  for(let i=0;i<8;i++) {
    const a=i*2.399,r=.10+((i*5)%7)/7*.30;
    coin.lathe([[0,0],[.026,0],[.026,.008],[0,.008]], [Math.cos(a)*r,0,Math.sin(a)*r],12);
  }
  add(coins,'bronzeDark',coin);out.set('park_fountain_coins',coins);

  const portrait=JSON.parse(fs.readFileSync(new URL('../../artifacts/bust-reliquary-production/portrait.json',import.meta.url),'utf8'));
  const portraitParts=['torso','head'].filter(name=>portrait[name]);
  if(!portraitParts.includes('head'))throw Error('Build the reliquary portrait before the eye props.');
  let minY=Infinity;
  for(const part of portraitParts)for(let i=1;i<portrait[part].positions.length;i+=3)minY=Math.min(minY,portrait[part].positions[i]);
  const offset=[0,-minY*GALLERY_BUST_SCALE,0];
  const damaged=groups();
  for(const part of portraitParts)add(damaged,'marble',createReliquaryPortraitGeometry({part,scale:GALLERY_BUST_SCALE,offset}));
  // The old neck repair belongs to the material history of the same face.
  const repair=reliquaryGeometry();
  repair.torus([-.2*GALLERY_BUST_SCALE,(4.94-minY)*GALLERY_BUST_SCALE,0],.31*GALLERY_BUST_SCALE,.042*GALLERY_BUST_SCALE,'y',32,6,[1,.8,.8]);
  for(const x of[-.44,.05])repair.rod([x*GALLERY_BUST_SCALE,(4.86-minY)*GALLERY_BUST_SCALE,-.12*GALLERY_BUST_SCALE],[x*GALLERY_BUST_SCALE,(5.05-minY)*GALLERY_BUST_SCALE,-.12*GALLERY_BUST_SCALE],.022*GALLERY_BUST_SCALE,8);
  add(damaged,'bronzeDark',repair);out.set('academic_bust_socketed',damaged);
  const returned=new Map([...damaged].map(([material,g])=>[material,transformed(g)]));
  for(const [side,c] of Object.entries(BUST_RELIQUARY_RIG.eyeCenters))eyes(returned,{side,center:c.map((v,k)=>v*GALLERY_BUST_SCALE+offset[k]),radius:CANONICAL_EYE_RADIUS});
  out.set('academic_bust_socketed_returned',returned);
  return out;
}
