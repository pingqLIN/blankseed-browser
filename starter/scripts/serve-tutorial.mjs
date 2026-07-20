import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const starterRoot = path.resolve(path.dirname(scriptPath), '..');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml']
]);

export function resolveTutorialPath(requestUrl, root = starterRoot) {
  const requestPath = String(requestUrl || '/').split(/[?#]/, 1)[0];
  const decoded = decodeURIComponent(requestPath);
  const normalized = decoded === '/' ? '/tutorial/' : decoded;
  const relativePath = normalized.replace(/^\/+/, '');
  let resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`) && resolved !== path.resolve(root)) {
    return null;
  }
  try {
    if (statSync(resolved).isDirectory()) resolved = path.join(resolved, 'index.html');
  } catch {
    // The request handler returns 404 for absent files.
  }
  return resolved;
}

export function createTutorialServer({ root = starterRoot } = {}) {
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method Not Allowed');
      return;
    }
    let filePath;
    try {
      filePath = resolveTutorialPath(request.url || '/', root);
    } catch {
      response.writeHead(400);
      response.end('Bad Request');
      return;
    }
    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    let metadata;
    try {
      metadata = statSync(filePath);
    } catch {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }
    if (!metadata.isFile()) {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Content-Length': metadata.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  });
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  const requestedPort = Number(process.env.BLANKSEED_TUTORIAL_PORT || 4173);
  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error('BLANKSEED_TUTORIAL_PORT must be an integer from 1 to 65535.');
  }
  const server = createTutorialServer();
  server.listen(requestedPort, '127.0.0.1', () => {
    console.log(`BlankSeed tutorial: http://127.0.0.1:${requestedPort}/tutorial/`);
    console.log('Press Ctrl+C to stop.');
  });
}
