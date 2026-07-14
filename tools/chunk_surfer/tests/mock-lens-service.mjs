// Deterministic protocol fixture for renderer integration tests. It echoes the
// conditioned material JPEG; it is not a production or calibration bypass.
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';

const port=Number(process.env.MOCK_LENS_PORT||8765);
const server=new WebSocketServer({host:'127.0.0.1',port});
server.on('listening',()=>console.log(`mock lens ready ws://127.0.0.1:${port}`));
server.on('connection',(socket)=>{
  let request=null;
  socket.send(JSON.stringify({
    type:'status',ok:true,supported:true,device:'mps',model:'sd15-hyper4',modelId:'sd15-hyper4',
    size:512,cacheSchema:2,weightsSha256:'mock',depth:false,
  }));
  socket.on('message',(data,isBinary)=>{
    if(!isBinary){request=JSON.parse(data.toString());return;}
    if(request?.type!=='generate')return;
    const bytes=Buffer.from(data);
    const sha256=createHash('sha256').update(bytes).digest('hex');
    socket.send(JSON.stringify({
      type:'result',requestId:request.requestId,bankId:request.bankId,slot:request.slot,
      modelId:'sd15-hyper4',checksumId:`sha256:${sha256}`,sha256,cached:false,
    }));
    socket.send(bytes);
  });
});
