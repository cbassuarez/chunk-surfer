// Original CC0 artist marks mounted on existing outdoor hosts. Coordinates
// below are in each host's own frame, in metres; the runtime clones the real
// host's pose, including its offset, floor, yaw and scale.
export const EXTERIOR_GRAFFITI_PACK='/assets/exterior-graffiti.glb';
const mark=(art,side,z,width,y0,y1,surface='masonry')=>({art,side,z,width,y0,y1,surface});
const court=(id,marks)=>({id:`district-${id}-graffiti`,host:`district-${id}-court-walls`,mesh:`exterior_graffiti_${id}`,kind:'court',marks});
const frontage=(id,host,kind,marks)=>({id:`${host}-graffiti`,host,mesh:`exterior_graffiti_${id}`,kind,marks});
export const EXTERIOR_GRAFFITI_HOSTS=Object.freeze([
 court('south',[mark('dephy',-1,4.5,1.8,.77,2.1),mark('Kurt',1,7.15,1.65,1.0,2.2),mark('ELLERY',-1,8.75,1.8,.82,2.1)]),
 court('west',[mark('GBS',-1,4.5,1.95,.72,2.35),mark('SURFER',1,7.15,1.7,.85,2.2),mark('maryjane',1,11.42,1.7,.83,2.1)]),
 court('east',[mark('DUB',-1,4.5,1.8,.82,2.17),mark('imdoinggreat',1,7.15,1.7,.83,2.2),mark('valha',-1,8.75,1.8,.75,2.2)]),
 frontage('west_street','district-west-row-b','workshop',[
   mark('valha',1,-12,3.4,.65,2.55,'shutter'),mark('dephy',1,20,2.3,.87,2.28,'shutter')]),
 frontage('east_street','district-east-row-b','workshop',[
   mark('RANDOM',1,20,2.5,.82,2.32,'shutter'),mark('DUB',1,-12,2.75,.75,2.45,'shutter')]),
 frontage('south_street','district-south-row-c','workshop',[
   mark('PEACE',1,-28,2.25,.90,2.35,'shutter'),mark('GBS',1,-12,3.15,.72,2.45,'shutter')]),
 frontage('north_street_a','district-north-row-a','street',[
   mark('Kurt',1,28.65,1.05,1.64,2.19)]),
 frontage('west_street_a','district-west-row-a','street',[
   mark('imdoinggreat',1,-3.35,1.05,1.64,2.19)]),
 frontage('east_street_a','district-east-row-a','street',[
   mark('RANDOM',1,-3.35,1.05,1.64,2.19)]),
 frontage('square_north','ellery-square-north','square',[
   mark('dephy',1,-11.35,1.05,1.64,2.19),mark('Kurt',1,12.65,.94,1.64,2.19),
   mark('PEACE',1,-19.35,1.05,1.64,2.19),mark('DUB',1,20.65,.95,1.64,2.19)]),
 frontage('square_west','ellery-square-west','square',[
   mark('maryjane',1,-15.35,.98,1.64,2.19),mark('PEACE',1,16.65,.95,1.64,2.19),
   mark('DUB',1,-15.35,.93,.99,1.49),mark('RANDOM',1,16.65,.98,.99,1.49)]),
].map(host=>Object.freeze({...host,marks:Object.freeze(host.marks.map(Object.freeze))})));
export const EXTERIOR_GRAFFITI_MESHES=Object.freeze(Object.fromEntries(
 EXTERIOR_GRAFFITI_HOSTS.map(h=>[h.mesh,{w:h.kind==='court'?9:1,d:h.kind==='court'?16:80,h:3.5,blocks:false}]),
));
