import { createServer } from 'vite';
const server = await createServer({ server: { host: '127.0.0.1', port: 5510, strictPort: true, hmr: false, watch: null }, logLevel: 'warn' });
await server.listen();
console.log('Achievement v1 review http://127.0.0.1:5510/?skiptut=1&achievementReview=1');
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0); });
