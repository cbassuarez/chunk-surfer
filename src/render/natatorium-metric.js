// A one-to-one, longitudinal presentation metric. Simulation, lighting and
// material coordinates stay in authored metres; only image formation uses F.
export const NATATORIUM_METRIC_IDENTITY=Object.freeze({pivotZ:0,near:3.5,span:14,k:0});
export const NATATORIUM_METRIC_LIMITS=Object.freeze({near:3.5,span:14,minK:-2.1,maxK:2.8,far:320});
export function normalizeNatatoriumMetric(value){
  if(!value||!Number.isFinite(value.pivotZ)||!Number.isFinite(value.k))return NATATORIUM_METRIC_IDENTITY;
  const k=Math.max(NATATORIUM_METRIC_LIMITS.minK,Math.min(NATATORIUM_METRIC_LIMITS.maxK,value.k));
  if(Math.abs(k)<1e-6)return NATATORIUM_METRIC_IDENTITY;
  return {pivotZ:value.pivotZ,near:3.5,span:14,k};
}
export function natatoriumMetricZ(z,metric=NATATORIUM_METRIC_IDENTITY){
  const m=normalizeNatatoriumMetric(metric),a=m.pivotZ+m.near,d=z-a;
  if(m.k===0||d<=0)return z;
  const end=m.span*Math.expm1(m.k)/m.k,slope=Math.exp(m.k);
  return a+(d<m.span?m.span*Math.expm1(m.k*d/m.span)/m.k:end+(d-m.span)*slope);
}
export function natatoriumMetricInverseZ(z,metric=NATATORIUM_METRIC_IDENTITY){
  const m=normalizeNatatoriumMetric(metric),a=m.pivotZ+m.near,d=z-a;
  if(m.k===0||d<=0)return z;
  const end=m.span*Math.expm1(m.k)/m.k,slope=Math.exp(m.k);
  return a+(d<end?m.span*Math.log1p(m.k*d/m.span)/m.k:m.span+(d-end)/slope);
}
export function natatoriumMetricPoint(point,metric){return [point[0],point[1],natatoriumMetricZ(point[2],metric)];}
export function natatoriumMetricInversePoint(point,metric){return [point[0],point[1],natatoriumMetricInverseZ(point[2],metric)];}
export function natatoriumMetricUniform(metric){const m=normalizeNatatoriumMetric(metric);return [m.pivotZ,m.near,m.span,m.k];}
export function natatoriumMetricRayPoint(origin,direction,distance,metric){
  const p=natatoriumMetricPoint(origin,metric).map((v,i)=>v+direction[i]*distance);
  return natatoriumMetricInversePoint(p,metric);
}
// Exact time to the NEXT authored z-grid boundary, in rendered ray metres.
// A fixed increment is invalid under this metric, even for a straight ray.
export function natatoriumMetricBoundaryTime(boundaryZ,originZ,directionZ,metric){
  if(Math.abs(directionZ)<1e-9)return Infinity;
  return (natatoriumMetricZ(boundaryZ,metric)-natatoriumMetricZ(originZ,metric))/directionZ;
}
export const NATATORIUM_METRIC_GLSL=`
uniform vec4 uNatatoriumMetric; // body z, untouched near metres, span metres, exponent
bool natatoriumMetricActive(){return abs(uNatatoriumMetric.w)>.000001;}
float natatoriumExpm1(float x){return abs(x)<.01?x*(1.0+x*(.5+x*(.1666666667+x*.0416666667))):exp(x)-1.0;}
float natatoriumLog1p(float x){return abs(x)<.01?x*(1.0+x*(-.5+x*(.3333333333-x*.25))):log(max(.000001,1.0+x));}
float natatoriumMetricZ(float z){
  float k=uNatatoriumMetric.w,a=uNatatoriumMetric.x+uNatatoriumMetric.y,d=z-a,L=uNatatoriumMetric.z;
  if(abs(k)<.000001||d<=0.0)return z;
  float end=L*natatoriumExpm1(k)/k;
  return a+(d<L?L*natatoriumExpm1(k*d/L)/k:end+(d-L)*exp(k));
}
float natatoriumMetricInverseZ(float z){
  float k=uNatatoriumMetric.w,a=uNatatoriumMetric.x+uNatatoriumMetric.y,d=z-a,L=uNatatoriumMetric.z;
  if(abs(k)<.000001||d<=0.0)return z;
  float end=L*natatoriumExpm1(k)/k;
  return a+(d<end?L*natatoriumLog1p(k*d/L)/k:L+(d-end)/exp(k));
}
vec3 natatoriumMetricPoint(vec3 p){return vec3(p.xy,natatoriumMetricZ(p.z));}
vec3 natatoriumMetricInversePoint(vec3 p){return vec3(p.xy,natatoriumMetricInverseZ(p.z));}
vec3 natatoriumMetricRayPoint(vec3 origin,vec3 direction,float distance){
  return natatoriumMetricInversePoint(natatoriumMetricPoint(origin)+direction*distance);
}
`;
