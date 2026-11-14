import {VAN_ICON_LAUNCH} from './motion.mjs';

// Render the small app loop at its display resolution. The source atlas
// records the acquired frames and the app plays them as a video.
export const STARTUP_VAN_LAYOUT=Object.freeze({...VAN_ICON_LAUNCH,
  frameCount:42,cell:128,cellSize:128,columns:7,rows:6,
  stages:Object.freeze([
    ...VAN_ICON_LAUNCH.stages.slice(0,-1),
    {atSeconds:1.55,name:'departure'},
    {atSeconds:3.20,name:'offscreen'},
  ]),
  weather:Object.freeze({...VAN_ICON_LAUNCH.weather,
    thunderAtSeconds:[],lightningAtSeconds:[],flashRanges:[],
    lightningDurationSeconds:0,lightningPolicy:'The app loop uses the reduced-flash render.',
  }),
});
export const STARTUP_VAN_BUDGET=Object.freeze({
  atlasEncodedBytes:300*1024,posterEncodedBytes:16*1024,videoEncodedBytes:128*1024,totalDecodedBytes:3*1024*1024,
});
