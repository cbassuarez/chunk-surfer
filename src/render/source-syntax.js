// Source text stays verbatim. Offsets use JavaScript/atlas UTF-16 code units,
// so callers can measure each prefix with the same font as the original row.
export const SOURCE_SYNTAX_PALETTE=Object.freeze({
  text:'#f3f6ff',whitespace:'#f3f6ff',identifier:'#f3f6ff',
  keyword:'#dca5ff',type:'#80eaff',function:'#ffee8a',property:'#9de7ff',
  number:'#ffca91',string:'#a8f5bb',template:'#a8f5bb',regexp:'#a8f5bb',
  comment:'#91bfd2',operator:'#ff9bd0',punctuation:'#e8edf7',
});
export const SOURCE_SYNTAX_RGB=Object.freeze(Object.fromEntries(Object.entries(SOURCE_SYNTAX_PALETTE)
  .map(([kind,color])=>[kind,Object.freeze([1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255))])));

const KEYWORDS=new Set(('as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let namespace new null of package private protected public return set static super switch this throw true try typeof undefined var while with yield '+
  'alignas alignof asm auto constexpr decltype explicit extern friend goto inline mutable noexcept nullptr register restrict sizeof struct template typedef typename union using virtual volatile').split(/\s+/));
const TYPES=new Set(('any bool boolean byte char double float int long never number object short signed size_t string symbol unknown unsigned void wchar_t '+
  'Array ArrayBuffer BigInt BigInt64Array BigUint64Array Boolean DataView Date Error Float32Array Float64Array Int8Array Int16Array Int32Array JSON Map Math Number Object Promise RegExp Set String Symbol Uint8Array Uint8ClampedArray Uint16Array Uint32Array WeakMap WeakSet').split(/\s+/));
const IDENTIFIER_START=/[$_\p{ID_Start}]/u,IDENTIFIER_PART=/[$_\u200c\u200d\p{ID_Continue}]/u;
const OPERATORS=['>>>=','**=','===','!==','>>>','&&=','||=','??=','<<=','>>=','...','=>','**','++','--','&&','||','??','?.','+=','-=','*=','/=','%=','&=','|=','^=','<<','>>','<=','>=','==','!=','::','->'];
const SINGLE_OPERATOR=/^[+\-*/%=!<>~^&|?]$/;
const NUMBER=/^(?:0[xX][\da-fA-F](?:_?[\da-fA-F])*(?:n|[uUlL]{1,3})?|0[bB][01](?:_?[01])*(?:n|[uUlL]{1,3})?|0[oO][0-7](?:_?[0-7])*(?:n|[uUlL]{1,3})?|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?(?:n|[fFuUlL]{1,3})?)/;
const isSpace=character=>/\s/u.test(character);
const operator=text=>OPERATORS.includes(text)||SINGLE_OPERATOR.test(text);
const type=text=>TYPES.has(text)||/^(?:u?int(?:8|16|32|64)_t|[A-Z][A-Za-z\d]*Array)$/.test(text);
const span=(source,start,end,kind)=>({text:source.slice(start,end),start,end,kind,color:SOURCE_SYNTAX_PALETTE[kind]});

function decorate(source,tokens){
  const significant=tokens.map((token,index)=>token.kind!=='whitespace'&&token.kind!=='comment'?index:-1).filter(index=>index>=0);
  const previous=new Map(),next=new Map();
  significant.forEach((index,at)=>{previous.set(index,tokens[significant[at-1]]);next.set(index,tokens[significant[at+1]]);});
  return tokens.map((token,index)=>{
    let {kind}=token;
    if(kind==='punctuation'&&operator(token.text))kind='operator';
    if(kind==='identifier'||kind==='keyword'||kind==='type'){
      const member=['.','?.','->','::'].includes(previous.get(index)?.text);
      kind=!member&&type(token.text)?'type':!member&&KEYWORDS.has(token.text)?'keyword':next.get(index)?.text==='('? 'function':'identifier';
    }
    return span(source,token.start,token.end,kind);
  });
}

// Prefer the atlas scanner's context when every token is verifiably a slice
// of this exact text. Any stale/overlapping/incomplete stream falls back as
// one whole row, rather than mixing incompatible offsets or losing glyphs.
export function sourceSyntaxSpans(text,authoredTokens){
  const source=String(text??'');
  if(!Array.isArray(authoredTokens))return tokenizeSourceSyntax(source);
  const tokens=[];let cursor=0;
  for(const token of authoredTokens){
    if(!token||!Number.isInteger(token.start)||!Number.isInteger(token.end)||token.start<cursor||token.end<=token.start||token.end>source.length
      ||token.text!==source.slice(token.start,token.end)||!Object.hasOwn(SOURCE_SYNTAX_PALETTE,token.kind)
      ||token.kind==='whitespace'&&/\S/u.test(token.text)
      ||/\S/u.test(source.slice(cursor,token.start)))return tokenizeSourceSyntax(source);
    if(token.start>cursor)tokens.push(span(source,cursor,token.start,'whitespace'));
    tokens.push(span(source,token.start,token.end,token.kind));cursor=token.end;
  }
  if(/\S/u.test(source.slice(cursor)))return tokenizeSourceSyntax(source);
  if(cursor<source.length)tokens.push(span(source,cursor,source.length,'whitespace'));
  return decorate(source,tokens);
}

