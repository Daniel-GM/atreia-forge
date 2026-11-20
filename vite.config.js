import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import market from './api/market.js';

function localMarket(server) {
  server.middlewares.use((req, res, next) => {
    const path = req.url.split('?')[0];
    if (path === '/api/market') return market(req, res).catch(next);
    if (path.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
    next();
  });
}

export default defineConfig({
  plugins: [react(), { name: 'local-market', configureServer: localMarket, configurePreviewServer: localMarket }],
});
