import {createServer} from 'vite';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),folder=resolve(root,'artifacts/student-strike-integration/evidence');
const revision=Date.now(),port=5543;await mkdir(folder,{recursive:true});
const paths=['src/main.js','src/data/student-strike-film.js','src/data/student-strike-dialogue.js','src/data/academic-society.js',
  'src/game/student-strike-scene.js','src/game/student-strike-host.js','src/game/student-strike-timeline.js','src/game/academic-society.js','src/game/academic-floor-returns.js',
  'src/audio/student-strike.js','src/render/student-strike-staging.js','src/render/student-strike-props.js','src/render/student-strike-performance.js',
  'src/dev/student-strike-review.js','src/game/save.js','src/game/source-contact.js','src/render/academic-society-characters.js','src/render/source-last-reception-residents.js',
  'src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js','src/render/physical-source-print.js','src/render/world-lettering-fonts.js',
  'public/assets/conservatory-props.glb','public/assets/academic-society-characters.glb','public/assets/academic-gallery.glb','public/assets/conservatory-doors.glb',
  'public/assets/conservatory-textiles.glb','public/assets/exterior-frontages.glb','public/assets/exterior-stationers.glb','public/assets/exterior-street-fabric.glb',
  'public/assets/ellery-public-front.glb','public/assets/ellery-exterior-roofline.glb','public/assets/opening-street.glb','public/assets/vegetation.glb'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function manifest(){return{revision,capturedAt:new Date().toISOString(),files:await Promise.all(paths.map(async path=>{
  try{const bytes=await readFile(resolve(root,path));return{path,bytes:bytes.length,sha256:hash(bytes)};}
  catch(error){if(error.code==='ENOENT')return{path,missing:true,sha256:null};throw error;}
}))};}
async function atomic(path,value){await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(path+'.tmp',path);}
const response=(res,value)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
const server=await createServer({root,cacheDir:'/private/tmp/chunk-surfer-student-strike-game-vite',clearScreen:false,
 server:{host:'127.0.0.1',port,strictPort:true,hmr:false,headers:{'Cache-Control':'no-store'},watch:{ignored:['**/artifacts/**','**/src-tauri/**']}},
 plugins:[{name:'student-strike-production-review',transformIndexHtml:html=>html.replace(/(src=["'])(?:\.\/)?src\/main\.js[^"']*/g,`$1/src/main.js?studentStrikeRevision=${revision}`),configureServer(vite){
  vite.middlewares.use('/__student-strike-review',async(req,res)=>{
    const name=(req.url||'').slice(1);
    try{
      if(req.method==='GET'&&name==='manifest'){response(res,await manifest());return;}
      if(req.method!=='POST'||!/^student-strike-[a-zA-Z0-9_.-]+\.(json|webm|png)$/.test(name))throw Error('Use the explicit local review controls.');
      const chunks=[];let size=0,max=name.endsWith('.json')?8*1024*1024:256*1024*1024;
      for await(const chunk of req){size+=chunk.length;if(size>max)throw Error('Review capture exceeds its bounded size.');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks),target=resolve(folder,name);
      if(name.endsWith('.png')&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected an intact PNG.');
      if(name.endsWith('.webm')&&!bytes.subarray(0,4).equals(Buffer.from([26,69,223,163])))throw Error('Expected an intact WebM.');
      if(name.endsWith('.json')){
        const data=JSON.parse(bytes);if(!String(data.kind||'').startsWith('student-strike-production-'))throw Error('Unknown evidence kind.');
        const after=await manifest(),before=new Map((data.sourceManifest?.files||[]).map(file=>[file.path,file.sha256]));
        const sourceDrift=after.files.filter(file=>before.get(file.path)!==file.sha256).map(file=>({path:file.path,before:before.get(file.path)??null,after:file.sha256}));
        const receipt={...data,sourceManifestAfter:after,sourceDrift,savedAt:new Date().toISOString()};await atomic(target,receipt);
        if(data.kind==='student-strike-production-capture')await atomic(resolve(folder,'latest-review.json'),{receipt:name,video:data.video,poster:data.poster,sourceDrift,failures:data.failures||[],silent:data.audioTracks===0,savedAt:receipt.savedAt,scope:data.scope});
        response(res,{saved:name,sourceDrift});return;
      }
      await writeFile(target,bytes);response(res,{saved:name,bytes:bytes.length,sha256:hash(bytes)});
    }catch(error){res.statusCode=400;response(res,{error:String(error.message||error)});}
  });
 }}]});
await server.listen();
const url=`http://127.0.0.1:${port}/?studentStrikeReview=1&silentReview=1&mode=story&skiptut=1&nodisplaynotice=1&skipwarn=1&nomic=1`;
await atomic(resolve(root,'artifacts/student-strike-integration/server.json'),{pid:process.pid,port,revision,url});
console.log(url);
for(const signal of['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