/** A bounded lexical fallback, not a JS parser. It accepts incomplete source,
 * C-style code and prose without changing their characters or indentation. */
export function tokenizeSourceSyntax(text){
  const source=String(text??''),tokens=[];let cursor=0;
  const push=(start,kind)=>{if(cursor>start)tokens.push(span(source,start,cursor,kind));};
  const previous=()=>{for(let i=tokens.length-1;i>=0;i--)if(!['whitespace','comment'].includes(tokens[i].kind))return tokens[i];return null;};
  const regexpAllowed=()=>{
    const before=previous();
    return!before||before.kind==='operator'&&!['++','--'].includes(before.text)
      ||['(','[','{',',',':',';','${'].includes(before.text)
      ||before.kind==='keyword'&&['return','throw','case','yield','await','void','typeof','delete','in','of'].includes(before.text);
  };
  function regexpEnd(){
    let at=cursor+1,inClass=false;
    while(at<source.length&&!/[\r\n]/.test(source[at])){
      if(source[at]==='\\'){at+=2;continue;}
      if(source[at]==='[')inClass=true;
      else if(source[at]===']')inClass=false;
      else if(source[at]==='/'&&!inClass){at++;while(/[a-z]/i.test(source[at]||'')&&at<source.length)at++;return at;}
      at++;
    }
    return null;
  }
  function quoted(){
    const start=cursor,quote=source[cursor++];
    while(cursor<source.length){
      if(source[cursor]==='\\'){
        cursor++;if(source[cursor]==='\r'&&source[cursor+1]==='\n')cursor+=2;else if(cursor<source.length)cursor++;
      }else if(source[cursor]===quote){cursor++;break;}
      else if(/[\r\n]/.test(source[cursor]))break;
      else cursor++;
    }
    const before=previous();let after=cursor;while(after<source.length&&isSpace(source[after]))after++;
    const property=source[after]===':'&&(!before||['{',','].includes(before.text));
    push(start,property?'property':'string');
  }
  function template(){
    let start=cursor++;
    while(cursor<source.length){
      if(source[cursor]==='\\'){cursor=Math.min(source.length,cursor+2);continue;}
      if(source[cursor]==='`'){cursor++;push(start,'template');return;}
      if(source[cursor]==='$'&&source[cursor+1]==='{'){
        push(start,'template');start=cursor;cursor+=2;push(start,'punctuation');code(true);start=cursor;continue;
      }
      cursor++;
    }
    push(start,'template');
  }
  function code(interpolation=false){
    let braces=0;
    while(cursor<source.length){
      const start=cursor,character=String.fromCodePoint(source.codePointAt(cursor)),next=source[cursor+1];
      if(isSpace(character)){cursor+=character.length;while(cursor<source.length&&isSpace(source[cursor]))cursor++;push(start,'whitespace');continue;}
      if(character==='/'&&next==='/'){cursor+=2;while(cursor<source.length&&!/[\r\n]/.test(source[cursor]))cursor++;push(start,'comment');continue;}
      if(character==='/'&&next==='*'){const end=source.indexOf('*/',cursor+2);cursor=end<0?source.length:end+2;push(start,'comment');continue;}
      if(character==='"'||character==="'"){quoted();continue;}
      if(character==='`'){template();continue;}
      if(character==='/'&&regexpAllowed()){
        const end=regexpEnd();if(end!==null){cursor=end;push(start,'regexp');continue;}
      }
      if(IDENTIFIER_START.test(character)){
        cursor+=character.length;
        while(cursor<source.length){const part=String.fromCodePoint(source.codePointAt(cursor));if(!IDENTIFIER_PART.test(part))break;cursor+=part.length;}
        const word=source.slice(start,cursor);push(start,type(word)?'type':KEYWORDS.has(word)?'keyword':'identifier');continue;
      }
      if(/\d/.test(character)||character==='.'&&/\d/.test(next||'')){
        const match=source.slice(cursor).match(NUMBER);if(match){cursor+=match[0].length;push(start,'number');continue;}
      }
      const symbol=OPERATORS.find(value=>source.startsWith(value,cursor));
      if(symbol){cursor+=symbol.length;push(start,'operator');continue;}
      if(SINGLE_OPERATOR.test(character)){cursor++;push(start,'operator');continue;}
      if(/[{}()[\],;:.]/.test(character)){
        cursor++;push(start,'punctuation');
        if(character==='{')braces++;
        if(character==='}'){
          if(interpolation&&braces===0)return;
          braces--;
        }
        continue;
      }
      cursor+=character.length;push(start,'text');
    }
  }
  code();return decorate(source,tokens);
}
