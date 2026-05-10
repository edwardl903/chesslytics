import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Serve repo-root `static/` in dev so `/static/*` works without Flask (images, etc.). */
function serveRepoStatic(staticRoot: string): Plugin {
  const MIME: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
  };

  return {
    name: 'serve-repo-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/static/')) return next();

        const rel = decodeURIComponent(url.slice('/static/'.length));
        const candidate = path.resolve(staticRoot, rel);
        const relative = path.relative(staticRoot, candidate);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return next();

        let st: fs.Stats;
        try {
          st = fs.statSync(candidate);
        } catch {
          return next();
        }
        if (!st.isFile()) return next();

        const ext = path.extname(candidate).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
        fs.createReadStream(candidate).pipe(res);
      });
    },
  };
}

// In dev: Vite serves on :5173. The Flask backend runs on :5001 and owns
//   - POST /generate
//   - /api/dashboard/*
// Repo-root /static/* is served by the plugin above so images load even when
// Flask is not running. In prod, Flask serves both the bundle and /static.
//
// In prod: Flask serves the built bundle from frontend/dist directly,
// so no proxy is needed.
export default defineConfig({
  plugins: [serveRepoStatic(path.resolve(__dirname, '..', 'static')), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // More specific path first so GET /generate/progress reaches Flask (not Vite 404).
      '/generate/progress': 'http://127.0.0.1:5001',
      '/generate': 'http://127.0.0.1:5001',
      '/api': 'http://127.0.0.1:5001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
