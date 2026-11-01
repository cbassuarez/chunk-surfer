import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';
const root='artifacts/hush-model-directions',records=[];
for(const id of['compression','cleft','brace','carrier']){
 const old=await readFile(`${root}/${id}.glb`),jsonLength=old.readUInt32LE(12),j=JSON.parse(old.subarray(20,20+jsonLength).toString()),bin=old.subarray(20+jsonLength);
 for(const mat of j.materials){mat.name='neutral opaque surface study';mat.pbrMetallicRoughness={baseColorFactor:[.32,.325,.31,1],metallicFactor:0,roughnessFactor:.79};delete mat.normalTexture;delete mat.occlusionTexture;mat.extras={...mat.extras,studyNeutralSurface:true};}
 const text=Buffer.from(JSON.stringify(j)),padding=(4-text.length%4)%4,body=Buffer.concat([text,Buffer.alloc(padding,32)]),header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+body.length+bin.length,8);header.writeUInt32LE(body.length,12);header.writeUInt32LE(0x4e4f534a,16);const out=Buffer.concat([header,body,bin]);await writeFile(`${root}/${id}-shell.glb`,out);records.push({id,path:`${id}-shell.glb`,sha256:createHash('sha256').update(out).digest('hex'),geometryBufferByteIdentical:true,material:'neutral grey diffuse shell; texture/normal/ORM maps intentionally absent. Shape/material-routing study, not finished skin.'});
}
await writeFile(`${root}/shell-studies.json`,JSON.stringify(records,null,2)+'\n');
console.log('Four material-only shell variants. Geometry, UVs, skin and clips unchanged.');
