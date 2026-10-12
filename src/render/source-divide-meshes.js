// Authored Source masonry uses the ordinary prop pass: material lighting,
// flashlight shadows and acquisition are shared with the actual GLB models.
// Geometry is recentered per piece so distance culling follows its real extent.
import { sourceDivideGeometry } from '../data/source-braided-divide.js';
import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };

export function divideMeshName(id) { return `source-divide-${id}`; }
export function dividePieceBounds(piece) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<piece.p.length;i++) { const axis=i%3;min[axis]=Math.min(min[axis],piece.p[i]);max[axis]=Math.max(max[axis],piece.p[i]); }
  return {min,max,center:min.map((v,i)=>(v+max[i])/2),radius:Math.hypot((max[0]-min[0])/2,(max[2]-min[2])/2)};
}

function sourceTexture(gl) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const context=canvas.getContext('2d');context.fillStyle='#d6d9d0';context.fillRect(0,0,512,512);
  context.font='13px monospace';context.textBaseline='top';
  const lines=Object.values(SOURCE_ATLAS.sectors).flatMap(sector=>sector.sourceLines||[]).map(line=>line.text).filter(text=>text.trim().length>12).slice(0,80);
  for(let row=0;row<26;row++){context.fillStyle=row%5===0?'#768477':'#a3afa0';context.fillText(lines[row%lines.length],8+(row%3)*9,row*20+3);}
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);return texture;
}

export function installDivideMeshes(gl,pack) {
  if(!gl||!pack?.catalog)return [];
  const geometry=sourceDivideGeometry(),names=geometry.map(p=>divideMeshName(p.id));
  if(names.every(name=>pack.catalog.has(name)))return names;
  const texture=sourceTexture(gl),identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  for(const piece of geometry){
    const name=divideMeshName(piece.id);if(pack.catalog.has(name))continue;
    const bounds=dividePieceBounds(piece),positions=[],normals=[],uvs=[];
    for(let j=0;j<piece.i.length;j+=3){
      const points=piece.i.slice(j,j+3).map(index=>piece.p.slice(index*3,index*3+3));
      const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1;
      for(let k=0;k<3;k++)n[k]/=length;
      const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
      for(const point of points){positions.push(...point.map((v,k)=>v-bounds.center[k]));normals.push(...n);uvs.push((axis===0?point[2]:point[0])/8,(axis===1?point[2]:point[1])/8);}
    }
    const vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,data,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,positions,3);bind(1,normals,3);bind(2,uvs,2);
    const indices=new Uint32Array(positions.length/3);for(let i=0;i<indices.length;i++)indices[i]=i;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);const stride=29*4;
    for(const [location,size,offset]of [[3,4,0],[4,4,4],[5,4,8],[6,4,12],[7,1,16],[8,1,17],[9,1,18],[10,4,19],[11,1,23],[12,4,24],[15,1,28]]){
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset*4);gl.vertexAttribDivisor(location,1);
    }
    pack.catalog.set(name,{name,nodeMatrix:identity,instanceBuffer,extras:{sourceDivide:true},primitives:[{vao,count:indices.length,indexType:gl.UNSIGNED_INT,base:[...(piece.color||[.68,.70,.64]).slice(0,3),1],emissive:[0,0,0],texture,metallic:0,roughness:.94,aoStrength:0,portrait:false,alphaCut:0,materialName:'source masonry',materialRole:'source-divide'}]});
  }
  gl.bindVertexArray(null);return names;
}
