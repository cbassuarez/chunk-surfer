import assert from 'node:assert/strict';
import fs from 'node:fs';

const PACKS = [
  'conservatory-props.glb',
  'conservatory-acquisitions.glb',
  'opening-street.glb',
  'source-structures.glb',
  'conservatory-doors.glb',
  'tuning-fork.glb',
  'conservatory-main-stair.glb',
];

const TEXTURED_PACKS = new Set([
  'conservatory-acquisitions.glb',
  'opening-street.glb',
  'source-structures.glb',
  'conservatory-doors.glb',
]);

function parseGlb(file) {
  const bytes = fs.readFileSync(`public/assets/${file}`);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF', `${file}: magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${file}: GLB version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${file}: declared length`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.subarray(16, 20).toString('ascii'), 'JSON', `${file}: JSON chunk`);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function textureIndices(material) {
  const pbr = material?.pbrMetallicRoughness;
  return [
    pbr?.baseColorTexture?.index,
    pbr?.metallicRoughnessTexture?.index,
    material?.normalTexture?.index,
    material?.occlusionTexture?.index,
    material?.emissiveTexture?.index,
  ].filter(Number.isInteger);
}

for (const file of PACKS) {
  const gltf = parseGlb(file);
  assert.ok(gltf.meshes?.length, `${file}: meshes`);
  assert.ok(gltf.materials?.length, `${file}: materials`);

  let texturedPrimitives = 0;
  for (const mesh of gltf.meshes) {
    assert.ok(mesh.primitives?.length, `${file}/${mesh.name}: primitives`);
    for (const primitive of mesh.primitives) {
      assert.ok(Number.isInteger(primitive.attributes?.POSITION), `${file}/${mesh.name}: positions`);
      assert.ok(Number.isInteger(primitive.attributes?.NORMAL), `${file}/${mesh.name}: normals`);
      assert.ok(Number.isInteger(primitive.indices), `${file}/${mesh.name}: indices`);
      assert.ok(Number.isInteger(primitive.material), `${file}/${mesh.name}: material`);
      assert.ok(gltf.accessors[primitive.attributes.POSITION], `${file}/${mesh.name}: position accessor`);
      assert.ok(gltf.accessors[primitive.attributes.NORMAL], `${file}/${mesh.name}: normal accessor`);
      assert.ok(gltf.accessors[primitive.indices], `${file}/${mesh.name}: index accessor`);
      const material = gltf.materials[primitive.material];
      assert.ok(material, `${file}/${mesh.name}: material resolves`);
      assert.ok(['OPAQUE', 'MASK', 'BLEND'].includes(material.alphaMode || 'OPAQUE'), `${file}/${mesh.name}: alpha mode`);
      const indices = textureIndices(material);
      if (indices.length) {
        texturedPrimitives += 1;
        assert.ok(Number.isInteger(primitive.attributes?.TEXCOORD_0), `${file}/${mesh.name}: textured primitive UVs`);
        assert.ok(gltf.accessors[primitive.attributes.TEXCOORD_0], `${file}/${mesh.name}: UV accessor`);
      }
      for (const index of indices) {
        const texture = gltf.textures?.[index];
        assert.ok(texture, `${file}/${mesh.name}: texture ${index} resolves`);
        assert.ok(gltf.images?.[texture.source], `${file}/${mesh.name}: texture image resolves`);
        if (Number.isInteger(texture.sampler)) {
          assert.ok(gltf.samplers?.[texture.sampler], `${file}/${mesh.name}: sampler resolves`);
        }
      }
    }
  }

  if (TEXTURED_PACKS.has(file)) {
    assert.ok(texturedPrimitives > 0, `${file}: retains textured primitives`);
    for (const image of gltf.images) {
      assert.ok(Number.isInteger(image.bufferView), `${file}: embedded image buffer view`);
      assert.ok(gltf.bufferViews[image.bufferView], `${file}: embedded image resolves`);
      assert.match(image.mimeType, /^image\/(?:jpeg|png|webp)$/, `${file}: supported image type`);
    }
  }
}

console.log('prop-pack texture regression contracts passed');
