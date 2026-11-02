// Approved, labeled normal-input relay client. No game-state writes or helpers.
import {readFile} from 'node:fs/promises';
const [kind='status',value,duration='80',second='0']=process.argv.slice(2);
const port=Number(process.env.COMPLETION_PORT)||5513;
const credentials=JSON.parse(await readFile(`/private/tmp/chunk-surfer-completion-control-${port}.json`,'utf8'));
const headers={Authorization:`Bearer ${credentials.token}`,'Content-Type':'application/json'};
const request=async(path,body)=>{const response=await fetch(credentials.origin+credentials.path+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Error(`${response.status}: ${JSON.stringify(data)}`);return data;};
if(kind==='status'){
 const s=await request('/status');console.log(JSON.stringify({connected:s.connected,context:s.client?.context,queued:s.queued,results:s.results?.slice(-6)},null,2));
}else{
 const command=kind==='key'?{kind,code:value,durationMs:Number(duration)}:kind==='controller'?{kind,action:value,durationMs:Number(duration)}:kind==='look'?{kind,turnX:Number(value),lookY:Number(second),durationMs:Number(duration)}:kind==='release'?{kind}:null;
 if(!command)throw Error('Only status, key, controller, look or release is permitted.');
 const queued=await request('/command',command);console.log(JSON.stringify({label:'approved-normal-input-relay',command,queued:true,id:queued.id}));
 let receipt=null;for(let attempt=0;attempt<30;attempt++){await new Promise(r=>setTimeout(r,100));const status=await request('/status');receipt=status.results.find(r=>r.id===queued.id);if(receipt)break;}
 console.log(JSON.stringify({label:'transport-receipt-not-gameplay-proof',receipt:receipt||'not-returned'}));
}
