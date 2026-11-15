import {VAN_ICON_LAUNCH} from './motion.mjs';

// Render the small app loop at its display resolution. The source atlas
// records the acquired frames and the app paints the selected atlas cell directly.
export const STARTUP_VAN_LAYOUT=Object.freeze({...VAN_ICON_LAUNCH,
 frameCount:84,cell:128,cellSize:128,columns:8,rows:11,
});
export const STARTUP_VAN_BUDGET=Object.freeze({
  atlasEncodedBytes:300*1024,posterEncodedBytes:16*1024,totalDecodedBytes:6*1024*1024,
});
