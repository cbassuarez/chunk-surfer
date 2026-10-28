import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { TEST_FILES, EXTERNAL_TEST_FILES, runTests } from './run-all.mjs';

test('npm test covers every portable top-level test exactly once',()=>{
  const discovered=readdirSync('test').filter(name=>/\.(?:spec|test)\.mjs$/.test(name)).map(name=>'test/'+name).sort();
  assert.equal(new Set(TEST_FILES).size,TEST_FILES.length);
  assert.equal(new Set(EXTERNAL_TEST_FILES).size,EXTERNAL_TEST_FILES.length);
  assert.deepEqual([...TEST_FILES,...EXTERNAL_TEST_FILES].sort(),discovered,
    'register every new portable test; explicitly identify tests requiring a real external render environment');
  for(const file of TEST_FILES)assert.ok(existsSync(file),file);
  for(const file of EXTERNAL_TEST_FILES){
    assert.ok(!TEST_FILES.includes(file));
    const source=readFileSync(file,'utf8');
    assert.match(source,/puppeteer-core/,'the exclusion must require an actual browser');
    assert.match(source,/\/Applications\/Google Chrome/,'these retained explicit smokes need the macOS desktop browser');
  }
});

test('the registry is inspectable without starting test children',()=>{
  const result=spawnSync(process.execPath,['test/run-all.mjs','--list'],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout),{tests:TEST_FILES,externalTests:EXTERNAL_TEST_FILES});
});

test('runner preserves direct execution, reports every child failure and still checks subsequent files',()=>{
  const calls=[],errors=[],logs=[];
  const spawn=(...args)=>{calls.push(args);return calls.length===2?{status:7}:{status:0};};
  assert.equal(runTests(['one.mjs','two.mjs','last.mjs'],{spawn,log:x=>logs.push(x),error:x=>errors.push(x)}),7);
  assert.deepEqual(calls.map(args=>args[1]),[['one.mjs'],['two.mjs'],['last.mjs']]);
  assert.equal(calls[0][2].stdio,'inherit');assert.ok(calls[0][2].timeout>0);
  assert.equal(calls[0][2].timeout,180_000);
  const slow=[];assert.equal(runTests(['test/acquisition-props.test.mjs'],{spawn:(...args)=>{slow.push(args);return{status:0}},log(){},error(){}}),0);
  assert.equal(slow[0][2].timeout,600_000);
  assert.deepEqual(logs,['RUN 1/3 one.mjs','RUN 2/3 two.mjs','RUN 3/3 last.mjs']);assert.match(errors[0],/FAILED two\.mjs: exit 7/);assert.match(errors[1],/1\/3 test files failed/);assert.ok(!logs.some(line=>line.startsWith('all ')));
});

test('a leaked or killed test child can never be reported as successful',()=>{
  for(const result of [{status:null,signal:'SIGTERM',error:Object.assign(new Error('timed out'),{code:'ETIMEDOUT'})},
    {status:0,error:new Error('spawn failed')},{status:null,signal:'SIGKILL'}]){
    let success=false;const errors=[];
    assert.equal(runTests(['stuck.mjs'],{spawn:()=>result,log:message=>{if(message.startsWith('all '))success=true;},error:x=>errors.push(x)}),1);
    assert.equal(success,false);assert.match(errors[0],/FAILED stuck\.mjs:/);
  }
});
