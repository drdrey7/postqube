'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

import { IDEA_FONTS, IdeaFont, IdeaMarks, IdeaRun, parseIdeaRuns } from '@gitroom/helpers/ideas/text-format';
export type IdeaBlock = { id: string; type: 'text' | 'task'; text: string; done?: boolean; inline?: boolean; runs?: IdeaRun[] };
export type TextCommand = 'bold' | 'italic' | 'underline' | 'strike' | 'font' | 'size' | 'color' | 'highlight' | 'clear' | 'undo' | 'redo';
export type NoteEditorHandle = { insertTask: () => void; normalText: () => void; format: (command: TextCommand, value?: string) => void };
type Token = { text: string; marks: IdeaMarks } | { id: string; done: boolean };
const newText = (): IdeaBlock => ({ id: crypto.randomUUID(), type: 'text', text: '', inline: true });
const styleKey = (m: IdeaMarks) => JSON.stringify([!!m.bold, !!m.italic, !!m.underline, !!m.strike, m.font, m.size, m.color, m.highlight]);
function cssColor(value: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + value.slice(1).split('').map(c => c + c).join('').toLowerCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) return;
  return '#' + rgb.slice(1, 4).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('');
}
function inheritMarks(node: HTMLElement, inherited: IdeaMarks): IdeaMarks {
  const m = { ...inherited }, style = node.style, tag = node.tagName;
  if (['B', 'STRONG'].includes(tag)) m.bold = true;
  if (['I', 'EM'].includes(tag)) m.italic = true;
  if (tag === 'U') m.underline = true;
  if (['S', 'STRIKE', 'DEL'].includes(tag)) m.strike = true;
  if (tag === 'MARK') m.highlight = '#ffe066';
  if (style.fontWeight) { if (style.fontWeight === 'bold' || Number(style.fontWeight) >= 600) m.bold = true; else delete m.bold; }
  if (style.fontStyle) { if (style.fontStyle === 'italic') m.italic = true; else delete m.italic; }
  const decoration = style.textDecorationLine || style.textDecoration;
  if (decoration) { if (decoration.includes('underline')) m.underline = true; else delete m.underline; if (decoration.includes('line-through')) m.strike = true; else delete m.strike; }
  const family = style.fontFamily || node.getAttribute('face');
  if (family) {
    const name = family.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const font = (Object.keys(IDEA_FONTS) as IdeaFont[]).find(key => IDEA_FONTS[key].label.toLowerCase() === name);
    if (font) m.font = font; else delete m.font;
  }
  const legacySize = Number(node.getAttribute('size'));
  const size = style.fontSize ? (style.fontSize.endsWith('px') ? Number.parseFloat(style.fontSize) : ({ 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32, 'xxx-large': 48 } as Record<string, number>)[style.fontSize]) : legacySize >= 1 && legacySize <= 7 ? [10, 13, 16, 18, 24, 32, 48][legacySize - 1] : undefined;
  if (size && size >= 8 && size <= 48) m.size = Math.round(size);
  const foreground = style.color || node.getAttribute('color');
  if (foreground) { const color = cssColor(foreground); if (color) m.color = color; else delete m.color; }
  if (style.backgroundColor) { const color = cssColor(style.backgroundColor); if (color) m.highlight = color; else delete m.highlight; }
  return m;
}
function taskMarker(done = false, label = 'Task completed') {
  const e = document.createElement('span'); e.className = 'inline-task'; e.contentEditable = 'false';
  e.dataset.task = crypto.randomUUID(); e.dataset.done = String(done); e.setAttribute('role', 'checkbox');
  e.setAttribute('aria-checked', String(done)); e.tabIndex = 0; e.setAttribute('aria-label', label); e.textContent = '✓'; return e;
}
function tokens(root: Node): Token[] {
  const out: Token[] = [];
  function walk(node: Node, marks: IdeaMarks = {}) {
    if (node.nodeType === Node.TEXT_NODE) { out.push({ text: (node.nodeValue || '').replace(/\u200b/g, ''), marks }); return; }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.task) { out.push({ id: node.dataset.task, done: node.dataset.done === 'true' }); return; }
    if (node.tagName === 'BR') { if (node.parentNode?.childNodes.length !== 1 || node.parentNode === root) out.push({ text: '\n', marks }); return; }
    const next = inheritMarks(node, marks);
    if (/^(DIV|P|LI)$/.test(node.tagName) && (out.length || node.previousSibling)) out.push({ text: '\n', marks: next });
    node.childNodes.forEach(child => walk(child, next));
  }
  root.childNodes.forEach(child => walk(child)); return out;
}
export function readNote(root: HTMLElement): IdeaBlock[] {
  const blocks: IdeaBlock[] = []; let current = newText(), runs: IdeaRun[] = [];
  const append = (text: string, marks: IdeaMarks) => {
    if (!text) return; current.text += text; const last = runs[runs.length - 1];
    if (last && styleKey(last) === styleKey(marks)) last.text += text; else runs.push({ text, ...marks });
  };
  const flush = () => {
    if (current.text || current.type === 'task') { if (runs.some(r => Object.keys(r).some(key => key !== 'text'))) current.runs = runs; blocks.push(current); }
    runs = [];
  };
  for (const token of tokens(root)) {
    if (!('text' in token)) { flush(); current = { id: token.id, type: 'task', text: '', done: token.done, inline: true }; }
    else if (current.type === 'task' && token.text.includes('\n')) { const at = token.text.indexOf('\n'); append(token.text.slice(0, at), token.marks); flush(); current = newText(); append(token.text.slice(at), token.marks); }
    else append(token.text, token.marks);
  }
  flush(); return blocks.length ? blocks : [newText()];
}
function applyMarks(span: HTMLElement, marks: IdeaMarks) {
  if (marks.bold) span.style.fontWeight = '700'; if (marks.italic) span.style.fontStyle = 'italic';
  if (marks.underline || marks.strike) span.style.textDecorationLine = [marks.underline ? 'underline' : '', marks.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  if (marks.font) span.style.fontFamily = IDEA_FONTS[marks.font].css;
  if (marks.size) span.style.fontSize = marks.size + 'px'; if (marks.color) span.style.color = marks.color;
  if (marks.highlight) span.style.backgroundColor = marks.highlight;
}

export function resizedNoteSelection(root: HTMLElement, range: Range, size: number): HTMLElement {
  const holder = document.createElement('div'); holder.append(range.cloneContents());
  let node = range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const parents: HTMLElement[] = []; while (node && node !== root) { parents.unshift(node); node = node.parentElement; }
  const inherited = parents.reduce((marks, element) => inheritMarks(element, marks), {} as IdeaMarks);
  const wrapper = document.createElement('span'); applyMarks(wrapper, inherited);
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT), nodes: Text[] = [];
  while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest('[data-task]')) nodes.push(walker.currentNode as Text);
  for (const text of nodes) { const span = document.createElement('span'); span.style.fontSize = size + 'px'; text.replaceWith(span); span.append(text); }
  if (range.collapsed) { const span = document.createElement('span'); span.style.fontSize = size + 'px'; span.textContent = '\u200b'; holder.append(span); }
  wrapper.append(...Array.from(holder.childNodes)); return wrapper;
}

