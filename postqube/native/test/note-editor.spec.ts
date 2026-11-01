import { parseIdeaRuns } from '../../../libraries/helpers/src/ideas/text-format';
import { randomUUID } from 'node:crypto';
import { readNote, renderNote } from '../../../apps/frontend/src/components/ideas/note-editor';
beforeAll(() => Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true }));
const invalid = (message: string): never => { throw Error(message); };
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

test('styled text round-trips beside a task without losing inline position or blank lines', () => {
  const root = document.createElement('div');
  root.innerHTML = 'Antes <span style="font-family: Georgia; font-size: 24px; font-weight: 700; font-style: italic; text-decoration-line: underline; background-color: rgb(255, 224, 102); color: rgb(26,25,25)">ideia</span>\n\n<span data-task="task-rich" data-done="false" contenteditable="false">✓</span><u>Preparar</u>';
  const blocks = readNote(root);
  expect(blocks.map(b => b.text).join('')).toBe('Antes ideia\n\nPreparar');
  expect(blocks[0].runs).toContainEqual({ text: 'ideia', font: 'georgia', size: 24, bold: true, italic: true, underline: true, highlight: '#ffe066', color: '#1a1919' });
  const restored = document.createElement('div'); renderNote(restored, blocks);
  expect(readNote(restored).map(({ id, ...b }) => b)).toEqual(blocks.map(({ id, ...b }) => b));
  expect(restored.querySelector('[data-task]')?.previousSibling?.textContent).toBe('\n\n');
});
test('rendering rich notes never treats text as HTML, or accepts arbitrary styles', () => {
  const root = document.createElement('div');
  renderNote(root, [{ id: 'safe', type: 'text', text: '<img src=x onerror=alert(1)>', runs: [{ text: '<img src=x onerror=alert(1)>', bold: true }] }]);
  expect(root.querySelector('img')).toBeNull(); expect(root.textContent).toBe('<img src=x onerror=alert(1)>');
  expect(() => parseIdeaRuns([{ text: 'ok', font: '__proto__' }], 'ok', invalid)).toThrow();
  expect(() => parseIdeaRuns([{ text: 'ok', highlight: 'url(https://evil.example)' }], 'ok', invalid)).toThrow();
  expect(() => parseIdeaRuns([{ text: 'ok', size: 999 }], 'ok', invalid)).toThrow();
  expect(() => parseIdeaRuns([{ text: 'different' }], 'original', invalid)).toThrow();
});
