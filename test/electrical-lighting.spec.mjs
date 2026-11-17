import test from 'node:test';
import assert from 'node:assert/strict';
import { QUAKE_FLICKER, lightstyleAt, createContactBurst, createPowerFault, samplePowerSupply,
  compileLampResponse, sampleLampResponse, createElectricalLighting } from '../src/game/electrical-lighting.js';
import { ELECTRICAL_FIXTURES } from '../src/data/electrical-fixtures.js';
import { allAuthoredLights, resolveLocalLights } from '../src/data/conservatory-lights.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { propPoweredMaterialScale } from '../src/render/prop-instance-layout.js';

const fixture = (id = 'test-tube', extra = {}) => ({ id, circuit: 'sp01', powerMode: 'circuit', color: [.8,.9,.7],
  electrical: { lamp: 'fluorescent' }, ...extra });
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('Quake lightstyles hold exact 100 ms samples and retain intermediate/overbright letters', () => {
  assert.equal(lightstyleAt('amz', 0), 0);
  assert.equal(lightstyleAt('amz', .099), 0);
  assert.equal(lightstyleAt('amz', .1), 1);
  near(lightstyleAt('amz', .2), 25 / 12);
  assert.equal(lightstyleAt('am', 0, {offset:-1}), 1);
  assert.equal(lightstyleAt('', 1), 1);
  assert.equal(lightstyleAt('invalid!', 1), 1);
  for (let i = 0; i < QUAKE_FLICKER.length; i++) assert.equal(lightstyleAt(QUAKE_FLICKER, (i + .5) / 10), QUAKE_FLICKER[i] === 'm' ? 1 : 0);
});

test('contact faults use repeatable, unequal holds with discontinuous edges', () => {
  const a = createContactBurst({seed:'contact-a',start:2}), b = createContactBurst({seed:'contact-a',start:2});
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, createContactBurst({seed:'contact-b',start:2}));
  assert.ok(Object.isFrozen(a) && a.every(Object.isFrozen));
  assert.ok(a.every((s,i) => !i || s.at > a[i-1].at));
  assert.equal(a.at(-1).level, 1);
  const widths = a.slice(1).map((s,i) => Math.round((s.at-a[i].at)*1000));
  assert.ok(new Set(widths).size > 3);
  const event = createPowerFault({type:'contact',seed:'contact-a',start:2,circuit:'sp01'});
  const edge = event.steps.find(s => s.level === 0);
  assert.equal(samplePowerSupply([event], edge.at - 1e-8, {circuit:'sp01'}).voltage, 1);
  assert.equal(samplePowerSupply([event], edge.at, {circuit:'sp01'}).voltage, 0);
});

test('phase, circuit and upstream faults have different spatial scopes', () => {
  const phase = createPowerFault({type:'phase-loss',phase:'B',start:2,duration:2});
  assert.equal(samplePowerSupply([phase], 3, {circuit:'sp02'}).voltage, 0);
  assert.equal(samplePowerSupply([phase], 3, {circuit:'sp05'}).voltage, 0);
  assert.equal(samplePowerSupply([phase], 3, {circuit:'sp01'}).voltage, 1);
  assert.equal(samplePowerSupply([phase], 4, {circuit:'sp02'}).voltage, 1);
  const local = createPowerFault({type:'outage',circuit:'sp02',start:2,duration:2});
  assert.equal(samplePowerSupply([local], 3, {circuit:'sp05'}).voltage, 1);
  const neutral = createPowerFault({type:'neutral',start:2,duration:4});
  assert.ok(samplePowerSupply([neutral], 3, {circuit:'sp01'}).voltage > 1);
  assert.ok(samplePowerSupply([neutral], 3, {circuit:'sp02'}).voltage < 1);
});

test('reclosers retry on a defined sequence, recover or stop in lockout', () => {
  const cleared = createPowerFault({type:'recloser',start:2,intervals:[1,3],closedSeconds:.2});
  const locked = createPowerFault({type:'recloser',start:2,intervals:[1,3],closedSeconds:.2,lockout:true});
  for (const t of [2,2.9,3.3,5]) assert.equal(samplePowerSupply([cleared], t).voltage, 0);
  assert.equal(samplePowerSupply([cleared], 3.1).voltage, 1);
  assert.equal(samplePowerSupply([cleared], 6.3).voltage, 1);
  assert.equal(samplePowerSupply([locked], 6.5).voltage, 0);
  assert.equal(samplePowerSupply([locked], 10000).voltage, 0);
});

test('a short interruption cuts the arc while this LED rides through and a filament decays', () => {
  const voltage = [{at:0,level:1},{at:2,level:0},{at:2.04,level:1}];
  const tube = compileLampResponse(voltage, {lamp:'fluorescent'});
  const led = compileLampResponse(voltage, {lamp:'led'});
  const filament = compileLampResponse(voltage, {lamp:'incandescent'});
  assert.equal(sampleLampResponse(tube, 2.001), 0);
  assert.equal(sampleLampResponse(tube, 2.04), 1, 'hot arc returns immediately');
  assert.equal(sampleLampResponse(led, 2.039), 1);
  assert.ok(sampleLampResponse(filament, 2.02) > 0 && sampleLampResponse(filament, 2.02) < 1);
  assert.equal(sampleLampResponse(filament, 3), 1);
});

