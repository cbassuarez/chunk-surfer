// Small self-contained GLB fixture for animation and renderer integration tests.
export function characterFixture(edit=()=>{}) {
  const chunks=[],views=[],accessors=[];
  let length=0;
  const add=(array,type,componentType=5126,normalized=false)=>{
    const padding=(4-length%4)%4;if(padding){chunks.push(new Uint8Array(padding));length+=padding;}
    const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),view=views.length;
    views.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;
    const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16},index=accessors.length;
    accessors.push({bufferView:view,componentType,count:array.length/widths[type],type,...(normalized?{normalized:true}:{})});return index;
  };
  const f=(v,type)=>add(new Float32Array(v),type);
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const rootBind=[...identity],childBind=[...identity];rootBind[12]=-1;childBind[12]=-1;childBind[13]=-1;
  const attributes={POSITION:f([0,0,0,0,1,0,1,0,0],'VEC3'),NORMAL:f([0,0,1,0,0,1,0,0,1],'VEC3'),TEXCOORD_0:f([0,0,0,1,1,0],'VEC2'),JOINTS_0:add(new Uint8Array([0,0,0,0,1,0,0,0,0,1,0,0]),'VEC4',5121),WEIGHTS_0:add(new Uint8Array([255,0,0,0,255,0,0,0,128,127,0,0]),'VEC4',5121,true)};
  const indices=add(new Uint16Array([0,1,2]),'SCALAR',5123),binds=f([...rootBind,...childBind],'MAT4');
  const targets=[{POSITION:f([.25,0,0,.25,0,0,.25,0,0],'VEC3'),NORMAL:f([0,.1,0,0,.1,0,0,.1,0],'VEC3')}];
  const times=f([0,2],'SCALAR'),move=f([0,1,0,2,1,0],'VEC3'),weights=f([0,1],'SCALAR'),turn=f([0,0,0,1,0,0,1,0],'VEC4');
  const cubic=f([0,0,0,0,1,0,2,0,0,2,0,0,2,1,0,0,0,0],'VEC3');
  const json={asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:views,accessors,nodes:[{name:'Root',translation:[1,0,0],children:[1]},{name:'Neck',translation:[0,1,0]},{mesh:0,skin:0}],skins:[{joints:[0,1],inverseBindMatrices:binds}],meshes:[{name:'outskirts_fold_guard',weights:[0],extras:{targetNames:['rib_compression']},primitives:[{attributes,indices,targets,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.4,.4,.4,1],metallicFactor:0,roughnessFactor:.8}}],animations:[
    {name:'fold',samplers:[{input:times,output:move,interpolation:'LINEAR'},{input:times,output:weights,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:1,path:'translation'}},{sampler:1,target:{node:2,path:'weights'}}]},
    {name:'idle',samplers:[{input:times,output:turn,interpolation:'STEP'}],channels:[{sampler:0,target:{node:0,path:'rotation'}}]},
    {name:'turn',samplers:[{input:times,output:turn,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:0,path:'rotation'}}]},
    {name:'writhe',samplers:[{input:times,output:cubic,interpolation:'CUBICSPLINE'}],channels:[{sampler:0,target:{node:1,path:'translation'}}]},
  ]};
  const padding=(4-length%4)%4;if(padding){chunks.push(new Uint8Array(padding));length+=padding;}json.buffers[0].byteLength=length;
  edit(json);
  const jsonBytes=new TextEncoder().encode(JSON.stringify(json)),jsonLength=Math.ceil(jsonBytes.length/4)*4,total=12+8+jsonLength+8+length,buffer=new ArrayBuffer(total),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonLength);bytes.set(jsonBytes,20);
  view.setUint32(20+jsonLength,length,true);view.setUint32(24+jsonLength,0x004e4942,true);let at=28+jsonLength;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return buffer;
}
