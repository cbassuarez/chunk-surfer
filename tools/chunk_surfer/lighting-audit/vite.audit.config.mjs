// Dev server for the lighting audit: the game's own config, but with hot reload
// and file watching off so an edit elsewhere cannot reload a capture mid-run.
import base from '../../../vite.config.js';
export default async env => {
  const config = typeof base === 'function' ? await base(env) : base;
  return {...config, root: new URL('../../..', import.meta.url).pathname, server: {...config.server, port: 5547, strictPort: true, host: '127.0.0.1', hmr: false, watch: null}};
};
