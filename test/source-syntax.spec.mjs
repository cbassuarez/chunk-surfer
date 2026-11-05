import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_SYNTAX_PALETTE as PALETTE,SOURCE_SYNTAX_RGB as RGB,sourceSyntaxSpans,tokenizeSourceSyntax as tokenize} from '../src/render/source-syntax.js';

function exact(source,spans){
  assert.equal(spans.map(span=>span.text).join(''),source);let cursor=0;
  for(const span of spans){
    assert.equal(span.start,cursor);assert.ok(span.end>span.start);assert.equal(span.text,source.slice(span.start,span.end));
    assert.equal(span.color,PALETTE[span.kind]);cursor=span.end;
  }
  assert.equal(cursor,source.length);return spans;
}
const significant=source=>exact(source,tokenize(source)).filter(span=>span.kind!=='whitespace');
const kind=(spans,text)=>spans.find(span=>span.text===text)?.kind;

test('syntax spans retain every UTF-16 position, line ending, tab and Unicode glyph',()=>{
  const source='\tconst café = read(雪, "🜁");\r\n  // λ stays exact\r\n\treturn café ?? 0;\n';
  const spans=exact(source,tokenize(source));assert.deepEqual(spans,tokenize(source));
  assert.equal(kind(spans,'café'),'identifier');assert.equal(kind(spans,'雪'),'identifier');
  assert.equal(kind(spans,'read'),'function');assert.equal(kind(spans,'??'),'operator');
  assert.ok(spans.some(span=>span.kind==='whitespace'&&span.text.includes('\r\n')));
  assert.equal(spans.find(span=>span.text==='"🜁"').end-spans.find(span=>span.text==='"🜁"').start,4);
});

test('keywords, types, functions and members have lexical boundaries rather than substring colors',()=>{
  const spans=significant('const returnValue = Math.floor(value); obj.return /* hold */ (returnValue); uint32_t count; int main() { return count; }');
  assert.equal(kind(spans,'const'),'keyword');assert.equal(kind(spans,'returnValue'),'identifier');
  assert.equal(kind(spans,'Math'),'type');assert.equal(kind(spans,'floor'),'function');
  assert.equal(spans.find(span=>span.text==='return').kind,'function','a reserved word used as a member is not a control statement');
  assert.equal(spans.filter(span=>span.text==='return').at(-1).kind,'keyword');
  for(const text of ['uint32_t','int'])assert.equal(kind(spans,text),'type');
  assert.equal(kind(spans,'main'),'function');assert.equal(kind(spans,'/* hold */'),'comment');
});

test('comments and escaped strings cannot expose fake keywords or comment delimiters',()=>{
  const source='const url = "https://host/\\\"return"; /* for\n false */\n// "if"\nconst key = \'/* literal */\';';
  const spans=exact(source,tokenize(source));
  assert.equal(spans.filter(span=>span.kind==='comment').length,2);
  assert.equal(spans.filter(span=>span.kind==='string').length,2);
  assert.ok(!spans.some(span=>span.kind==='keyword'&&['return','for','false','if'].includes(span.text)));
  const json=significant('{"key": "value", "count": 2, "ready": true}');
  assert.equal(kind(json,'"key"'),'property');assert.equal(kind(json,'"value"'),'string');
});

test('nested template expressions color code while raw and escaped template text stay intact',()=>{
  const source='const line = `return \\${literal} ${format({value: `x${n + 1}`})} tail`;';
  const spans=significant(source);
  assert.equal(kind(spans,'format'),'function');assert.equal(kind(spans,'n'),'identifier');
  assert.equal(spans.filter(span=>span.text==='${').length,2,'escaped interpolation stays template text');
  assert.ok(spans.some(span=>span.kind==='template'&&span.text.includes('return \\${literal}')));
  assert.equal(kind(spans,'1'),'number');assert.equal(kind(spans,'+'),'operator');
});

test('numbers and longest operators cover the actual JS and C-style lexical forms',()=>{
  const numbers=['0xCA_FE','0b1010n','0o77','12_345','1.25e-3','.5','42n','2.0f','8ULL'];
  const spans=significant(numbers.join(' ')+'; a >>>= 2; b **= 3; c === d && e !== f; x ??= obj?.value; fn => fn + 1;');
  for(const number of numbers)assert.equal(kind(spans,number),'number',number);
  for(const operator of ['>>>=','**=','===','&&','!==','??=','?.','=>'])assert.equal(kind(spans,operator),'operator',operator);
});

