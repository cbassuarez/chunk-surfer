// Inlays belong to existing Source II treads and landings. They are visual
// construction details, never supports, collision, lights or objective arrows.
const freeze=Object.freeze;
const strip=(id,supportId,x,y,z,sx,sz)=>freeze({id,supportId,x,y,z,sx,sy:.018,sz});
const stair=(id,x,low,high,material,base)=>freeze({id,mesh:'rest-route-'+id,anchor:freeze({x,y:0,z:-29}),material,base:freeze(base),
  pieces:freeze(Array.from({length:14},(_,k)=>strip(id+'-'+k,id+'-'+k,0,high-(high-low)*k/14+.006,(k+1)*20/14-.055,3.70,.070)))});
export const SOURCE_REST_ROUTE_GROUPS=freeze([
  stair('wrong-east-stair',20,0,4.2,'worn-metal',[.58,.39,.22]),
  stair('wrong-west-stair',-12,4.2,8.4,'linen',[.70,.66,.54]),
  stair('wrong-return-stair',24,4.2,8.4,'wood',[.57,.43,.28]),
  freeze({id:'landing-joints',mesh:'rest-route-landing-joints',anchor:freeze({x:0,y:0,z:0}),material:'worn-metal',base:freeze([.58,.39,.22]),
    pieces:freeze([
      strip('east-foot','wrong-east-stair-foot',20,.006,-7.25,3.70,.09),
      strip('east-head','wrong-mid-east-head',20,4.206,-30.05,3.70,.09),
      strip('west-foot','wrong-west-stair-foot',-12,4.206,-7.25,3.70,.09),
      strip('west-head','wrong-upper-west-head',-12,8.406,-30.05,3.70,.09),
      strip('return-head','wrong-upper-east-head',24,8.406,-30.05,3.70,.09),
      strip('overlook','wrong-overlook-return-arm',3.85,8.406,3.02,.50,.09),
      strip('refuge-entry','wrong-upper-refuge',0,8.406,-19.48,5.10,.09),
      strip('refuge-turn','wrong-upper-refuge',.83,8.406,-22.55,1.32,.09),
    ])}),
]);
export const SOURCE_REST_ROUTE_BEATS=freeze([
  freeze({id:'entry',supportId:'wrong-east-stair-foot',at:freeze({x:20,y:0,z:-7.25}),purpose:'A warm metal edge identifies the first real stair against the opened instrument case.'}),
  freeze({id:'crossing',supportId:'wrong-mid-east-head',at:freeze({x:20,y:4.2,z:-30.05}),purpose:'The stair ends at a transverse joint; the soundboard landing opens across the interlocked construction.'}),
  freeze({id:'ascent',supportId:'wrong-west-stair-foot',at:freeze({x:-12,y:4.2,z:-7.25}),purpose:'Pale worn tread edges distinguish the climb toward the older masonry above.'}),
  freeze({id:'return',supportId:'wrong-upper-east-head',at:freeze({x:24,y:8.4,z:-30.05}),purpose:'Timber wear distinguishes the returning flight without turning the three stairs into identical stripes.'}),
  freeze({id:'overlook',supportId:'wrong-overlook-return-arm',at:freeze({x:3.85,y:8.4,z:3.02}),purpose:'A single copper cross-joint slows the eye at the real view of the original entry below.'}),
  freeze({id:'shelter',supportId:'wrong-upper-refuge',at:freeze({x:.83,y:8.4,z:-22.55}),purpose:'The same quiet metal joint turns into the screened music-room bay; its seat and western opening appear after the corner.'}),
]);
