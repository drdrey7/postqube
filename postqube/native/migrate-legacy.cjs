/* Postqube legacy SQLite -> native PostgreSQL. Run with a private read-only legacy mount. */
const { DatabaseSync } = require('node:sqlite');
const { PrismaClient } = require('@prisma/client');
const { isDeepStrictEqual } = require('node:util');
async function main() {
  const sqlite = new DatabaseSync(process.env.LEGACY_IDEAS_DB || '/legacy/ideas.sqlite', { readOnly: true });
  const prisma = new PrismaClient();
  try {
    const records = ['folders', 'sections', 'pages'].flatMap(kind => sqlite.prepare('SELECT * FROM ' + kind + ' ORDER BY created_at,id').all().map(row => ({ id: row.id, organizationId: row.org, kind, parentId: row.folder_id || row.section_id || null, title: row.title, blocks: row.blocks ? JSON.parse(row.blocks) : [], revision: row.revision || 1, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at), deletedAt: row.deleted_at ? new Date(row.deleted_at) : null })));
    const count = await prisma.$transaction(async tx => {
      for (const record of records) {
        const existing = await tx.ideaItem.findUnique({ where: { id: record.id } });
        if (existing) {
          for (const key of Object.keys(record)) if (!isDeepStrictEqual(existing[key], record[key])) throw Error('Native record differs; refusing to overwrite');
        } else await tx.ideaItem.create({ data: record });
      }
      for (const record of records) {
        const migrated = await tx.ideaItem.findUnique({ where: { id: record.id } });
        for (const key of Object.keys(record)) if (!isDeepStrictEqual(migrated[key], record[key])) throw Error('Migration verification failed');
      }
      return records.length;
    }, { timeout: 60000 });
    console.log(JSON.stringify({ migratedAndVerified: count, originalPreserved: true }));
  } finally { sqlite.close(); await prisma.$disconnect(); }
}
main().catch(() => { console.error('Migration failed; transaction rolled back. Private note content omitted.'); process.exit(1); });
