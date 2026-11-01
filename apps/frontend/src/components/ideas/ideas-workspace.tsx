'use client';

import { CSSProperties, DragEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT, useTranslationSettings } from '@gitroom/react/translation/get.transation.service.client';
import { canMoveContainer, containerPath, ideaHeading, ideaText } from '@gitroom/helpers/ideas/hierarchy';
import { IdeaMarks } from '@gitroom/helpers/ideas/text-format';
import { IdeaBlock, NoteEditor, NoteEditorHandle } from './note-editor';
import { TextTools } from './text-tools';
import styles from './ideas.module.scss';

type Kind = 'folders' | 'sections' | 'pages';
type Item = { id: string; kind: Kind; parentId: string | null; title: string; excerpt?: string; pinned: boolean; revision: number; createdAt: string; updatedAt: string };
type Note = Item & { blocks: IdeaBlock[] };
type Tree = { folders: Item[]; sections: Item[]; pages: Item[] };
type ApiError = Error & { status?: number };
type Preferences = { filter?: string; noteId?: string; editor?: boolean; organizing?: boolean; collapsed?: boolean; sort?: string; expanded?: Record<string, boolean> };
const emptyTree: Tree = { folders: [], sections: [], pages: [] };
const colors = ['#8b75dd', '#45a895', '#d89a50', '#548dc8', '#c66d9f', '#80a249', '#d17566', '#679bb0'];
const accent = (id: string) => colors[Array.from(id).reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 0) % colors.length];
const asItem = (note: Note): Item => { const { blocks, ...item } = note; return { ...item, excerpt: ideaText(blocks).trim().slice(0, 240) }; };

