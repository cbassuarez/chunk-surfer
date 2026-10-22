// Task-only review server. Keep peer production edits from reloading an active study.
import {mergeConfig} from 'vite';
import existing from '../../../vite.config.js';
export default mergeConfig(existing,{cacheDir:'node_modules/.vite-source-drive-study',server:{host:'127.0.0.1',port:5337,strictPort:true,hmr:false,watch:{ignored:["**/src-tauri/**","**/artifacts/**/native/**"]}}});
