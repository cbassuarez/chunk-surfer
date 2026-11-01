import{readFileSync,writeFileSync}from'node:fs';
import{parseCharacterAsset,sampleCharacterPose}from'../../src/render/character-asset.js';
const dir=new URL('../../artifacts/hush-motion-study/rig/',import.meta.url),load=path=>{const b=readFileSync(path);return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));},baseline=load(new URL('../../public/assets/pressure-character.glb',import.meta.url)),variant=load(new URL('pressure-character-neck-study.glb',dir));
const before=JSON.parse(readFileSync(new URL('production-rig-audit.json',dir))),after=JSON.parse(readFileSync(new URL('neck-study-rig-audit.json',dir)));
function point(asset,v,descriptor){const e=asset.entries[0],p=e.primitives[0],pose=sampleCharacterPose(asset,e,descriptor),q=Array.from(p.positions.subarray(v*3,v*3+3));for(let m=0;m<e.morphCount;m++)for(let k=0;k<3;k++)q[k]+=p.targets[m].positions[v*3+k]*pose.morphs[m];const out=[0,0,0];for(let j=0;j<4;j++){const at=p.joints[v*4+j]*16,w=p.weights[v*4+j];for(let k=0;k<3;k++)out[k]+=(pose.bones[at+k]*q[0]+pose.bones[at+4+k]*q[1]+pose.bones[at+8+k]*q[2]+pose.bones[at+12+k])*w;}return out;}
const dist=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
// Static bind/corrective checks use the actual CPU sampler and every affected
// vertex. They test preserved neutral anatomy, not identical animated weights.
const staticChecks=[];
for(const morph of [null,...baseline.entries[0].morphNames]){
 const descriptor={clip:'pressure_hold',time:0,...(morph?{morphs:{[morph]:1}}:{})};let maxDelta=0;
 // Sampling per vertex would repeat pose work; obtain a palette once per asset.
 const e=baseline.entries[0],eb=variant.entries[0],pa=sampleCharacterPose(baseline,e,descriptor),pb=sampleCharacterPose(variant,eb,descriptor);
 function fast(entry,po,v){const p=entry.primitives[0],a=Array.from(p.positions.subarray(v*3,v*3+3));for(let m=0;m<entry.morphCount;m++)for(let k=0;k<3;k++)a[k]+=p.targets[m].positions[v*3+k]*po.morphs[m];const q=[0,0,0];for(let j=0;j<4;j++){const at=p.joints[v*4+j]*16,w=p.weights[v*4+j];for(let k=0;k<3;k++)q[k]+=(po.bones[at+k]*a[0]+po.bones[at+4+k]*a[1]+po.bones[at+8+k]*a[2]+po.bones[at+12+k])*w;}return q;}
 for(let v=0;v<e.primitives[0].vertexCount;v++)maxDelta=Math.max(maxDelta,dist(fast(e,pa,v),fast(eb,pb,v)));staticChecks.push({morph:morph||'neutral',maxDeltaMetres:maxDelta});
}
const originalHotspot={a:25412,b:25415,clip:'pressure_advance',time:.54};
originalHotspot.beforeLengthMetres=dist(point(baseline,originalHotspot.a,originalHotspot),point(baseline,originalHotspot.b,originalHotspot));
originalHotspot.afterLengthMetres=dist(point(variant,originalHotspot.a,originalHotspot),point(variant,originalHotspot.b,originalHotspot));
const output={kind:'hush-neck-envelope-comparison',productionUntouched:true,poseSamplesPerClip:9,edges:'Unique triangle edges longer than5mm in neutral hold; rigid UV splits do not duplicate edges by endpoint ID.',neckRegion:'both rest endpoints y1.76–2.14m,abs(x)<.25m',staticChecks,originalHotspot,clips:before.extensions.map(a=>{const b=after.extensions.find(b=>b.clip===a.clip);return{clip:a.clip,before:{globalP95:a.p95Ratio,globalP99:a.p99Ratio,globalMax:a.worst.ratio,neck:a.neck},after:{globalP95:b.p95Ratio,globalP99:b.p99Ratio,globalMax:b.worst.ratio,neck:b.neck}};}),cost:{addedVertices:0,addedTriangles:0,addedPrimitives:0,addedJoints:0,addedMorphs:0,addedTextureBytes:0,addedGLBBytes:0,runtimeChange:'none; study-only skin buffer variant'},limits:['Nine phase samples per clip; not continuous swept-triangle/self-collision proof.','Ratios diagnose local envelope strain, not physiological plausibility or perceptual acceptance.','This corrects collar skin weights only; Source phase speed and stop transitions are unchanged.','Static neutral renders use exact production CPU-sampled surfaces in Blender Cycles CPU; they are not final dither or native gameplay evidence.']};
writeFileSync(new URL('neck-study-comparison.json',dir),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({staticChecks,originalHotspot,advance:output.clips.find(c=>c.clip==='pressure_advance'),cost:output.cost},null,2));
