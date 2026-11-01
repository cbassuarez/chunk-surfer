import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_REST_STARS_GLSL,sourceRestStarCoordinates,sourceRestStarsFrame} from '../src/render/source-rest-stars.js';

function starCentres(){
  const result=[];
  // Construct world directions from the angular cell's seeded centre. These
  // are procedural sky coordinates, not an astronomical catalogue.
  for(let x=0;x<88;x++)for(let y=56;y<86;y++){
    const seed=sourceRestStarCoordinates([-1,(y+.5)/44-1,(x+.5)/44-1]),
      ray=[-1,(y+seed.center[1])/44-1,(x+seed.center[0])/44-1],
      initial=sourceRestStarsFrame({ray,reveal:0}),late=sourceRestStarsFrame({ray,reveal:1});
    if(late.star>0)result.push({ray,initial,late});
  }
  return result;
}

test('the celestial lattice is fixed to normalized world direction across every cubemap face',()=>{
  for(const[ray,face]of[[[1,.1,.2],0],[[-1,.1,.2],1],[[.1,1,.2],2],[[.1,-1,.2],3],[[.1,.2,1],4],[[.1,.2,-1],5]]){
    const a=sourceRestStarCoordinates(ray),b=sourceRestStarCoordinates(ray.map(n=>n*17));
    assert.equal(a.face,face);assert.deepEqual(a.cell,b.cell);assert.deepEqual(a.center,b.center);
    assert.ok(a.center.every(n=>n>=.3&&n<=.7));assert.ok(a.uv.every(n=>n>=-1&&n<=1));
  }
  const ray=[-1,.45,.23],a=sourceRestStarsFrame({ray,reveal:.8});
  assert.deepEqual(a,sourceRestStarsFrame({ray,reveal:.8,time:900,camera:[200,40,-300]}),'there is no time, player-position or note-clock input to move or twinkle the sky');
  assert.ok(sourceRestStarsFrame({ray:[0,0,0],reveal:1}).rgb.every(Number.isFinite));
});

test('the same few landmarks persist while later reveal adds varied stellar magnitudes',()=>{
  const points=starCentres(),initial=points.filter(p=>p.initial.star>0),later=points.filter(p=>p.late.star>0);
  assert.ok(initial.length>=5&&initial.length<later.length/2);
  assert.ok(later.length>40&&later.length<200,'a sparse star field, not a screen of equal-density confetti');
  assert.ok(initial.every(p=>p.late.star>=p.initial.star),'reveal never replaces existing stars with new positions');
  const magnitudes=later.map(p=>p.late.star);assert.ok(Math.max(...magnitudes)>Math.min(...magnitudes)*2);
  assert.ok(Math.max(...later.flatMap(p=>p.late.rgb))<.81,'even the bright pinpoints have bounded radiance');
});

test('clouds and storm cover the actual field and dust without moving their coordinates',()=>{
  const point=starCentres().find(p=>p.late.star>.5);assert.ok(point);
  for(const options of[{cloudCover:1},{stormCover:1}]){
    const obscured=sourceRestStarsFrame({ray:point.ray,reveal:1,...options});assert.deepEqual(obscured.rgb,[0,0,0]);
    assert.deepEqual(obscured.coordinates,point.late.coordinates);
  }
  const half=sourceRestStarsFrame({ray:point.ray,reveal:1,cloudCover:.5});
  half.rgb.forEach((v,i)=>assert.ok(Math.abs(v-point.late.rgb[i]*.25)<1e-12));
  assert.deepEqual(sourceRestStarsFrame({ray:[-1,-.2,0],reveal:1}).rgb,[0,0,0],'the vault has no stars under the horizon');
});

test('the desaturated dust band appears late, stays angularly continuous and remains much fainter than stars',()=>{
  const ray=[-1,.4,0],early=sourceRestStarsFrame({ray,reveal:0}),late=sourceRestStarsFrame({ray,reveal:1}),
    nearby=sourceRestStarsFrame({ray:[-1,.40001,0],reveal:1});
  assert.equal(early.dust,0);assert.ok(late.dust>.005&&late.dust<.027);
  assert.ok(Math.abs(late.dust-nearby.dust)<.00001);
  assert.ok(late.dust<starCentres().find(p=>p.late.star>.5).late.star*.06);
});

test('the injectable shader uses one bounded angular lookup, derivative antialiasing, and no extra rendering owner',()=>{
  assert.match(SOURCE_REST_STARS_GLSL,/vec3 sourceRestStars\(vec3 worldRay,float reveal,float cloudCover,float stormCover\)/);
  assert.equal((SOURCE_REST_STARS_GLSL.match(/sourceRestStarHash\(cell/g)||[]).length,1);
  assert.match(SOURCE_REST_STARS_GLSL,/fwidth\(p\)/);assert.match(SOURCE_REST_STARS_GLSL,/major\*major\*major/);
  assert.doesNotMatch(SOURCE_REST_STARS_GLSL,/uniform|sampler|gl_FragCoord|gl_FragDepth|discard|uTime|\bfor\s*\(|\bwhile\s*\(/);
  assert.ok(SOURCE_REST_STARS_GLSL.length<2600,'one small function joins the existing background acquisition');
});

test('production Source injects the field only into empty sunset background before the existing acquisition',()=>{
  const host=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),
    source=host.slice(host.indexOf('const SOURCE_ROOM_ACQUISITION_FRAG'),host.indexOf('// Exact door absence after POST')),
    background=source.indexOf('if(uRestSky.x>.001&&material.a<.001)'),
    stars=source.indexOf('dusk+=sourceRestStars(ray,starReveal,uRestClouds.x,veil)'),
    sunset=source.indexOf('overcast=mix(overcast,dusk,'),water=source.indexOf('acquired=coastalWaterComposite(');
  assert.match(host,/import \{SOURCE_REST_STARS_GLSL\} from '\.\/source-rest-stars\.js'/);
  assert.ok(source.includes('${SOURCE_REST_STARS_GLSL}'));
  assert.ok(background<stars&&stars<sunset&&sunset<water,'real material/depth stays in front of the celestial sphere');
  assert.match(host,/const encoded=runPixelMeshPass\(\{\.\.\.worldState,hushBodyAllowed:false\},now\)/,'the existing world acquisition still records the resolved sky');
});
