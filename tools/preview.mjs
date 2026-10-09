import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../app/src/main/assets/web/', import.meta.url));
const port = Number(process.env.MUMU_PREVIEW_PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || relative.includes('..')) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port,'127.0.0.1',() => console.log(`Preview: http://127.0.0.1:${port}`));
