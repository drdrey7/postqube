// Consistent snapshot; never copy only the live SQLite main file while WAL is active.
import { IdeasStore } from './store.mjs';
import path from 'node:path';
const target = process.argv[2];
if (!target || !path.isAbsolute(target)) throw new Error('Supply an absolute, new snapshot filename');
const store = new IdeasStore(path.join(process.env.DATA_DIR || '/data', 'ideas.sqlite'));
try { store.backup(target); console.log('Ideas database snapshot completed'); } finally { store.close(); }
