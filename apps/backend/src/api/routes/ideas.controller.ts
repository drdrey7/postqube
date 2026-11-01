import { canMoveContainer, containerPath } from '@gitroom/helpers/ideas/hierarchy';
import { parseIdeaRuns } from '@gitroom/helpers/ideas/text-format';
import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Injectable, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, Prisma, User } from '@prisma/client';
import { Request } from 'express';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { randomUUID } from 'crypto';

type Kind = 'folders' | 'sections' | 'pages';
const kinds: Kind[] = ['folders', 'sections', 'pages'];
function fail(status: number, message: string): never { throw new HttpException({ message }, status); }
const kindOf = (value: string): Kind => kinds.includes(value as Kind) ? value as Kind : fail(404, 'Tipo desconhecido.');
const label = (value: unknown, fallback: string) => {
  if (typeof value !== 'string' || value.length > 160) fail(400, 'O título pode ter até 160 caracteres.');
  return (value as string).trim() || fallback;
};
export function ideaBlocks(value: unknown) {
  if (!Array.isArray(value) || value.length > 500) fail(400, 'A página pode ter até 500 blocos.');
  const ids = new Set<string>(); let size = 0;
  const blocks = value.map(b => {
    if (!b || !['text', 'task'].includes(b.type) || typeof b.text !== 'string' || typeof b.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(b.id) || ids.has(b.id)) fail(400, 'Bloco inválido.');
    if (b.text.length > 50000 || (b.type === 'task' && typeof b.done !== 'boolean')) fail(400, 'Texto ou tarefa inválidos.');
    ids.add(b.id); size += b.text.length;
    return { id: b.id, type: b.type, text: b.text, ...(b.type === 'task' ? { done: b.done } : {}), ...(b.inline === true ? { inline: true } : {}), ...(b.runs === undefined ? {} : { runs: parseIdeaRuns(b.runs, b.text, message => fail(400, message)) }) };
  });
  if (size > 400000) fail(400, 'A página atingiu o limite de texto.');
  return blocks;
}
type Db = Prisma.TransactionClient;
const metadata = { id: true, kind: true, parentId: true, title: true, pinned: true, revision: true, createdAt: true, updatedAt: true } as const;
const destinationOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.length || value.length > 80) fail(400, 'invalid_location');
  return value as string;
};
@Injectable()
export class IdeasService {
  constructor(private readonly prisma: PrismaService) {}
  private containers(db: Db, org: string) {
    return db.ideaItem.findMany({ where: { organizationId: org, kind: { in: ['folders', 'sections'] } }, select: { ...metadata, deletedAt: true } });
  }
  private async mutation<T>(org: string, work: (db: Db) => Promise<T>): Promise<T> {
    // Serialize organization hierarchy writes, including reciprocal concurrent moves.
    return this.prisma.$transaction(async db => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${org}, 0))`;
      return work(db);
    }, { timeout: 15000 });
  }
  private async liveIn(db: Db, org: string, kind: Kind, id: string) {
    const item = await db.ideaItem.findFirst({ where: { id, organizationId: org, kind, deletedAt: null } });
    if (!item || containerPath(await this.containers(db, org), item.parentId) === null) fail(404, 'not_found');
    return item;
  }
  async live(org: string, kind: Kind, id: string) { return this.liveIn(this.prisma, org, kind, id); }
  async tree(org: string, query = '') {
    if (typeof query !== 'string' || query.length > 200) fail(400, 'invalid_search');
    const containers = await this.containers(this.prisma, org);
    const visible = containers.filter(item => !item.deletedAt && containerPath(containers, item.id) !== null);
    const ids = visible.map(item => item.id);
    const parent = ids.length ? Prisma.sql`(i."parentId" IS NULL OR i."parentId" IN (${Prisma.join(ids)}))` : Prisma.sql`i."parentId" IS NULL`;
    const pattern = '%' + query.trim().replace(/[\\%_]/g, c => '\\' + c) + '%';
    const search = query.trim() ? Prisma.sql`AND (i.title ILIKE ${pattern} OR content.text ILIKE ${pattern})` : Prisma.empty;
    // Only metadata and a bounded preview leave the database; complete notes load on demand.
    const pages = await this.summaries(org, Prisma.sql`i.kind = 'pages' AND i."deletedAt" IS NULL AND ${parent} ${search}`);
    return { folders: visible.filter(i => i.kind === 'folders'), sections: visible.filter(i => i.kind === 'sections'), pages };
  }
  private summaries(org: string, condition: Prisma.Sql, order = Prisma.sql`i.pinned DESC, i."updatedAt" DESC, i.id ASC`) {
    return this.prisma.$queryRaw<({ id: string; kind: string; parentId: string | null; title: string; excerpt: string; pinned: boolean; revision: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null })[]>(Prisma.sql`
      SELECT i.id, i.kind, i."parentId", i.title, i.pinned, i.revision, i."createdAt", i."updatedAt", i."deletedAt",
        LEFT(content.text, 240) AS excerpt
      FROM "IdeaItem" i CROSS JOIN LATERAL (
        SELECT COALESCE(string_agg((CASE WHEN n > 1 AND b->>'inline' IS DISTINCT FROM 'true' THEN E'\\n' ELSE '' END) || (b->>'text'), '' ORDER BY n), '') AS text
        FROM jsonb_array_elements(i.blocks) WITH ORDINALITY AS x(b,n)
      ) content WHERE i."organizationId" = ${org} AND ${condition}
      ORDER BY ${order}`);
  }
  async create(org: string, kind: Kind, body: Record<string, unknown>) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_input');
    const parentId = destinationOf(body.parentId);
    return this.mutation(org, async db => {
      if (containerPath(await this.containers(db, org), parentId) === null) fail(404, 'invalid_location');
      return db.ideaItem.create({ data: { organizationId: org, kind, parentId, title: label(body.title ?? '', kind === 'pages' ? '' : 'Nova pasta'), blocks: kind === 'pages' ? [{ id: randomUUID(), type: 'text', text: '' }] : [] } });
    });
  }
  async update(org: string, kind: Kind, id: string, body: Record<string, unknown>) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_input');
    return this.mutation(org, async db => {
      const current = await this.liveIn(db, org, kind, id);
      if (kind === 'pages' && (!Number.isInteger(body.revision) || body.revision !== current.revision)) fail(409, 'conflict');
      const moving = Object.prototype.hasOwnProperty.call(body, 'parentId');
      const parentId = moving ? destinationOf(body.parentId) : current.parentId;
      if (moving) {
        const containers = await this.containers(db, org);
        if (containerPath(containers, parentId) === null) fail(404, 'invalid_location');
        if (kind !== 'pages' && !canMoveContainer(containers, id, parentId)) fail(400, 'folder_cycle');
      }
      if (body.pinned !== undefined && (kind !== 'pages' || typeof body.pinned !== 'boolean')) fail(400, 'invalid_pin');
      const result = await db.ideaItem.updateMany({ where: { id, organizationId: org, kind, deletedAt: null, ...(kind === 'pages' ? { revision: Number(body.revision) } : {}) }, data: {
        title: body.title === undefined ? current.title : label(body.title, kind === 'pages' ? '' : 'Nova pasta'),
        ...(moving ? { parentId } : {}),
        ...(kind === 'pages' ? { blocks: body.blocks === undefined ? current.blocks : ideaBlocks(body.blocks), revision: { increment: 1 }, ...(body.pinned === undefined ? {} : { pinned: body.pinned as boolean }) } : {}),
      } });
      if (result.count !== 1) fail(409, 'conflict');
      return this.liveIn(db, org, kind, id);
    });
  }
  async trash(org: string, kind: Kind, id: string) {
    return this.mutation(org, async db => {
      await this.liveIn(db, org, kind, id);
      await db.ideaItem.updateMany({ where: { id, organizationId: org, kind, deletedAt: null }, data: { deletedAt: new Date() } });
      return { ok: true };
    });
  }
  async trashList(org: string) { return { items: await this.summaries(org, Prisma.sql`i."deletedAt" IS NOT NULL`, Prisma.sql`i."deletedAt" DESC, i.id ASC`) }; }
  async restore(org: string, kind: Kind, id: string) {
    return this.mutation(org, async db => {
      const item = await db.ideaItem.findFirst({ where: { id, organizationId: org, kind, deletedAt: { not: null } } });
      if (!item) fail(404, 'not_found');
      if (containerPath(await this.containers(db, org), item.parentId) === null) fail(404, 'restore_parents');
      await db.ideaItem.updateMany({ where: { id, organizationId: org, kind }, data: { deletedAt: null } }); return { ok: true };
    });
  }
}
@ApiTags('Ideas')
@Controller('/ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}
  private origin(req: Request) {
    if (!req.headers.origin || req.headers.origin !== new URL(process.env.FRONTEND_URL).origin) throw new ForbiddenException('Origem não permitida.');
  }
  @Get('/tree') async tree(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User, @Query('q') query?: string) { return { ...await this.ideas.tree(org.id, query), workspaceId: org.id, viewerId: user.id, scope: 'workspace' }; }
  @Get('/trash') trashList(@GetOrgFromRequest() org: Organization) { return this.ideas.trashList(org.id); }
  @Get('/pages/:id') page(@GetOrgFromRequest() org: Organization, @Param('id') id: string) { return this.ideas.live(org.id, 'pages', id); }
  @Post('/:kind') create(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Body() body: Record<string, unknown>, @Req() req: Request) { this.origin(req); return this.ideas.create(org.id, kindOf(kind), body); }
  @Patch('/:kind/:id') update(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) { this.origin(req); return this.ideas.update(org.id, kindOf(kind), id, body); }
  @Delete('/:kind/:id') trash(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Param('id') id: string, @Req() req: Request) { this.origin(req); return this.ideas.trash(org.id, kindOf(kind), id); }
  @Post('/:kind/:id/restore') restore(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Param('id') id: string, @Req() req: Request) { this.origin(req); return this.ideas.restore(org.id, kindOf(kind), id); }
}
