// Source-owned conversations are first-class timeline entries while their
// modules remain the editing authority. This is a view; project.json stays the
// canonical manifest for documents the Studio can write.
const openingModule='src/data/opening-prologue.js';
const sourceModules=[
  'src/data/source-rest-conversation.js',
  'src/data/source-rest-couperin-conversation.js',
  'src/data/source-rest-questions.js',
  'src/data/source-rest-earthly.js',
];

export function projectStudioTimeline(project,documents){
  const byModule=new Map(documents.filter(item=>item.readOnly).map(item=>[item.module,item.document.id]));
  const unique=ids=>[...new Set(ids)];
  return(project.timeline||[]).map(entry=>{
    const ids=[...(entry.documents||[])];
    if(entry.id==='opening'){
      const opening=byModule.get(openingModule);
      return{...entry,documents:unique([...(opening?[opening]:[]),...ids])};
    }
    if(entry.id==='source-space'){
      const listening=sourceModules.map(module=>byModule.get(module)).filter(Boolean);
      return{...entry,title:listening.length?'Source Space · Contact and listening':entry.title,
        documents:unique([...ids.slice(0,1),...listening,...ids.slice(1)])};
    }
    return{...entry,documents:ids};
  });
}
