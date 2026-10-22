// Start driver compilation while assets are loading. Polling the KHR completion
// token does not wait for that work; asking LINK_STATUS on first use does.
export function deferGlProgram(gl,vertexSource,fragmentSource,label='program'){
  const extension=gl.getExtension('KHR_parallel_shader_compile');
  const vertex=gl.createShader(gl.VERTEX_SHADER),fragment=gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(vertex,vertexSource);gl.compileShader(vertex);
  gl.shaderSource(fragment,fragmentSource);gl.compileShader(fragment);
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  let done=false,disposed=false;
  const dispose=()=>{
    if(disposed)return;
    if(!done){gl.deleteShader(vertex);gl.deleteShader(fragment);}
    gl.deleteProgram(program);disposed=true;
  };
  return {
    poll(){
      if(disposed||gl.isContextLost?.())return null;
      if(done)return program;
      if(extension&&!gl.getProgramParameter(program,extension.COMPLETION_STATUS_KHR))return null;
      try{
        for(const shader of [vertex,fragment])if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))
          throw new Error(`${label} shader: ${gl.getShaderInfoLog(shader)}`);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`${label} link: ${gl.getProgramInfoLog(program)}`);
      }catch(error){dispose();throw error;}
      gl.deleteShader(vertex);gl.deleteShader(fragment);done=true;
      return program;
    },
    dispose,
  };
}
