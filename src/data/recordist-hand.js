// HIS HAND.
//
// The single-stroke capitals of his blue-ink notes in the cab
// (tools/chunk_surfer/build-opening-cab-objects.mjs draws A–Z from the same
// table), plus what an engineer's notes on a works order need: digits, a
// slashed zero so it never reads as O, and `: - + / ? , .`.
//
// Pure data and geometry. The work order's live ink draws these strokes into a
// texture in page millimetres; a bake can emit the same segments as SVG lines.
// Glyph space: x 0..1 across the glyph box, y 0 at the top of the capitals.
const freeze=Object.freeze;
export const RECORDIST_GLYPHS=freeze({
  A:['0,1 .5,0 1,1','.22,.57 .78,.57'],B:['0,1 0,0 .65,0 1,.22 .65,.48 0,.48','.65,.48 1,.72 .7,1 0,1'],C:['1,.12 .72,0 .2,0 0,.25 0,.8 .22,1 .8,1 1,.88'],
  D:['0,1 0,0 .55,0 1,.28 1,.72 .55,1 0,1'],E:['1,0 0,0 0,1 1,1','0,.48 .78,.48'],F:['1,0 0,0 0,1','0,.48 .8,.48'],G:['1,.16 .75,0 .22,0 0,.25 0,.8 .22,1 1,1 1,.55 .55,.55'],
  H:['0,0 0,1','1,0 1,1','0,.5 1,.5'],I:['.15,0 .85,0','.5,0 .5,1','.15,1 .85,1'],J:['.12,0 1,0','1,0 1,.8 .8,1 .2,1 0,.8'],K:['0,0 0,1','1,0 0,.58 1,1'],L:['0,0 0,1 1,1'],
  M:['0,1 0,0 .5,.57 1,0 1,1'],N:['0,1 0,0 1,1 1,0'],O:['.2,0 .8,0 1,.25 1,.8 .8,1 .2,1 0,.75 0,.22 .2,0'],P:['0,1 0,0 .75,0 1,.22 .75,.5 0,.5'],
  Q:['.2,0 .8,0 1,.25 1,.8 .8,1 .2,1 0,.75 0,.22 .2,0','.6,.7 1.1,1.1'],R:['0,1 0,0 .75,0 1,.22 .75,.5 0,.5','.55,.5 1,1'],S:['1,.12 .75,0 .22,0 0,.24 .2,.47 .78,.55 1,.78 .78,1 .2,1 0,.88'],
  T:['0,0 1,0','.5,0 .5,1'],U:['0,0 0,.78 .22,1 .78,1 1,.78 1,0'],V:['0,0 .5,1 1,0'],W:['0,0 .22,1 .5,.48 .78,1 1,0'],X:['0,0 1,1','1,0 0,1'],Y:['0,0 .5,.5 1,0','.5,.5 .5,1'],Z:['0,0 1,0 0,1 1,1'],
  "'":['.5,0 .35,.25'],'.':['.45,.94 .55,1'],
  0:['.2,0 .8,0 1,.25 1,.8 .8,1 .2,1 0,.75 0,.22 .2,0','.85,.12 .15,.88'],1:['.2,.22 .55,0 .55,1','.2,1 .9,1'],2:['0,.2 .25,0 .75,0 1,.22 1,.42 0,1 1,1'],
  3:['0,.08 .3,0 .75,0 1,.2 .75,.47 .35,.47','.75,.47 1,.72 .75,1 .25,1 0,.9'],4:['.75,1 .75,0 0,.68 1,.68'],5:['1,0 .1,0 0,.45 .65,.42 1,.62 .85,.95 .45,1 0,.9'],
  6:['.9,.05 .45,0 .1,.25 0,.65 .15,.95 .5,1 .9,.9 1,.65 .8,.45 .4,.42 0,.62'],7:['0,0 1,0 .35,1'],
  8:['.5,.47 .15,.35 .12,.12 .5,0 .88,.12 .85,.35 .5,.47 .1,.62 .05,.88 .5,1 .95,.88 .9,.62 .5,.47'],9:['.95,.38 .6,.55 .2,.5 0,.25 .25,0 .7,0 1,.25 1,.6 .8,.92 .4,1 .1,.95'],
  ':':['.5,.28 .5,.36','.5,.82 .5,.9'],'-':['.15,.55 .85,.55'],'+':['.1,.55 .9,.55','.5,.18 .5,.92'],'/':['.9,0 .1,1'],
  '?':['0,.2 .25,0 .75,0 1,.2 1,.4 .5,.6 .5,.74','.5,.92 .5,1'],',':['.5,.88 .35,1.1'],
});
const NARROW=new Set(['1','I',':','.',"'",',']);
const parsed=Object.fromEntries(Object.entries(RECORDIST_GLYPHS).map(([ch,paths])=>[ch,
  freeze(paths.map(path=>freeze(path.split(' ').map(point=>freeze(point.split(',').map(Number))))))]));

/** True when every character can be written in his hand (spaces allowed). */
export function recordistHandCovers(text){
  return [...String(text??'')].every(ch=>ch===' '||Object.hasOwn(parsed,ch.toUpperCase()));
}

function seeded(seed){let s=0;for(const c of String(seed))s=(Math.imul(s,31)+c.charCodeAt(0))>>>0;
  return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

/**
 * Lay out `text` as his strokes. `x,y` is the top-left of the capitals and `h`
 * their height, in whatever unit the caller draws in (the work order uses
 * page millimetres). The same seed always gives the same wobble, so a note
 * looks identical every time the sheet is opened.
 * Returns {strokes:[[ [x,y], ... ], ...], width, unsupported:[chars]}.
 */
export function layoutRecordistHand(text,{x=0,y=0,h=3,seed=text,slant=.08,tilt=-.6,wobble=1}={}){
  const r=seeded(seed),adv=h*.86,strokes=[],unsupported=[],rise=Math.tan(tilt*Math.PI/180);let cx=x;
  for(const raw of String(text??'')){
    if(raw===' '){cx+=h*.62;continue;}
    const ch=raw.toUpperCase(),paths=parsed[ch];
    if(!paths){unsupported.push(raw);cx+=adv;continue;}
    const narrow=NARROW.has(ch),gw=narrow?.5:.74,dy=(r()-.5)*h*.10*wobble,sc=1+(r()-.5)*.08*wobble,rot=(r()-.5)*.05*wobble;
    const c=Math.cos(rot),s=Math.sin(rot),base=y+dy+(cx-x)*rise;
    for(const path of paths)strokes.push(path.map(([u,v])=>{
      const px=(u+(1-v)*slant)*adv*gw*sc,py=v*h*sc;
      return[cx+px*c-py*s+(r()-.5)*h*.035*wobble,base+px*s+py*c+(r()-.5)*h*.035*wobble];
    }));
    cx+=adv*(narrow?.62:1);
  }
  return{strokes,width:cx-x,unsupported};
}
