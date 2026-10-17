// Object-local grasp frames. The object owns the pose; anatomical hands solve
// to its surfaces, so support fingers cannot drift when the other hand moves.
const paper=(anchor,axis)=>({kind:'paper',anchor,axis,normal:[0,0,-1]});
const cylinder=(side,radius,wrist,ys=[.04,.015,-.01,-.035])=>({kind:'cylinder',side,radius,wrist,axis:[0,-.48,-.8773],normal:[side==='L'?1:-1,0,0],ys});
export const VIGIL_OBJECT_LAYOUT=Object.freeze({
  ruth:{kind:'folder',position:[-.005,1.13,-.40],angles:[.84,-.08,.025],width:.30,height:.36,
    hands:{L:paper([-.142,-.095,0],[.423,-.906,0]),R:paper([.150,.035,0],[-.940,-.342,0])}},
  leila:{kind:'flask',position:[-.12,1.105,-.32],angles:[.02,.10,-.02],radius:.046,height:.27,
    hands:{L:{...cylinder('L',.052,[-.054,.077,.068]),axis:[0,0,-1]}}},
  owen:{kind:'umbrella',position:[.16,.99,-.23],angles:[.035,-.08,.015],radius:.014,height:1.03,
    hands:{R:cylinder('R',.017,[.039,.055,.067],[.015,-.005,-.025,-.044])}},
  denise:{kind:'photographs',position:[-.035,1.13,-.34],angles:[1.15,.06,-.09],width:.19,height:.145,
    hands:{L:paper([-.087,-.045,0],[.940,-.342,0]),R:paper([.085,.023,0],[-.940,-.342,0])}},
  malcolm:{kind:'map',position:[0,1.09,-.43],angles:[.86,-.025,-.025],width:.46,height:.30,
    hands:{L:paper([-.230,-.025,0],[.342,-.940,0]),R:paper([.222,-.025,0],[-.500,-.866,0])}},
  kit:{kind:'microphone',position:[.18,1.13,-.35],angles:[-.12,-.12,-.08],radius:.019,height:.26,
    hands:{R:cylinder('R',.025,[.044,.067,.065],[.03,.006,-.018,-.040])}},
});
