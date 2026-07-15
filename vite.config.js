import { defineConfig } from 'vite';
import { createReadStream, readFileSync, statSync } from 'node:fs';

const host = process.env.TAURI_DEV_HOST;
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const DEV_CHANGE_RINGING_WAV = process.env.CHUNK_SURFER_CHANGE_RINGING_WAV || '/Users/paul/Desktop/change-ringing-peal.wav';

function devBellBed(){
  return {
    name:'chunk-surfer-dev-bell-bed',apply:'serve',
    configureServer(server){
      server.middlewares.use('/__dev/change-ringing-peal.wav',(req,res)=>{
        let stat;try{stat=statSync(DEV_CHANGE_RINGING_WAV);}catch{res.statusCode=404;res.end('development bell bed unavailable');return;}
        const range=req.headers.range;
        res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Type','audio/wav');res.setHeader('Cache-Control','no-store');
        if(range){
          const match=/bytes=(\d+)-(\d*)/.exec(range),start=Number(match?.[1]||0),end=Math.min(stat.size-1,Number(match?.[2]||stat.size-1));
          if(start>=stat.size||end<start){res.statusCode=416;res.setHeader('Content-Range',`bytes */${stat.size}`);res.end();return;}
          res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);res.setHeader('Content-Length',end-start+1);createReadStream(DEV_CHANGE_RINGING_WAV,{start,end}).pipe(res);return;
        }
        res.setHeader('Content-Length',stat.size);createReadStream(DEV_CHANGE_RINGING_WAV).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [devBellBed()],
  base: './',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    target: 'es2020',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
});
