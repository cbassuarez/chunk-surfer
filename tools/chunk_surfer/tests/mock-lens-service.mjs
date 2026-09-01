// Deterministic protocol fixture for renderer integration tests. It echoes the
// conditioned material JPEG; it is not a production or calibration bypass.
// Production requests may arrive as an L2 packet containing JPEG + depth. The
// mock advertises depth:false, so it must echo only the JPEG, exactly as a
// no-depth server would after unpacking the request.
import { createHash } from 'node:crypto';
import { WebSocketServer } from 'ws';

const port=Number(process.env.MOCK_LENS_PORT||8765);

function sourceFrame(data){
  const bytes=Buffer.from(data);
  if(bytes.length<2||bytes[0]!==0x4c||bytes[1]!==0x32)return bytes;
  if(bytes.length<6)throw new Error('truncated L2 header');
  const frameLength=bytes.readUInt32LE(2);
  if(frameLength<1||6+frameLength>bytes.length)throw new Error('invalid L2 frame length');
  return bytes.subarray(6,6+frameLength);
}

const server=new WebSocketServer({host:'127.0.0.1',port});
server.on('listening',()=>console.log(`mock lens ready ws://127.0.0.1:${port}`));
server.on('connection',(socket)=>{
  let request=null;
  socket.send(JSON.stringify({
    type:'status',ok:true,supported:true,device:'mps',model:'sd15-hyper4',modelId:'sd15-hyper4',
    size:512,cacheSchema:3,weightsSha256:'mock',depth:false,
  }));
  socket.on('message',(data,isBinary)=>{
    if(!isBinary){request=JSON.parse(data.toString());return;}
    if(!['generate','mutate'].includes(request?.type))return;
    let bytes;
    try{bytes=sourceFrame(data);}
    catch(error){socket.send(JSON.stringify({type:'error',error:error.message}));return;}
    const sha256=createHash('sha256').update(bytes).digest('hex');
    socket.send(JSON.stringify({
      type:'result',requestId:request.requestId,bankId:request.bankId,slot:request.slot,
      modelId:'sd15-hyper4',checksumId:`sha256:${sha256}`,sha256,cached:false,
    }));
    socket.send(bytes);
  });
});
