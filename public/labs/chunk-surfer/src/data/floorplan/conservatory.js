// THE CONSERVATORY. Condemned, powered down, days from demolition.
//
// Three logical drawings, compiled into one Euclidean physical volume. Logical
// cells remain unique for saves, sound paths and mutation; physicalOrigin puts
// their air spans above/below one another for the renderer.
//
//   sub-basement  (left, -4m)    studio B3 · the plant room · the dead lift shaft
//   ground        (top right)    loading dock · foyer · concert hall · the natatorium
//   upper         (+4.8m)              the practice wing · the vaulted chapel
//
// You carry the standard keyring. It does not open everything. The building has
// changed since it was working, and again since the last recordist walked it:
// the foyer door onto the concert hall is bricked up, and the chapel is locked
// with a key nobody gave you. Both have another way in. They always do.
//
// The engine holds no geometry — edit these maps freely. To find a building
// that has quietly sealed itself:
//
//   node tools/chunk_surfer/tests/floorplan.mjs --plan=conservatory --map

function hallGroundRows(){
  const w=30,h=38,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=(x===0||x===w-1||y===0||y===h-1)?'#':'H';
    if(y>0&&y<8&&x>0&&x<w-1)c='S';
    if(y>=8&&y<=31&&(x<=4||x>=25)&&x>0&&x<w-1)c='h';
    if(y>=32&&y<h-1&&x>0&&x<w-1)c='r';
    if(x===0&&(y===7||y===24||y===25||y===32))c='H';
    row+=c;
  }out.push(row);}return out;
}
function balconyRows(glyph){
  const w=30,h=38,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c=' ';
    if(x===0||x===w-1||y===0||y===h-1)c='#';
    else if((y>=8&&y<=35&&(x<=4||x>=25))||y>=32)c=glyph;
    row+=c;
  }out.push(row);}return out;
}
function chapelRows(){
  const w=30,h=36,out=[];
  for(let y=0;y<h;y++){let row='';for(let x=0;x<w;x++){
    let c='#';
    if(x>=6&&x<=17&&y>0&&y<h-1)c='C';
    if(y===0&&x===6)c='+';
    if(x===28&&y<=12)c='=';
    if(y===12&&x>=17&&x<=28)c='=';
    row+=c;
  }out.push(row);}return out;
}
function galleriaStairRows(x0){const out=[];for(let y=0;y<13;y++){let row='';for(let x=0;x<8;x++)row+=(y>0&&y<12&&x>=x0&&x<x0+2)?'/':' ';out.push(row);}return out;}
const EUCLIDEAN_ADDITIONS=[
  {id:'hall_orchestra',layer:'ground',space:'hall',renderGroup:'hall',origin:{x:98,y:4},physicalOrigin:{x:98,y:4},base:0,rows:hallGroundRows(),stairs:[
    {from:{x:103,y:12},to:{x:103,y:35},fromH:-2.5,toH:2.5,width:20,ceil:15.5,zone:'hall',material:'woodVelvet'},
    {from:{x:99,y:25},to:{x:99,y:36},fromH:0,toH:2.5,width:4,ceil:3.8,zone:'hall',material:'woodVelvet'},
    {from:{x:123,y:25},to:{x:123,y:36},fromH:0,toH:2.5,width:4,ceil:3.8,zone:'hall',material:'woodVelvet'},
  ]},
  {id:'hall_lower_balcony',layer:'hall_lower',space:'hall',renderGroup:'hall',origin:{x:0,y:40},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('L')},
  {id:'hall_upper_balcony',layer:'hall_upper',space:'hall',renderGroup:'hall',origin:{x:0,y:82},physicalOrigin:{x:98,y:4},base:0,rows:balconyRows('U')},
  {id:'galleria_lower_stair',layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:32,y:40},physicalOrigin:{x:99,y:20},base:0,rows:galleriaStairRows(1),stairs:[{from:{x:33,y:41},to:{x:33,y:51},fromH:0,toH:4,width:2,ceil:15.5,zone:'hall',material:'woodVelvet'}]},
  {id:'galleria_upper_stair',layer:'hall_stair',space:'hall',renderGroup:'hall',origin:{x:40,y:40},physicalOrigin:{x:122,y:20},base:0,rows:galleriaStairRows(4),stairs:[{from:{x:44,y:51},to:{x:44,y:41},fromH:4,toH:7.5,width:2,ceil:15.5,zone:'hall',material:'woodVelvet'}]},
  {id:'hall_access',layer:'ground',space:'hall',renderGroup:'hall',origin:{x:94,y:24},physicalOrigin:{x:94,y:24},base:0,rows:['HHHHH','###H#','###H#','###H#','HHHH#']},
  {id:'chapel_nave',layer:'upper',space:'chapel',renderGroup:'upper',origin:{x:81,y:58},physicalOrigin:{x:51,y:14},base:4.8,rows:chapelRows()},
];

