import { Body, Controller, Delete, ForbiddenException, Get, HttpException, Injectable, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
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
    return { id: b.id, type: b.type, text: b.text, ...(b.type === 'task' ? { done: b.done } : {}), ...(b.inline === true ? { inline: true } : {}) };
  });
  if (size > 400000) fail(400, 'A página atingiu o limite de texto.');
  return blocks;
}
@Injectable()
export class IdeasService {
  constructor(private readonly prisma: PrismaService) {}
  async live(org: string, kind: Kind, id: string) {
    const item = await this.prisma.ideaItem.findFirst({ where: { id, organizationId: org, kind, deletedAt: null } });
    if (!item) fail(404, 'Elemento não encontrado neste espaço.');
    if (kind !== 'folders') await this.live(org, kind === 'pages' ? 'sections' : 'folders', item.parentId);
    return item;
  }
  async tree(org: string) {
    const items = await this.prisma.ideaItem.findMany({ where: { organizationId: org, deletedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, kind: true, parentId: true, title: true, revision: true, createdAt: true, updatedAt: true } });
    const folders = items.filter(i => i.kind === 'folders'); const folderIds = new Set(folders.map(i => i.id));
    const sections = items.filter(i => i.kind === 'sections' && folderIds.has(i.parentId)); const sectionIds = new Set(sections.map(i => i.id));
    return { folders, sections, pages: items.filter(i => i.kind === 'pages' && sectionIds.has(i.parentId)) };
  }
  async create(org: string, kind: Kind, body: Record<string, unknown>) {
    if (kind !== 'folders') await this.live(org, kind === 'pages' ? 'sections' : 'folders', String(body.parentId || ''));
    return this.prisma.ideaItem.create({ data: { organizationId: org, kind, parentId: kind === 'folders' ? null : String(body.parentId), title: label(body.title ?? '', { folders: 'Nova pasta', sections: 'Novo separador', pages: 'Nova página' }[kind]), blocks: kind === 'pages' ? [{ id: randomUUID(), type: 'text', text: '' }] : [] } });
  }
  async update(org: string, kind: Kind, id: string, body: Record<string, unknown>) {
    const current = await this.live(org, kind, id);
    if (kind === 'pages' && (!Number.isInteger(body.revision) || body.revision !== current.revision)) fail(409, 'Outro membro alterou esta página. O teu texto foi preservado.');
    const result = await this.prisma.ideaItem.updateMany({ where: { id, organizationId: org, kind, deletedAt: null, ...(kind === 'pages' ? { revision: Number(body.revision) } : {}) }, data: { title: body.title === undefined ? current.title : label(body.title, 'Sem título'), ...(kind === 'pages' ? { blocks: body.blocks === undefined ? current.blocks : ideaBlocks(body.blocks), revision: { increment: 1 } } : {}) } });
    if (result.count !== 1) fail(409, 'A página mudou. O teu texto continua no editor.');
    return this.live(org, kind, id);
  }
  async trash(org: string, kind: Kind, id: string) {
    await this.live(org, kind, id);
    await this.prisma.ideaItem.updateMany({ where: { id, organizationId: org, kind, deletedAt: null }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
  async trashList(org: string) { return { items: await this.prisma.ideaItem.findMany({ where: { organizationId: org, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' }, select: { id: true, title: true, kind: true, deletedAt: true } }) }; }
  async restore(org: string, kind: Kind, id: string) {
    const item = await this.prisma.ideaItem.findFirst({ where: { id, organizationId: org, kind, deletedAt: { not: null } } });
    if (!item) fail(404, 'Elemento não encontrado no lixo.');
    if (kind !== 'folders') await this.live(org, kind === 'pages' ? 'sections' : 'folders', item.parentId);
    await this.prisma.ideaItem.updateMany({ where: { id, organizationId: org, kind }, data: { deletedAt: null } }); return { ok: true };
  }
}
@ApiTags('Ideas')
@Controller('/ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}
  private origin(req: Request) {
    if (!req.headers.origin || req.headers.origin !== new URL(process.env.FRONTEND_URL).origin) throw new ForbiddenException('Origem não permitida.');
  }
  @Get('/tree') async tree(@GetOrgFromRequest() org: Organization, @GetUserFromRequest() user: User) { return { ...await this.ideas.tree(org.id), workspaceId: org.id, viewerId: user.id, scope: 'workspace' }; }
  @Get('/trash') trashList(@GetOrgFromRequest() org: Organization) { return this.ideas.trashList(org.id); }
  @Get('/pages/:id') page(@GetOrgFromRequest() org: Organization, @Param('id') id: string) { return this.ideas.live(org.id, 'pages', id); }
  @Post('/:kind') create(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Body() body: Record<string, unknown>, @Req() req: Request) { this.origin(req); return this.ideas.create(org.id, kindOf(kind), body); }
  @Patch('/:kind/:id') update(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) { this.origin(req); return this.ideas.update(org.id, kindOf(kind), id, body); }
  @Delete('/:kind/:id') trash(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Param('id') id: string, @Req() req: Request) { this.origin(req); return this.ideas.trash(org.id, kindOf(kind), id); }
  @Post('/:kind/:id/restore') restore(@GetOrgFromRequest() org: Organization, @Param('kind') kind: string, @Param('id') id: string, @Req() req: Request) { this.origin(req); return this.ideas.restore(org.id, kindOf(kind), id); }
}
