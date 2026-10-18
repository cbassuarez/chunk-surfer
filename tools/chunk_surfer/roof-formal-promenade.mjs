// Original roof-terrace inlay. Broad carpet borders and stone diamonds carry
// the old conservatory's formality at player scale; no tile is a clue or gate.
// All faces lie centimetres above the existing zinc, with no new obstruction.
export const ROOF_FORMAL_PROMENADES=Object.freeze([
  {id:'west',x:-7.55,z:-1,w:1.7,d:16,along:'z',panels:8},
  {id:'east',x:6.8,z:-.5,w:2,d:16,along:'z',panels:8},
  {id:'arrival',x:-1,z:-10.25,w:13,d:2.3,along:'x',panels:7},
  {id:'south',x:-1,z:9.2,w:13,d:2.8,along:'x',panels:7},
].map(Object.freeze));

export function buildRoofFormalPromenades({m,materials,addQuad}){
  const material=(name,rgb)=>{
    const index=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:.89},extras:{roofRole:'weathered-surface'}});
    return index;
  };
  const limestone=material('roof promenade old warm limestone',[.355,.330,.265]);
  const slate=material('roof promenade charcoal slate',[.051,.068,.073]);
  const border=material('roof promenade rain-dulled ochre inlay',[.205,.166,.098]);
  // The old standing seams top out at .025 m. The laid stone must cover them,
  // otherwise their black ribs slice through the pattern in the native pass.
  const y=.032;
  const rect=(x0,z0,x1,z1,mat)=>addQuad(m,[x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],mat);
  for(const p of ROOF_FORMAL_PROMENADES){
    const x0=p.x-p.w/2,x1=p.x+p.w/2,z0=p.z-p.d/2,z1=p.z+p.d/2;
    const edge=.16,inner=p.along==='x'?.16:.09;
    // Non-overlapping tessellation, rather than coplanar decals: depth remains
    // stable through the prop pass and the shared acquisition/dither stack.
    rect(x0,z0,x1,z0+edge,slate);rect(x0,z1-edge,x1,z1,slate);
    rect(x0,z0+edge,x0+edge,z1-edge,slate);rect(x1-edge,z0+edge,x1,z1-edge,slate);
    const a=x0+edge,b=z0+edge,c=x1-edge,d=z1-edge;
    rect(a,b,c,b+inner,border);rect(a,d-inner,c,d,border);
    rect(a,b+inner,a+inner,d-inner,border);rect(c-inner,b+inner,c,d-inner,border);
    const ax=a+inner,az=b+inner,bx=c-inner,bz=d-inner;
    const span=p.along==='x'?bx-ax:bz-az;
    for(let i=0;i<p.panels;i++){
      const lo=span*i/p.panels,hi=span*(i+1)/p.panels;
      const q=p.along==='x'?{x0:ax+lo,x1:ax+hi,z0:az,z1:bz}:{x0:ax,x1:bx,z0:az+lo,z1:az+hi};
      const cx=(q.x0+q.x1)/2,cz=(q.z0+q.z1)/2;
      if(p.along==='x'&&i%2===1){
        // An eight-point opus-sectile rosette punctuates each broad forecourt.
        // Its pieces tessellate the complete panel without coplanar decals.
        const rx=(q.x1-q.x0)/2,rz=(q.z1-q.z0)/2;
        const rings=Array.from({length:16},(_,k)=>{
          const a=k*Math.PI/8,c=Math.cos(a),s=-Math.sin(a),square=1/Math.max(Math.abs(c),Math.abs(s));
          const radius=k%2?.34:.78;
          return{outer:[cx+c*rx*square,y,cz+s*rz*square],inner:[cx+c*rx*radius,y,cz+s*rz*radius]};
        });
        for(let k=0;k<16;k++){
          const a=rings[k],b=rings[(k+1)%16];
          addQuad(m,a.inner,a.outer,b.outer,b.inner,limestone);
        }
        for(let k=0;k<16;k+=2)
          addQuad(m,[cx,y,cz],rings[k].inner,rings[k+1].inner,rings[(k+2)%16].inner,k%4===0?slate:border);
        continue;
      }
      const rx=(q.x1-q.x0)*.29,rz=(q.z1-q.z0)*.31;
      const north=[cx,y,cz-rz],west=[cx-rx,y,cz],south=[cx,y,cz+rz],east=[cx+rx,y,cz];
      // Four surrounding quadrants meet the same dark diamond exactly. The
      // bands stay broad and sparse instead of becoming a fine noisy checker.
      addQuad(m,[q.x0,y,q.z0],[q.x0,y,q.z1],west,north,limestone);
      addQuad(m,[q.x0,y,q.z1],[q.x1,y,q.z1],south,west,limestone);
      addQuad(m,[q.x1,y,q.z1],[q.x1,y,q.z0],east,south,limestone);
      addQuad(m,[q.x1,y,q.z0],[q.x0,y,q.z0],north,east,limestone);
      addQuad(m,north,west,south,east,slate);
    }
  }
}
