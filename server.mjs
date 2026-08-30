import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

createServer(async (request, response) => {
  const urlPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const filePath = normalize(join(root, urlPath));
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error('Not a file');
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(4173, () => console.log('Son Kutu: http://localhost:4173'));
