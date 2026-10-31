'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

export type IdeaBlock = { id: string; type: 'text' | 'task'; text: string; done?: boolean; inline?: boolean };
export type NoteEditorHandle = { insertTask: () => void; normalText: () => void };
type Token = string | { id: string; done: boolean };
const newText = (text = ''): IdeaBlock => ({ id: crypto.randomUUID(), type: 'text', text, inline: true });
function taskMarker(done = false) {
  const e = document.createElement('span'); e.className = 'inline-task'; e.contentEditable = 'false';
  e.dataset.task = crypto.randomUUID(); e.dataset.done = String(done); e.setAttribute('role', 'checkbox');
  e.setAttribute('aria-checked', String(done)); e.tabIndex = 0; e.setAttribute('aria-label', 'Tarefa concluída'); e.textContent = '✓'; return e;
}
function tokens(root: Node): Token[] {
  const out: Token[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { out.push((node.nodeValue || '').replace(/\u200b/g, '')); return; }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.task) { out.push({ id: node.dataset.task, done: node.dataset.done === 'true' }); return; }
    if (node.tagName === 'BR') { if (node.parentNode?.childNodes.length !== 1 || node.parentNode === root) out.push('\n'); return; }
    if (/^(DIV|P|LI)$/.test(node.tagName) && (out.length || node.previousSibling)) out.push('\n');
    node.childNodes.forEach(walk);
  }
  root.childNodes.forEach(walk); return out;
}
export function readNote(root: HTMLElement): IdeaBlock[] {
  const blocks: IdeaBlock[] = []; let current = newText();
  const flush = () => { if (current.text || current.type === 'task') blocks.push(current); };
  for (const token of tokens(root)) {
    if (typeof token !== 'string') { flush(); current = { id: token.id, type: 'task', text: '', done: token.done, inline: true }; }
    else if (current.type === 'task' && token.includes('\n')) { const at = token.indexOf('\n'); current.text += token.slice(0, at); flush(); current = newText(token.slice(at)); }
    else current.text += token;
  }
  flush(); return blocks.length ? blocks : [newText()];
}
export const NoteEditor = forwardRef<NoteEditorHandle, { initial: IdeaBlock[]; onChange: (blocks: IdeaBlock[]) => void }>(function NoteEditor({ initial, onChange }, ref) {
  const root = useRef<HTMLDivElement>(null), selection = useRef<Range | null>(null), initialBlocks = useRef(initial), changed = useRef(onChange);
  changed.current = onChange;
  const capture = useCallback(() => { const s = getSelection(); if (s?.rangeCount && root.current?.contains(s.anchorNode) && root.current.contains(s.focusNode)) selection.current = s.getRangeAt(0).cloneRange(); }, []);
  const sync = () => { if (root.current) changed.current(readNote(root.current)); capture(); };
  function restore() {
    const e = root.current!, s = getSelection()!; e.focus(); s.removeAllRanges();
    if (selection.current && e.contains(selection.current.startContainer)) s.addRange(selection.current);
    else { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); s.addRange(r); }
  }
  useLayoutEffect(() => {
    const e = root.current!; e.replaceChildren();
    initialBlocks.current.forEach((b, i) => { if (i && !b.inline) e.append(document.createTextNode('\n')); if (b.type === 'task') e.append(taskMarker(b.done)); e.append(document.createTextNode(b.text)); });
  }, []);
  useEffect(() => { document.addEventListener('selectionchange', capture); return () => document.removeEventListener('selectionchange', capture); }, [capture]);
  useImperativeHandle(ref, () => ({
    insertTask() { restore(); if (readNote(root.current!).length >= 499) return; document.execCommand('insertHTML', false, taskMarker().outerHTML + '&#8203;'); sync(); },
    normalText() {
      restore(); const caret = getSelection()!.getRangeAt(0).cloneRange(); let task: HTMLElement | null = null;
      for (const candidate of Array.from(root.current!.querySelectorAll<HTMLElement>('[data-task]'))) {
        const after = document.createRange(); after.setStartAfter(candidate); after.collapse(true);
        if (after.compareBoundaryPoints(Range.START_TO_START, caret) > 0) break;
        const between = document.createRange(); between.setStartAfter(candidate); between.setEnd(caret.startContainer, caret.startOffset);
        if (!tokens(between.cloneContents()).some(t => typeof t === 'string' && t.includes('\n'))) task = candidate;
      }
      if (task) { const r = document.createRange(), s = getSelection()!; r.selectNode(task); s.removeAllRanges(); s.addRange(r); document.execCommand('delete'); s.removeAllRanges(); s.addRange(caret); sync(); }
    },
  }));
  function toggle(target: EventTarget | null) {
    const task = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-task]') : null;
    if (!task) return false; task.dataset.done = String(task.dataset.done !== 'true'); task.setAttribute('aria-checked', task.dataset.done); sync(); return true;
  }
  return <div ref={root} className="continuous-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Texto da nota" aria-multiline="true" spellCheck data-placeholder="Escreve a tua ideia…"
    onInput={sync} onMouseUp={capture} onKeyUp={capture}
    onBeforeInput={event => { if ((event.nativeEvent as InputEvent).inputType?.startsWith('format')) event.preventDefault(); }}
    onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); sync(); }}
    onClick={event => { if (toggle(event.target)) event.preventDefault(); }}
    onKeyDown={event => {
      if (event.target instanceof HTMLElement && event.target.dataset.task && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); toggle(event.target); return; }
      if (event.key !== 'Enter' || event.shiftKey || (event.nativeEvent as KeyboardEvent).isComposing) return;
      const s = getSelection(); if (!s?.rangeCount || !s.isCollapsed) return;
      const cursor = s.getRangeAt(0), before = cursor.cloneRange(); before.selectNodeContents(root.current!); before.setEnd(cursor.startContainer, cursor.startOffset);
      let active: Exclude<Token, string> | null = null;
      for (const token of tokens(before.cloneContents())) { if (typeof token !== 'string') active = token; else if (token.includes('\n')) active = null; }
      if (!active) return;
      const task = Array.from(root.current!.querySelectorAll<HTMLElement>('[data-task]')).find(e => e.dataset.task === active!.id);
      const rest = document.createRange(); rest.selectNodeContents(root.current!); if (task) rest.setStartAfter(task);
      let text = ''; for (const token of tokens(rest.cloneContents())) { if (typeof token !== 'string') break; text += token; if (token.includes('\n')) { text = text.split('\n')[0]; break; } }
      event.preventDefault(); if (!text.trim()) { task?.remove(); document.execCommand('insertText', false, '\n'); } else document.execCommand('insertHTML', false, '<br>' + taskMarker().outerHTML + '&#8203;'); sync();
    }} />;
});
