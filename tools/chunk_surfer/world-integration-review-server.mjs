import {createServer} from 'vite';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),folder=resolve(root,'artifacts/world-integration/evidence');
const revision=Date.now(),port=5544;await mkdir(folder,{recursive:true});
const paths=['src/main.js','src/dev/world-integration-review.js','src/game/props.js','src/game/save.js','src/game/source-contact.js',
  'src/data/student-strike-evidence.js','src/data/exterior-vigil.js','src/generated/student-strike-records.js',
  'src/render/faceplate-modules.js','src/render/faceplate-module-state.js','src/render/ui.js','src/render/minimap.js','src/render/navigator-clock.js',
  'src/game/bag.js','src/game/bag-model.js','src/game/map-ownership.js','src/data/exterior-infrastructure.js',
  'public/assets/student-strike-records.glb','public/assets/exterior-infrastructure.glb',
  'src/game/natatorium-coffee-stretch.js','src/game/natatorium-dread.js','src/game/natatorium-water.js','src/render/natatorium-metric.js',
  'src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js','src/render/stillness-faces.js','src/render/stillness-relief.js',
  'src/data/conservatory-props.js','src/data/floorplan/conservatory.js','src/data/pub-dialogue.js','src/game/pub-quest.js','src/data/conservatory-script.js',
  'src/game/academic-society.js','src/data/academic-society.js','src/data/student-strike-dialogue.js','src/game/story-evidence.js',
  'public/assets/conservatory-props.glb','public/assets/conservatory-doors.glb','public/assets/academic-society-characters.glb','public/assets/academic-gallery.glb',
  'public/assets/conservatory-textiles.glb','public/assets/exterior-frontages.glb','public/assets/exterior-stationers.glb','public/assets/vegetation.glb'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function manifest(){return{revision,capturedAt:new Date().toISOString(),files:await Promise.all(paths.map(async path=>{
  try{const bytes=await readFile(resolve(root,path));return{path,bytes:bytes.length,sha256:hash(bytes)};}
  catch(error){if(error.code==='ENOENT')return{path,missing:true,sha256:null};throw error;}
}))};}
async function atomic(path,value){await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(path+'.tmp',path);}
const response=(res,value)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
const server=await createServer({root,cacheDir:'/private/tmp/chunk-surfer-world-integration-vite',clearScreen:false,
  server:{host:'127.0.0.1',port,strictPort:true,hmr:false,headers:{'Cache-Control':'no-store'},watch:{ignored:['**/artifacts/**','**/src-tauri/**']}},
  plugins:[{name:'world-integration-review',transformIndexHtml:html=>html.replace(/(src=["'])(?:\.\/)?src\/main\.js[^"']*/g,`$1/src/main.js?worldIntegrationRevision=${revision}`),configureServer(vite){
    vite.middlewares.use('/__world-integration-review',async(req,res)=>{
      const name=(req.url||'').slice(1);
      try{
        if(req.method==='GET'&&name==='manifest'){response(res,await manifest());return;}
        if(req.method!=='POST'||!/^world-integration-[a-zA-Z0-9_.-]+\.(json|webm|png)$/.test(name))throw Error('Use the explicit local review controls.');
        const chunks=[];let size=0,max=name.endsWith('.json')?8*1024*1024:256*1024*1024;
        for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Review capture exceeds its bounded size.');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks),target=resolve(folder,name);
        if(name.endsWith('.png')&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected an intact PNG.');
        if(name.endsWith('.webm')&&!bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))throw Error('Expected an intact WebM.');
        if(name.endsWith('.json')){
          const data=JSON.parse(bytes);if(!['world-integration-point','world-integration-capture'].includes(data.kind))throw Error('Unknown evidence kind.');
          const after=await manifest(),before=new Map((data.sourceManifest?.files||[]).map(file=>[file.path,file.sha256]));
          const sourceDrift=after.files.filter(file=>before.get(file.path)!==file.sha256).map(file=>({path:file.path,before:before.get(file.path)??null,after:file.sha256}));
          const receipt={...data,sourceManifestAfter:after,sourceDrift,savedAt:new Date().toISOString()};await atomic(target,receipt);
          await atomic(resolve(folder,'latest-review.json'),{receipt:name,video:data.video||null,poster:data.poster||null,stage:data.stage,sourceDrift,failures:data.failures||[],audioTracks:data.audioTracks??null,savedAt:receipt.savedAt,scope:data.scope});
          response(res,{saved:name,sourceDrift});return;
        }
        await writeFile(target,bytes);response(res,{saved:name,bytes:bytes.length,sha256:hash(bytes)});
      }catch(error){res.statusCode=400;response(res,{error:String(error.message||error)});}
    });
  }}]});
await server.listen();
const url=`http://127.0.0.1:${port}/?worldIntegrationReview=1&silentReview=1&mode=story&skiptut=1&nodisplaynotice=1&skipwarn=1&nomic=1`;
await atomic(resolve(root,'artifacts/world-integration/server.json'),{pid:process.pid,port,revision,url});console.log(url);
for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
