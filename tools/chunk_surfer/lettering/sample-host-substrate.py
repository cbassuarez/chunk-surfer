#!/usr/bin/env python3
"""Barycentric reproject of actual opaque host PBR stock; no inferred color."""
from pathlib import Path
from PIL import Image
import hashlib,json,sys
import numpy as np

def unit(v):
 n=np.linalg.norm(v,axis=-1,keepdims=True)
 return v/np.maximum(n,1e-12)
def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
def srgb(a):return np.where(a<=.0031308,a*12.92,1.055*np.maximum(a,0)**(1/2.4)-.055)
images={}
def sample(file,uv,default):
 if not file:return np.broadcast_to(default,(*uv.shape[:-1],3)).copy()
 if file not in images:images[file]=np.asarray(Image.open(file).convert('RGB'),dtype=float)/255
 a=images[file];h,w=a.shape[:2]
 # glTF image rows and TEXCOORD_0 both have their origin at top left. Repeat
 # agrees with the imported repeat sampler and is applied before bilinear taps.
 x=(uv[...,0]%1)*w-.5;y=(uv[...,1]%1)*h-.5
 x0=np.floor(x).astype(int);y0=np.floor(y).astype(int);fx=(x-x0)[...,None];fy=(y-y0)[...,None]
 return ((a[y0%h,x0%w]*(1-fx)+a[y0%h,(x0+1)%w]*fx)*(1-fy)+
  (a[(y0+1)%h,x0%w]*(1-fx)+a[(y0+1)%h,(x0+1)%w]*fx)*fy)
def main():
 source=Path(sys.argv[1]);prefix=Path(sys.argv[2]);data=json.loads(source.read_text());w=data['width'];h=data['height']
 right=np.asarray(data['orientation']['readerRight']);up=np.asarray(data['orientation']['up']);normal=unit(np.cross(right,up))
 yy,xx=np.mgrid[:h,:w];x=((xx+.5)/w-.5)*data['widthM'];y=(.5-(yy+.5)/h)*data['heightM']
 depth=np.full((h,w),-np.inf);owner=np.full((h,w),-1,dtype=int);weights=np.zeros((h,w,3))
 for i,triangle in enumerate(data['triangles']):
  p=np.asarray(triangle['projected']);a=p[0];b=p[1];c=p[2]
  determinant=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(determinant)<1e-15:continue
  wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/determinant
  wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/determinant;wc=1-wa-wb
  d=wa*a[2]+wb*b[2]+wc*c[2]
  inside=(wa>=-1e-7)&(wb>=-1e-7)&(wc>=-1e-7)&(d<=.003)&(d>depth)
  owner[inside]=i;depth[inside]=d[inside];weights[inside]=np.stack([wa,wb,wc],axis=-1)[inside]
 missing=int(np.sum(owner<0))
 if missing:raise ValueError(f"{data['id']}: {missing}/{w*h} stock texels have no actual host surface")
 if np.max(depth)>.00005:raise ValueError(f"{data['id']}: overlay penetrates host by {np.max(depth)}m")
 if np.min(depth)<-.004:raise ValueError(f"{data['id']}: overlay floats {abs(np.min(depth))}m from host")
 rgb=np.zeros((h,w,3));mapped=np.zeros((h,w,3));orm=np.ones((h,w,3))
 for i,triangle in enumerate(data['triangles']):
  use=owner==i
  if not np.any(use):continue
  material=data['materials'][triangle['primitiveIndex']];bary=weights[use];uv=np.matmul(bary,np.asarray(triangle['uv'])) if triangle['uv'] else np.zeros((len(bary),2))
  factor=np.asarray(material['baseColorFactor'][:3]);base=sample(material['albedo'],uv,np.ones(3))
  rgb[use]=srgb(linear(base)*factor)
  p=np.asarray(triangle['points']);e1=p[1]-p[0];e2=p[2]-p[0]
  hostN=unit(np.matmul(bary,np.asarray(triangle['normals'])))
  texN=sample(material['normal'],uv,np.array([.5,.5,1]))*2-1;texN[:,:2]*=material['normalScale'];texN=unit(texN)
  if triangle['uv']:
   t=np.asarray(triangle['uv']);d1=t[1]-t[0];d2=t[2]-t[0];det=d1[0]*d2[1]-d1[1]*d2[0]
   if abs(det)>1e-12:
    hostT=unit((e1*d2[1]-e2*d1[1])/det);hostB=unit((-e1*d2[0]+e2*d1[0])/det)
   else:hostT=right;hostB=-up
  else:hostT=right;hostB=-up
  worldN=unit(texN[:,0,None]*hostT+texN[:,1,None]*hostB+texN[:,2,None]*hostN)
  mapped[use]=unit(np.stack([worldN@right,worldN@(-up),worldN@normal],axis=-1))*.5+.5
  packed=sample(material['orm'],uv,np.ones(3));packed[:,1]*=material['roughnessFactor'];packed[:,2]*=material['metallicFactor']
  if material['occlusion']:
   ao=sample(material['occlusion'],uv,np.ones(3))[:,0];packed[:,0]=1+material['occlusionStrength']*(ao-1)
  else:packed[:,0]=1
  orm[use]=packed
 for role,array in [('albedo',rgb),('normal',mapped),('orm',orm)]:
  Image.fromarray(np.uint8(np.clip(array,0,1)*255+.5),'RGB').save(str(prefix)+'-'+role+'.png')
 report={k:data[k] for k in ['id','sourceAsset','sourceAssetSha256','mesh','width','height','orientation']}
 report.update(dict(projectedTriangles=len(data['triangles']),missingTexels=missing,
  minimumSeparationM=float(-np.max(depth)),maximumSeparationM=float(-np.min(depth)),
  method='Actual host triangles, barycentric TEXCOORD_0, bilinear source images; linear baseColorFactor composition; tangent-space normal reprojection; exact rough/metal/AO factors.',
  outputs={role:hashlib.sha256(Path(str(prefix)+'-'+role+'.png').read_bytes()).hexdigest() for role in ['albedo','normal','orm']}))
 Path(str(prefix)+'-report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
