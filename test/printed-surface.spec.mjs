import test from 'node:test';
import assert from 'node:assert/strict';
import {printedSurfaceDescriptor,encodePrintedSurface,encodePrintedAreaSurface,decodePrintedSurface,packPropWorldDepth,unpackPropWorldDepth,
  PRINTED_SURFACE_SOURCE_ROUTE_BYTE,PRINTED_SURFACE_SOURCE_ROUTE_FAMILY,PRINTED_SURFACE_GLSL} from '../src/render/printed-surface.js';
import {FIRE_ESCAPE_INK_BYTE} from '../src/render/fire-escape-ink.js';
import {ROOF_SURFACE_INK_BYTE,ROOF_GLASS_INK_BYTE} from '../src/render/roof-surface-ink.js';

test('authored pigment remains opaque and cannot claim unrelated material tags',()=>{
  for(const kind of [1,2])for(let i=0;i<16;i++){
    const tag=encodePrintedSurface(i/15,kind),stored=Math.round(tag*255)/255;
    assert.deepEqual(decodePrintedSurface(stored),{kind,coverage:i/15});
    assert.ok(Math.round(tag*255)>128&&Math.round(tag*255)<174);
  }
  for(const byte of [0,128,255,FIRE_ESCAPE_INK_BYTE,ROOF_SURFACE_INK_BYTE,ROOF_GLASS_INK_BYTE])
    assert.equal(decodePrintedSurface(byte/255).kind,0);
  for(let byte=174;byte<=219;byte++)assert.equal(decodePrintedSurface(byte/255).kind,0);
  assert.equal(encodePrintedSurface(1,0),0);
  assert.equal(printedSurfaceDescriptor(null),null);
  const contract={version:1,coverage:'baseColorAlpha',polarity:'dark-on-light',process:'vitreous enamel'};
  assert.equal(printedSurfaceDescriptor(contract).emission,'none');
  assert.throws(()=>printedSurfaceDescriptor(contract,{alphaMode:'MASK'}),/OPAQUE/);
  assert.throws(()=>printedSurfaceDescriptor(contract,{hasTexture:false}),/texture/);
  assert.throws(()=>printedSurfaceDescriptor({...contract,polarity:'guess-from-luma'}),/contract/);
});

test('area-averaged dark paper is explicit and cannot alias solid paint or structured marks',()=>{
  const reserved=new Set();
  for(let i=0;i<16;i++){
    const tag=encodePrintedAreaSurface(i/15),byte=Math.round(tag*255);reserved.add(byte);
    assert.deepEqual(decodePrintedSurface(byte/255),{kind:1,coverage:i/15,area:true});
    assert.ok(byte>=112&&byte<=127);
    for(const kind of[1,2])assert.notEqual(tag,encodePrintedSurface(i/15,kind));
  }
  for(let byte=0;byte<256;byte++){
    const decoded=decodePrintedSurface(byte/255),solid=(byte>=136&&byte<=151)||(byte>=156&&byte<=171),route=byte>=80&&byte<=95;
    assert.equal(decoded.kind>0,reserved.has(byte)||solid||route,`byte ${byte} falsely classified`);
    assert.equal(decoded.area===true,reserved.has(byte));
    assert.equal(decoded.family===PRINTED_SURFACE_SOURCE_ROUTE_FAMILY,route);
  }
  const base={version:1,coverage:'baseColorAlpha',polarity:'dark-on-light'};
  assert.equal(printedSurfaceDescriptor({...base,sampling:'area'}).sampling,'area');
  assert.deepEqual(Object.keys(printedSurfaceDescriptor(base)),['version','coverage','polarity','process','emission']);
  assert.throws(()=>printedSurfaceDescriptor({...base,sampling:'area',coverage:'solid'}),/Area print/);
  assert.throws(()=>printedSurfaceDescriptor({...base,sampling:'area',polarity:'light-on-dark'}),/Area print/);
  assert.throws(()=>printedSurfaceDescriptor({...base,sampling:'guessed'}),/sampling/);
});

test('Source-II route identity is explicit, opaque light-on-dark pigment with no area sampling',()=>{
  const family=PRINTED_SURFACE_SOURCE_ROUTE_FAMILY;
  assert.equal(family,'source-ii-route');assert.equal(PRINTED_SURFACE_SOURCE_ROUTE_BYTE,80);
  const base={version:1,coverage:'baseColorAlpha',polarity:'light-on-dark'},route={...base,family};
  assert.deepEqual(printedSurfaceDescriptor(route),{...base,process:'printed pigment',emission:'none',family});
  assert.ok(Object.isFrozen(printedSurfaceDescriptor(route)));
  assert.deepEqual(Object.keys(printedSurfaceDescriptor(base)),['version','coverage','polarity','process','emission']);
  assert.deepEqual(printedSurfaceDescriptor({...base,family:undefined}),printedSurfaceDescriptor(base));
  for(const invalid of [{family:'unknown'},{family:null},{family,coverage:'solid'},{family,polarity:'dark-on-light'},
    {family,polarity:3},{family,sampling:'area'}]){
    assert.throws(()=>printedSurfaceDescriptor({...route,...invalid}),/contract|Area print/);
  }
  assert.throws(()=>printedSurfaceDescriptor(route,{hasTexture:false}),/texture/);
  assert.throws(()=>printedSurfaceDescriptor(route,{alphaMode:'MASK'}),/OPAQUE/);
  for(const polarity of [0,1,3,'dark-on-light','unknown'])assert.equal(encodePrintedSurface(.5,polarity,{family}),0);
  assert.equal(encodePrintedSurface(.5,2,{family:'unknown'}),0);
  assert.equal(encodePrintedSurface(.5,2,{family:null}),0);
});

