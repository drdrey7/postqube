// Postqube Ideas © 2026 André Barroso. AGPL-3.0-or-later.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { IdeasStore, IdeasError } from './store.mjs';
const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));
const FILES = { '/ideas/editor/': ['index.html', 'text/html; charset=utf-8'], '/ideas/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/ideas/style.css': ['style.css', 'text/css; charset=utf-8'] };
const security = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'" };
function json(res, status, body) { res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new IdeasError(415, 'Envia os dados em JSON.');
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 1024 * 1024) throw new IdeasError(413, 'Página demasiado grande.'); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || Array.isArray(data) || typeof data !== 'object') throw Error(); return data; }
  catch { throw new IdeasError(400, 'Dados inválidos.'); }
}
export function nativeAuthentication(base) {
  const endpoint = new URL('/api/user/self', base);
  return async req => {
    if (!req.headers.cookie) throw new IdeasError(401, 'Entra no Postqube para abrir as ideias.');
    let response;
    try { response = await fetch(endpoint, { headers: { cookie: req.headers.cookie }, redirect: 'error', signal: AbortSignal.timeout(7000) }); }
    catch { throw new IdeasError(503, 'Não foi possível confirmar a sessão. Tenta novamente.'); }
    if ([401,403].includes(response.status)) throw new IdeasError(401, 'A sessão terminou. Volta a entrar.');
    if (!response.ok) throw new IdeasError(503, 'A autenticação está temporariamente indisponível.');
    const user = await response.json();
    if (typeof user.id !== 'string' || typeof user.orgId !== 'string' || !user.activated) throw new IdeasError(401, 'Sessão inválida.');
    return { userId: user.id, orgId: user.orgId, name: user.name || '', role: user.role };
  };
}
export function createIdeasServer({ store, authenticate, origin }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin), route = url.pathname, method = req.method;
      if (route === '/healthz' && method === 'GET') return json(res, 200, { ok: true });
      if (['/ideas', '/ideas/'].includes(route) && method === 'GET') { res.writeHead(308, { ...security, Location: '/launches?view=ideas' }); return res.end(); }
      if (FILES[route] && method === 'GET') {
        const [name, mime] = FILES[route]; res.writeHead(200, { ...security, 'Content-Type': mime }); return res.end(await readFile(path.join(PUBLIC, name)));
      }
      if (!route.startsWith('/ideas/api/')) return json(res, 404, { message: 'Não encontrado.' });
      if (!['GET','POST','PATCH','DELETE'].includes(method)) return json(res, 405, { message: 'Método não permitido.' });
      if (method !== 'GET' && req.headers.origin !== origin) return json(res, 403, { message: 'Origem não permitida.' });
      const identity = await authenticate(req), org = identity.orgId;
      if (method === 'GET' && route === '/ideas/api/tree') return json(res, 200, { ...store.tree(org), scope: 'workspace', workspaceId: org, viewerId: identity.userId });
      if (method === 'GET' && route === '/ideas/api/trash') return json(res, 200, { items: store.trashList(org) });
      let match = route.match(/^\/ideas\/api\/(folders|sections|pages)(?:\/([a-zA-Z0-9-]{1,80}))?(\/restore)?$/);
      if (!match) return json(res, 404, { message: 'Não encontrado.' });
      const [, type, id, restore] = match;
      if (restore && method === 'POST' && id) return json(res, 200, store.restore(org, type, id));
      if (method === 'GET' && type === 'pages' && id && !restore) return json(res, 200, store.page(org, id));
      if (method === 'POST' && !id) return json(res, 201, store.create(org, type, await body(req)));
      if (method === 'PATCH' && id && !restore) return json(res, 200, store.update(org, type, id, await body(req)));
      if (method === 'DELETE' && id && !restore) return json(res, 200, store.trash(org, type, id));
      return json(res, 405, { message: 'Método não permitido.' });
    } catch (err) {
      if (res.headersSent) return res.end();
      json(res, err instanceof IdeasError ? err.status : 500, { message: err instanceof IdeasError ? err.message : 'Não foi possível guardar. O teu texto continua no editor; tenta novamente.' });
      // Do not log request headers, cookies, note content or upstream auth bodies.
      if (!(err instanceof IdeasError)) console.error('ideas: internal request failure');
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.DATA_DIR || '/data'; mkdirSync(dataDir, { recursive: true });
  const origin = new URL(process.env.PUBLIC_URL || 'http://localhost:4018').origin;
  const store = new IdeasStore(path.join(dataDir, 'ideas.sqlite'));
  const server = createIdeasServer({ store, origin, authenticate: nativeAuthentication(process.env.POSTIZ_INTERNAL_URL || 'http://postiz:5000') });
  server.listen(Number(process.env.PORT || 4018), '0.0.0.0', () => console.log('Postqube Ideas listening'));
  server.headersTimeout = 15000; server.requestTimeout = 30000;
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