export const conservatory = {
  width: 132,
  height: 124,
  widenCorridors: true,
  connectors:[
    // Logical seams coincide at identical physical landings. Height changes
    // happen on the ordinary stair cells between them, never in the connector.
    {from:{x:100,y:21},to:{x:33,y:41}},
    {from:{x:33,y:51},to:{x:2,y:67}},
    {from:{x:28,y:67},to:{x:44,y:51}},
    {from:{x:44,y:41},to:{x:28,y:99}},
  ],
  // Inside the loading dock, service door at your back. A bag, a work order,
  // and a radio that will fail.
  spawn: { x: 65, y: 10 },
  doors: [
    { x: 25, y: 12, key: 'master' },   // studio B3 → the plant room
    { x: 65, y: 16, key: 'master' },   // the dock's inner door
    { x: 74, y: 11, key: 'master' },   // dock → foyer
    { x: 87, y: 55, key: 'chapel' },   // the chapel. You were not given this one.
  ],
  levels: [
    {
      // ── sub-basement, four metres down ─────────────────────────────────────
      id:'basement',layer:'basement',space:'basement',renderGroup:'basement',origin: { x: 0, y: 0 }, physicalOrigin:{x:50,y:0},base: -4.0,
      rows: [
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
        '     #####################   #############',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMMM#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#####',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#####MMMMMMMMMM##.##',
        '     #BBBBBBBBBBBBBBBBBBB+....MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#####MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#   ######.######.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     ##########.##########        #.#    #.#',
        '              #.#                 #.#    #.#',
        '     ##########.###################.######.#####',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     ###########################################',
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
      ],
    },
    {
      // ── ground ─────────────────────────────────────────────────────────────
      id:'ground',layer:'ground',space:'ground',renderGroup:'ground',origin: { x: 50, y: 0 }, physicalOrigin:{x:50,y:0},base: 0,
      rows: [
        ' ',
        ' ',
        ' ',
        '       ################# ################# ###################',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD.+.FFFFFFFFFFFFFFF.x.HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       ########.######## #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '              #+#        #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '              #.#        ########.######## #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        ' ##############.###########     #.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' ##########,###############     #.#        #HHHHHHHHHHHHHHHHH#',
        '          #,#                   #.#        #HHHHHHHHHHHHHHHHH#',
        '          #,#            ########.##########.#################',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #####################',
      ],
      stairs: [
        // Into the drained pool: 0 → -1.6m over five cells. Not a step. Steps.
        { from: { x: 84, y: 31 }, to: { x: 84, y: 35 }, fromH: 0, toH: -1.6, width: 3, ceil: 6.5 },
      ],
    },
    {
      // ── upper, four metres up ──────────────────────────────────────────────
      id:'upper',layer:'upper',space:'upper',renderGroup:'upper',origin: { x: 50, y: 44 }, physicalOrigin:{x:20,y:0},base: 4.8,
      rows: [
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '     ######,####################################',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     ########.#######################+#######=##',
        '            #.#                     #.#     #=#',
        '     ########.############ ##########.#######=##########',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP+,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPP#,,PPPP#PPP#PPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ########,,##+###+###+## #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #,,,,,,,,,P,,,,,,,,,,,# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ###+###+###+###+###+### #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPP#PPP#PPP#PPP#PPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ####################### #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #############################',
        ' ',
        ' ',
      ],
      stairs: [
        // Stair A: the ground spine down to the basement. 0 → -4.0m, 11 cells.
        { from: { x: 57, y: 22 }, to: { x: 47, y: 22 }, fromH: 0, toH: -4.0, width: 3 },
        // Stair B: the shaft up to the practice wing. 0 → 4.0m, 11 cells.
        { from: { x: 60, y: 41 }, to: { x: 60, y: 51 }, fromH: 0, toH: 4.8, width: 3 },
      ],
    },
    ...EUCLIDEAN_ADDITIONS,
  ],
};
