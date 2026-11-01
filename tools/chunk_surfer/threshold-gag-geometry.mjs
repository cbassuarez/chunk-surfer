// One original, deliberately crude scenery apparatus. Local origin is the
// vertical hinge pin; Y up; deployed painted face +Z; the arm extends -X.
// The Source renderer's +yaw maps local -X toward -Z. Rest=+PI/2, stop=0.
import {ShapeUtils,Vector2} from 'three';

export const THRESHOLD_GAG_MATERIALS=Object.freeze([
 ['old cream distemper',[.79,.775,.70],.98,0],['cardboard cut edge',[.42,.29,.16],1,0],
 ['plain unfinished hardboard',[.36,.27,.17],1,0],['rough sawn timber',[.34,.23,.13],.98,0],
 ['wood end grain',[.48,.34,.20],1,0],['worn hinge steel',[.25,.26,.24],.58,.48],
 ['black brush lettering',[.012,.016,.013],.97,0],['speaker black case',[.027,.030,.026],.82,.08],
 ['speaker grille',[.15,.16,.14],.68,.3],['red insulated wire',[.29,.065,.035],.85,0],
 ['black insulated wire',[.025,.024,.020],.87,0],['exposed backing',[.27,.24,.17],1,0],
 ['old green scenic facing',[.31,.34,.29],.98,0],['exposed nail heads',[.19,.19,.16],.63,.6],
 ['student charcoal ink inscription',[.012,.014,.011],1,0],
]);
export const THRESHOLD_GAG_MODEL=Object.freeze({
 version:1,coordinateSpace:'metres; hinge pin origin; Y up; front +Z; moving arm -X',
 pivot:[0,0,0],axis:[0,1,0],restAngle:Math.PI/2,stopAngle:0,
 fixedMeshes:['ellery_threshold_mount','ellery_threshold_scenery'],
 movingMeshes:['ellery_threshold_ghost','ellery_threshold_armature'],
 anchors:{hinge:[0,0,0],speaker:[-.68,-.185,-.111],release:[.015,.015,-.015],stop:[-.245,0,.030],rattle:[-.47,-.02,-.055]},
 contact:{movingArmFrontZ:.030,stopMinZ:.030,stopX:[-.28,-.21],stopY:[-.065,.065],positiveAngleClearance:true},
 board:{centerX:-.68,frontZ:.082,backZ:.068,thickness:.014,faceIsFrontOnly:true},
 scenery:{minX:.19,maxX:.255,minZ:-1.52,maxZ:-.02,floorY:-1.15,topY:1.38},
 frontalApron:{minX:-.18,maxX:.30,minZ:-.008,maxZ:.018,slotMinY:-.13,slotMaxY:.10,breastplate:{minX:-.18,maxX:.30,minY:-.18,maxY:.16,minZ:.055,maxZ:.080}},
 reverseInscription:{lines:['HIS FEARFUL','MEDIOCRITY'],attribution:'ELLERY STUDENTS',handwrittenLines:['His fearful','Mediocrity'],handwrittenAttribution:'Ellery students',construction:'Original whole-word cubic brush paths with individual pen lifts, changing pressure, ink pools, retrace and dry brush; no glyph alphabet, font or texture',signatures:'two anonymous illegible curved hand flourishes; no names or date',panel:{minX:-.943,maxX:-.473,minY:.210,maxY:.548,frontZ:.018,backZ:.008},inkZ:.0072,inkMaterial:14,mainCapHeight:.080,attributionCapHeight:.035,inspectionTarget:[-.68,.36,.005],provenance:'New user-approved student mock-title; students/backstage crews are established, no maker identity or date asserted'},
 text:'boo!',authoredFrom:'User-supplied three-view Ellery threshold gag concept; original modeled construction, not a pasted image',
});
const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const faceNormal=(a,b,c)=>unit(cross(sub(b,a),sub(c,a)));
export function thresholdGagGeometry(){
 const meshes=[],create=(name,part,role)=>{const row={name,part,role,groups:new Map()};meshes.push(row);return row;};
 const group=(m,mat)=>{if(!m.groups.has(mat))m.groups.set(mat,{p:[],n:[],uv:[],i:[]});return m.groups.get(mat);};
 function tri(m,mat,a,b,c,normal=null){let n=faceNormal(a,b,c);if(Math.hypot(...cross(sub(b,a),sub(c,a)))<1e-12)return;if(normal&&dot(n,normal)<0){[b,c]=[c,b];n=n.map(v=>-v);}const g=group(m,mat);for(const p of[a,b,c]){g.i.push(g.p.length/3);g.p.push(...p);g.n.push(...(normal||n));g.uv.push(p[0]*4,p[1]*4);}}
 function quad(m,mat,a,b,c,d,normal=null){tri(m,mat,a,b,c,normal);tri(m,mat,a,c,d,normal);}
 function box(m,mat,at,size){const p=Array.from({length:8},(_,i)=>at.map((v,k)=>v+size[k]/2*(i&(1<<k)?1:-1)));for(const[a,b,c,d]of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(m,mat,p[a],p[b],p[c],p[d]);}
 function cylinder(m,mat,a,b,r,sides=9){const along=unit(sub(b,a)),seed=Math.abs(along[1])<.9?[0,1,0]:[1,0,0],u=unit(cross(along,seed)),v=cross(along,u),p=(at,k)=>at.map((n,j)=>n+r*(u[j]*Math.cos(k/sides*Math.PI*2)+v[j]*Math.sin(k/sides*Math.PI*2)));for(let k=0;k<sides;k++){const c=p(a,k),d=p(a,k+1),e=p(b,k+1),f=p(b,k);quad(m,mat,c,d,e,f);tri(m,mat,a,d,c);tri(m,mat,b,f,e);}}
 function beam(m,mat,a,b,w,d=w){const along=unit(sub(b,a)),ref=Math.abs(along[1])<.9?[0,1,0]:[1,0,0],side=unit(cross(along,ref)),up=cross(along,side),p=Array.from({length:8},(_,i)=>(i&1?b:a).map((n,k)=>n+side[k]*(i&2?w/2:-w/2)+up[k]*(i&4?d/2:-d/2)));for(const[a,b,c,d]of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(m,mat,p[a],p[b],p[c],p[d]);}
 function surface(m,mat,points,z,front=true){const vertices=points.map(p=>new Vector2(...p));for(const[a,b,c]of ShapeUtils.triangulateShape(vertices,[]))tri(m,mat,[...points[a],z],[...points[b],z],[...points[c],z],[0,0,front?1:-1]);}
 function sheet(m,points,frontZ,backZ,{front=0,back=2,edge=1}={}){surface(m,front,points,frontZ,true);surface(m,back,points,backZ,false);for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];quad(m,edge,[...a,frontZ],[...b,frontZ],[...b,backZ],[...a,backZ]);}}
 function ellipse(m,mat,c,rx,ry,z,twist=0){const points=Array.from({length:18},(_,k)=>{const a=k/18*Math.PI*2,r=1+.05*Math.sin(k*2.7),x=Math.cos(a)*rx*r,y=Math.sin(a)*ry*r;return[c[0]+x*Math.cos(twist)-y*Math.sin(twist),c[1]+x*Math.sin(twist)+y*Math.cos(twist)];});surface(m,mat,points,z);}
 function stroke(m,mat,points,width,z){for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!l)continue;const n=[-(b[1]-a[1])/l*width/2,(b[0]-a[0])/l*width/2];quad(m,mat,[a[0]+n[0],a[1]+n[1],z],[b[0]+n[0],b[1]+n[1],z],[b[0]-n[0],b[1]-n[1],z],[a[0]-n[0],a[1]-n[1],z],[0,0,1]);}}
 function ovalStroke(m,c,rx,ry,width,z,tilt=0){const points=Array.from({length:19},(_,k)=>{const a=k/18*Math.PI*2,r=1+.035*Math.sin(k*1.8),x=Math.cos(a)*rx*r,y=Math.sin(a)*ry*r;return[c[0]+x*Math.cos(tilt)-y*Math.sin(tilt),c[1]+x*Math.sin(tilt)+y*Math.cos(tilt)];});stroke(m,6,points,width,z);}
 function wire(m,mat,points,r=.0025){for(let i=1;i<points.length;i++)cylinder(m,mat,points[i-1],points[i],r,5);}
 function screw(m,x,y,z,back=false){cylinder(m,13,[x,y,z-.002],[x,y,z+.002],.006,8);const s=back?-.0035:.0035;stroke(m,6,[[x-.003,y-.001],[x+.003,y+.001]],.0016,z+s);}
 const fixed=create('ellery_threshold_mount','fixed','jamb mounting block; fixed hinge leaf; pin and physical stop');
 box(fixed,3,[.105,0,.098],[.19,.24,.13]);box(fixed,4,[.201,0,.098],[.006,.235,.126]);
 // Two leaves share one actual vertical pin. The pivot is not the board centre.
 box(fixed,5,[.078,0,.031],[.13,.184,.012]);
 for(const y of[-.075,-.025,.025,.075])cylinder(fixed,5,[0,y-.017,0],[0,y+.017,0],.018,10);
 cylinder(fixed,5,[0,-.117,0],[0,.117,0],.008,10);
 for(const x of[.045,.113])for(const y of[-.060,.060])screw(fixed,x,y,.039);
 box(fixed,3,[-.245,0,.055],[.07,.13,.05]);box(fixed,4,[-.245,0,.081],[.069,.129,.002]);
 // A side cleat carries the stop back into the fixed mounting timber.
 box(fixed,3,[-.070,-.092,.052],[.41,.055,.064]);
 for(const x of[-.24,.03])screw(fixed,x,-.093,.087);
 const scenery=create('ellery_threshold_scenery','fixed','local floor-supported scenery flat; unfinished reverse and bracing');
 // The thin flat is on +X, clear of the complete negative-X swinging volume.
 box(scenery,12,[.202,.115,-.77],[.024,2.53,1.5]);
 // Backing is a separate exposed brown skin, no front artwork duplicated.
 box(scenery,11,[.222,.115,-.77],[.012,2.53,1.5]);
 for(const z of[-1.48,-.06])box(scenery,3,[.255,.115,z],[.07,2.53,.065]);
 for(const y of[-1.095,.10,1.325])box(scenery,3,[.255,y,-.77],[.075,.065,1.48]);
 beam(scenery,3,[.29,-1.04,-1.41],[.29,1.28,-.21],.052,.035);
 box(scenery,3,[.31,-1.117,-1.25],[.30,.066,.18]);box(scenery,3,[.31,-1.117,-.22],[.30,.066,.18]);
 // An imperfect shallow moulding connects the side return to the hinge block.
 box(scenery,3,[.245,.115,.015],[.11,2.53,.28]);box(scenery,4,[.245,-1.105,.015],[.13,.09,.30]);
 for(const z of[-1.47,-.18])for(const y of[-1.0,.13,1.27]){cylinder(scenery,13,[.292,y,z],[.296,y,z],.006,7);}
 // A narrow return face hides the stowed sheet from the now-frontal
 // approach. Its hinge-height aperture lets the rotating timber/hinge pass;
 // a short fixed cleat stands 25mm ahead of the moving arm's furthest face.
 // This masks the slot optically without placing scenery in the swing.
 sheet(scenery,[[-.18,.10],[.30,.10],[.30,1.38],[-.18,1.38]],.018,-.008,{front:12,back:11,edge:3});
 sheet(scenery,[[-.18,-1.15],[.30,-1.15],[.30,-.13],[-.18,-.13]],.018,-.008,{front:12,back:11,edge:3});
 box(scenery,3,[.060,-.010,.0675],[.48,.34,.025]);
 for(const x of[-.105,.205])screw(scenery,x,0,.082);
 const ghost=create('ellery_threshold_ghost','moving','thin white ghost; brown edge and plain reverse; attached boo! tab');
 const outline=[[-.28,-.84],[.31,-.82],[.322,-.59],[.298,-.20],[.25,.15],[.228,.52],[.184,.75],[.112,.90],[.004,.968],[-.126,.953],[-.224,.852],[-.272,.706],[-.279,.515],[-.320,.477],[-.457,.673],[-.554,.787],[-.590,.773],[-.602,.745],[-.631,.750],[-.648,.710],[-.631,.650],[-.612,.600],[-.49,.348],[-.334,.157],[-.317,-.150],[-.302,-.50]].map(([x,y])=>[x-.68,y]);
 sheet(ghost,outline,.082,.068);
 ellipse(ghost,6,[-.776,.629],.035,.074,.0827,.12);ellipse(ghost,6,[-.590,.643],.030,.064,.0828,-.15);ellipse(ghost,6,[-.670,.423],.026,.040,.0829,.08);
 // Small exposed cuts interrupt the paint rather than adding a texture system.
 let seed=0x31ba;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const inside=(x,y)=>{let yes=false;for(let i=0,j=outline.length-1;i<outline.length;j=i++){const a=outline[i],b=outline[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 for(let k=0;k<145;k++){const x=-1.31+random()*.96,y=-.82+random()*1.76,w=.002+random()*.010,h=.003+random()*.019;if(!inside(x,y)||!inside(x+w,y+h))continue;if(Math.hypot((x+.68)/.23,(y-.59)/.20)<1)continue;surface(ghost,k%5?1:2,[[x,y],[x+w,y+.002],[x+w*.37,y+h]],.0831);}
 // Cut edges have a visible dark flute/seam; the reverse is never face-painted.
 for(let k=0;k<outline.length;k++){const a=outline[k],b=outline[(k+1)%outline.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.floor(length/.035));for(let j=0;j<n;j++){const t=(j+.5)/n,u=a.map((v,d)=>v+(b[d]-v)*t);cylinder(ghost,2,[u[0],u[1],.070],[u[0],u[1],.079],.0012,4);}}
 const tab=[[-.392,.527],[-.324,.590],[-.354,.793],[-.285,.848],[.100,.865],[.161,.813],[.157,.600],[.105,.552],[-.230,.543],[-.321,.476],[-.295,.551]].map(([x,y])=>[x-.4,y+.27]);
 sheet(ghost,tab,.089,.077,{front:0,back:2,edge:1});
 // Original vector brushwork, exact diegetic text: boo! The uneven loops and
 // stem are actual front-only geometry, not a font or mirrored texture.
 const tabPoint=([x,y])=>[x-.4,y+.27];
 stroke(ghost,6,[[-.258,.610],[-.260,.795]].map(tabPoint),.020,.0905);ovalStroke(ghost,tabPoint([-.217,.659]),.036,.045,.019,.0905,.10);
 ovalStroke(ghost,tabPoint([-.116,.660]),.035,.044,.019,.0905,-.11);ovalStroke(ghost,tabPoint([-.017,.663]),.034,.045,.019,.0905,.06);
 stroke(ghost,6,[[.082,.697],[.074,.784]].map(tabPoint),.019,.0905);ellipse(ghost,6,tabPoint([.078,.630]),.012,.012,.0906);
 for(const[x,y]of[[-.354,.600],[-.294,.783]])ellipse(ghost,13,tabPoint([x,y]),.004,.004,.091);
 // An offcut screwed to the reverse spine carries the students' mock-title.
 // It stays within the original silhouette: the painted front is unchanged.
 // Each word below is an independently drawn gesture, not a jittered glyph
 // alphabet. Pen lifts, joins and variable paint load are part of the source.
 const inscription=THRESHOLD_GAG_MODEL.reverseInscription,ink=inscription.inkMaterial;
 sheet(ghost,[[-.943,.212],[-.477,.210],[-.473,.543],[-.939,.548]],.018,.008,{front:2,back:2,edge:1});
 // From the reverse, the observer's right is local -X. Reverse winding and
 // normal keep the writing visible solely from that unfinished side.
 // A stroke starts with [x,y], then cubic control/end sextuples. These are
 // whole words with unequal letter widths and naturally differing repeated
 // letters. The two f's, l's, e's and t's intentionally are not instances.
 const titleHand=[
  [[7,-6],[10,17,12,48,13,69]],
  [[41,3],[38,20,43,50,44,66]],
  [[11,28],[19,30,32,40,42,37]],
  [[56,2],[54,12,61,31,61,39]],
  [[93,36],[88,46,74,41,75,31],[75,22,97,20,91,7],[87,-8,71,-6,68,1]],
  [[131,-6],[131,14,139,48,145,69],[150,84,159,75,152,63],[145,51,135,33,132,22]],
  [[125,27],[135,29,146,32,157,30]],
  [[158,14],[181,18,184,32,175,34],[160,37,153,23,159,8],[165,-5,180,-3,186,5]],
  [[220,38],[209,49,190,33,194,13],[198,-2,214,2,219,22],[221,34,223,46,221,41]],
  [[221,41],[216,26,216,2,227,3]],
  [[236,4],[238,16,242,29,245,36],[243,22,244,19,246,25],[253,40,266,38,265,28]],
  [[275,-5],[277,17,286,50,294,68],[300,82,310,74,303,62],[296,47,284,35,277,23]],
  [[270,28],[280,29,291,33,305,32]],
  [[316,43],[310,25,308,1,321,3],[333,6,338,32,341,39],[338,22,332,2,346,0]],
  [[354,0],[365,21,374,54,372,70],[370,83,362,76,359,61],[354,37,348,8,358,-7],[365,-9,373,-4,378,4]],
 ];
 const mediocreHand=[
  [[4,0],[8,20,9,56,12,73],[17,57,25,32,29,19],[37,35,51,62,57,72],[55,52,54,22,58,3]],
  [[67,13],[88,17,95,32,83,35],[70,37,61,25,66,10],[71,-4,88,-3,98,8]],
  [[130,35],[115,44,99,31,103,14],[108,-2,124,4,130,21],[136,43,142,73,146,79]],
  [[144,73],[140,54,128,7,137,4],[141,2,147,6,151,11]],
  [[161,45],[159,29,151,4,163,5],[167,6,170,9,173,12]],
  [[204,37],[189,47,174,32,178,14],[182,-2,200,0,207,17],[214,33,206,43,198,41]],
  [[244,30],[235,40,217,27,218,12],[218,-6,240,-6,251,6]],
  [[259,-2],[259,15,264,32,268,43],[264,29,265,20,269,29],[278,47,288,44,289,34]],
  [[302,36],[298,25,292,3,301,2],[306,2,309,7,313,11]],
  [[336,63],[332,47,325,23,324,9],[324,-3,338,2,346,13]],
  [[316,35],[325,37,338,40,351,39]],
  [[362,43],[355,20,352,3,365,2],[376,2,384,21,389,40],[380,14,378,-14,368,-28],[358,-40,346,-28,356,-20],[370,-13,392,-4,408,8]],
 ];
 const creditHand=[
  [[32,45],[17,57,-1,43,10,31],[17,25,27,27,31,30]],
  [[17,28],[-4,27,-2,5,12,3],[23,1,35,5,42,12]],
  [[42,4],[54,23,61,45,56,53],[50,59,47,42,45,26],[40,6,43,2,55,7]],
  [[60,6],[70,25,81,49,75,55],[67,61,63,37,62,17],[60,2,67,1,76,8]],
  [[79,15],[95,15,105,31,95,32],[84,34,77,22,81,11],[86,0,100,3,107,10]],
  [[112,3],[115,13,118,23,120,31],[116,22,117,17,121,22],[128,35,140,34,139,26]],
  [[145,30],[138,16,140,1,150,2],[160,2,167,21,172,32],[165,13,162,-9,155,-19],[148,-31,135,-24,141,-16],[150,-10,169,-2,181,7]],
  [[235,28],[225,35,209,26,215,18],[219,14,235,14,234,7],[232,-3,214,-2,209,4]],
  [[252,50],[250,34,243,15,246,5],[249,-3,257,2,263,9]],
  [[237,28],[247,30,258,32,269,30]],
  [[278,29],[272,14,273,0,283,3],[293,6,296,21,300,31],[296,16,294,1,306,5]],
  [[334,27],[325,35,309,24,313,12],[317,-2,329,4,333,18],[337,33,343,47,344,54]],
  [[344,52],[341,36,330,2,339,3],[345,4,348,8,351,11]],
  [[355,14],[371,17,381,30,370,32],[359,35,351,22,356,10],[362,0,375,3,383,10]],
  [[387,2],[388,12,393,23,396,32],[393,22,394,16,397,21],[407,38,419,31,413,17],[408,3,415,0,424,7]],
  [[440,48],[436,32,430,14,434,5],[437,-1,446,4,451,11]],
  [[424,27],[432,31,447,32,457,30]],
  [[486,28],[478,35,463,29,463,20],[463,13,484,15,483,6],[481,-3,463,-1,458,4]],
 ];
 function brushPool(at,rx,ry,phase=0){const points=Array.from({length:9},(_,k)=>{const a=k/9*Math.PI*2,r=1+.13*Math.sin(k*2.1+phase);return[at[0]+Math.cos(a)*rx*r,at[1]+Math.sin(a)*ry*r];});surface(ghost,ink,points,inscription.inkZ,false);}
 function handStroke(path,left,baseline,scale,width,phase){
  const points=[path[0]],world=p=>[left-p[0]*scale,baseline+p[1]*scale];let from=path[0];
  for(const curve of path.slice(1)){const a=from,b=curve.slice(0,2),c=curve.slice(2,4),d=curve.slice(4,6),length=Math.hypot(...sub(b,a))+Math.hypot(...sub(c,b))+Math.hypot(...sub(d,c)),n=Math.max(3,Math.min(12,Math.ceil(length*scale/.0065)));
   for(let j=1;j<=n;j++){const t=j/n,u=1-t;points.push([0,1].map(k=>u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]));}from=d;
  }
  const written=points.map(world),sides=written.map((p,k)=>{const a=written[Math.max(0,k-1)],b=written[Math.min(written.length-1,k+1)],length=Math.hypot(...sub(b,a))||1,t=k/(written.length-1),load=.68+.22*Math.sin(t*Math.PI)+.16*Math.sin(t*11+phase)+.07*Math.cos(t*31+phase),w=width*load/2;return[[-(b[1]-a[1])/length*w,(b[0]-a[0])/length*w],p];});
  for(let k=1;k<sides.length;k++){const[n,a]=sides[k-1],[m,b]=sides[k],z=inscription.inkZ;quad(ghost,ink,[a[0]+n[0],a[1]+n[1],z],[b[0]+m[0],b[1]+m[1],z],[b[0]-m[0],b[1]-m[1],z],[a[0]-n[0],a[1]-n[1],z],[0,0,-1]);}
  // A loaded start and an occasional paused endpoint are distinct from the
  // narrow dry exit; these are paint geometry rather than extra text effects.
  if(Math.sin(phase*1.3)>.4)brushPool(written[0],width*.71,width*.47,phase);
  if(Math.sin(phase)>.5)brushPool(written.at(-1),width*.55,width*.63,phase+1);
 }
 titleHand.forEach((p,k)=>handStroke(p,-.493,.445,.00112,.0061+(k%4)*.00035,k*1.71));
 mediocreHand.forEach((p,k)=>handStroke(p,-.493,.348,.00103,.0059+(k%3)*.00045,k*1.39+.7));
 creditHand.forEach((p,k)=>handStroke(p,-.550,.274,.00065,.0029+(k%4)*.00016,k*1.17+2));
 // Separate dots are quick touches, not recycled ovals or font diacritics.
 for(const[x,y,left,baseline,scale]of[[62,55,-.493,.445,.00112],[163,57,-.493,.348,.00103],[306,58,-.493,.348,.00103]])brushPool([left-x*scale,baseline+y*scale],.0030,.0025,x);
 // A brief second pass on H and the capital M; a dragged, underloaded tail
 // off the final y. These follow the actual pen paths, not uniform distress.
 handStroke([[10,11],[12,30,12,50,13,61]],-.4942,.445,.00112,.0020,4.2);
 handStroke([[10,38],[11,54,12,64,12,70]],-.492,.348,.00103,.0019,2.8);
 handStroke([[383,-6],[392,-1,405,4,416,5]],-.493,.348,.00103,.0023,5.3);
 // An underloaded second sweep missed the first f's crossbar slightly.
 handStroke([[126,24],[137,25,148,30,155,28]],-.493,.445,.00112,.0024,4.9);
 // A few exposed bristle tracks split just the broad, loaded downstrokes.
 // They are the actual hardboard showing through, not noise over every word.
 for(const p of[
  [[-.5045,.467],[-.5051,.481],[-.5054,.495]],
  [[-.653,.490],[-.652,.480],[-.650,.473]],
  [[-.504,.410],[-.504,.400],[-.505,.389]],
 ]){for(let k=1;k<p.length;k++){const a=p[k-1],b=p[k],w=.0005,z=inscription.inkZ-.0001;quad(ghost,2,[a[0]-w,a[1],z],[b[0]-w,b[1],z],[b[0]+w,b[1],z],[a[0]+w,a[1],z],[0,0,-1]);}}
 // Two unrelated individual signatures, deliberately not resolvable names.
 handStroke([[0,0],[8,6,11,23,8,25],[2,23,2,5,6,3],[14,-2,20,22,17,19],[14,16,17,1,24,4],[29,7,30,15,33,10],[32,5,36,0,41,4],[46,12,49,13,47,5],[46,-2,54,0,61,3],[73,7,81,8,96,5]],-.570,.230,.001,.0023,1.8);
 handStroke([[0,2],[14,8,27,21,19,24],[12,25,9,2,17,0],[23,-2,24,18,28,17],[36,17,25,0,34,2],[43,5,43,14,46,10],[48,5,46,0,52,3],[60,9,61,12,63,6],[62,2,69,0,72,3],[79,6,85,6,95,4]],-.763,.230,.001,.0021,3.1);
 for(const y of[.226,.533]){cylinder(ghost,13,[-.673,y,.004],[-.673,y,.010],.0047,8);}
 const moving=create('ellery_threshold_armature','moving','wood arm; rear spine; speaker, grille and visible wiring');
 box(moving,3,[-.385,0,-.025],[.77,.105,.11]);box(moving,4,[-.768,0,-.025],[.004,.10,.108]);
 box(moving,5,[-.076,0,.031],[.128,.184,.012]);for(const x of[-.040,-.110])for(const y of[-.060,.060])screw(moving,x,y,.039);
 box(moving,3,[-.658,-.008,.043],[.09,1.55,.050]);box(moving,4,[-.658,.770,.043],[.089,.008,.049]);
 box(moving,3,[-.677,.625,.047],[.19,.075,.042]);
 for(const y of[-.700,-.315,.133,.570,.714])screw(moving,-.658,y,.015,true);
 box(moving,7,[-.680,-.185,-.053],[.185,.205,.100]);
 // Driver cone faces -Z, toward an observer inspecting the unfinished reverse.
 cylinder(moving,8,[-.680,-.185,-.105],[-.680,-.185,-.111],.071,24);
 cylinder(moving,7,[-.680,-.185,-.112],[-.680,-.185,-.114],.062,24);
 for(let row=-5;row<=5;row++)for(let col=-5;col<=5;col++){const x=col*.0108,y=row*.0108;if(x*x+y*y>.056*.056)continue;cylinder(moving,8,[-.680+x,-.185+y,-.115],[-.680+x,-.185+y,-.117],.0024,5);}
 for(const x of[-.758,-.602])for(const y of[-.270,-.100])screw(moving,x,y,-.107,true);
 wire(moving,9,[[-.586,-.180,-.098],[-.520,-.176,-.105],[-.480,-.103,-.100],[-.338,-.079,-.089],[-.190,-.084,-.083],[-.050,-.083,-.064],[.022,-.073,-.055]],.0027);
 wire(moving,10,[[-.586,-.209,-.099],[-.516,-.209,-.106],[-.472,-.129,-.105],[-.336,-.101,-.092],[-.188,-.106,-.086],[-.048,-.108,-.065],[.020,-.093,-.055]],.0026);
 // Modest clips tie the wires onto the supporting arm, with a short free loop.
 for(const x of[-.46,-.29,-.14])box(moving,5,[x,-.092,-.095],[.009,.035,.008]);
 // Sparse long grain/scuffs make the reverse readable without a fake face.
 for(let k=0;k<28;k++){const x=-.695+random()*.073,y=-.72+random()*1.44;box(moving,k%4?4:2,[x,y,.016],[.0011,.02+random()*.11,.001]);}
 return meshes;
}
export function thresholdGagBounds(mesh){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const g of mesh.groups.values())for(let i=0;i<g.p.length;i++){const axis=i%3;min[axis]=Math.min(min[axis],g.p[i]);max[axis]=Math.max(max[axis],g.p[i]);}return{min,max};}
export function thresholdGagPosePoint(point,angle){const c=Math.cos(angle),s=Math.sin(angle);return[c*point[0]-s*point[2],point[1],s*point[0]+c*point[2]];}
