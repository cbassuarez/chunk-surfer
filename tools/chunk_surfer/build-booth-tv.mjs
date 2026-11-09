// Rebuild the ordinary lodge programme from our own captured driving scene.
// This never downloads a commercial broadcast or captures the live desktop.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const source='artifacts/source-drive-study/evolution/native/landscape-and-reverse.webm',output='public/video/booth-night-road.mp4';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
fs.mkdirSync(path.dirname(path.join(root,output)),{recursive:true});
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-ss','6','-i',path.join(root,source),'-t','18','-an','-vf','crop=640:480:180:160,scale=320:240:flags=area,gblur=sigma=0.5,eq=gamma=1.25:brightness=0.035:contrast=0.95,fps=15','-c:v','libx264','-profile:v','baseline','-level','3.0','-pix_fmt','yuv420p','-b:v','400k','-maxrate','500k','-bufsize','1000k','-movflags','+faststart','-y',path.join(root,output)],{stdio:'inherit'});
const receipt={id:'booth-night-road',creator:'Chunk Surfer project',rights:'Project-owned rendered gameplay footage; no external broadcast or football recording used',source,sourceSHA256:sha(source),path:output,sha256:sha(output),bytes:fs.statSync(path.join(root,output)).size,excerpt:{startSeconds:6,durationSeconds:18,crop:[180,160,640,480]},output:{width:320,height:240,fps:15,audio:false,loop:'hard source boundary, ordinary television programme'},modifications:['Remove all audio','Tight windshield crop removes steering wheel, dashboard readouts and external UI','Area reduction with0.5px average prevents source dither becoming isolated dashboard-like sparks','Gentle midtone lift gamma1.25 brightness0.035 contrast0.95 for tiny real-world CRT readability','Resize to320x24015fps; bounded400kbit/s programme encode','Runtime phosphor tint and scanlines; existing world dither/depth apply']};
fs.writeFileSync(path.join(root,'public/video/booth-night-road.credits.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
