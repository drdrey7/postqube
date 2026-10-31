import { randomUUID } from 'node:crypto';
import { readNote } from '../../../apps/frontend/src/components/ideas/note-editor';
beforeAll(() => Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true }));
const clean = (root: HTMLElement) => readNote(root).map(({ id, ...block }) => block);
test('inline circle preserves the exact prefix, following word, completion and next line', () => {
  const root = document.createElement('div');
  root.append(document.createTextNode('Antes '));
  const task = document.createElement('span'); task.dataset.task = 'task-one'; task.dataset.done = 'true'; task.contentEditable = 'false'; task.textContent = '✓'; root.append(task, document.createTextNode('\u200bpalavra depois\nOutra linha'));
  expect(clean(root)).toEqual([{ type: 'text', text: 'Antes ', inline: true }, { type: 'task', text: 'palavra depois', done: true, inline: true }, { type: 'text', text: '\nOutra linha', inline: true }]);
});
test('browser paragraph and blank-line structure survives without adding or removing a line', () => {
  const root = document.createElement('div'); root.innerHTML = 'Um<div><br></div><div>Três</div>';
  expect(readNote(root).map(b => b.text).join('')).toBe('Um\n\nTrês');
});
test('literal markup remains text and unchecked tasks remain unchecked', () => {
  const root = document.createElement('div'); root.append(document.createTextNode('<script>alert(1)</script>'));
  const task = document.createElement('span'); task.dataset.task = 'task-two'; task.dataset.done = 'false'; task.textContent = '✓'; root.append(task, document.createTextNode('Fazer'));
  expect(clean(root)).toEqual([{ type: 'text', text: '<script>alert(1)</script>', inline: true }, { type: 'task', text: 'Fazer', done: false, inline: true }]);
});