test('regular expressions retain escaped slashes and character classes without consuming division',()=>{
  const source='const rule = /https?:\\/\\/[a-z/]+/gi; const ratio = total / count / 2;';
  const spans=significant(source);
  assert.equal(spans.filter(span=>span.kind==='regexp').length,1);
  assert.equal(spans.filter(span=>span.text==='/'&&span.kind==='operator').length,2);
  assert.equal(spans.filter(span=>span.kind==='comment').length,0);
});

test('verified authored token contexts win, with whitespace gaps and function/operator enrichment',()=>{
  const source='  read \t (value ?? 0)\r\n';
  const tokens=[['read','identifier',2],['(','punctuation',9],['value','identifier',10],['??','punctuation',16],['0','number',19],[')','punctuation',20]]
    .map(([text,kind,start])=>({text,kind,start,end:start+text.length}));
  const before=structuredClone(tokens),spans=exact(source,sourceSyntaxSpans(source,tokens));
  assert.equal(kind(spans,'read'),'function');assert.equal(kind(spans,'??'),'operator');assert.deepEqual(tokens,before);
  const continued='return / x';
  assert.equal(sourceSyntaxSpans(continued,[{text:continued,start:0,end:continued.length,kind:'comment'}])[0].kind,'comment','valid authored multiline context must not be re-lexed as standalone code');
});

test('stale, overlapping, incomplete and malformed authored streams fall back as a complete row',()=>{
  const source='read(value)';
  const good=[{text:'read',start:0,end:4,kind:'identifier'},{text:'(',start:4,end:5,kind:'punctuation'},{text:'value',start:5,end:10,kind:'identifier'},{text:')',start:10,end:11,kind:'punctuation'}];
  for(const tokens of [null,[],[null],good.slice(1),good.slice(0,-1),[{...good[0],text:'stale'},...good.slice(1)],[good[0],{...good[1],start:3},...good.slice(2)],[{...good[0],start:.5},...good.slice(1)],[{...good[0],kind:'unknown'},...good.slice(1)],[{...good[0],kind:'whitespace'},...good.slice(1)]]){
    assert.deepEqual(exact(source,sourceSyntaxSpans(source,tokens)),tokenize(source));
  }
});

test('incomplete source, unknown glyphs and prose always remain lossless',()=>{
  for(const source of ['', '  \r\n\t', 'a quiet room — 🜁', '/* unclosed\nreturn', '"unfinished\nnext', '`open ${call({x: 1})'])exact(source,tokenize(source));
  assert.deepEqual(tokenize(null),[]);assert.deepEqual(tokenize(undefined),[]);
});

test('all authored atlas rows retain exact copy and valid supplied offsets',()=>{
  const atlas=JSON.parse(readFileSync(new URL('../content/chunk-surf/source-atlas.json',import.meta.url),'utf8'));
  const rows=Object.values(atlas.sectors).flatMap(sector=>sector.sourceLines||[]);
  assert.ok(rows.length>800);const kinds=new Set();
  for(const row of rows){
    const spans=exact(row.text,sourceSyntaxSpans(row.text,row.tokens));
    for(const token of row.tokens)assert.ok(spans.some(span=>span.start===token.start&&span.end===token.end&&span.text===token.text),'verified atlas token boundaries must survive');
    for(const span of spans)kinds.add(span.kind);
  }
  for(const expected of ['function','keyword','number','string','comment','operator','property','whitespace'])assert.ok(kinds.has(expected),expected);
});

test('editor colors expose immutable normalized RGB and keep every category readable',()=>{
  assert.ok(Object.isFrozen(PALETTE)&&Object.isFrozen(RGB));
  for(const [kind,color] of Object.entries(PALETTE)){
    assert.match(color,/^#[\da-f]{6}$/i);assert.ok(Object.isFrozen(RGB[kind]));
    assert.deepEqual(RGB[kind],[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255));
    assert.ok(RGB[kind].reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)>.6,kind+' must remain bright against Source architecture');
  }
  assert.ok(new Set(Object.values(PALETTE)).size>=8);
});
