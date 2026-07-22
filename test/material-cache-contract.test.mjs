import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('material cache key invalidates every runtime identity boundary', () => {
  const script = String.raw`
import json, sys
sys.path.insert(0, 'tools/chunk_surfer/diffusion_server')
from cache_contract import material_cache_key
work = dict(bankId='explore', slot=0, prompt='p', negative='n', strength=.3,
            passes=1, guidance=1, seed=7, size=512, cacheSchema=2,
            sourceAtlasSha256='a'*64, recipeSha256='b'*64, modelId='sd15-hyper4')
base = dict(work=work, source_sha256='c'*64, model_id='sd15-hyper4', resolution=512,
            weights_sha256='d'*64, service_revision='r14', cache_schema=2)
keys = [material_cache_key(**base)]
for name, value in [('source_sha256','e'*64),('model_id','other'),('resolution',256),
                    ('weights_sha256','f'*64),('service_revision','r15'),('cache_schema',3)]:
    changed = dict(base); changed[name] = value; keys.append(material_cache_key(**changed))
for name, value in [('bankId','calm'),('slot',1),('recipeSha256','1'*64),
                    ('sourceAtlasSha256','2'*64),('seed',8),
                    ('frame',1),('depthScale',0.55),('depthSha256','3'*64)]:
    changed = dict(base); changed['work'] = dict(work); changed['work'][name] = value
    keys.append(material_cache_key(**changed))
print(json.dumps(keys))
`;
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const keys = JSON.parse(result.stdout);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => /^[0-9a-f]{64}$/.test(key)));
});
