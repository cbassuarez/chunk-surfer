// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// One finite route with fixed physical narrowing and widening. Saved-clock
// deterioration changes perception, never the geometry behind the driver.
// Distances parameterise forward -Z; all dimensions are metres, +lateral is right.
import {roadTreatmentAt} from './route-treatment.js';
const freezeRows=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));
export const ROUTE=Object.freeze({id:'source-cut-service-approach',length:1200,bridgeDistance:540,halfWidth:3.25,shoulderWidth:1.6,
  departure:{start:-32,fullEnd:20,end:85,extraWidth:4},pullIn:{start:816,end:906,fullStart:839,fullEnd:883,side:'left',extraWidth:2.7},
  arrival:{start:1110,stopStart:1194,stopEnd:1226,apronEnd:1244,extraLeftWidth:1.55,extraRightWidth:1.55},
  continuation:'Drive through the opening grey goods pair; the host carries the crossing into the next Source section without a stop or dismount prompt.'});
// Position and slope are evaluated as a C2 quintic profile in road.js. These
// changes include the cliff switchbacks; the bridge and final apron stay fixed.
export const ALIGNMENT=freezeRows([
 {d:-120,x:0,h:0},{d:0,x:0,h:0},{d:65,x:0,h:0},
 {d:180,x:-7,h:.6},{d:250,x:-33,h:4.2},{d:315,x:-7,h:8.8},
 {d:380,x:-40,h:10.0},{d:445,x:-1,h:7.8},
 {d:500,x:14,h:6.8},{d:540,x:18,h:6.5},{d:585,x:20,h:6.15},
 {d:710,x:5,h:3.2},{d:820,x:-17,h:1.65},{d:950,x:-34,h:1.7},
 {d:1060,x:-20,h:2.8},{d:1150,x:-6,h:3.45},{d:1200,x:0,h:3.5},
 {d:1244,x:0,h:3.5},{d:1400,x:0,h:3.5},
]);
// The lower road is deliberately level through the overhead crossing. Separate
// height-only keys avoid introducing spurious horizontal curvature at that seam.
export const HEIGHT_PROFILE=freezeRows([...ALIGNMENT.map(({d,h})=>({d,h})),{d:520,h:6.5},{d:560,h:6.5}].sort((a,b)=>a.d-b.d));
export const ROUTE_SECTIONS=freezeRows([
 {id:'departure-edge',start:0,end:160,title:'The service edge',role:'Learn the controls between a low retaining edge and an open field; forward road remains visible.'},
 {id:'rising-cutting',start:160,end:420,title:'A road with an outside',role:'A long left bend climbs between a held bank and the open flank; the far ridge is a stable reference.'},
 {id:'bridge-approach',start:420,end:600,title:'The crossing',role:'The road levels beneath one recognisable overpass. Unequal joint spacing stays fixed at 540 m.'},
 {id:'open-flank',start:600,end:816,title:'The open flank',role:'The bridge recedes on the correct side; drainage and the low valley become readable through the side window and mirror.'},
 {id:'sheltered-pull-in',start:816,end:970,title:'A place to stop',role:'A physically paved left bay gives a deliberate opportunity to stop, tune, record and look back without blocking the lane.'},
 {id:'goods-approach',start:970,end:1244,title:'The goods apron',role:'Retaining edge and paired trees frame the grey goods pair. Its leaves open before the moving van crosses the threshold.'},
]);
// Each placement has a reason and a finite range. mesh geometry uses local -Z
// longitudinal axes. Root consumes worldAt(d,lateral,lift), then yaw/pitch/scale.
const placement=(id,mesh,d,lateral,extra={})=>({id,mesh,d,lateral,lift:0,yaw:0,pitchWithRoad:false,scale:[1,1,1],layer:'mid',...(mesh==='drive_retaining_wall'?{collision:{shape:'box',localCentre:[.06,.675,0],halfSize:[.28,.675,.5]}}:{}),...extra});
const run=(id,mesh,start,end,step,lateral,extra={})=>Array.from({length:Math.floor((end-start)/step)+1},(_,i)=>placement(`${id}-${i}`,mesh,start+i*step,lateral,{...extra,scale:[...(extra.scale||[1,1,step+.04])]}));
export const ROUTE_PLACEMENTS=freezeRows([
 ...run('cutting-drain','drive_drain_channel',156,408,12,-4.12,{pitchWithRoad:true,layer:'fore',purpose:'Gravity-led roadside drainage on the rising retained bank.'}),
 ...run('cutting-bank','drive_bank',174,402,24,-8.0,{scale:[1.5,1.45,24.3],pitchWithRoad:true,purpose:'Broad earth behind the retaining edge rather than floating wall pieces.'}),
 ...run('outside-fence','drive_fence',246,317.3,3.1,7.3,{yaw:Math.PI/2,scale:[1,1,1],pitchWithRoad:true,purpose:'A bounded field edge; it stops before the bridge view.'}),
 placement('ridge-on-left','drive_terrain_ridge',315,-110,{scale:[1.3,1.5,1.2],layer:'back',purpose:'Stable far silhouette across the first bend.'}),
 placement('ridge-ahead','drive_terrain_ridge',690,124,{yaw:.35,scale:[1.6,1.0,1.5],layer:'back',purpose:'The open-flank background seen beyond the bridge.'}),
 placement('valley-left','drive_terrain_slope',681,-65,{yaw:Math.PI,scale:[1.8,.75,1.8],layer:'back',purpose:'The far road descends toward a low drainage valley beyond the overpass.'}),
 placement('valley-right','drive_terrain_slope',651,67,{scale:[1.6,.65,1.6],layer:'back',purpose:'A distant opposing slope gives depth beyond a flat black verge.'}),
 placement('bridge-earthwork-left','drive_bridge_earthwork',540,-6.7,{yaw:Math.PI,layer:'mid',purpose:'Raised earth supports the upper crossing at the actual end of the 14 m overpass deck.'}),
 placement('bridge-earthwork-right','drive_bridge_earthwork',540,6.7,{layer:'mid',purpose:'Opposing supported upper crossing; the lower carriageway remains clear.'}),
 ...run('underpass-drain','drive_drain_channel',520,560,8,-3.61,{scale:[1,1,8.04],pitchWithRoad:true,layer:'fore',purpose:'A narrow drain passes between the left road edge and overpass pier.'}),
 ...[[-1,510],[-1,575],[1,510],[1,575]].map(([side,d],i)=>placement('bridge-reflector-'+i,'drive_reflector',d,side*3.65,{yaw:side<0?Math.PI:0,layer:'fore',purpose:'Finite warning pair defines bridge width.'})),
 ...run('open-low-bank','drive_bank',624,780,26,7.0,{yaw:Math.PI,scale:[1.5,.6,26.2],pitchWithRoad:true,purpose:'One side remains open for the returning bridge and valley.'}),
 ...[666,731,781].map((d,i)=>placement('open-tree-'+i,'drive_tree',d,-(15+i*5),{yaw:i*.67,scale:[.9+i*.12,.95+i*.1,.9+i*.12],purpose:'Three separated recognisable trees, not repeated roadside wallpaper.'})),
 ...[821,902].map((d,i)=>placement('pullin-post-'+i,'drive_reflector',d,-6.7,{yaw:Math.PI,layer:'fore',purpose:'Two passive edge markers locate a real stopping bay.'})),
 placement('pullin-tree','drive_tree',871,-12.5,{yaw:-.6,scale:[1.2,1.1,1.1],purpose:'A singular side-window anchor for voluntary stopping.'}),
 placement('rise-screen','drive_terrain_slope',1010,60,{scale:[1.15,.85,1.5],layer:'back',purpose:'The final bend temporarily screens the destination without a fog-wall threshold.'}),
 ...run('goods-approach-drain','drive_drain_channel',1020,1128,12,4.1,{pitchWithRoad:true,layer:'fore',purpose:'Drainage collects at the goods approach, stops before the flat apron.'}),
 placement('goods-left-tree','drive_tree',1160,-11,{yaw:.3,scale:[1.1,1.2,1.05],purpose:'One of a visibly unequal terminal framing pair.'}),
 placement('goods-right-tree','drive_tree',1180,13,{yaw:-.8,scale:[.85,.9,.9],purpose:'Offset second terminal tree preserves depth and asymmetry.'}),
 placement('goods-stop-lamp','drive_pole',1208,-6.8,{yaw:0,purpose:'Single practical at the service apron; fixture lighting is supplied by root.'}),
]);
export const ROUTE_DRAIN_RANGES=freezeRows([{start:150,end:414,lateral:-4.12,adaptiveEdge:true},{start:516,end:564,lateral:-3.61}]);
export const ORDINARY_BRIDGE=Object.freeze({id:'ordinary-bridge',mesh:'drive_bridge',d:540,lateral:0,
  joints:[-1.8,0,2.7],spanStart:532,spanEnd:548,outerPierLateral:4.45,type:'overpass',clearance:4.7,upperDeckTop:5.3,
  requirements:['Keep the 540 m audio/physical identity and unequal joint offsets fixed.','The driven road is level beneath the overpass from 520 to 560 m; the deck is overhead, not a surface the van drives on.','Keep the lower carriageway and 4.7 m headroom open; the narrow roadside drain passes inside the left pier.','Retaining/terrain masses support each abutment and remain outside the carriageway.']});
export const ORDINARY_DESTINATION=Object.freeze({id:'grey-goods-service-apron',d:1228,lateral:-1.35,
  archetype:'bay-goods-pair',assemblyMeshes:['door_leaf_bay_goods','door_frame_goods','door_threshold_slab'],unsupportedMasonryHeadOmitted:true,
  stoppingRange:[1194,1226],apronEnd:1244,
  requirements:['Use the canonical goods pair, opening into the driven lane.','The whole van passes the threshold at speed; no stop or Enter interaction is required.','A physical threshold impulse accompanies the crossing without stopping or reversing the vehicle.','No lodge, phone, bus, new person or active side encounter is added.']});
export function routeLayoutBetween(from=-120,to=1400){return ROUTE_PLACEMENTS.filter(p=>(p.layer==='back'||p.d>=from&&p.d<=to)&&!p.id.startsWith('cutting-bank')&&!p.id.startsWith('outside-fence')&&!p.id.startsWith('goods-approach-drain')).map(p=>p.id.startsWith('cutting-drain')?{...p,lateral:-(roadTreatmentAt(p.d).halfWidth+.12)}:p);}
