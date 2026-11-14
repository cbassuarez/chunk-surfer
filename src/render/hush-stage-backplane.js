// A low, raking return on the surface behind the performer gives the black
// body a readable negative shape. It enters the same depth and dither pass.
export function createHushStageBackplane(THREE, intensity = 1) {
  const material = new THREE.ShaderMaterial({
    uniforms: { intensity: { value: intensity } },
    transparent: true,
    depthWrite: true,
    toneMapped: false,
    vertexShader: `
      varying vec2 plateUv;
      void main() {
        plateUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float intensity;
      varying vec2 plateUv;
      void main() {
        vec2 p = plateUv * 2.0 - 1.0;
        // The light falls off at the edges of the screen and rakes across it
        // diagonally. The screen has no time signal of its own.
        vec2 bounds = abs(p);
        float coverage = (1.0 - smoothstep(.48, 1.0, bounds.x))
          * (1.0 - smoothstep(.71, 1.0, bounds.y));
        if (coverage < .002) discard;
        float rake = 1.0 - smoothstep(-.70, .78, p.x + p.y * .26);
        float surface = .93 + .045 * sin(p.x * 24.0 + p.y * 41.0)
          + .025 * sin(p.x * 63.0 - p.y * 36.0);
        vec3 light = vec3(.027, .030, .032) * mix(.60, 1.0, rake) * surface * intensity;
        gl_FragColor = vec4(light, coverage);
      }
    `,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.85), material);
  plane.name = 'HUSH battle rear return';
  plane.position.set(.08, 1.03, -.58);
  return plane;
}
