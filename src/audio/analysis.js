// ── Audio analysis: FFT + MIR features + biome classifier (pure) ───────────
export function fft(re, im){
  const N=re.length;
  // bit-reversal permutation
  for(let i=1,j=0;i<N;i++){
    let bit=N>>1;
    for(;j&bit;bit>>=1) j^=bit;
    j^=bit;
    if(i<j){
      let t=re[i]; re[i]=re[j]; re[j]=t;
      t=im[i]; im[i]=im[j]; im[j]=t;
    }
  }
  for(let size=2;size<=N;size<<=1){
    const half=size>>1;
    const ang=-2*Math.PI/size;
    const wr0=Math.cos(ang), wi0=Math.sin(ang);
    for(let start=0;start<N;start+=size){
      let wr=1, wi=0;
      for(let k=0;k<half;k++){
        const ar=re[start+k+half], ai=im[start+k+half];
        const tr=wr*ar - wi*ai;
        const ti=wr*ai + wi*ar;
        re[start+k+half]=re[start+k]-tr;
        im[start+k+half]=im[start+k]-ti;
        re[start+k]+=tr;
        im[start+k]+=ti;
        const nwr=wr*wr0 - wi*wi0;
        wi=wr*wi0 + wi*wr0;
        wr=nwr;
      }
    }
  }
}

// ── Audio analysis (time-domain + FFT-based MIR) ──────────────────────────────
export function analyze(buffer){
  const data=buffer.getChannelData(0);
  const sr=buffer.sampleRate;
  const N=Math.min(data.length, sr*2);

  // time-domain (kept for biomeFrom + baseVolFor)
  let rmsSum=0;
  for(let i=0;i<N;i++) rmsSum+=data[i]*data[i];
  const rms=Math.sqrt(rmsSum/N);

  let zcr=0;
  for(let i=1;i<N;i++) if((data[i]>=0)!==(data[i-1]>=0)) zcr++;
  zcr/=N;

  let diff=0;
  for(let i=1;i<N;i++) diff+=Math.abs(data[i]-data[i-1]);
  const hf=diff/N;

  const BLOCK=128, nB=Math.floor(N/BLOCK);
  const bm=Array.from({length:nB},(_,b)=>{
    let s=0; for(let i=b*BLOCK;i<(b+1)*BLOCK;i++) s+=data[i]; return s/BLOCK;
  });
  const bMean=bm.reduce((a,b)=>a+b,0)/bm.length;
  const lf=Math.sqrt(bm.reduce((a,b)=>a+(b-bMean)**2,0)/bm.length);

  // length
  const length=buffer.duration;

  // spectral features — average centroid + 85% rolloff over up to 8 frames
  const FFT_SIZE=1024;
  const maxFrames=Math.max(1, Math.min(8, Math.floor(N/FFT_SIZE)));
  const re=new Float32Array(FFT_SIZE);
  const im=new Float32Array(FFT_SIZE);
  let centroidSum=0, rolloffSum=0, framesUsed=0;
  for(let f=0;f<maxFrames;f++){
    const off=Math.floor(f*(N-FFT_SIZE)/Math.max(1,maxFrames));
    for(let i=0;i<FFT_SIZE;i++){
      // Hann window
      const w=0.5*(1-Math.cos(2*Math.PI*i/(FFT_SIZE-1)));
      re[i]=(data[off+i]||0)*w;
      im[i]=0;
    }
    fft(re,im);
    let num=0, den=0, total=0;
    const half=FFT_SIZE/2;
    for(let k=0;k<half;k++){
      const m=Math.sqrt(re[k]*re[k]+im[k]*im[k]);
      const freq=k*sr/FFT_SIZE;
      num+=freq*m;
      den+=m;
      total+=m;
    }
    if(den>0){ centroidSum+=num/den; framesUsed++; }
    let cum=0; const target=0.85*total;
    for(let k=0;k<half;k++){
      cum+=Math.sqrt(re[k]*re[k]+im[k]*im[k]);
      if(cum>=target){ rolloffSum+=k*sr/FFT_SIZE; break; }
    }
  }
  const centroid=framesUsed>0?centroidSum/framesUsed:0;
  const rolloff=framesUsed>0?rolloffSum/framesUsed:0;

  // attack: time from start to first 50%-of-peak amplitude crossing (seconds)
  let peak=0;
  for(let i=0;i<N;i++){ const a=Math.abs(data[i]); if(a>peak) peak=a; }
  let attackSamples=0;
  if(peak>0){
    const thr=0.5*peak;
    for(let i=0;i<N;i++){ if(Math.abs(data[i])>=thr){ attackSamples=i; break; } }
  }
  const attack=attackSamples/sr;

  return {rms,zcr,hf,lf,length,centroid,rolloff,attack};
}

export function biomeFrom({zcr,hf,lf,rms}){
  if(zcr>0.055&&hf>0.014)  return 'noise';
  if(zcr<0.015&&lf>0.007)  return 'drone';
  if(hf>0.011&&zcr<0.038)  return 'shimmer';
  if(rms>0.11&&zcr<0.038)  return 'pulse';
  return 'resonance';
}
