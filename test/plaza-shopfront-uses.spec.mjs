import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_SHOPFRONTS} from '../src/data/plaza-shopfronts.js';
import {addSouthShopDeed} from '../tools/chunk_surfer/exterior-shop-massing.mjs';

const build=()=>{
  const materials=[],shapes=[],api={materials,
    addBox:(owner,center,size,material)=>shapes.push({kind:'box',center,size,material}),
    addBeam:(owner,a,b,width,material)=>shapes.push({kind:'beam',a,b,width,material}),
    addCylinder:(owner,center,radius,height,material)=>shapes.push({kind:'cylinder',center,radius,height,material}),
    addQuad:(owner,...args)=>shapes.push({kind:'quad',points:args.slice(0,4),material:args[4]}),
    addTriangle:(owner,a,b,c,material)=>shapes.push({kind:'triangle',points:[a,b,c],material}),
  };
  const reports=PLAZA_SHOPFRONTS.map((use,i)=>{
    const deed=i<2?i+2:i;
    return addSouthShopDeed(api,{name:'district_civic_frontage'},{deed,z:-28+8*deed,h:12.8,useIndex:i});
  });
  return{reports,materials,shapes};
};

test('every existing commercial deed has a legible distinct use rather than generic display blocks',()=>{
  const{reports}=build();
  assert.equal(new Set(reports.map(r=>r.use)).size,8);
  assert.equal(new Set(PLAZA_SHOPFRONTS.map(r=>r.display)).size,8);
  const cues=['press-screw','instrument-lower-0','book-0-0','folio-0-0','vase-0','dress-form-torso','coffee-machine','duplicator-body'];
  for(const[i,r]of reports.entries()){
    assert.equal(r.name,PLAZA_SHOPFRONTS[i].name);
    assert.ok(r.parts.some(p=>p.id.startsWith(`shop-${r.use}-${cues[i]}`)),`${r.name} has particular stock or equipment`);
    assert.equal(r.lettering[0].text,r.name);
    assert.ok(r.lettering[0].capHeight>=.20,'fascia has street-scale physical lettering');
    assert.ok(r.parts.find(p=>p.id==='physical-fascia-name').points.length>30,'lettering is real font outline geometry');
    assert.equal(r.parts.some(p=>p.id.startsWith('display-stock-')),false);
  }
});

test('display contents occupy real depth behind the frame and before the building body',()=>{
  const{reports}=build();
  for(const r of reports){
    const body=r.parts.find(p=>p.id==='occupied-back-volume');
    const bodyFront=body.center[0]+body.size[0]/2;
    const back=r.parts.find(p=>p.id.endsWith('-room-back'));
    assert.ok(back.center[0]-back.size[0]/2>bodyFront+.1);
    const reveal=r.parts.find(p=>p.id==='display-reveal--1');
    assert.ok(reveal.size[0]>=.9,'an actual display cavity replaces the former 270mm skin');
    const lamp=r.parts.find(p=>p.id.endsWith('-ceiling-light'));
    assert.equal(!!lamp,r.lit);
    assert.ok(!lamp||lamp.size[0]*lamp.size[2]<.3,'illumination belongs to a small room fixture');
    assert.notEqual(back.material,'warm','the entire rear wall is not a luminous window panel');
    assert.ok(r.parts.some(p=>p.id==='closed-door-leaf'),'furnishings do not invent an operable entrance');
  }
});

test('early closures are selective, explicit and independent of upstairs occupation',()=>{
  const{reports,materials}=build();
  assert.deepEqual(reports.filter(r=>r.closedForVigil).map(r=>r.use),['secondhand-books','tailor']);
  assert.ok(reports.some(r=>r.lit)&&reports.some(r=>!r.lit));
  for(const r of reports){
    const paper=r.parts.find(p=>p.id==='early-closure-paper');
    assert.equal(!!paper,r.closedForVigil);
    if(paper){
      assert.deepEqual(r.lettering.slice(1).map(l=>l.text),['CLOSED EARLY','FOR THE VIGIL']);
      assert.ok(r.parts.some(p=>p.id.endsWith('-lowered-roller-blind')));
    }
    assert.ok(r.parts.some(p=>p.id.startsWith('upper-')&&p.id.endsWith('-back')),'flats retain their own window pattern');
  }
  assert.ok(materials.every(m=>!m.alphaMode&&!m.pbrMetallicRoughness.baseColorTexture),'no extra texture atlas or alpha rendering dependency');
});

test('occupied display stock has restrained baked bounce with unchanged physical materials',()=>{
  const{materials,reports}=build(),byName=name=>materials.find(m=>m.name===name);
  const variants=[
    ['shop lit ivory stock','shop ivory stock',[.16,.125,.078]],
    ['shop lit dark wood','dark wood',[.045,.027,.012]],
    ['shop lit painted steel','painted steel',[.055,.05,.037]],
    ['shop lit green stock','pub green paint',[.018,.04,.024]],
    ['shop lit terracotta stock','dull terracotta',[.08,.038,.018]],
  ];
  const fixture=byName('occupied warm glass'),back=byName('shop reflected warm plaster');
  const luminance=rgb=>rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  for(const[name,ordinary,emission]of variants){
    const lit=byName(name),base=byName(ordinary);
    assert.deepEqual(lit.pbrMetallicRoughness,base.pbrMetallicRoughness,`${name} retains its surface`);
    assert.deepEqual(lit.emissiveFactor,emission);
    assert.ok(luminance(lit.emissiveFactor)>luminance(back.emissiveFactor),'stock reads ahead of the dim backing');
    assert.ok(luminance(lit.emissiveFactor)<luminance(fixture.emissiveFactor)*.25,'small ceiling fixture remains the strongest source');
  }
  for(const r of reports.filter(r=>r.lit)){
    assert.ok(r.parts.some(p=>p.id.startsWith(`shop-${r.use}-`)&&p.material.startsWith('lit')),'occupied stock receives baked bounce');
    assert.equal(r.parts.find(p=>p.id.endsWith('-interior-floor')).material,'wood');
    assert.equal(r.parts.find(p=>p.id.endsWith('-room-back')).material,'interior');
    assert.equal(r.parts.find(p=>p.id.endsWith('-ceiling-light')).material,'warm');
    assert.equal(r.parts.find(p=>p.id==='physical-fascia-name').material,'paper','painted facade lettering stays unlit');
    assert.ok(r.parts.every(p=>!p.material.startsWith('lit')||p.id.startsWith(`shop-${r.use}-`)),'bounce is confined to internal display primitives');
  }
});

test('unlit shop stock, closures and external fabric never receive occupied-display illumination',()=>{
  const{reports}=build();
  for(const r of reports){
    if(!r.lit){
      assert.equal(r.parts.some(p=>p.material.startsWith('lit')),false,`${r.name} keeps dark contents`);
      assert.equal(r.parts.find(p=>p.id.endsWith('-room-back')).material,'black');
      assert.equal(r.parts.some(p=>p.id.endsWith('-ceiling-light')),false);
    }
    assert.equal(r.parts.filter(p=>!p.id.startsWith(`shop-${r.use}-`)).some(p=>p.material.startsWith('lit')),false,'facades and physical signs keep their original material');
    if(r.closedForVigil){
      assert.equal(r.parts.find(p=>p.id==='early-closure-paper').material,'paper');
      assert.equal(r.parts.find(p=>p.id.endsWith('-lowered-roller-blind')).material,'wood');
    }
  }
});
