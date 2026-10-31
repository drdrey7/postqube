import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { IdeasStore, IdeasError } from '../store.mjs';
import { createIdeasServer, nativeAuthentication } from '../server.mjs';
const chain = (s, org = 'org-a') => {
  const folder = s.create(org, 'folders', { title: 'Conteúdos' });
  const section = s.create(org, 'sections', { title: 'Instagram', parentId: folder.id });
  const page = s.create(org, 'pages', { title: 'Nova ideia', parentId: section.id });
  return { folder, section, page };
};
test('two members share workspace content; another workspace cannot read, mutate or attach children', () => {
  const s = new IdeasStore(':memory:');
  try {
    const { folder, section, page } = chain(s);
    assert.equal(s.tree('org-a').folders.length, 1);
    assert.equal(s.tree('org-b').folders.length, 0);
    for (const action of [() => s.page('org-b', page.id), () => s.update('org-b', 'pages', page.id, { revision: 1, title: 'Stolen' }), () => s.trash('org-b', 'folders', folder.id), () => s.create('org-b', 'sections', { title: 'Cross', parentId: folder.id }), () => s.create('org-b', 'pages', { title: 'Cross', parentId: section.id })]) assert.throws(action, e => e.status === 404);
    assert.equal(s.page('org-a', page.id).title, 'Nova ideia');
  } finally { s.close(); }
});
test('text and task state persist; revision rejects silent overwrite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ideas-test-')); const db = path.join(dir, 'notes.sqlite'); let s = new IdeasStore(db);
  try {
    const { page } = chain(s);
    const blocks = [{ id: 'text-1', type: 'text', text: '<script>alert(1)</script>\nUma ideia' }, { id: 'task-1', type: 'task', text: 'Preparar carrossel', done: true }];
    const saved = s.update('org-a', 'pages', page.id, { revision: 1, title: 'Um rascunho', blocks });
    assert.equal(saved.revision, 2); assert.deepEqual(saved.blocks, blocks);
    assert.throws(() => s.update('org-a', 'pages', page.id, { revision: 1, blocks: [] }), e => e.status === 409);
    assert.equal(s.page('org-a', page.id).blocks[1].done, true);
    s.close(); s = new IdeasStore(db); assert.deepEqual(s.page('org-a', page.id).blocks, blocks);
    const backup = path.join(dir, 'backup.sqlite'); s.backup(backup); const b = new IdeasStore(backup); assert.equal(b.page('org-a', page.id).title, 'Um rascunho'); b.close();
  } finally { s.close(); rmSync(dir, { recursive: true }); }
});
test('trash hides descendants, restore recovers data and prevents cross-workspace access', () => {
  const s = new IdeasStore(':memory:');
  try {
    const { folder, section, page } = chain(s);
    s.trash('org-a', 'folders', folder.id); assert.equal(s.tree('org-a').pages.length, 0); assert.throws(() => s.page('org-a', page.id), e => e.status === 404);
    assert.throws(() => s.restore('org-b', 'folders', folder.id), e => e.status === 404);
    s.restore('org-a', 'folders', folder.id); assert.equal(s.tree('org-a').pages.length, 1);
    s.trash('org-a', 'pages', page.id); s.trash('org-a', 'sections', section.id);
    assert.throws(() => s.restore('org-a', 'pages', page.id), e => e.status === 404);
    s.restore('org-a', 'sections', section.id); s.restore('org-a', 'pages', page.id); assert.equal(s.page('org-a', page.id).title, 'Nova ideia');
  } finally { s.close(); }
});
test('invalid blocks, duplicate IDs and oversized data are rejected without modifying saved page', () => {
  const s = new IdeasStore(':memory:');
  try {
    const { page } = chain(s);
    for (const blocks of [[{ id: 'x', type: 'html', text: '' }], [{ id: 'x', type: 'task', text: '', done: 'true' }], [{ id: 'x', type: 'text', text: '' }, { id: 'x', type: 'text', text: '' }], [{ id: 'x', type: 'text', text: 'a'.repeat(50001) }]]) assert.throws(() => s.update('org-a', 'pages', page.id, { revision: 1, blocks }), e => e.status === 400);
    assert.equal(s.page('org-a', page.id).revision, 1);
  } finally { s.close(); }
});
test('HTTP reuses verified identity, enforces mutation Origin, protects notes and supports team sharing', async () => {
  const store = new IdeasStore(':memory:'); const origin = 'https://postqube.example.com';
  const server = createIdeasServer({ store, origin, authenticate: async req => {
    const cookie = req.headers.cookie;
    if (!cookie) throw new IdeasError(401, 'Login required');
    return cookie === 'other' ? { orgId: 'org-b', userId: 'other' } : { orgId: 'org-a', userId: cookie };
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  async function req(route, method = 'GET', data, cookie = 'member-one', requestOrigin = origin) {
    return fetch(base + '/ideas/api/' + route, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: requestOrigin, 'Content-Type': 'application/json' }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  }
  try {
    assert.equal((await req('tree', 'GET', undefined, null)).status, 401);
    assert.equal((await req('folders', 'POST', { title: 'No' }, 'member-one', 'https://evil.example')).status, 403);
    const f = await (await req('folders', 'POST', { title: 'Equipa' })).json();
    const section = await (await req('sections', 'POST', { title: 'Ideias', parentId: f.id })).json();
    const page = await (await req('pages', 'POST', { title: 'Partilhada', parentId: section.id })).json();
    assert.equal((await req('pages/' + page.id, 'GET', undefined, 'member-two')).status, 200);
    assert.equal((await req('pages/' + page.id, 'GET', undefined, 'other')).status, 404);
    assert.equal((await req('folders/' + f.id, 'DELETE', undefined, 'other')).status, 404);
    assert.equal((await req('pages/' + page.id, 'PATCH', { revision: 0, title: 'Overwrite' })).status, 409);
    const tree = await (await req('tree')).json(); assert.equal(tree.scope, 'workspace'); assert.equal(tree.pages.length, 1); assert.equal(tree.viewerId, 'member-one');
    const html = await fetch(base + '/ideas/'); assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal((await fetch(base + '/ideas/api/../../store.mjs')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
test('native authentication forwards only existing session cookie and rejects missing identity', async () => {
  const http = await import('node:http'); let received;
  const server = http.createServer((req, res) => { received = { url: req.url, cookie: req.headers.cookie, auth: req.headers.auth }; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(req.headers.cookie === 'bad' ? {} : { id: 'u1', orgId: 'space1', activated: true, role: 'USER' })); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const authenticate = nativeAuthentication(`http://127.0.0.1:${server.address().port}`);
    await assert.rejects(authenticate({ headers: {} }), e => e.status === 401);
    const identity = await authenticate({ headers: { cookie: 'session-test', auth: 'do-not-forward' } });
    assert.equal(identity.orgId, 'space1'); assert.deepEqual(received, { url: '/api/user/self', cookie: 'session-test', auth: undefined });
    await assert.rejects(authenticate({ headers: { cookie: 'bad' } }), e => e.status === 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
