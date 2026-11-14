import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filmLeakFrame,filmLeakRoll,FILM_LEAK} from '../src/game/film-leak.js';
import {FILM_LEAK_ATLAS as ATLAS} from '../src/data/film-leak-atlas.js';
import {neuralFrame,neuralSeconds} from '../src/game/neural-transition.js';

const jpegSize=bytes=>{
  for(let i=2;i<bytes.length;){
    if(bytes[i]!==0xFF){i++;continue;}
    const marker=bytes[i+1],length=bytes.readUInt16BE(i+2);
    if(marker>=0xC0&&marker<=0xC3)return{height:bytes.readUInt16BE(i+5),width:bytes.readUInt16BE(i+7)};
    i+=2+length;
  }
  return null;
};

test('the atlas is the scanned film the data says it is',()=>{
  const size=jpegSize(readFileSync(new URL('../public/'+ATLAS.url,import.meta.url)));
  assert.deepEqual(size,{width:ATLAS.cols*ATLAS.cellWidth,height:ATLAS.rows*ATLAS.cellHeight});
  assert.equal(ATLAS.cells.length,ATLAS.cols*ATLAS.rows);
  for(const[reel,{fog,burn}]of Object.entries(ATLAS.reels)){
    assert.ok(fog.length>=5&&burn.length>=3,`${reel} has too little film`);
    for(const i of fog)assert.equal(ATLAS.cells[i].run,'fog');
    for(const i of burn)assert.equal(ATLAS.cells[i].run,'burn');
    const exposures=burn.map(i=>ATLAS.cells[i].exposure);
    assert.deepEqual(exposures,[...exposures].sort((a,b)=>a-b),`${reel}'s burn must keep rising`);
    assert.ok(Math.max(...fog.map(i=>ATLAS.cells[i].exposure))<Math.min(...exposures),`${reel}'s fog brighter than its burn`);
  }
});

test('every crossing is its own roll, and both treatments and both reels turn up',()=>{
  const seen=new Map();let filmOnly=0,r5072=0,mirrored=0;const n=4000;
  for(let k=0;k<n;k++){
    const roll=filmLeakRoll((k+.5)/n);
    seen.set(`${roll.filmOnly}/${roll.reel}/${roll.mirrored}`,true);
    filmOnly+=roll.filmOnly;r5072+=roll.reel==='5072';mirrored+=roll.mirrored;
  }
  assert.equal(seen.size,8,'some combination of treatment, reel and side never happens');
  for(const[name,count]of[['film only',filmOnly],['reel 5072',r5072],['mirrored',mirrored]])
    assert.ok(count/n>.4&&count/n<.6,`${name} is ${Math.round(count/n*100)}% of crossings`);
  assert.deepEqual(filmLeakRoll(.3),filmLeakRoll(.3),'one seed is one roll');
});

test('no light, no film',()=>{
  for(const seed of[0,.13,.5,.77]){
    const f=filmLeakFrame({leak:0,white:0,time:.4,seed});
    assert.equal(f.fog.scale,0);assert.equal(f.burn.scale,0);
  }
});

test('with the lens the white is the lens\'s, never the film\'s burn',()=>{
  for(let k=0;k<200;k++){
    const seed=k/200;if(filmLeakRoll(seed).filmOnly)continue;
    for(const white of[.2,.6,1])assert.equal(filmLeakFrame({leak:1,white,time:.3,seed}).burn.scale,0);
  }
});

test('each frame comes off its own reel\'s run',()=>{
  for(let k=0;k<200;k++){
    const seed=k/200,roll=filmLeakRoll(seed),{fog,burn}=ATLAS.reels[roll.reel];
    for(let t=0;t<1;t+=.05){
      const f=filmLeakFrame({leak:t,white:t,time:t,seed});
      if(f.fog.scale)assert.ok(fog.includes(f.fog.a)&&fog.includes(f.fog.b));
      if(f.burn.scale)assert.ok(burn.includes(f.burn.a)&&burn.includes(f.burn.b));
    }
  }
});

