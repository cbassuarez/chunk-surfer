const queryText=query=>String(query||'').trim().toLowerCase();
const identity=(item,q)=>[item.document.title,item.document.id,item.module,...(item.document.tags||[])].join(' ').toLowerCase().includes(q);
const textMatch=(item,q)=>Object.values(item.document.nodes||{}).find(node=>
  node.lines?.some(line=>String(line.text||'').toLowerCase().includes(q))
  ||node.choices?.some(choice=>String(choice.text||'').toLowerCase().includes(q)));

export function storyMatchesSearch(item,query){
  const q=queryText(query);return!q||identity(item,q)||!!textMatch(item,q);
}

export function storySearchNode(item,query){
  const q=queryText(query);
  // Asking for a named conversation opens its beginning. A sentence query
  // deliberately opens the beat that says it, rather than resetting to entry.
  return q&&!identity(item,q)?textMatch(item,q)?.id||item.document.entry:item.document.entry;
}
