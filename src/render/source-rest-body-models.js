// Static garment geometry uses the retained CC0 MakeHuman/contractor topology.
// Pose and timing belong to source-rest-body.js; this library owns no clock.
import {sourceRestBodyData} from './source-rest-body-data.js';

export const SOURCE_REST_BODY = Object.freeze({
  axes: 'X right, Y up, Z back', hipAboveSeat: .10, referenceHipHeight: .67,
  handAsset: 'assets/source-rest/seated-hands.glb',
  handEntries: Object.freeze({left:'rest_hand_left',right:'rest_hand_right'}),
  handMorphs: Object.freeze(['brace','slack']),
  handAxes: 'wrist origin; fingers -Z; dorsum +Y; palm -Y',
  sleeveAxis: '+Y from joint 0 to joint 1; transverse dimensions remain metres',
  cuffRange: Object.freeze([.895,1]),
  sourceLicense: 'CC0-1.0',
  ordinaryBodyDamage: false,
});

export function sourceRestBodyGeometryLibrary(){return sourceRestBodyData;}

// Vertical intersection against the real clothed thigh, not a guessed plane.
// Forward is positive into the lap while the mesh convention is -Z forward.
export function sourceRestBodyThighHeight(forward,right){
  if(!Number.isFinite(forward)||!Number.isFinite(right)||forward<.04||forward>.50||Math.abs(right)>.27)return null;
  const {p,i}=sourceRestBodyData['rest-body-lap'],x=right,z=-forward;let height=null;
  for(let n=0;n<i.length;n+=3){
    const a=i[n]*3,b=i[n+1]*3,c=i[n+2]*3,
      denominator=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);
    if(Math.abs(denominator)<1e-12)continue;
    const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/denominator,
      v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/denominator,w=1-u-v;
    if(u< -1e-7||v< -1e-7||w< -1e-7)continue;
    const y=u*p[a+1]+v*p[b+1]+w*p[c+1];
    // Reject the shin and the lower trouser surface if a top surface exists.
    if(y>-.22&&(height===null||y>height))height=y;
  }
  return height;
}
