// Fictional Ellery publicity. Copy is environmental print, never a prompt or
// progression authority. The formal programme preserves the unopened season.
const poster=(id,title,kind,widthM=.594,heightM=.841,extra={})=>Object.freeze({
  id,title,kind,widthM,heightM,mesh:`institution_poster_${id}`,
  flatMesh:`institution_poster_${id}_flat`,tapedMesh:`institution_poster_${id}_taped`,
  ...extra,
});
const experimental=(id,title,kind)=>poster(id,title,kind,.594,.841,{
  experimental:true,rasterWidthPx:704,materialWidthPx:192,paperSegments:[12,8],
});
export const INSTITUTION_POSTER_DESIGNS=Object.freeze([
  poster('season','Music for the city','season-programme',1,.70),
  poster('winter_programme','The winter programme','season-programme',1,.70),
  poster('winter','Winter concerts','season-promotion'),
  poster('chamber','In company','chamber-promotion'),
  poster('piano','One piano','solo-promotion'),
  poster('visiting','Other voices','visiting-ensemble-promotion'),
  poster('chapel','Sound & stone','chapel-promotion'),
  poster('students','Play together','student-notice'),
  poster('lyric','After the last note','local-music-promotion'),
  experimental('loudspeakers','Room without players','fixed-media-promotion'),
  experimental('live_electronics','Live wires','live-electronics-promotion'),
  experimental('tape','Tape music','tape-music-promotion'),
  experimental('new_works','Not yet heard','new-music-promotion'),
  experimental('graphic_score','Read the room','graphic-score-workshop'),
  experimental('prepared','Objects for piano','prepared-piano-promotion'),
]);
export const INSTITUTION_POSTER_ASSET='assets/institution-posters.glb';
export const INSTITUTION_POSTER_CASE_MESH='institution_poster_case';
export const INSTITUTION_POSTER_MESHES=Object.freeze([...INSTITUTION_POSTER_DESIGNS.flatMap(p=>[p.flatMesh,p.tapedMesh]),INSTITUTION_POSTER_CASE_MESH]);
export function institutionPoster(id){return INSTITUTION_POSTER_DESIGNS.find(p=>p.id===id)||null;}
