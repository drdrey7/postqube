/** Shared hierarchy rules. Legacy sections are containers, just like folders. */
export type IdeaNode = { id: string; kind: string; parentId: string | null; deletedAt?: Date | string | null };
export function containerPath<T extends IdeaNode>(items: readonly T[], id: string | null): T[] | null {
  const byId = new Map(items.map(item => [item.id, item])), seen = new Set<string>(), path: T[] = [];
  while (id !== null) {
    if (seen.has(id)) return null;
    seen.add(id);
    const node = byId.get(id);
    if (!node || node.deletedAt || !['folders', 'sections'].includes(node.kind)) return null;
    path.unshift(node); id = node.parentId;
  }
  return path;
}
export function canMoveContainer(items: readonly IdeaNode[], id: string, destination: string | null): boolean {
  const path = containerPath(items, destination);
  return path !== null && !path.some(item => item.id === id);
}
export function ideaText(blocks: readonly { text: string; inline?: boolean }[]): string {
  return blocks.map((block, index) => (index && !block.inline ? '\n' : '') + block.text).join('');
}
export function ideaHeading(title: string, excerpt: string, fallback: string): string {
  return title.trim() || excerpt.trim().split(/\r?\n/)[0].slice(0, 160) || fallback;
}