export function IdeasWorkspace() {
  const t = useT(), i18n = useTranslationSettings(), nativeFetch = useFetch(), user = useUser();
  const label = (key: string, values?: Record<string, unknown>) => t('ideas_ui.' + key, values);
  const heading = (item: Item) => ideaHeading(item.title, item.excerpt || '', label('untitled'));
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.resolvedLanguage || 'en', { day: 'numeric', month: 'short' });
  const storageKey = `postqube-ideas-view:${user?.orgId}:${user?.id}`;
  const root = useRef<HTMLDivElement>(null), editor = useRef<NoteEditorHandle>(null), titleInput = useRef<HTMLTextAreaElement>(null);
  const [tree, setTree] = useState<Tree>(emptyTree), [note, setNote] = useState<Note | null>(null), [filter, setFilter] = useState('all');
  const [organizing, setOrganizing] = useState(false), [collapsed, setCollapsed] = useState(false), [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEditor, setShowEditor] = useState(false), [sort, setSort] = useState('edited'), [query, setQuery] = useState(''), [results, setResults] = useState<Item[] | null>(null), [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('opening'), [conflict, setConflict] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [epoch, setEpoch] = useState(0), [marks, setMarks] = useState<IdeaMarks>({}), [drop, setDrop] = useState<string | null | undefined>(undefined);
  const [naming, setNaming] = useState<{ item?: Item; parentId: string | null } | null>(null), [title, setTitle] = useState('');
  const [action, setAction] = useState<Item | null>(null), [moving, setMoving] = useState<Item | null>(null), [destination, setDestination] = useState('');
  const [trash, setTrash] = useState<Item[] | null>(null);
  const nameDialog = useRef<HTMLDialogElement>(null), itemDialog = useRef<HTMLDialogElement>(null), moveDialog = useRef<HTMLDialogElement>(null), trashDialog = useRef<HTMLDialogElement>(null);
  const current = useRef<{ note: Note | null; dirty: boolean; conflict: boolean; serial: number }>({ note: null, dirty: false, conflict: false, serial: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), flight = useRef<Promise<boolean> | null>(null), opening = useRef(0), creation = useRef(false);
  const focusEditor = useRef(false), preferencesReady = useRef(false);
  const containers = [...tree.folders, ...tree.sections];
  const activeFolder = containers.find(item => item.id === filter);
  const pathName = (id: string | null) => (containerPath(containers, id) || []).map(item => item.title).join(' / ') || label('unfiled');
  const filterTitle = activeFolder?.title || label(filter === 'loose' ? 'unfiled' : filter === 'pinned' ? 'pinned' : 'all_ideas');
  const createIn = activeFolder?.id || null;
  const displayTitle = note ? ideaHeading(note.title, ideaText(note.blocks), '') : '';
  const api = useCallback(async (path: string, method = 'GET', data?: unknown, keepalive = false) => {
    const response = await nativeFetch('/ideas/' + path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }), keepalive });
    const result = await response.json();
    if (!response.ok) { const error: ApiError = new Error(typeof result.message === 'string' ? result.message : 'failed'); error.status = response.status; throw error; }
    return result;
  }, [nativeFetch]);
  const errorText = error ? label(['invalid_location', 'folder_cycle', 'conflict', 'restore_parents', 'not_found', 'invalid_search'].includes(error) ? error : 'failed') : '';
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
        current.current.note = { ...current.current.note, revision: saved.revision, updatedAt: saved.updatedAt };
        setNote(current.current.note);
        setTree(tree => ({ ...tree, pages: tree.pages.map(item => item.id === n.id ? asItem(current.current.note!) : item) }));
        if (current.current.serial === serial) { current.current.dirty = false; forget(n.id); setStatus('saved'); }
        else { remember(); timer.current = setTimeout(() => { void persist(); }, 150); }
        return !current.current.dirty;
      } catch (error) {
        remember();
        if ((error as ApiError).status === 409) { current.current.conflict = true; setConflict(true); setStatus('conflict'); }
        else setStatus('failed');
        return false;
      } finally { flight.current = null; }
    })(); return flight.current;
  }, [api, forget, remember]);
  const changed = useCallback((updates: Partial<Note>) => {
    if (!current.current.note) return;
    current.current.note = { ...current.current.note, ...updates }; current.current.dirty = true; current.current.serial++;
    setNote(current.current.note); remember();
    setTree(tree => ({ ...tree, pages: tree.pages.map(item => item.id === current.current.note?.id ? asItem(current.current.note!) : item) }));
    if (!current.current.conflict) { setStatus('pending'); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void save(); }, 750); }
  }, [remember, save]);
  const canLeave = async () => await save() || confirm(label('leave'));
  const refresh = useCallback(async () => { const next: Tree = await api('tree'); setTree(next); return next; }, [api]);
  const openPage = useCallback(async (id: string, force = false, reveal = true) => {
    if (!force && current.current.note?.id === id) { if (reveal) setShowEditor(true); return; }
    const request = ++opening.current;
    if (!force && !(await save()) && !confirm(i18n.t('ideas_ui.leave_draft'))) return;
    try {
      const fresh: Note = await api('pages/' + id); if (request !== opening.current) return;
      let draft: Partial<Note> | null = null; try { draft = JSON.parse(sessionStorage.getItem(draftKey(id)) || 'null'); } catch {}
      const recover = draft && Array.isArray(draft.blocks), clash = !!recover && draft.revision !== fresh.revision;
      const page = recover ? { ...fresh, title: draft.title ?? fresh.title, blocks: draft.blocks! } : fresh;
      current.current = { note: page, dirty: !!recover, conflict: clash, serial: 0 };
      setNote(page); setMarks({}); setConflict(clash); setError(''); setEpoch(value => value + 1); if (reveal) setShowEditor(true);
      setStatus(clash ? 'compare' : recover ? 'recovering' : 'saved');
      if (recover && !clash) timer.current = setTimeout(() => { void save(); }, 750);
    } catch (error) { if (request === opening.current) setError((error as Error).message); }
  }, [api, draftKey, i18n, save]);
  useEffect(() => { document.title = t('ideas') + ' · Postqube'; }, [t]);
  useEffect(() => {
    let active = true; preferencesReady.current = false; setLoaded(false);
    refresh().then(async tree => {
      if (!active) return;
      let preferences: Preferences = {}; try { preferences = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
      const folders = [...tree.folders, ...tree.sections];
      setFilter(['all', 'loose', 'pinned'].includes(preferences.filter || '') || folders.some(item => item.id === preferences.filter) ? preferences.filter! : 'all');
      setOrganizing(preferences.organizing === true); setCollapsed(preferences.collapsed === true); setExpanded(preferences.expanded || {});
      setSort(['edited', 'created', 'title'].includes(preferences.sort || '') ? preferences.sort! : 'edited');
      const page = tree.pages.find(item => item.id === preferences.noteId) || tree.pages[0];
      if (page) await openPage(page.id, true, preferences.editor === true || innerWidth > 850);
      if (active) { preferencesReady.current = true; setLoaded(true); if (!page) setStatus('ready'); }
    }).catch(error => { if (active) { setError(error.message); setLoaded(true); } });
    return () => { active = false; opening.current++; if (timer.current) clearTimeout(timer.current); if (current.current.dirty && !current.current.conflict) void save(); };
  }, [refresh, openPage, save, storageKey]);
  useEffect(() => {
    if (!loaded || !preferencesReady.current) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ filter, noteId: note?.id, editor: showEditor, organizing, collapsed, sort, expanded })); } catch {}
  }, [storageKey, loaded, filter, note?.id, showEditor, organizing, collapsed, sort, expanded]);
  useEffect(() => {
    if (!loaded || !query.trim()) { setResults(null); setSearching(false); return; }
    let active = true; setSearching(true);
    const timer = setTimeout(() => { api('tree?q=' + encodeURIComponent(query.trim())).then(result => { if (active) setResults(result.pages); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setSearching(false); }); }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [api, query, loaded, tree]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (current.current.dirty) { remember(); event.preventDefault(); event.returnValue = ''; } };
    const online = () => { if (current.current.dirty && !current.current.conflict) void save(); };
    const focus = async () => { try { const tree = await refresh(), page = tree.pages.find(item => item.id === current.current.note?.id); if (page && page.revision !== current.current.note?.revision && !current.current.dirty && !flight.current) await openPage(page.id, true, false); } catch {} };
    window.addEventListener('beforeunload', unload); window.addEventListener('online', online); window.addEventListener('focus', focus);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('online', online); window.removeEventListener('focus', focus); };
  }, [remember, save, refresh, openPage]);
  useLayoutEffect(() => {
    const size = () => { if (root.current) root.current.style.setProperty('--ideas-height', `${Math.max(260, (innerWidth <= 850 ? window.visualViewport?.height || innerHeight : innerHeight) - root.current.getBoundingClientRect().top - (innerWidth <= 800 ? 8 : 12))}px`); };
    size(); window.addEventListener('resize', size); window.visualViewport?.addEventListener('resize', size);
    const observer = new ResizeObserver(size), layout = root.current?.closest('[class*="min-h-screen"]'); if (layout?.firstElementChild) observer.observe(layout.firstElementChild);
    return () => { window.removeEventListener('resize', size); window.visualViewport?.removeEventListener('resize', size); observer.disconnect(); };
  }, []);
  useLayoutEffect(() => { const title = titleInput.current; if (title) { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; } }, [displayTitle, epoch]);
  useEffect(() => { if (focusEditor.current && note) { focusEditor.current = false; root.current?.querySelector<HTMLElement>('.continuous-editor')?.focus(); } }, [epoch, note]);
  useEffect(() => { if (naming && !nameDialog.current?.open) nameDialog.current?.showModal(); }, [naming]);
  useEffect(() => { if (action && !itemDialog.current?.open) itemDialog.current?.showModal(); }, [action]);
  useEffect(() => { if (moving && !moveDialog.current?.open) moveDialog.current?.showModal(); }, [moving]);
  useEffect(() => { if (trash && !trashDialog.current?.open) trashDialog.current?.showModal(); }, [trash]);

  function chooseFolder(id: string) { setFilter(id); setQuery(''); setShowEditor(false); if (innerWidth <= 850) setOrganizing(false); }
  function startName(item?: Item, parentId = createIn) { setError(''); setTitle(item ? heading(item) : ''); setNaming({ item, parentId }); }
  function closeAction() { itemDialog.current?.close(); setAction(null); setError(''); }
  function startMove(item: Item) { closeAction(); setDestination(item.parentId || ''); setMoving(item); }
  async function newPage(parentId = createIn) {
    if (creation.current) return; creation.current = true; setBusy(true); setError('');
    try {
      if (!(await canLeave())) return;
      const fresh: Note = await api('pages', 'POST', { parentId, title: '' }); await refresh();
      setQuery(''); if (filter === 'pinned') setFilter(parentId || 'loose'); if (innerWidth <= 850) setOrganizing(false);
      focusEditor.current = true; await openPage(fresh.id, true);
    } catch (error) { setError((error as Error).message); } finally { creation.current = false; setBusy(false); }
  }
  async function submitName(event: React.FormEvent) {
    event.preventDefault(); if (!naming || !title.trim()) return; setBusy(true); setError('');
    try {
      const { item, parentId } = naming;
      if (item?.kind === 'pages') {
        if (current.current.note?.id !== item.id) await openPage(item.id);
        if (current.current.note?.id !== item.id) return;
        changed({ title: title.trim() }); if (!(await save())) throw Error('failed');
      } else if (item) await api(`${item.kind}/${item.id}`, 'PATCH', { title: title.trim() });
      else {
        const folder: Item = await api('folders', 'POST', { title: title.trim(), parentId });
        if (parentId) setExpanded(previous => ({ ...previous, [parentId]: true }));
        setFilter(folder.id); if (innerWidth <= 850) setOrganizing(false);
      }
      await refresh(); nameDialog.current?.close(); setNaming(null);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function metadata(item: Item, updates: Record<string, unknown>) {
    if (!(await save())) throw Error('failed');
    const baseRevision = current.current.note?.id === item.id ? current.current.note.revision : null;
    const pending = (async () => {
      try {
        const latest = item.kind === 'pages' ? await api('pages/' + item.id) : item;
        const saved: Note = await api(`${item.kind}/${item.id}`, 'PATCH', { ...updates, ...(item.kind === 'pages' ? { revision: latest.revision } : {}) });
        if (current.current.note?.id === saved.id) {
          if (current.current.dirty) {
            // Never replace text typed while a move/pin request was in flight.
            const clash = latest.revision !== baseRevision;
            current.current.note = { ...current.current.note, parentId: saved.parentId, pinned: saved.pinned, updatedAt: saved.updatedAt, ...(!clash ? { revision: saved.revision } : {}) };
            if (clash) { current.current.conflict = true; setConflict(true); setStatus('compare'); }
            remember();
          } else {
            const contentChanged = JSON.stringify(current.current.note.blocks) !== JSON.stringify(saved.blocks) || current.current.note.title !== saved.title;
            current.current.note = saved; if (contentChanged) setEpoch(value => value + 1); setStatus('saved');
          }
          setNote(current.current.note);
        }
        return true;
      } finally { flight.current = null; }
    })();
    flight.current = pending; await pending; await refresh();
  }
  async function move(item: Item, parentId: string | null) {
    setBusy(true); setError('');
    try {
      await metadata(item, { parentId });
      if (parentId) setExpanded(previous => ({ ...previous, [parentId]: true }));
      moveDialog.current?.close(); setMoving(null);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function pin(item: Item) { closeAction(); setBusy(true); try { await metadata(item, { pinned: !item.pinned }); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }
  async function remove(item: Item) {
    if (!(await canLeave()) || !confirm(label('confirm_trash', { name: heading(item) }))) return;
    setBusy(true); setError('');
    try {
      await api(`${item.kind}/${item.id}`, 'DELETE'); closeAction(); const next = await refresh();
      if (!next.pages.some(page => page.id === current.current.note?.id)) { opening.current++; current.current = { note: null, dirty: false, conflict: false, serial: 0 }; setNote(null); setConflict(false); setShowEditor(false); setStatus('ready'); }
      if (!['all', 'loose', 'pinned'].includes(filter) && ![...next.folders, ...next.sections].some(folder => folder.id === filter)) setFilter('all');
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function saveCopy() {
    const draft = current.current.note; if (!draft) return;
    try {
      const copy: Note = await api('pages', 'POST', { title: ideaHeading(draft.title, ideaText(draft.blocks), i18n.t('ideas_ui.untitled')).slice(0, 145) + label('copy_suffix'), parentId: draft.parentId });
      await api('pages/' + copy.id, 'PATCH', { revision: copy.revision, blocks: draft.blocks });
      forget(draft.id); current.current.dirty = false; current.current.conflict = false; await refresh(); await openPage(copy.id, true);
    } catch (error) { setError((error as Error).message); }
  }
  function dragStart(event: DragEvent, item: Item) { event.dataTransfer.setData('application/x-postqube-idea', JSON.stringify({ id: item.id, kind: item.kind })); event.dataTransfer.effectAllowed = 'move'; }
  function dropOn(event: DragEvent, parentId: string | null) {
    event.preventDefault(); setDrop(undefined);
    try { const data = JSON.parse(event.dataTransfer.getData('application/x-postqube-idea')); const item = [...containers, ...tree.pages].find(item => item.id === data.id && item.kind === data.kind); if (item && item.parentId !== parentId) void move(item, parentId); } catch {}
  }
  function dropProps(parentId: string | null) { return {
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes('application/x-postqube-idea')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDrop(parentId); } },
    onDragLeave: (event: DragEvent) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDrop(undefined); },
    onDrop: (event: DragEvent) => dropOn(event, parentId),
  }; }
  const sortedFolders = [...containers].sort((a, b) => a.title.localeCompare(b.title, i18n.resolvedLanguage));
  function folderTree(parentId: string | null, depth = 0): React.ReactNode {
    return sortedFolders.filter(item => item.parentId === parentId).map(item => {
      const children = containers.some(child => child.parentId === item.id);
      return <li key={item.id}>
        <div className={'folder-row colored-item' + (filter === item.id ? ' active' : '') + (drop === item.id ? ' drop-target' : '')} style={{ '--idea-accent': accent(item.id), '--folder-depth': depth } as CSSProperties} {...dropProps(item.id)} draggable onDragStart={event => dragStart(event, item)} onDragEnd={() => setDrop(undefined)}>
          <button className={'folder-expand' + (!children ? ' no-children' : '')} aria-label={label(expanded[item.id] ? 'collapse' : 'expand', { name: item.title })} aria-expanded={children ? !!expanded[item.id] : undefined} disabled={!children} onClick={() => setExpanded(previous => ({ ...previous, [item.id]: !previous[item.id] }))}>{expanded[item.id] ? '⌄' : '›'}</button>
          <button className="folder-select" onClick={() => chooseFolder(item.id)}><span aria-hidden>▱</span><span>{item.title}</span></button>
          <button className="item-menu" aria-label={label('options', { name: item.title })} onClick={() => { setError(''); setAction(item); }}>⋯</button>
        </div>{children && expanded[item.id] && <ul>{folderTree(item.id, depth + 1)}</ul>}
      </li>;
    });
  }
  const pages = (query.trim() ? results || [] : tree.pages.filter(page => filter === 'all' || filter === 'loose' && page.parentId === null || filter === 'pinned' && page.pinned || page.parentId === filter)).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === 'title' ? heading(a).localeCompare(heading(b), i18n.resolvedLanguage, { numeric: true }) : new Date(sort === 'created' ? b.createdAt : b.updatedAt).getTime() - new Date(sort === 'created' ? a.createdAt : a.updatedAt).getTime()) || a.id.localeCompare(b.id));
  const childFolders = query.trim() || !activeFolder ? [] : sortedFolders.filter(item => item.parentId === activeFolder.id);
  const tasks = note?.blocks.filter(block => block.type === 'task') || [], text = note ? ideaText(note.blocks).trim() : '', words = text ? text.split(/\s+/).length : 0;
  const destinations = sortedFolders.map(item => ({ item, path: pathName(item.id) })).sort((a, b) => a.path.localeCompare(b.path, i18n.resolvedLanguage));
  const locationPicker = (value: string, change: (value: string) => void, movingItem?: Item) => <select aria-label={label('location')} value={value} onChange={event => change(event.target.value)}><option value="">{label('unfiled')}</option>{destinations.filter(({ item }) => !movingItem || movingItem.kind === 'pages' || canMoveContainer(containers, movingItem.id, item.id)).map(({ item, path }) => <option value={item.id} key={item.id}>{path}</option>)}</select>;

  return <div ref={root} className={styles.root} data-editor={showEditor} data-organizing={organizing} data-list-collapsed={collapsed}>
    <main className="workspace" aria-label={label('workspace')}>
      {organizing && <><button className="organizer-backdrop" aria-label={label('close_organizer')} onClick={() => setOrganizing(false)} />
        <nav className="organizer" aria-label={label('organize_folders')}>
          <div className="organizer-heading"><h2>{label('organize_folders')}</h2><button className="icon-button" aria-label={label('close_organizer')} onClick={() => setOrganizing(false)}>×</button></div>
          <div className="folder-shortcuts">
            {[['all', 'all_ideas', '▤'], ['loose', 'unfiled', '▱'], ['pinned', 'pinned', '☆']].map(([id, key, icon]) => <button key={id} aria-current={filter === id ? 'page' : undefined} className={(filter === id ? 'active' : '') + (id !== 'pinned' && drop === null ? ' drop-target' : '')} {...(id !== 'pinned' ? dropProps(null) : {})} onClick={() => chooseFolder(id)}><span aria-hidden>{icon}</span>{label(key)}<small>{tree.pages.filter(page => id === 'all' || id === 'loose' && page.parentId === null || id === 'pinned' && page.pinned).length}</small></button>)}
          </div>
          <div className="folder-group-heading"><span>{label('folders')}</span><button className="icon-button" aria-label={label('new_folders')} onClick={() => startName(undefined, null)}>+</button></div>
          <ul className="folder-tree">{folderTree(null)}</ul>
          <div className="organizer-footer"><button onClick={() => { setError(''); void api('trash').then(result => setTrash(result.items)).catch(error => setError(error.message)); }}>♲ {label('trash')}</button><span>{label('shared')}</span><a href="https://github.com/drdrey7/postqube/tree/postqube-0.5.0-beta.1" target="_blank" rel="noreferrer">{label('source')}</a></div>
        </nav></>}
      <aside className="ideas-list" aria-label={label('pages')}>
        <div className="list-rail"><button className="icon-button" aria-label={label('expand_list')} onClick={() => setCollapsed(false)}>›</button><button className="icon-button" aria-label={label('organize_folders')} onClick={() => setOrganizing(value => !value)}>▱</button><button className="icon-button" aria-label={label('new_idea')} disabled={busy || !loaded} onClick={() => void newPage()}>+</button></div>
        <div className="list-body">
          <header className="list-heading"><div className="list-heading-top"><button className="organize-button" aria-expanded={organizing} onClick={() => setOrganizing(value => !value)}><span aria-hidden>▱</span>{label('organize_folders')}</button><button className="collapse-list icon-button" aria-label={label('collapse_list')} onClick={() => setCollapsed(true)}>‹</button></div>
            <h2>{query.trim() ? label('search_results') : filterTitle}</h2><p>{label('everyone')}</p>
            <button className="primary-button new-idea" title={label('create_in', { name: pathName(createIn) })} disabled={busy || !loaded} onClick={() => void newPage()}>+ {label('new_idea')}</button>
            <div className="creation-location">{label('create_in', { name: pathName(createIn) })}</div>
          </header>
          <label className="search"><span aria-hidden>⌕</span><input type="search" aria-label={label('global_search')} placeholder={label('global_search_placeholder')} maxLength={200} value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label={label('clear_search')} onClick={() => setQuery('')}>×</button>}</label>
          <div className="list-controls"><span role="status">{searching ? label('searching') : label('page_count', { count: pages.length })}</span><select aria-label={label('sort_by')} value={sort} onChange={event => setSort(event.target.value)}><option value="edited">{label('last_edited')}</option><option value="created">{label('date_created')}</option><option value="title">{label('page_title')}</option></select></div>
          <div className="page-list">{error && !showEditor && !naming && !moving && !action && !trash && <div className="conflict-banner" role="alert">{errorText}<button onClick={() => { setError(''); void refresh(); }}>{label('retry')}</button></div>}{childFolders.map(folder => <div className={'subfolder-row colored-item' + (drop === folder.id ? ' drop-target' : '')} key={folder.id} style={{ '--idea-accent': accent(folder.id) } as CSSProperties} {...dropProps(folder.id)}><button onClick={() => chooseFolder(folder.id)}><span aria-hidden>▱</span>{folder.title}<span aria-hidden>›</span></button><button className="item-menu" aria-label={label('options', { name: folder.title })} onClick={() => setAction(folder)}>⋯</button></div>)}
            {pages.map(page => <div className={'page-row' + (page.id === note?.id ? ' active' : '')} key={page.id} draggable onDragStart={event => dragStart(event, page)} onDragEnd={() => setDrop(undefined)}>
              <button className="page-main" onClick={() => void openPage(page.id)}><span className="page-title">{page.pinned && <span className="pin-mark" aria-label={label('pinned')}>☆ </span>}{heading(page)}</span><span className="page-preview">{page.excerpt || label('empty_note')}</span><span className="page-meta"><span>{date(sort === 'created' ? page.createdAt : page.updatedAt)}</span><span>{pathName(page.parentId)}</span></span></button>
              <button className="item-menu" aria-label={label('options', { name: heading(page) })} onClick={() => { setError(''); setAction(page); }}>⋯</button>
            </div>)}
            {!loaded ? <div className="empty-list" role="status">{label('loading')}</div> : !pages.length && !childFolders.length && !searching && <div className="empty-list"><span aria-hidden>✧</span><strong>{label(query.trim() ? 'no_results' : 'no_ideas')}</strong><p>{label(query.trim() ? 'try_search' : 'write_first')}</p>{!query.trim() && <button className="subtle-button" disabled={busy} onClick={() => void newPage()}>+ {label('new_idea')}</button>}</div>}
          </div>
        </div>
      </aside>
      <section className="editor-panel" aria-label={label('editor')}>
        <div className="editor-top"><button className="back-to-list" onClick={() => { setShowEditor(false); void save(); }}>‹ {label('back_to_list')}</button><div className="editor-location">{note && <button aria-label={label('move_to')} title={label('move_to')} onClick={() => startMove(asItem(note))}><span aria-hidden>▱</span><span>{pathName(note.parentId)}</span><span aria-hidden>⌄</span></button>}</div><div className="save-status" data-state={status === 'saved' ? 'saved' : conflict ? 'conflict' : 'pending'} role="status"><span />{label('status_' + status)}</div></div>
        {note && <div className="note-toolbar"><div className="toolbar-group"><TextTools marks={marks} format={(command, value) => editor.current?.format(command, value)} normalText={() => editor.current?.normalText()} /><button className="toolbar-button" onMouseDown={event => event.preventDefault()} onClick={() => editor.current?.insertTask()}><span className="task-icon" />{label('task')}</button></div><span className="toolbar-hint">{label('hint')}</span><button className="icon-button" aria-label={label('page_options')} onClick={() => { setError(''); setAction(asItem(note)); }}>⋯</button></div>}
        {error && !naming && !moving && !action && !trash && <div className="conflict-banner" role="alert">{errorText}<button onClick={() => { setError(''); void refresh(); }}>{label('retry')}</button></div>}
        {conflict && <div className="conflict-banner" role="alert"><strong>{label('conflict_title')}</strong><p>{label('conflict_help')}</p><button onClick={() => { if (note) void navigator.clipboard.writeText(ideaHeading(note.title, text, label('untitled')) + '\n\n' + text); }}>{label('copy_text')}</button><button onClick={() => void saveCopy()}>{label('save_copy')}</button><button onClick={() => { if (note && confirm(label('confirm_latest'))) { forget(note.id); current.current.dirty = false; current.current.conflict = false; void openPage(note.id, true); } }}>{label('open_latest')}</button></div>}
        <div className="editor-scroll">{note ? <article className="note"><div className="note-meta"><span className="note-kicker">{label('building')}</span><span>{date(note.createdAt)}</span></div><textarea ref={titleInput} className="note-title" rows={1} aria-label={label('page_title')} placeholder={label('untitled')} maxLength={160} value={displayTitle} onChange={event => changed({ title: event.target.value.replace(/\n/g, ' ') })} /><div className="note-rule" /><NoteEditor key={note.id + ':' + epoch} ref={editor} initial={note.blocks} labels={{ text: label('note_text'), placeholder: label('note_placeholder'), task: label('task_completed') }} onChange={blocks => changed({ blocks })} onFormattingChange={next => setMarks(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)} /></article> : <div className="empty-editor"><div className="empty-mark" aria-hidden>✧</div><span className="eyebrow">{label('think')}</span><h2>{label('empty_title')}</h2><p>{label('capture_first')}</p><button className="primary-button" disabled={busy || !loaded} onClick={() => void newPage()}>+ {label('new_idea')}</button></div>}</div>
        <div className="note-footer"><span>{note ? label('word_count', { count: words }) + (tasks.length ? ' · ' + label('tasks_count', { done: tasks.filter(task => task.done).length, total: tasks.length }) : '') : label('shared')}</span><span>{label('access')}</span></div>
        {status === 'failed' && <button className="retry-save" onClick={() => void save()}>{label('retry_save')}</button>}
      </section>
    </main>
    <dialog ref={nameDialog} onCancel={() => { setNaming(null); setError(''); }}><form onSubmit={submitName}><button type="button" className="dialog-close" aria-label={label('close')} onClick={() => { nameDialog.current?.close(); setNaming(null); setError(''); }}>×</button><h2>{label(naming?.item ? 'rename' : 'new_folders')}</h2><label htmlFor="idea-name">{label('name')}</label><input id="idea-name" required autoFocus maxLength={160} value={title} onChange={event => setTitle(event.target.value)} />{!naming?.item && <label className="destination-label">{label('location')}{locationPicker(naming?.parentId || '', value => setNaming(previous => previous ? { ...previous, parentId: value || null } : previous))}</label>}<p role="alert">{errorText}</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => { nameDialog.current?.close(); setNaming(null); setError(''); }}>{label('cancel')}</button><button className="primary-button" type="submit" disabled={busy}>{label(naming?.item ? 'save' : 'create')}</button></div></form></dialog>
    <dialog ref={itemDialog} onCancel={() => { setAction(null); setError(''); }}><button className="dialog-close" aria-label={label('close')} onClick={closeAction}>×</button><h2>{action ? heading(action) : ''}</h2><button className="menu-action" onClick={() => { const item = action!; closeAction(); startName(item); }}>{label('rename')}</button><button className="menu-action" onClick={() => { if (action) startMove(action); }}>{label('move_to')}</button>{action?.kind === 'pages' ? <button className="menu-action" disabled={busy} onClick={() => { if (action) void pin(action); }}>{label(action.pinned ? 'unpin' : 'pin')}</button> : <><button className="menu-action" onClick={() => { const parent = action!.id; closeAction(); startName(undefined, parent); }}>{label('new_subfolder')}</button><button className="menu-action" onClick={() => { const parent = action!.id; closeAction(); void newPage(parent); }}>{label('new_idea')}</button></>}
      {action?.id === note?.id && <details className="note-details"><summary>{label('note_details')}</summary><p>{label('word_count', { count: words })}<br />{label('tasks_count', { done: tasks.filter(task => task.done).length, total: tasks.length })}<br />{label('access')}</p></details>}
      <button className="menu-action danger" disabled={busy} onClick={() => { if (action) void remove(action); }}>{label('move_trash')}</button><p>{label('restorable')}</p><p role="alert">{errorText}</p></dialog>
    <dialog ref={moveDialog} onCancel={() => { setMoving(null); setError(''); }}><form onSubmit={event => { event.preventDefault(); if (moving) void move(moving, destination || null); }}><button type="button" className="dialog-close" aria-label={label('close')} onClick={() => { moveDialog.current?.close(); setMoving(null); setError(''); }}>×</button><h2>{label('move_to')}</h2><p>{moving ? heading(moving) : ''}</p><label className="destination-label">{label('location')}{locationPicker(destination, setDestination, moving || undefined)}</label><p>{label('move_scope')}</p><p role="alert">{errorText}</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => { moveDialog.current?.close(); setMoving(null); setError(''); }}>{label('cancel')}</button><button className="primary-button" type="submit" disabled={busy}>{label('move')}</button></div></form></dialog>
    <dialog ref={trashDialog} onCancel={() => { setTrash(null); setError(''); }}><button className="dialog-close" aria-label={label('close')} onClick={() => { trashDialog.current?.close(); setTrash(null); setError(''); }}>×</button><h2>{label('trash')}</h2><p>{label('restore_parents')}</p>{trash?.map(item => <div className="trash-entry" key={item.id}><div><strong>{heading(item)}</strong><small>{label(item.kind === 'pages' ? 'editor_page' : 'folder')}</small></div><button onClick={() => { void api(`${item.kind}/${item.id}/restore`, 'POST', {}).then(async () => { await refresh(); const result = await api('trash'); setTrash(result.items); }).catch(error => setError(error.message)); }}>{label('restore')}</button></div>)}{!trash?.length && <p>{label('trash_empty')}</p>}<p role="alert">{errorText}</p></dialog>
  </div>;
}