test('film is whole frames, a twelfth of a second each; Reduce Flash runs smooth',()=>{
  const seed=.21,step=1/FILM_LEAK.framesPerSecond;
  for(let i=0;i<24;i++){
    const t0=i*step+.001,t1=(i+1)*step-.001,leak=.5;
    assert.deepEqual(filmLeakFrame({leak,white:0,time:t0,seed}).fog,filmLeakFrame({leak,white:0,time:t1,seed}).fog,'a frame changed inside its twelfth');
  }
  let last=null;
  for(let leak=0;leak<=1;leak+=.01){
    const f=filmLeakFrame({leak,white:0,time:leak,seed,reducedFlash:true});
    assert.equal(f.grain,0,'the grain steps with Reduce Flash on');
    if(!f.fog.scale)continue;
    const at=ATLAS.reels[filmLeakRoll(seed).reel].fog.indexOf(f.fog.a)+f.fog.mix;
    if(last!==null)assert.ok(at>=last-1e-9&&at-last<.2,`the fog jumped from ${last} to ${at}`);
    last=at;
  }
});

test('a cut between burn frames never moves the screen\'s level',()=>{
  for(let k=0;k<40;k++){
    const seed=k/40;if(!filmLeakRoll(seed).filmOnly)continue;
    for(const white of[.3,.7,1]){
      const levels=new Set();
      for(let t=0;t<2;t+=1/24){const b=filmLeakFrame({leak:1,white,time:t,seed}).burn;levels.add((b.scale*ATLAS.cells[b.a].exposure).toFixed(9));}
      assert.equal(levels.size,1,`burn level moved at white ${white}`);
    }
  }
});

test('on the real crossings the fog only steps back between frames of the same strength',()=>{
  for(const kind of['enter','arrive','leave','emerge'])for(let k=0;k<20;k++){
    const seed=(k+.5)/20,run=ATLAS.reels[filmLeakRoll(seed).reel].fog;let prev=null;
    for(let t=0;t<=neuralSeconds(kind);t+=1/60){
      const n=neuralFrame(kind,t),f=filmLeakFrame({leak:n.leak,white:n.white,time:n.time,seed});
      if(!f.fog.scale){prev=null;continue;}
      if(prev!==null&&prev!==f.fog.a){
        const rising=kind==='enter'||kind==='leave',back=rising?run.indexOf(f.fog.a)<run.indexOf(prev):run.indexOf(f.fog.a)>run.indexOf(prev);
        if(back){
          const[a,b]=[ATLAS.cells[prev].exposure,ATLAS.cells[f.fog.a].exposure];
          // Both are neighbours of the same centre frame, so each is within the ratio of it.
          assert.ok(Math.max(a,b)/Math.min(a,b)<FILM_LEAK.neighbourRatio**2,`${kind} stepped back from cell ${prev} to ${f.fog.a}`);
        }
      }
      prev=f.fog.a;
    }
  }
});

test('the post shader takes the film, and the painted leak is gone',()=>{
  const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const post=r3d.slice(r3d.indexOf('const POST_FRAG'),r3d.indexOf('export function r3dPostShaderSources'));
  for(const name of['uLeakPlate','uLeakPlateFog','uLeakPlateBurn','uLeakPlateGrid','uLeakFilmOnly']){
    assert.match(r3d,new RegExp(`uniform (sampler2D|vec4|float) ${name};`),`${name} is not declared`);
    assert.match(r3d,new RegExp(`postU\\('${name}'\\)`),`${name} is never set`);
  }
  assert.doesNotMatch(post,/Out-of-focus light|vec3\(1\.0,\.78,\.30\)/,'the bokeh discs or the painted ramp came back');
  assert.match(post,/leakGrainHash/,'grain on leakHash tiles every ten cells');
  assert.doesNotMatch(r3d.slice(r3d.indexOf('vec3 leakFilm('),r3d.indexOf('vec3 leakFilm(')+600),/leakNoise\(gl_FragCoord/,'grain on leakHash tiles every ten cells');
});
