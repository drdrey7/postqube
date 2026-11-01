import { canMoveContainer, containerPath, ideaHeading, ideaText } from '../../../libraries/helpers/src/ideas/hierarchy';
const folder = (id: string, parentId: string | null = null, extra = {}) => ({ id, kind: 'folders', parentId, ...extra });
test('root pages need no container and legacy sections work alongside nested folders', () => {
  const nodes = [folder('root'), folder('legacy', 'root', { kind: 'sections' }), folder('nested', 'legacy')];
  expect(containerPath(nodes, null)).toEqual([]);
  expect(containerPath(nodes, 'nested')?.map(node => node.id)).toEqual(['root', 'legacy', 'nested']);
});
test('deleted ancestors, missing parents, page parents and cycles are never navigable', () => {
  expect(containerPath([folder('root', null, { deletedAt: new Date() }), folder('child', 'root')], 'child')).toBeNull();
  expect(containerPath([folder('child', 'missing')], 'child')).toBeNull();
  expect(containerPath([folder('page', null, { kind: 'pages' })], 'page')).toBeNull();
  expect(containerPath([folder('a', 'b'), folder('b', 'a')], 'a')).toBeNull();
});
test('moves reject self and descendant targets but support root and unrelated folders', () => {
  const nodes = [folder('a'), folder('b', 'a'), folder('c', 'b'), folder('other')];
  expect(canMoveContainer(nodes, 'a', 'a')).toBe(false);
  expect(canMoveContainer(nodes, 'a', 'c')).toBe(false);
  expect(canMoveContainer(nodes, 'b', null)).toBe(true);
  expect(canMoveContainer(nodes, 'b', 'other')).toBe(true);
});
test('automatic headings follow first line across inline tasks without replacing explicit titles', () => {
  const text = ideaText([{ text: 'A new ' }, { text: 'idea', inline: true }, { text: 'Details' }]);
  expect(text).toBe('A new idea\nDetails');
  expect(ideaHeading('', text, 'Untitled')).toBe('A new idea');
  expect(ideaHeading('My title', text, 'Untitled')).toBe('My title');
  expect(ideaHeading('', '', 'Untitled')).toBe('Untitled');
});