test('a longer outage triggers distinct driver boot and irregular full-strength tube strikes', () => {
  const voltage = [{at:0,level:1},{at:2,level:0},{at:3,level:1}];
  const tube = compileLampResponse(voltage, {lamp:'fluorescent',seed:'old-tube'});
  const led = compileLampResponse(voltage, {lamp:'led'});
  assert.equal(sampleLampResponse(led, 2.061), 0);
  assert.equal(sampleLampResponse(led, 3.159), 0);
  assert.equal(sampleLampResponse(led, 3.161), 1);
  const strikes = tube.filter(s => s.at > 3 && s.level === 1);
  assert.ok(strikes.length >= 4);
  assert.ok(tube.every(s => !s.tau), 'arcs do not inherit generic easing');
  assert.equal(sampleLampResponse(tube, 6), 1);
  assert.ok(new Set(strikes.slice(1).map((s,i) => Math.round((s.at-strikes[i].at)*1000))).size > 1);
});

test('a new supply loss cancels pending restarts and preheat flashes', () => {
  const voltage = [{at:0,level:1},{at:1,level:0},{at:2,level:1},{at:2.05,level:0},{at:4,level:1}];
  for (const lamp of ['fluorescent','led']) {
    const program = compileLampResponse(voltage, {lamp});
    for (let t = 2.12; t < 4; t += .01) assert.equal(sampleLampResponse(program, t), 0);
    assert.equal(sampleLampResponse(program, 8), 1);
  }
});

test('absolute-time queries are deterministic across frame rates, query order and window boundaries', () => {
  const light = fixture('faulty', {electrical:{lamp:'fluorescent',fault:'ballast',quiet:[12,30]}});
  const a = createElectricalLighting({seed:'same'}), b = createElectricalLighting({seed:'same'});
  const canonical = Array.from({length:481}, (_,i) => a.sample(light, i / 4));
  for (const hz of [20,60,144]) for (let i = 0; i <= 8 * hz; i++) b.sample(light, i / hz);
  for (let i = canonical.length - 1; i >= 0; i--) assert.deepEqual(b.sample(light, i / 4), canonical[i]);
  near(a.sample(light,119.999).power, a.sample(light,120).power);
  for (const t of [NaN,Infinity,-3]) assert.deepEqual(a.sample(light,t),a.sample(light,0));
  const levels = new Set(Array.from({length:12000},(_,i) => a.sample(light,i/100).power));
  assert.ok(levels.has(0) && levels.has(1));
  assert.ok(levels.size < 15, 'held levels, not a continuously wandering brightness');
});

test('battery supply and reduced/off presentation remain steady while real breaker state still gates output', () => {
  const system = createElectricalLighting({automatic:false,faults:[createPowerFault({type:'outage',start:1,duration:8})]});
  const lamp = fixture(), battery = fixture('exit',{powerMode:'maintained',electrical:{lamp:'led'}});
  assert.equal(system.sample(lamp,4).power,0);
  assert.equal(system.sample(battery,4).power,1);
  for (const effectsMode of ['reduced','off']) {
    assert.equal(system.sample(lamp,4,{effectsMode}).power,1);
    assert.equal(system.sample(lamp,4,{effectsMode,powered:false}).power,0);
  }
  system.setFaults([]);
  assert.equal(system.sample(lamp,4).power,1);
});

test('every authored electrical profile names a real ordinary fixture', () => {
  const authored = new Map(allAuthoredLights().map(light => [light.id,light]));
  for (const [id,profile] of Object.entries(ELECTRICAL_FIXTURES)) {
    assert.ok(authored.has(id), `${id} exists`);
    assert.equal(authored.get(id).kind,'fitting');
    assert.equal(authored.get(id).electrical,profile);
  }
});

test('resolved power drives illumination and all bulb materials, including lamps outside the slot budget', () => {
  const system = createElectricalLighting({automatic:false,faults:[createPowerFault({type:'outage',circuit:'sp01',start:1,duration:8})]});
  const context = {group:'basement',zone:ZONE.plant};
  let practical;
  const selected = resolveLocalLights(context,{timeSec:4,liveCircuits:['sp01'],electricalSystem:system,
    slots:1,onPracticalLights:lights=>{practical=lights;}});
  assert.equal(selected.length,1);
  const fittings = practical.filter(light=>light.kind==='fitting');
  assert.ok(fittings.length >= 3);
  for (const light of fittings) {
    assert.equal(light.intensity,0);
    assert.equal(light.emissiveScale,0);
    assert.equal(propPoweredMaterialScale({},light.emissiveScale,true),0);
  }
  resolveLocalLights(context,{timeSec:4,liveCircuits:[],onPracticalLights:lights=>{practical=lights;}});
  assert.equal(practical.find(light=>light.id==='plant-service-live').emissiveScale,0);
  assert.equal(propPoweredMaterialScale({},.25,true),.25);
  assert.equal(propPoweredMaterialScale({},.25),1,'unrelated painted props retain their reflected material');
});
