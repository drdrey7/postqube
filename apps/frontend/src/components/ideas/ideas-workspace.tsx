'use client';

import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { IdeaBlock, NoteEditor, NoteEditorHandle } from './note-editor';
import styles from './ideas.module.scss';
import { useT, useTranslationSettings } from '@gitroom/react/translation/get.transation.service.client';
import { TextTools } from './text-tools';
import { IdeaMarks } from '@gitroom/helpers/ideas/text-format';
const folderColors = ['#8b75dd', '#45a895', '#d89a50', '#548dc8', '#c66d9f', '#80a249', '#d17566', '#679bb0'];
const folderColor = (id: string) => folderColors[Array.from(id).reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 0) % folderColors.length];

type Kind = 'folders' | 'sections' | 'pages';
type Item = { id: string; title: string; parentId: string | null; kind: Kind; createdAt: string; updatedAt: string; revision: number };
type Note = Item & { blocks: IdeaBlock[] };
type Tree = { folders: Item[]; sections: Item[]; pages: Item[] };
type ApiError = Error & { status?: number };
const emptyTree: Tree = { folders: [], sections: [], pages: [] };

export function IdeasWorkspace() {
  const t = useT(), i18n = useTranslationSettings();
  const label = (key: string, values?: Record<string, unknown>) => t('ideas_ui.' + key, values);
  const names: Record<Kind, string> = { folders: label('folder'), sections: label('section'), pages: label('page') };
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.resolvedLanguage || i18n.language || 'en', { day: 'numeric', month: 'short' });
  useEffect(() => { document.title = t('ideas') + ' · Postqube'; }, [t]);
  const nativeFetch = useFetch(), user = useUser(), root = useRef<HTMLDivElement>(null), editor = useRef<NoteEditorHandle>(null);
  const [marks, setMarks] = useState<IdeaMarks>({});
  const [tree, setTree] = useState<Tree>(emptyTree), [folder, setFolder] = useState<string | null>(null), [section, setSection] = useState<string | null>(null), [note, setNote] = useState<Note | null>(null);
  const [view, setView] = useState<string>('folders'), [collapsed, setCollapsed] = useState<Record<string, boolean>>({}), [query, setQuery] = useState(''), [status, setStatus] = useState('opening'), [conflict, setConflict] = useState(false), [epoch, setEpoch] = useState(0);
  const [dialog, setDialog] = useState<{ kind: Kind; item?: Item } | null>(null), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [action, setAction] = useState<{ kind: Kind; item: Item } | null>(null), [trash, setTrash] = useState<Item[] | null>(null);
  const nameDialog = useRef<HTMLDialogElement>(null), itemDialog = useRef<HTMLDialogElement>(null), trashDialog = useRef<HTMLDialogElement>(null);
  const current = useRef<{ note: Note | null; dirty: boolean; conflict: boolean; serial: number }>({ note: null, dirty: false, conflict: false, serial: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), flight = useRef<Promise<boolean> | null>(null);
  const api = useCallback(async (path: string, method = 'GET', data?: unknown, keepalive = false) => {
    const response = await nativeFetch('/ideas/' + path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }), keepalive });
    const result = await response.json();
    if (!response.ok) { const e: ApiError = new Error('failed'); e.status = response.status; throw e; }
    return result;
  }, [nativeFetch]);
  const draftKey = useCallback((id: string) => `postqube-ideas:${user?.orgId}:${user?.id}:${id}`, [user?.orgId, user?.id]);
  const remember = useCallback(() => { const n = current.current.note; if (n) try { sessionStorage.setItem(draftKey(n.id), JSON.stringify({ title: n.title, blocks: n.blocks, revision: n.revision })); } catch {} }, [draftKey]);
  const forget = useCallback((id: string) => { try { sessionStorage.removeItem(draftKey(id)); } catch {} }, [draftKey]);
  const save = useCallback(async function persist(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (!current.current.note || !current.current.dirty) return true;
    if (current.current.conflict) return false;
    if (flight.current) { await flight.current; return current.current.dirty && !current.current.conflict ? persist() : !current.current.dirty; }
    const n = structuredClone(current.current.note), serial = current.current.serial; setStatus('saving');
    flight.current = (async () => {
      try {
        const saved: Note = await api('pages/' + n.id, 'PATCH', { revision: n.revision, title: n.title, blocks: n.blocks });
        if (current.current.note?.id !== n.id) return false;
        current.current.note = { ...current.current.note, revision: saved.revision, updatedAt: saved.updatedAt }; setNote(current.current.note);
        setTree(t => ({ ...t, pages: t.pages.map(p => p.id === n.id ? { ...p, title: current.current.note?.title || '', revision: saved.revision, updatedAt: saved.updatedAt } : p) }));
        if (current.current.serial === serial) { current.current.dirty = false; forget(n.id); setStatus('saved'); }
        else { remember(); timer.current = setTimeout(() => { void persist(); }, 150); }
        return !current.current.dirty;
      } catch (e) {
        remember(); if ((e as ApiError).status === 409) { current.current.conflict = true; setConflict(true); setStatus('conflict'); }
        else setStatus('failed');
        return false;
      } finally { flight.current = null; }
    })(); return flight.current;
  }, [api, forget, remember]);
  const changed = useCallback((updates: Partial<Note>) => {
    if (!current.current.note) return;
    current.current.note = { ...current.current.note, ...updates }; current.current.dirty = true; current.current.serial++;
    setNote(current.current.note); remember();
    if (!current.current.conflict) { setStatus('pending'); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void save(); }, 750); }
  }, [remember, save]);
  const canLeave = async () => await save() || confirm(label('leave'));
  const refresh = useCallback(async () => { const t: Tree = await api('tree'); setTree(t); return t; }, [api]);
  const openPage = useCallback(async (id: string, force = false) => {
    if (!force && current.current.note?.id === id) { setView('editor'); return; }
    if (!force && !(await save()) && !confirm(i18n.t('ideas_ui.leave_draft'))) return;
    try {
      const fresh: Note = await api('pages/' + id); let draft: Partial<Note> | null = null;
      try { draft = JSON.parse(sessionStorage.getItem(draftKey(id)) || 'null'); } catch {}
      const recover = draft && Array.isArray(draft.blocks), clash = !!recover && draft.revision !== fresh.revision;
      const page = recover ? { ...fresh, title: draft.title || fresh.title, blocks: draft.blocks! } : fresh;
      current.current = { note: page, dirty: !!recover, conflict: clash, serial: 0 }; setNote(page); setMarks({}); setConflict(clash); setEpoch(n => n + 1); setSection(page.parentId); setView('editor'); setStatus(clash ? 'compare' : recover ? 'recovering' : 'saved');
      if (recover && !clash) timer.current = setTimeout(() => { void save(); }, 750);
    } catch (e) { setError((e as Error).message); }
  }, [api, draftKey, save]);
  useEffect(() => {
    let active = true;
    refresh().then(t => { if (!active) return; const f = t.folders[0], s = t.sections.find(i => i.parentId === f?.id); setFolder(f?.id || null); setSection(s?.id || null); setStatus('ready'); const p = t.pages.find(i => i.parentId === s?.id); if (p) void openPage(p.id).then(() => { if (innerWidth <= 850) setView('folders'); }); }).catch(e => setError(e.message));
    try { setCollapsed(JSON.parse(localStorage.getItem('postqube-ideas-columns') || '{}')); } catch {}
    return () => { active = false; if (timer.current) clearTimeout(timer.current); if (current.current.dirty && !current.current.conflict) void save(); };
  }, [refresh, openPage, save]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (current.current.dirty) { remember(); e.preventDefault(); e.returnValue = ''; } };
    const online = () => { if (current.current.dirty && !current.current.conflict) void save(); };
    const focus = async () => { try { const t = await refresh(); const p = t.pages.find(i => i.id === current.current.note?.id); if (p && p.revision !== current.current.note?.revision && !current.current.dirty && !flight.current) await openPage(p.id, true); } catch {} };
    window.addEventListener('beforeunload', unload); window.addEventListener('online', online); window.addEventListener('focus', focus);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('online', online); window.removeEventListener('focus', focus); };
  }, [remember, save, refresh, openPage]);
  useLayoutEffect(() => {
    const size = () => { if (root.current) root.current.style.setProperty('--ideas-height', `${Math.max(260, innerHeight - root.current.getBoundingClientRect().top - (innerWidth <= 800 ? 8 : 12))}px`); };
    size(); window.addEventListener('resize', size); const observer = new ResizeObserver(size); const layout = root.current?.closest('[class*="min-h-screen"]'); if (layout?.firstElementChild) observer.observe(layout.firstElementChild);
    return () => { window.removeEventListener('resize', size); observer.disconnect(); };
  }, []);
  useLayoutEffect(() => { const title = root.current?.querySelector<HTMLTextAreaElement>('textarea.note-title'); if (title) { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; } }, [note?.title, epoch]);
  useEffect(() => { if (dialog && !nameDialog.current?.open) nameDialog.current?.showModal(); }, [dialog]);
  useEffect(() => { if (action && !itemDialog.current?.open) itemDialog.current?.showModal(); }, [action]);
  useEffect(() => { if (trash && !trashDialog.current?.open) trashDialog.current?.showModal(); }, [trash]);
  async function select(kind: Kind, item: Item) {
    if (kind === 'pages') { await openPage(item.id); return; }
    if (!(await canLeave())) return;
    current.current = { note: null, dirty: false, conflict: false, serial: 0 }; setNote(null); setConflict(false); setQuery('');
    if (kind === 'folders') { setFolder(item.id); setSection(tree.sections.find(s => s.parentId === item.id)?.id || null); setView('sections'); }
    else { setSection(item.id); setView('pages'); } setStatus('ready');
  }
  function createDialog(kind: Kind, item?: Item) { setError(''); setTitle(item?.title || ''); setDialog({ kind, item }); }
  async function submitName(e: React.FormEvent) {
    e.preventDefault(); if (!dialog || !title.trim()) return; setBusy(true); setError('');
    try {
      const { kind, item } = dialog;
      if (item) {
        if (kind === 'pages') { if (current.current.note?.id !== item.id) await openPage(item.id); if (current.current.note?.id !== item.id) throw Error('open_failed'); changed({ title: title.trim() }); if (!(await save())) throw Error('name_unsaved'); }
        else await api(kind + '/' + item.id, 'PATCH', { title: title.trim() });
      } else {
        if (!(await canLeave())) return;
        const result: Note = await api(kind, 'POST', { title: title.trim(), parentId: kind === 'sections' ? folder : section }); await refresh();
        if (kind === 'pages') await openPage(result.id); else await select(kind, result);
      }
      await refresh(); nameDialog.current?.close(); setDialog(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!action || !(await canLeave())) return;
    if (!confirm(label('confirm_trash', { name: action.item.title }))) return;
    try { await api(`${action.kind}/${action.item.id}`, 'DELETE'); itemDialog.current?.close(); setAction(null); current.current = { note: null, dirty: false, conflict: false, serial: 0 }; setNote(null); setConflict(false); const t = await refresh(); const f = t.folders.find(i => i.id === folder) || t.folders[0]; const s = t.sections.find(i => i.id === section && i.parentId === f?.id) || t.sections.find(i => i.parentId === f?.id); setFolder(f?.id || null); setSection(s?.id || null); setView(action.kind); setStatus('ready'); } catch (e) { setError((e as Error).message); }
  }
  async function saveCopy() {
    const draft = current.current.note; if (!draft) return;
    try { const copy: Note = await api('pages', 'POST', { title: draft.title.slice(0, 145) + label('copy_suffix'), parentId: draft.parentId }); await api('pages/' + copy.id, 'PATCH', { revision: copy.revision, title: copy.title, blocks: draft.blocks }); forget(draft.id); current.current.dirty = false; current.current.conflict = false; await refresh(); await openPage(copy.id, true); } catch (e) { setError((e as Error).message); }
  }
  const activeFolder = tree.folders.find(f => f.id === folder), activeSection = tree.sections.find(s => s.id === section);
  const items = { folders: tree.folders, sections: tree.sections.filter(s => s.parentId === folder), pages: tree.pages.filter(p => p.parentId === section && p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) };
  const tasks = note?.blocks.filter(b => b.type === 'task') || [], text = note?.blocks.map(b => b.text).join(' ').trim() || '', words = text ? text.split(/\s+/).length : 0;
  const close = (which: 'name' | 'item' | 'trash') => { if (which === 'name') { nameDialog.current?.close(); setDialog(null); } if (which === 'item') { itemDialog.current?.close(); setAction(null); } if (which === 'trash') { trashDialog.current?.close(); setTrash(null); } setError(''); };
  return <div ref={root} className={styles.root} data-view={view} data-folders-collapsed={!!collapsed.folders} data-sections-collapsed={!!collapsed.sections} data-pages-collapsed={!!collapsed.pages}>
    <main className="workspace" aria-label={label('workspace')}>
      {(['folders', 'sections', 'pages'] as Kind[]).map((kind, index) => <section key={kind} className={`panel ${kind}-panel`} aria-label={label(kind)}>
        <div className="column-top"><div><span className="eyebrow">{label(index === 0 ? 'library' : index === 1 ? 'organize' : 'develop')}</span><h2>{label(kind)}</h2></div><button className="icon-button" aria-label={label('new_' + kind)} disabled={kind === 'sections' && !folder || kind === 'pages' && !section} onClick={() => createDialog(kind)}>+</button></div>
        <div className="context-label">{kind === 'folders' ? label('everyone') : kind === 'sections' ? activeFolder?.title || label('choose_folder') : activeSection?.title || label('choose_section')}</div>
        {kind === 'pages' && <label className="search"><span aria-hidden>⌕</span><input type="search" aria-label={label('search')} placeholder={label('search_placeholder')} value={query} onChange={e => setQuery(e.target.value)} /></label>}
        <button className="collapse-column" aria-expanded={!collapsed[kind]} aria-label={label(collapsed[kind] ? 'expand' : 'collapse', { name: names[kind] })} onClick={() => { const value = { ...collapsed, [kind]: !collapsed[kind] }; setCollapsed(value); try { localStorage.setItem('postqube-ideas-columns', JSON.stringify(value)); } catch {} }}>‹<span>{label(kind)}</span></button>
        <div className="list">{items[kind].map(item => <div key={item.id} style={kind !== 'pages' ? { '--idea-accent': folderColor(item.id) } as CSSProperties : undefined} className={'item-row' + (kind !== 'pages' ? ' colored-item' : '') + ((kind === 'folders' ? folder : kind === 'sections' ? section : note?.id) === item.id ? ' active' : '')}>
          <button className={'item-main' + (kind === 'pages' ? ' page-main' : '')} onClick={() => void select(kind, item)}>{kind !== 'sections' && <span className="item-icon" aria-hidden>{kind === 'folders' ? '▱' : '▤'}</span>}<span className="page-title-wrap"><span className="item-title">{item.id === note?.id ? note.title : item.title}</span>{kind === 'pages' && <span className="page-subtitle">{date(item.updatedAt)}</span>}</span></button>
          <button className="item-menu" aria-label={label('options', { name: item.title })} onClick={() => { setError(''); setAction({ kind, item }); }}>⋯</button>
        </div>)}{!items[kind].length && <div className="empty-list"><strong>{label('empty_' + kind)}</strong>{label('create_hint_' + kind)}</div>}</div>
        {kind === 'folders' ? <div className="panel-bottom"><button className="subtle-button" onClick={() => { setError(''); void api('trash').then(r => setTrash(r.items)).catch(e => setError(e.message)); }}>♲ {label('trash')}</button><p>{label('shared_saved')}</p><a className="source-link" href="https://github.com/drdrey7/postqube/tree/postqube-0.4.0-beta.1" target="_blank" rel="noreferrer">{label('source')}</a></div> : <button className="bottom-create" disabled={kind === 'sections' ? !folder : !section} onClick={() => createDialog(kind)}>+ {label('new_' + kind)}</button>}
      </section>)}
      <section className="editor-panel" aria-label={label('editor')}>
        <div className="editor-top"><div className="breadcrumbs">{[activeFolder?.title, activeSection?.title, note?.title].filter(Boolean).join(' / ') || t('ideas')}</div><div className="save-status" data-state={status === 'saved' ? 'saved' : conflict ? 'conflict' : 'pending'} role="status"><span />{label('status_' + status)}</div></div>
        {note && <div className="note-toolbar"><div className="toolbar-group"><TextTools marks={marks} format={(command, value) => editor.current?.format(command, value)} normalText={() => editor.current?.normalText()} /><button className="toolbar-button" onMouseDown={e => e.preventDefault()} onClick={() => editor.current?.insertTask()}><span className="task-icon" />{label('task')}</button></div><span className="toolbar-hint">{label('hint')}</span><button className="icon-button" aria-label={label('page_options')} onClick={() => setAction({ kind: 'pages', item: note })}>⋯</button></div>}
        {conflict && <div className="conflict-banner" role="alert"><strong>{label('conflict_title')}</strong><p>{label('conflict_help')}</p><button onClick={() => { if (note) void navigator.clipboard.writeText(note.title + '\n\n' + note.blocks.map((b, i) => (i && !b.inline ? '\n' : '') + (b.type === 'task' ? b.done ? '[x] ' : '[ ] ' : '') + b.text).join('')); }}>{label('copy_text')}</button><button onClick={() => void saveCopy()}>{label('save_copy')}</button><button onClick={() => { if (note && confirm(label('confirm_latest'))) { forget(note.id); current.current.dirty = false; current.current.conflict = false; void openPage(note.id, true); } }}>{label('open_latest')}</button></div>}
        {error && !dialog && !action && !trash && <div className="conflict-banner" role="alert">{error ? label(Object.prototype.hasOwnProperty.call({"failed": 1, "open_failed": 1, "name_unsaved": 1}, error) ? error : 'failed') : ''}<button onClick={() => { setError(''); void refresh(); }}>{label('retry')}</button></div>}
        <div className="editor-scroll">{note ? <article className="note"><div className="note-meta"><span className="note-kicker">{label('building')}</span><span>{date(note.createdAt)}</span></div><textarea className="note-title" rows={1} aria-label={label('page_title')} maxLength={160} value={note.title} onChange={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; changed({ title: e.target.value.replace(/\n/g, ' ') }); }} /><div className="note-rule" /><NoteEditor key={note.id + ':' + epoch} ref={editor} initial={note.blocks} labels={{ text: label('note_text'), placeholder: label('note_placeholder'), task: label('task_completed') }} onChange={blocks => changed({ blocks })} onFormattingChange={next => setMarks(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)} /></article> : <div className="empty-editor"><div className="empty-mark" aria-hidden>✧</div><span className="eyebrow">{label('think')}</span><h2>{label('empty_title')}</h2><p>{label('empty_help')}</p><button className="primary-button" onClick={() => createDialog(section ? 'pages' : folder ? 'sections' : 'folders')}>+ {label('create_' + (section ? 'pages' : folder ? 'sections' : 'folders'))}</button></div>}</div>
        <div className="note-footer"><span>{note ? label('word_count', { count: words }) + (tasks.length ? ' · ' + label('tasks_count', { done: tasks.filter(t => t.done).length, total: tasks.length }) : '') : label('shared')}</span><span>{label('access')}</span>{status === 'failed' && <button onClick={() => void save()}>{label('retry_save')}</button>}</div>
      </section>
    </main>
    <nav className="mobile-navigation" aria-label={label('levels')}>{[['folders', label('folders')], ['sections', label('sections')], ['pages', label('pages')], ['editor', label('editor_page')]].map(([key, name]) => <button key={key} className={view === key ? 'active' : ''} disabled={key === 'sections' && !folder || key === 'pages' && !section || key === 'editor' && !note} onClick={() => setView(key)}>{name}</button>)}</nav>
    <dialog ref={nameDialog} onCancel={() => { setDialog(null); setError(''); }}><form onSubmit={submitName}><button type="button" className="dialog-close" aria-label={label('close')} onClick={() => close('name')}>×</button><h2>{dialog?.item ? label('rename') : label('create_' + (dialog?.kind || 'folders'))}</h2><label htmlFor="idea-name">{label('name')}</label><input id="idea-name" required autoFocus maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /><p role="alert">{error ? label(Object.prototype.hasOwnProperty.call({"failed": 1, "open_failed": 1, "name_unsaved": 1}, error) ? error : 'failed') : ''}</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => close('name')}>{label('cancel')}</button><button className="primary-button" type="submit" disabled={busy}>{dialog?.item ? label('save') : label('create')}</button></div></form></dialog>
    <dialog ref={itemDialog} onCancel={() => setAction(null)}><button className="dialog-close" aria-label={label('close')} onClick={() => close('item')}>×</button><h2>{action?.item.title}</h2><button className="menu-action" onClick={() => { const a = action!; close('item'); createDialog(a.kind, a.item); }}>{label('rename')}</button><button className="menu-action danger" onClick={() => void remove()}>{label('move_trash')}</button><p>{label('restorable')}</p><p role="alert">{error ? label(Object.prototype.hasOwnProperty.call({"failed": 1, "open_failed": 1, "name_unsaved": 1}, error) ? error : 'failed') : ''}</p></dialog>
    <dialog ref={trashDialog} onCancel={() => setTrash(null)}><button className="dialog-close" aria-label={label('close')} onClick={() => close('trash')}>×</button><h2>{label('trash')}</h2><p>{label('restore_parents')}</p>{trash?.map(i => <div className="trash-entry" key={i.id}><div><strong>{i.title}</strong><small>{names[i.kind]}</small></div><button onClick={() => { void api(`${i.kind}/${i.id}/restore`, 'POST', {}).then(async () => { await refresh(); const r = await api('trash'); setTrash(r.items); }).catch(e => setError(e.message)); }}>{label('restore')}</button></div>)}{!trash?.length && <p>{label('trash_empty')}</p>}<p role="alert">{error ? label(Object.prototype.hasOwnProperty.call({"failed": 1, "open_failed": 1, "name_unsaved": 1}, error) ? error : 'failed') : ''}</p></dialog>
  </div>;
}