test('all sixteen Source-II route coverage levels survive RGBA8 storage without aliases',()=>{
  const family=PRINTED_SURFACE_SOURCE_ROUTE_FAMILY;
  for(let level=0;level<16;level++)for(const polarity of [2,'light-on-dark']){
    for(const offset of [-.49,0,.49]){
      const tag=encodePrintedSurface((level+offset)/15,polarity,{family}),byte=Math.round(tag*255);
      assert.equal(byte,80+level);
      assert.deepEqual(decodePrintedSurface(byte/255),{kind:2,coverage:level/15,family});
      assert.notEqual(tag,encodePrintedSurface(level/15,1));
      assert.notEqual(tag,encodePrintedSurface(level/15,2));
      assert.notEqual(tag,encodePrintedAreaSurface(level/15));
    }
  }
  assert.equal(encodePrintedSurface(-Infinity,2,{family}),80/255);
  assert.equal(encodePrintedSurface(Infinity,2,{family}),95/255);
});

// Execute the scalar shader contract itself as JavaScript: these helpers use
// only scalar declarations, floor and clamp. This catches JS/GLSL range drift
// without a GPU and does not substitute another implementation of the tags.
function shaderScalar(name,dependencies={}){
  const match=PRINTED_SURFACE_GLSL.match(new RegExp(`float ${name}\\(([^)]*)\\)\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match,`${name} shader helper is present`);
  const parameters=match[1].split(',').filter(Boolean).map(parameter=>parameter.trim().split(/\s+/).at(-1));
  const body=match[2].replace(/\bfloat\b/g,'let');
  return new Function('floor','clamp',...Object.keys(dependencies),...parameters,body)
    .bind(null,Math.floor,(value,min,max)=>Math.max(min,Math.min(max,value)),...Object.values(dependencies));
}

test('GLSL and JavaScript agree on every byte, route boundary and coverage quantization',()=>{
  const route=shaderScalar('printedSurfaceSourceRoute'),area=shaderScalar('printedSurfaceArea');
  const kind=shaderScalar('printedSurfaceKind',{printedSurfaceSourceRoute:route});
  const coverage=shaderScalar('printedSurfaceCoverage',{printedSurfaceSourceRoute:route,printedSurfaceKind:kind,printedSurfaceArea:area});
  const routeTag=shaderScalar('printedSourceRouteTag'),standardTag=shaderScalar('printedSurfaceTag');
  for(let byte=0;byte<256;byte++){
    const tag=byte/255,decoded=decodePrintedSurface(tag),expectedRoute=byte>=80&&byte<=95;
    assert.equal(route(tag),expectedRoute?1:0,`route identity at byte ${byte}`);
    assert.equal(kind(tag),decoded.kind,`kind at byte ${byte}`);
    assert.equal(coverage(tag),decoded.coverage,`coverage at byte ${byte}`);
    assert.equal(area(tag),decoded.area?1:0,`area identity at byte ${byte}`);
    if(expectedRoute)assert.deepEqual(decoded,{kind:2,coverage:(byte-80)/15,family:'source-ii-route'});
  }
  for(const boundary of [79.5,95.5,111.5,127.5,135.5,151.5,155.5,171.5])for(const offset of [-.0001,0,.0001]){
    const tag=(boundary+offset)/255,decoded=decodePrintedSurface(tag);
    assert.equal(kind(tag),decoded.kind,`kind around byte ${boundary}`);
    assert.equal(coverage(tag),decoded.coverage,`coverage around byte ${boundary}`);
    assert.equal(route(tag),decoded.family==='source-ii-route'?1:0,`family around byte ${boundary}`);
  }
  for(let sample=-1;sample<=256;sample++){
    const pigment=sample/255;
    assert.equal(routeTag(pigment),encodePrintedSurface(pigment,2,{family:'source-ii-route'}));
    for(const polarity of [0,1,2,3])assert.equal(standardTag(pigment,polarity),encodePrintedSurface(pigment,polarity));
  }
});

test('reusing the depth slot preserves the hardware depth quantization',()=>{
  for(let i=0;i<=100000;i++){
    const depth=i/100000,rgb=packPropWorldDepth(depth).map(v=>Math.round(v*255)/255);
    const expected=Math.round(depth*16777215)/16777215;
    assert.ok(Math.abs(unpackPropWorldDepth(rgb)-expected)<1e-14,`depth ${depth}`);
  }
  assert.equal(unpackPropWorldDepth(packPropWorldDepth(0)),0);
  assert.equal(unpackPropWorldDepth(packPropWorldDepth(1)),1);
});