export function renderNote(root: HTMLElement, blocks: IdeaBlock[]) {
  root.replaceChildren();
  blocks.forEach((b, i) => {
    if (i && !b.inline) root.append(document.createTextNode('\n'));
    if (b.type === 'task') root.append(taskMarker(b.done));
    let runs: IdeaRun[] = [{ text: b.text }];
    try { if (b.runs) runs = parseIdeaRuns(b.runs, b.text, () => { throw new Error('Invalid recovery formatting'); }); } catch { /* Plain text is still recoverable. */ }
    for (const run of runs) {
      const span = document.createElement('span'); span.textContent = run.text;
      applyMarks(span, run);
      if (Object.keys(run).length > 1) root.append(span); else root.append(document.createTextNode(run.text));
    }
  });
}
export const NoteEditor = forwardRef<NoteEditorHandle, { initial: IdeaBlock[]; onChange: (blocks: IdeaBlock[]) => void; onFormattingChange?: (marks: IdeaMarks) => void; labels?: { text: string; placeholder: string; task: string } }>(function NoteEditor({ initial, onChange, onFormattingChange, labels = { text: 'Note text', placeholder: 'Write your idea…', task: 'Task completed' } }, ref) {
  const root = useRef<HTMLDivElement>(null), selection = useRef<Range | null>(null), initialBlocks = useRef(initial), changed = useRef(onChange);
  changed.current = onChange;
  const formattingChanged = useRef(onFormattingChange); formattingChanged.current = onFormattingChange;
  const capture = useCallback(() => {
    const s = getSelection(); if (!s?.rangeCount || !root.current?.contains(s.anchorNode) || !root.current.contains(s.focusNode)) return;
    selection.current = s.getRangeAt(0).cloneRange();
    let anchor: Node | null = s.anchorNode;
    if (anchor instanceof HTMLElement && anchor.childNodes.length) anchor = anchor.childNodes[Math.min(s.anchorOffset, anchor.childNodes.length - 1)];
    while (anchor instanceof HTMLElement && anchor.firstChild && !anchor.dataset.task) anchor = anchor.firstChild;
    let node = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
    const parents: HTMLElement[] = []; while (node && node !== root.current) { parents.unshift(node); node = node.parentElement; }
    formattingChanged.current?.(parents.reduce((marks, e) => inheritMarks(e, marks), {} as IdeaMarks));
  }, []);
  const sync = () => { if (root.current) changed.current(readNote(root.current)); capture(); };
  function restore() {
    const e = root.current!, s = getSelection()!; e.focus(); s.removeAllRanges();
    if (selection.current && e.contains(selection.current.startContainer)) s.addRange(selection.current);
    else { const r = document.createRange(); r.selectNodeContents(e); r.collapse(false); s.addRange(r); }
  }
  useLayoutEffect(() => {
    renderNote(root.current!, initialBlocks.current);
  }, []);
  useEffect(() => { root.current?.querySelectorAll('[data-task]').forEach(task => task.setAttribute('aria-label', labels.task)); }, [labels.task, initial]);
  useEffect(() => { document.addEventListener('selectionchange', capture); return () => document.removeEventListener('selectionchange', capture); }, [capture]);
  useImperativeHandle(ref, () => ({
    insertTask() { restore(); if (readNote(root.current!).length >= 499) return; document.execCommand('insertHTML', false, taskMarker(false, labels.task).outerHTML + '&#8203;'); sync(); },
    normalText() {
      restore(); const caret = getSelection()!.getRangeAt(0).cloneRange(); let task: HTMLElement | null = null;
      for (const candidate of Array.from(root.current!.querySelectorAll<HTMLElement>('[data-task]'))) {
        const after = document.createRange(); after.setStartAfter(candidate); after.collapse(true);
        if (after.compareBoundaryPoints(Range.START_TO_START, caret) > 0) break;
        const between = document.createRange(); between.setStartAfter(candidate); between.setEnd(caret.startContainer, caret.startOffset);
        if (!tokens(between.cloneContents()).some(t => 'text' in t && t.text.includes('\n'))) task = candidate;
      }
      if (task) { const r = document.createRange(), s = getSelection()!; r.selectNode(task); s.removeAllRanges(); s.addRange(r); document.execCommand('delete'); s.removeAllRanges(); s.addRange(caret); sync(); }
    },
    format(command, value) {
      restore(); document.execCommand('styleWithCSS', false, 'true');
      if (command === 'size') {
        const size = value === 'default' ? Number.parseFloat(getComputedStyle(root.current!).fontSize) : Number(value);
        if (!Number.isInteger(size) || size < 8 || size > 48) return;
        const range = getSelection()!.getRangeAt(0), collapsed = range.collapsed, wrapper = resizedNoteSelection(root.current!, range, size), id = crypto.randomUUID(); wrapper.dataset.noteFormat = id;
        document.execCommand('insertHTML', false, wrapper.outerHTML);
        const inserted = root.current!.querySelector<HTMLElement>('[data-note-format=\"' + id + '\"]');
        if (inserted) { const selected = document.createRange(); selected.selectNodeContents(inserted); if (collapsed) selected.collapse(false); const current = getSelection()!; current.removeAllRanges(); current.addRange(selected); inserted.removeAttribute('data-note-format'); }
      } else if (command === 'font') {
        const family = value && Object.prototype.hasOwnProperty.call(IDEA_FONTS, value) ? IDEA_FONTS[value as IdeaFont].label : getComputedStyle(root.current!).fontFamily;
        document.execCommand('fontName', false, family);
      } else if (command === 'highlight') {
        const color = value === 'clear' ? 'transparent' : value;
        if (color && (color === 'transparent' || /^#[0-9a-f]{6}$/i.test(color))) {
          if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color);
          if (color !== 'transparent') document.execCommand('foreColor', false, '#1a1919');
          else {
            const nativeColor = getComputedStyle(root.current!).color; document.execCommand('foreColor', false, nativeColor);
            const selected = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0) : null;
            for (const span of Array.from(root.current!.querySelectorAll<HTMLElement>('[style]'))) if (span.style.color === nativeColor && selected?.intersectsNode(span)) span.style.color = 'rgb(var(--new-textColor))';
          }
        }
      } else if (command === 'color') { if (value && /^#[0-9a-f]{6}$/i.test(value)) document.execCommand('foreColor', false, value); }
      else document.execCommand(({ strike: 'strikeThrough', clear: 'removeFormat' } as Record<string, string>)[command] || command);
      sync();
    },
  }));
  function toggle(target: EventTarget | null) {
    const task = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-task]') : null;
    if (!task) return false; task.dataset.done = String(task.dataset.done !== 'true'); task.setAttribute('aria-checked', task.dataset.done); sync(); return true;
  }
  return <div ref={root} className="continuous-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label={labels.text} aria-multiline="true" spellCheck data-placeholder={labels.placeholder}
    onInput={sync} onMouseUp={capture} onKeyUp={capture}
    onPaste={event => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); sync(); }}
    onClick={event => { if (toggle(event.target)) event.preventDefault(); }}
    onKeyDown={event => {
      if (event.target instanceof HTMLElement && event.target.dataset.task && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); toggle(event.target); return; }
      if (event.key !== 'Enter' || event.shiftKey || (event.nativeEvent as KeyboardEvent).isComposing) return;
      const s = getSelection(); if (!s?.rangeCount || !s.isCollapsed) return;
      const cursor = s.getRangeAt(0), before = cursor.cloneRange(); before.selectNodeContents(root.current!); before.setEnd(cursor.startContainer, cursor.startOffset);
      let active: Extract<Token, { id: string }> | null = null;
      for (const token of tokens(before.cloneContents())) { if (!('text' in token)) active = token; else if (token.text.includes('\n')) active = null; }
      if (!active) return;
      const task = Array.from(root.current!.querySelectorAll<HTMLElement>('[data-task]')).find(e => e.dataset.task === active!.id);
      const rest = document.createRange(); rest.selectNodeContents(root.current!); if (task) rest.setStartAfter(task);
      let text = ''; for (const token of tokens(rest.cloneContents())) { if (!('text' in token)) break; text += token.text; if (token.text.includes('\n')) { text = text.split('\n')[0]; break; } }
      event.preventDefault(); if (!text.trim()) { task?.remove(); document.execCommand('insertText', false, '\n'); } else document.execCommand('insertHTML', false, '<br>' + taskMarker(false, labels.task).outerHTML + '&#8203;'); sync();
    }} />;
});
