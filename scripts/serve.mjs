import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.csv':'text/csv; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async (req,res) => {
  try { const target = path.join(root, decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0])); if (!target.startsWith(root)) throw new Error('bad path'); const body = await fs.readFile(target); res.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream'}).end(body); }
  catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 43871), '127.0.0.1', () => console.log(`http://127.0.0.1:${process.env.PORT || 43871}`));
