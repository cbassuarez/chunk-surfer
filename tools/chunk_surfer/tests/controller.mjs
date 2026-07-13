import {
  setControllerBindings, setControllerBinding, resetControllerBindings,
  controllerToken, controllerBindingLabel,
} from '../../../public/labs/chunk-surfer/src/game/bindings.js';
import {
  gamepadTick, beginControllerRemap, controllerResetForTest,
} from '../../../public/labs/chunk-surfer/src/game/controller.js';

let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};
const pad={id:'Test Controller (Vendor: 0000)',axes:[0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};
Object.defineProperty(globalThis.navigator,'getGamepads',{configurable:true,value:()=>[pad]});
const pressed=[],released=[];
const tick=(menuContext=false)=>gamepadTick({menuContext,onPress:(a,r)=>pressed.push([a,r]),onRelease:(a)=>released.push(a)});
const clear=()=>{pressed.length=0;released.length=0;};

controllerResetForTest();setControllerBindings();tick();clear();
pad.axes[1]=-1;tick();
ck('left stick emits the same held movement action as the keyboard',pressed.some(([a])=>a==='move_up'));
pad.axes[1]=0;tick();
ck('returning the stick to centre releases movement',released.includes('move_up'));

clear();pad.buttons[0]={pressed:true,value:1};tick(false);
ck('south face button interacts in the world',pressed.some(([a])=>a==='interact'));
pad.buttons[0]={pressed:false,value:0};tick(false);clear();
pad.buttons[0]={pressed:true,value:1};tick(true);
ck('the same face button confirms in menus',pressed.some(([a])=>a==='confirm'));
pad.buttons[0]={pressed:false,value:0};tick(true);clear();

let rebound='';beginControllerRemap('bag',(token)=>{rebound=token;setControllerBinding('bag',token);});
tick(true);pad.buttons[5]={pressed:true,value:1};tick(true);
ck('button capture remaps an action without a reload',rebound==='button5'&&controllerToken('bag')==='button5',rebound);
pad.buttons[5]={pressed:false,value:0};tick(false);clear();pad.buttons[5]={pressed:true,value:1};tick(false);
ck('the remapped button drives its gameplay action',pressed.some(([a])=>a==='bag'));
ck('controller labels identify the physical control',controllerBindingLabel('bag')==='RB / R1',controllerBindingLabel('bag'));

resetControllerBindings();
ck('controller mappings restore authored defaults',controllerToken('bag')==='button2');
if(!pass)process.exit(1);
console.log('\n✅ CONTROLLER PASSED');
