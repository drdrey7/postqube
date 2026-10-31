// Postqube Ideas © 2026 André Barroso. AGPL-3.0-or-later.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class IdeasError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new IdeasError(status, message); };
const tableFor = type => ({ folders: 'folders', sections: 'sections', pages: 'pages' })[type] || fail(404, 'Tipo desconhecido.');
export function title(value, fallback) {
  if (typeof value !== 'string') return fail(400, 'O título tem de ser texto.');
  const text = value.trim();
  if (text.length > 160) fail(400, 'O título pode ter até 160 caracteres.');
  return text || fallback;
}
export function validateBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length > 500) fail(400, 'A página pode ter até 500 blocos.');
  const ids = new Set(); let size = 0;
  const clean = blocks.map(b => {
    if (!b || !['text', 'task'].includes(b.type) || typeof b.text !== 'string' || typeof b.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(b.id) || ids.has(b.id)) fail(400, 'Bloco inválido.');
    if (b.text.length > 50000) fail(400, 'Um bloco pode ter até 50 000 caracteres.');
    if (b.type === 'task' && typeof b.done !== 'boolean') fail(400, 'Estado de tarefa inválido.');
    size += b.text.length; ids.add(b.id);
    return { id: b.id, type: b.type, text: b.text, ...(b.type === 'task' ? { done: b.done } : {}), ...(b.inline === true ? { inline: true } : {}) };
  });
  if (size > 400000) fail(400, 'Esta página atingiu o limite de texto.');
  return clean;
}
export class IdeasStore {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS folders (id TEXT PRIMARY KEY, org TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, org TEXT NOT NULL, folder_id TEXT NOT NULL REFERENCES folders(id), title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, org TEXT NOT NULL, section_id TEXT NOT NULL REFERENCES sections(id), title TEXT NOT NULL, blocks TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
      CREATE INDEX IF NOT EXISTS folders_org ON folders(org, deleted_at);
      CREATE INDEX IF NOT EXISTS sections_org ON sections(org, folder_id, deleted_at);
      CREATE INDEX IF NOT EXISTS pages_org ON pages(org, section_id, deleted_at);`);
  }
  close() { this.db.close(); }
  live(org, type, id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id)) fail(404, 'Elemento não encontrado neste espaço.');
    let row;
    if (type === 'folders') row = this.db.prepare('SELECT * FROM folders WHERE id=? AND org=? AND deleted_at IS NULL').get(id, org);
    if (type === 'sections') row = this.db.prepare('SELECT s.* FROM sections s JOIN folders f ON f.id=s.folder_id AND f.org=s.org WHERE s.id=? AND s.org=? AND s.deleted_at IS NULL AND f.deleted_at IS NULL').get(id, org);
    if (type === 'pages') row = this.db.prepare('SELECT p.* FROM pages p JOIN sections s ON s.id=p.section_id AND s.org=p.org JOIN folders f ON f.id=s.folder_id AND f.org=s.org WHERE p.id=? AND p.org=? AND p.deleted_at IS NULL AND s.deleted_at IS NULL AND f.deleted_at IS NULL').get(id, org);
    return row || fail(404, 'Elemento não encontrado neste espaço.');
  }
  tree(org) {
    const folders = this.db.prepare('SELECT id,title,updated_at FROM folders WHERE org=? AND deleted_at IS NULL ORDER BY created_at,id').all(org);
    const sections = this.db.prepare('SELECT s.id,s.folder_id,s.title,s.updated_at FROM sections s JOIN folders f ON f.id=s.folder_id AND f.org=s.org WHERE s.org=? AND s.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY s.created_at,s.id').all(org);
    const pages = this.db.prepare('SELECT p.id,p.section_id,p.title,p.updated_at,p.revision FROM pages p JOIN sections s ON s.id=p.section_id AND s.org=p.org JOIN folders f ON f.id=s.folder_id AND f.org=s.org WHERE p.org=? AND p.deleted_at IS NULL AND s.deleted_at IS NULL AND f.deleted_at IS NULL ORDER BY p.created_at,p.id').all(org);
    return { folders, sections, pages };
  }
  page(org, id) {
    const { blocks, org: _org, deleted_at: _deleted, ...page } = this.live(org, 'pages', id);
    return { ...page, blocks: JSON.parse(blocks) };
  }
  create(org, type, data) {
    const table = tableFor(type), now = new Date().toISOString(), id = randomUUID();
    const label = title(data.title ?? '', { folders: 'Nova pasta', sections: 'Novo separador', pages: 'Nova página' }[type]);
    if (type === 'folders') this.db.prepare('INSERT INTO folders(id,org,title,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, org, label, now, now);
    else if (type === 'sections') {
      this.live(org, 'folders', data.parentId);
      this.db.prepare('INSERT INTO sections(id,org,folder_id,title,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, org, data.parentId, label, now, now);
    } else {
      this.live(org, 'sections', data.parentId);
      const blocks = [{ id: randomUUID(), type: 'text', text: '' }];
      this.db.prepare('INSERT INTO pages(id,org,section_id,title,blocks,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, org, data.parentId, label, JSON.stringify(blocks), now, now);
    }
    return type === 'pages' ? this.page(org, id) : { id, title: label };
  }
  update(org, type, id, data) {
    const table = tableFor(type), row = this.live(org, type, id), now = new Date().toISOString();
    if (type === 'pages') {
      if (!Number.isInteger(data.revision) || data.revision !== row.revision) fail(409, 'Esta página foi alterada por outro membro. O teu texto foi preservado neste separador; compara as versões antes de continuar.');
      const blocks = data.blocks === undefined ? JSON.parse(row.blocks) : validateBlocks(data.blocks);
      const label = data.title === undefined ? row.title : title(data.title, 'Sem título');
      const result = this.db.prepare('UPDATE pages SET title=?,blocks=?,revision=revision+1,updated_at=? WHERE org=? AND id=? AND revision=? AND deleted_at IS NULL').run(label, JSON.stringify(blocks), now, org, id, data.revision);
      if (result.changes !== 1) fail(409, 'A página mudou. Reabre-a antes de continuar.');
      return this.page(org, id);
    }
    const label = title(data.title, row.title);
    this.db.prepare(`UPDATE ${table} SET title=?,updated_at=? WHERE org=? AND id=? AND deleted_at IS NULL`).run(label, now, org, id);
    return { id, title: label };
  }
  trash(org, type, id) {
    const table = tableFor(type); this.live(org, type, id);
    this.db.prepare(`UPDATE ${table} SET deleted_at=?,updated_at=? WHERE org=? AND id=?`).run(new Date().toISOString(), new Date().toISOString(), org, id);
    return { ok: true };
  }
  trashList(org) {
    return ['folders', 'sections', 'pages'].flatMap(type => this.db.prepare(`SELECT id,title,deleted_at FROM ${tableFor(type)} WHERE org=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all(org).map(row => ({ ...row, type }))).sort((a,b) => b.deleted_at.localeCompare(a.deleted_at));
  }
  restore(org, type, id) {
    const table = tableFor(type);
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE org=? AND id=? AND deleted_at IS NOT NULL`).get(org, id);
    if (!row) fail(404, 'Elemento não encontrado no lixo.');
    if (type === 'sections') this.live(org, 'folders', row.folder_id);
    if (type === 'pages') this.live(org, 'sections', row.section_id);
    this.db.prepare(`UPDATE ${table} SET deleted_at=NULL,updated_at=? WHERE org=? AND id=?`).run(new Date().toISOString(), org, id);
    return { ok: true };
  }
  backup(path) {
    // VACUUM INTO produces a consistent SQLite snapshot, including committed WAL data.
    this.db.prepare('VACUUM INTO ?').run(path);
  }
}
