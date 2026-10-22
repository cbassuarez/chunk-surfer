// A scene-local view model, using the same PBR -> depth acquisition -> final
// pixel shader as the game's other embodied objects. No DOM/card surface.
export function createRoofWordLockView(){
  let current=null,pending=null,disposed=false,error=null,frames=0,lastLayout=null;
  const release=s=>{
    if(!s)return;
    s.model?.dispose();s.dither?.dispose();s.environment?.dispose();s.scene?.clear();
    s.renderer?.dispose();s.renderer?.forceContextLoss();
  };
  const warm=()=>{
    if(current||pending||disposed||typeof document==='undefined')return pending;
    let allocated=null;
    pending=(async()=>{
      const [THREE,{RoundedBoxGeometry},{RoomEnvironment},{createTransparentPixelMesh},{buildRoofWordLockModel}]=await Promise.all([
        import('three'),import('three/addons/geometries/RoundedBoxGeometry.js'),
        import('three/addons/environments/RoomEnvironment.js'),import('./pixel-mesh/transparent.js'),
        import('./roof-word-lock-model.js'),
      ]);
      if(disposed)return;
      const canvas=document.createElement('canvas');
      const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
      allocated={renderer};
      renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.36;
      renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
      const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1.6,.02,12);
      allocated.scene=scene;
      const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
      let environment;try{environment=pmrem.fromScene(room,.07);}finally{room.dispose();pmrem.dispose();}
      allocated.environment=environment;
      scene.environment=environment.texture;scene.environmentIntensity=.7;
      scene.add(new THREE.HemisphereLight('#ddd7c5','#17221a',.65));
      const key=new THREE.DirectionalLight('#e8e2cc',2.6);key.position.set(-.4,.45,1.4);scene.add(key);
      key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.1,far:4});
      key.shadow.bias=-.00008;key.shadow.normalBias=.0003;
      const grazing=new THREE.DirectionalLight('#8dafa0',.65);grazing.position.set(.8,.15,.12);scene.add(grazing);
      const model=buildRoofWordLockModel(THREE,{RoundedBoxGeometry});scene.add(model.group);
      allocated.model=model;
      model.group.traverse(node=>{if(node.isMesh&&node.material?.colorWrite!==false){node.castShadow=true;node.receiveShadow=true;}});
      const focusLight=new THREE.PointLight('#e4d5a7',.012,.42,2);scene.add(focusLight);
      const dither=createTransparentPixelMesh(THREE,renderer,{profile:'explore',pressureFinish:false});
      allocated.dither=dither;
      const s={THREE,canvas,renderer,scene,camera,model,environment,dither,focusLight,lost:false};
      await dither.ready;
      if(disposed){release(s);allocated=null;return;}
      current=s;
      allocated=null;
      canvas.addEventListener('webglcontextlost',e=>{if(disposed||current!==s)return;e.preventDefault();s.lost=true;error='Lock view context lost';});
      canvas.addEventListener('webglcontextrestored',()=>{if(disposed||current!==s)return;current=null;pending=null;release(s);error=null;warm();});
    })().catch(e=>{release(allocated);if(!disposed){error=String(e?.message||e);console.warn('Roof lock close view unavailable',e);}});
    return pending;
  };
  const projectRect=(s,target,width,height)=>{
    const box=target?.isObject3D?new s.THREE.Box3().setFromObject(target):null;
    if(!box||box.isEmpty())return null;
    let x=Infinity,y=Infinity,x1=-Infinity,y1=-Infinity;
    for(const xx of[box.min.x,box.max.x])for(const yy of[box.min.y,box.max.y])for(const zz of[box.min.z,box.max.z]){
      const p=new s.THREE.Vector3(xx,yy,zz).project(s.camera),px=(p.x*.5+.5)*width,py=(-p.y*.5+.5)*height;
      x=Math.min(x,px);y=Math.min(y,py);x1=Math.max(x1,px);y1=Math.max(y1,py);
    }
    return{x,y,w:x1-x,h:y1-y};
  };
  return{
    warm,
    draw({ctx,width,height,dpr=1,positions,cursor,focus,phase,age,reducedMotion,display={}}){
      warm();const s=current;if(!s||s.lost||disposed)return false;
      const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
      if(s.canvas.width!==w||s.canvas.height!==h)s.renderer.setSize(w,h,false);
      const aspect=w/h,fit=Math.max(1,1.45/aspect),approach=reducedMotion?0:Math.exp(-Math.max(0,frames/60)*13)*.12;
      s.camera.aspect=aspect;s.camera.position.set(.36*fit,.12*fit,(.91+approach)*fit);s.camera.lookAt(-.015,.005,.045);s.camera.updateProjectionMatrix();
      positions.forEach((position,i)=>{s.model.wheels[i].rotation.x=-position*Math.PI*2/26;});
      const travel=phase==='released'?Math.min(1,age/.26):phase==='refused'?.22*Math.sin(Math.min(1,age/.42)*Math.PI):0;
      s.model.handle.rotation.z=-travel*.75;
      s.model.selection.visible=focus==='wheel';s.model.selection.position.x=s.model.wheels[cursor].position.x;
      const active=s.model.targets[cursor];
      if(active){active.getWorldPosition(s.focusLight.position);s.focusLight.position.z+=.08;}
      s.focusLight.intensity=focus==='wheel'?.012:.004;
      s.scene.updateMatrixWorld(true);s.camera.updateMatrixWorld(true);
      const cssW=w/dpr,cssH=h/dpr;
      lastLayout={width:cssW,height:cssH,w:cssW,h:cssH,x:0,y:0,physical:true,
        wheels:s.model.targets.map((target,i)=>({...projectRect(s,target,cssW,cssH),index:i})),
        handle:projectRect(s,s.model.handleTarget,cssW,cssH),close:{x:12,y:cssH-42,w:110,h:32}};
      s.dither.render(s.scene,s.camera,{width:w,height:h,dpr:1,sceneScale:Math.min(1,1280/w,720/h),
        profile:display.profile||'explore',screen:display.screen,cellSize:display.settings?.cellSize||'auto',
        cellScale:dpr,screenScale:display.screenScale||dpr,
        snapshot:{clock:performance.now()/1000,reducedMotion:!!reducedMotion,reduceFlash:!!display.settings?.reduceFlash}});
      ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(s.canvas,0,0,w,h);ctx.restore();frames++;
      return true;
    },
    layout:()=>lastLayout,
    diagnostics:()=>({ready:!!current&&!current.lost,error,frames,physicalModel:current?.model.diagnostics,dither:current?.dither.debug(),disposed}),
    dispose(){if(disposed)return;disposed=true;release(current);current=null;lastLayout=null;},
  };
}
