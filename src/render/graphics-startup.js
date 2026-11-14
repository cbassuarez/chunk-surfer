// Only explicit graphics capability/driver failures carry this code. Ordinary
// JavaScript or asset errors must never trigger a change of graphics backend.
export function graphicsStartupError(message) {
  const error = new Error(message);
  error.name = 'GraphicsStartupError';
  error.code = 'CHUNK_GRAPHICS_STARTUP';
  return error;
}

// Exercise an offscreen target once, before allocating the world's targets.
// The authored opening is allowed to be black, so it is never the test image.
export function verifyGraphicsStartup(gl) {
  if (!gl) throw graphicsStartupError('webgl2 unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw graphicsStartupError('Required floating-point render targets are unavailable (EXT_color_buffer_float).');
  }
  const saved = {
    drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
    readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
    texture: gl.getParameter(gl.TEXTURE_BINDING_2D),
    packBuffer: gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
    clear: gl.getParameter(gl.COLOR_CLEAR_VALUE),
    mask: gl.getParameter(gl.COLOR_WRITEMASK),
    viewport: gl.getParameter(gl.VIEWPORT),
    scissor: gl.isEnabled(gl.SCISSOR_TEST),
    pack: [gl.PACK_ALIGNMENT, gl.PACK_ROW_LENGTH, gl.PACK_SKIP_PIXELS, gl.PACK_SKIP_ROWS]
      .map(parameter => [parameter, gl.getParameter(parameter)]),
  };
  let texture = null;
  let framebuffer = null;
  try {
    texture = gl.createTexture();
    framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw graphicsStartupError('Graphics startup probe could not allocate its render target.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw graphicsStartupError(`Graphics startup probe framebuffer incomplete (${status}).`);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.viewport(0, 0, 1, 1);
    const expected = [51, 102, 153, 255];
    gl.clearColor(...expected.map(channel => channel / 255));
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    for (const [parameter] of saved.pack) gl.pixelStorei(parameter, parameter === gl.PACK_ALIGNMENT ? 1 : 0);
    const actual = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, actual);
    if (gl.isContextLost() || expected.some((channel, index) => Math.abs(actual[index] - channel) > 1)) {
      throw graphicsStartupError('Graphics startup probe readback failed.');
    }
    return true;
  } finally {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.drawFramebuffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.readFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, saved.texture);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, saved.packBuffer);
    gl.clearColor(...saved.clear);
    gl.colorMask(...saved.mask);
    gl.viewport(...saved.viewport);
    if (saved.scissor) gl.enable(gl.SCISSOR_TEST);
    else gl.disable(gl.SCISSOR_TEST);
    for (const [parameter, value] of saved.pack) gl.pixelStorei(parameter, value);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (texture) gl.deleteTexture(texture);
  }
}
