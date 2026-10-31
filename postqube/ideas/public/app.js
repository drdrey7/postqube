/* Postqube Ideas © 2026 André Barroso. AGPL-3.0-or-later. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { tree: { folders: [], sections: [], pages: [] }, folder: null, section: null, page: null, dirty: false, serial: 0, saving: null, timer: null, conflict: false, query: '', editing: null, action: null, online: true };
  const labels = { folders: 'pasta', sections: 'separador', pages: 'página' };
  const icons = { folders: '▱', sections: '▎', pages: '▤' };
  let toastTimer, booting = false;
  function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
  function status(kind, text) { const e = $('save-status'); e.dataset.state = kind; e.replaceChildren(Object.assign(document.createElement('span')), document.createTextNode(text)); $('retry-save').hidden = !['error'].includes(kind); }
  async function api(route, { method = 'GET', data, keepalive = false } = {}) {
    let response;
    try { response = await fetch('/ideas/api/' + route, { method, credentials: 'same-origin', cache: 'no-store', ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' } } : {}), ...(data !== undefined ? { body: JSON.stringify(data) } : {}), keepalive, signal: AbortSignal.timeout(15000) }); }
    catch { const error = new Error('Sem ligação. O teu texto continua neste separador. Tenta guardar novamente.'); error.status = 0; throw error; }
    let result; try { result = await response.json(); } catch { throw new Error('O servidor não respondeu como esperado.'); }
    if (response.status === 401) { $('session-gate').hidden = false; status('error', 'Sessão terminada'); }
    if (!response.ok) { const error = new Error(result.message || 'Não foi possível concluir.'); error.status = response.status; throw error; }
    return result;
  }
  function currentFolder() { return state.tree.folders.find(f => f.id === state.folder); }
  function currentSection() { return state.tree.sections.find(s => s.id === state.section); }
  function draftKey(id = state.page?.id) { return `postqube-ideas:${state.tree.workspaceId}:${state.tree.viewerId}:${id}`; }
  function rememberDraft() {
    if (!state.page) return;
    try { sessionStorage.setItem(draftKey(), JSON.stringify({ title: state.page.title, blocks: state.page.blocks, revision: state.page.revision })); } catch { /* UI still reports unsaved state; never clear the editor. */ }
  }
  function forgetDraft(id) { try { sessionStorage.removeItem(draftKey(id)); } catch {} }
  function setView(view) {
    if ((view === 'sections' && !state.folder) || (view === 'pages' && !state.section) || (view === 'editor' && !state.page)) return;
    document.body.dataset.view = view;
    for (const button of document.querySelectorAll('[data-view]')) if (button.tagName === 'BUTTON') button.classList.toggle('active', button.dataset.view === view);
  }
  function syncControls() {
    for (const e of document.querySelectorAll('[data-create]')) e.disabled = (e.dataset.create === 'sections' && !state.folder) || (e.dataset.create === 'pages' && !state.section);
    for (const e of document.querySelectorAll('button[data-view]')) e.disabled = (e.dataset.view === 'sections' && !state.folder) || (e.dataset.view === 'pages' && !state.section) || (e.dataset.view === 'editor' && !state.page);
    $('folder-context').textContent = currentFolder()?.title || 'Escolhe uma pasta';
    $('breadcrumbs').textContent = [currentFolder()?.title, currentSection()?.title, state.page?.title || (state.section ? 'Nova ideia' : '')].filter(Boolean).join('  /  ') || 'Ideias / A tua próxima ideia';
    $('pages-count').textContent = state.tree.pages.filter(p => p.section_id === state.section).length;
    $('start-button').textContent = state.section ? '+ Criar uma página' : state.folder ? '+ Criar um separador' : '+ Criar a primeira pasta';
  }
  function emptyList(root, heading, text) { const e = document.createElement('div'); e.className = 'empty-list'; const strong = document.createElement('strong'); strong.textContent = heading; e.append(strong, document.createTextNode(text)); root.append(e); }
  function renderList(kind, root, items, active) {
    root.replaceChildren();
    const colors = ['#aa86d9', '#73b4a5', '#d2a16d', '#8f9bd9', '#c984a6'];
    items.forEach((item, index) => {
      const row = document.createElement('div'); row.className = 'item-row' + (item.id === active ? ' active' : '');
      const button = document.createElement('button'); button.className = 'item-main' + (kind === 'pages' ? ' page-main' : ''); button.type = 'button'; button.setAttribute('aria-current', item.id === active ? 'true' : 'false');
      const icon = document.createElement('span'); icon.className = kind === 'sections' ? 'section-icon' : kind === 'pages' ? 'page-icon' : 'item-icon'; icon.textContent = kind === 'sections' ? '' : icons[kind]; icon.setAttribute('aria-hidden', 'true'); if (kind === 'sections') icon.style.background = colors[index % colors.length];
      const wrap = document.createElement('span'); wrap.className = 'page-title-wrap'; const name = document.createElement('span'); name.className = 'item-title'; name.textContent = item.id === state.page?.id ? state.page.title || 'Sem título' : item.title; wrap.append(name);
      if (kind === 'pages') { const meta = document.createElement('span'); meta.className = 'page-subtitle'; meta.textContent = new Date(item.updated_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }); wrap.append(meta); }
      button.append(icon, wrap); button.addEventListener('click', () => select(kind, item.id));
      const menu = document.createElement('button'); menu.className = 'item-menu'; menu.type = 'button'; menu.textContent = '⋯'; menu.title = 'Opções'; menu.setAttribute('aria-label', 'Opções de ' + item.title); menu.addEventListener('click', () => itemOptions(kind, item));
      row.append(button, menu); root.append(row);
    });
    if (!items.length) emptyList(root, kind === 'folders' ? 'Ainda sem pastas' : kind === 'sections' ? 'Espaço para organizar' : 'A próxima ideia é tua', kind === 'folders' ? 'Cria a primeira pasta para começar.' : kind === 'sections' ? 'Cria um separador dentro desta pasta.' : 'Cria uma página para escrever e adicionar tarefas.');
  }
  function renderLists() {
    renderList('folders', $('folders-list'), state.tree.folders, state.folder);
    renderList('sections', $('sections-list'), state.tree.sections.filter(s => s.folder_id === state.folder), state.section);
    renderList('pages', $('pages-list'), state.tree.pages.filter(p => p.section_id === state.section && p.title.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())), state.page?.id);
    syncControls();
  }
  function resize(textarea) { textarea.style.height = 'auto'; textarea.style.height = Math.max(30, textarea.scrollHeight) + 'px'; }
  function stats() {
    if (!state.page) { $('note-stats').textContent = 'Ideias partilhadas. Possibilidades infinitas.'; return; }
    const tasks = state.page.blocks.filter(b => b.type === 'task'), done = tasks.filter(b => b.done).length;
    const text = state.page.blocks.map(b => b.text).join(' ').trim(), words = text ? text.split(/\s+/).length : 0;
    $('note-stats').textContent = `${words} ${words === 1 ? 'palavra' : 'palavras'}${tasks.length ? `  ·  ${done}/${tasks.length} tarefas concluídas` : ''}`;
  }
  function changed() {
    if (!state.page) return;
    state.dirty = true; state.serial++; rememberDraft(); stats();
    if (!state.conflict) { status('pending', 'Por guardar…'); clearTimeout(state.timer); state.timer = setTimeout(() => save(), 750); }
  }
  // One continuous, plain-text editor. Task markers are inline non-editable controls.
  // Stored text never becomes HTML. Legacy block notes are displayed without migration.
  let noteSelection = null;
  function marker(done = false) {
    const e = document.createElement('span'); e.className = 'inline-task';
    e.contentEditable = 'false'; e.dataset.task = crypto.randomUUID();
    e.dataset.done = String(done); e.setAttribute('role', 'checkbox');
    e.setAttribute('aria-checked', String(done)); e.setAttribute('tabindex', '0');
    e.setAttribute('aria-label', 'Tarefa concluída'); e.textContent = '✓'; return e;
  }
  function editorTokens(root = $('blocks')) {
    const tokens = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { tokens.push(node.nodeValue.replace(/\u200b/g, '')); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches('[data-task]')) { tokens.push({ done: node.dataset.done === 'true', id: node.dataset.task }); return; }
      if (node.tagName === 'BR') { if (node.parentElement.childNodes.length !== 1 || node.parentElement === root) tokens.push('\n'); return; }
      const line = /^(DIV|P|LI)$/.test(node.tagName);
      if (line && (tokens.length || node.previousSibling)) tokens.push('\n');
      for (const child of node.childNodes) walk(child);
    }
    for (const child of root.childNodes) walk(child);
    return tokens;
  }
  function readEditor() {
    const blocks = []; let current = { id: crypto.randomUUID(), type: 'text', text: '', inline: true };
    const flush = () => { if (current.text || current.type === 'task') blocks.push(current); };
    for (const token of editorTokens()) {
      if (typeof token !== 'string') { flush(); current = { id: crypto.randomUUID(), type: 'task', text: '', done: token.done, inline: true }; }
      else if (current.type === 'task' && token.includes('\n')) {
        const at = token.indexOf('\n'); current.text += token.slice(0, at); flush();
        current = { id: crypto.randomUUID(), type: 'text', text: token.slice(at), inline: true };
      } else current.text += token;
    }
    flush();
    return blocks.length ? blocks : [{ id: crypto.randomUUID(), type: 'text', text: '', inline: true }];
  }
  function captureSelection() {
    const selection = getSelection();
    if (selection.rangeCount && $('blocks').contains(selection.anchorNode) && $('blocks').contains(selection.focusNode)) noteSelection = selection.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    $('blocks').focus(); const selection = getSelection(); selection.removeAllRanges();
    if (noteSelection && $('blocks').contains(noteSelection.startContainer)) selection.addRange(noteSelection);
    else { const range = document.createRange(); range.selectNodeContents($('blocks')); range.collapse(false); selection.addRange(range); }
  }
  function syncEditor() { if (!state.page) return; state.page.blocks = readEditor(); changed(); captureSelection(); }
  function renderEditor() {
    const exists = !!state.page; $('note').hidden = !exists; $('note-toolbar').hidden = !exists; $('empty-editor').hidden = exists; $('conflict-banner').hidden = !state.conflict;
    noteSelection = null; $('blocks').replaceChildren();
    if (!exists) { $('note-title').value = ''; stats(); return; }
    $('note-title').value = state.page.title; requestAnimationFrame(() => resize($('note-title')));
    $('note-date').textContent = new Date(state.page.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
    state.page.blocks.forEach((block, index) => {
      if (index && !block.inline) $('blocks').append(document.createTextNode('\n'));
      if (block.type === 'task') $('blocks').append(marker(block.done));
      $('blocks').append(document.createTextNode(block.text));
    }); stats(); syncControls();
  }
  function insertTask() {
    if (!state.page) return;
    if (state.page.blocks.length >= 499) return toast('Esta página atingiu o limite de tarefas.');
    restoreSelection();
    // Static, generated marker only; execCommand keeps insertion in native undo history.
    const e = marker(); document.execCommand('insertHTML', false, e.outerHTML + '&#8203;');
    syncEditor();
  }
  async function save() {
    clearTimeout(state.timer);
    if (!state.page || !state.dirty) return true;
    if (state.conflict) return false;
    if (state.saving) { await state.saving; return state.dirty && !state.conflict ? save() : !state.dirty; }
    const id = state.page.id, serial = state.serial, payload = structuredClone({ title: state.page.title, blocks: state.page.blocks, revision: state.page.revision });
    status('saving', 'A guardar…');
    state.saving = (async () => {
      try {
        const result = await api('pages/' + id, { method: 'PATCH', data: payload });
        if (state.page?.id !== id) return false;
        state.page.revision = result.revision; state.page.updated_at = result.updated_at;
        const summary = state.tree.pages.find(p => p.id === id); if (summary) Object.assign(summary, { title: state.page.title || 'Sem título', revision: result.revision, updated_at: result.updated_at });
        if (state.serial === serial) { state.dirty = false; forgetDraft(id); status('saved', 'Guardado'); $('save-detail').textContent = 'Guardado às ' + new Date(result.updated_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false }); }
        else { rememberDraft(); state.timer = setTimeout(() => save(), 150); }
        renderLists(); return !state.dirty;
      } catch (error) {
        rememberDraft();
        if (error.status === 409) { state.conflict = true; $('conflict-banner').hidden = false; status('conflict', 'Alteração na equipa'); }
        else { status('error', error.status === 401 ? 'Sessão terminada' : 'Por guardar — tentar novamente'); $('save-detail').textContent = error.message; }
        return false;
      } finally { state.saving = null; }
    })();
    return state.saving;
  }
  async function canLeave() { await save(); if (state.dirty) { rememberDraft(); return confirm('Existem alterações por guardar. Continuam guardadas temporariamente neste separador. Queres mudar de página?'); } return true; }
  async function openPage(id, { force = false } = {}) {
    if (!force && state.page?.id === id) { setView('editor'); return; }
    if (!force && !(await canLeave())) return;
    const previous = state.page;
    try {
      const page = await api('pages/' + id); state.page = page; state.dirty = false; state.conflict = false; state.serial = 0;
      state.section = page.section_id; state.folder = state.tree.sections.find(s => s.id === page.section_id)?.folder_id || state.folder;
      let recovered;
      try { recovered = JSON.parse(sessionStorage.getItem(draftKey(id))); } catch {}
      if (recovered && Array.isArray(recovered.blocks)) {
        state.page.title = recovered.title; state.page.blocks = recovered.blocks; state.dirty = true;
        state.conflict = recovered.revision !== page.revision;
        if (state.conflict) status('conflict', 'Rascunho local por comparar');
        else { toast('Recuperámos alterações que ainda não estavam guardadas.'); state.timer = setTimeout(() => save(), 1000); status('pending', 'A recuperar…'); }
      } else { status('saved', 'Guardado'); $('save-detail').textContent = 'Só os membros deste espaço têm acesso.'; }
      renderLists(); renderEditor(); setView('editor');
    } catch (error) { state.page = previous; toast(error.message); }
  }
  async function select(kind, id) {
    if (kind === 'pages') return openPage(id);
    if (!(await canLeave())) return;
    state.page = null; state.dirty = false; state.conflict = false;
    if (kind === 'folders') {
      state.folder = id; state.section = state.tree.sections.find(s => s.folder_id === id)?.id || null;
    } else { state.section = id; }
    state.query = ''; $('page-search').value = ''; renderLists(); renderEditor();
    setView(kind === 'folders' ? 'sections' : 'pages'); status('saved', 'Pronto');
  }
  async function refreshTree() { state.tree = await api('tree'); renderLists(); }
  function nameDialog(kind, item) {
    if ((kind === 'sections' && !state.folder) || (kind === 'pages' && !state.section)) return toast('Escolhe primeiro ' + (kind === 'sections' ? 'uma pasta.' : 'um separador.'));
    state.editing = { kind, item }; $('name-heading').textContent = (item ? 'Editar ' : 'Nova ') + labels[kind];
    if (kind === 'sections') $('name-heading').textContent = item ? 'Editar separador' : 'Novo separador';
    $('name-input').value = item?.title || ''; $('name-error').textContent = ''; $('name-submit').textContent = item ? 'Guardar' : 'Criar'; $('name-submit').disabled = false;
    $('name-dialog').showModal(); $('name-input').focus(); $('name-input').select();
  }
  async function submitName(event) {
    event.preventDefault(); const { kind, item } = state.editing, value = $('name-input').value.trim(); if (!value) return;
    $('name-submit').disabled = true; $('name-error').textContent = '';
    try {
      if (item) {
        if (kind === 'pages') {
          if (state.page?.id !== item.id) { if (!(await canLeave())) return; await openPage(item.id); }
          if (state.page?.id !== item.id) throw new Error('Não foi possível abrir a página.');
          state.page.title = value; $('note-title').value = value; changed(); if (!(await save())) throw new Error('O nome ainda não foi guardado.');
        } else await api(kind + '/' + item.id, { method: 'PATCH', data: { title: value } });
      } else {
        if (!(await canLeave())) return;
        const result = await api(kind, { method: 'POST', data: { title: value, parentId: kind === 'sections' ? state.folder : state.section } });
        await refreshTree();
        if (kind === 'pages') await openPage(result.id);
        else await select(kind, result.id);
      }
      await refreshTree(); $('name-dialog').close();
    } catch (error) { $('name-error').textContent = error.message; }
    finally { $('name-submit').disabled = false; }
  }
  function itemOptions(kind, item) { state.action = { kind, item }; $('item-title').textContent = item.title; $('item-dialog').showModal(); }
  async function trashItem() {
    const { kind, item } = state.action;
    if (!(await canLeave())) return;
    if (!confirm(`Mover “${item.title}” para o lixo?${kind !== 'pages' ? ' O conteúdo dentro fica oculto até restaurares este elemento.' : ''}`)) return;
    try {
      await api(kind + '/' + item.id, { method: 'DELETE' }); $('item-dialog').close();
      // Clear selections only if their parent was removed; never carry an editor into another parent.
      state.page = null; state.dirty = false; state.conflict = false;
      await refreshTree();
      if (!state.tree.folders.some(f => f.id === state.folder)) state.folder = state.tree.folders[0]?.id || null;
      if (!state.tree.sections.some(s => s.id === state.section)) state.section = state.tree.sections.find(s => s.folder_id === state.folder)?.id || null;
      renderLists(); renderEditor(); setView(kind === 'folders' ? 'folders' : kind === 'sections' ? 'sections' : 'pages'); toast('Movido para o lixo. Podes restaurar quando quiseres.'); status('saved', 'Pronto');
    } catch (error) { toast(error.message); }
  }
  async function showTrash() {
    try {
      const { items } = await api('trash'); const list = $('trash-list'); list.replaceChildren();
      if (!items.length) emptyList(list, 'O lixo está vazio', 'As ideias que removeres podem ser restauradas aqui.');
      for (const item of items) {
        const row = document.createElement('div'); row.className = 'trash-entry'; const wrap = document.createElement('div'); const label = document.createElement('strong'); label.textContent = item.title; const type = document.createElement('small'); type.textContent = labels[item.type]; wrap.append(label, type);
        const button = document.createElement('button'); button.textContent = 'Restaurar'; button.addEventListener('click', async () => { button.disabled = true; try { await api(item.type + '/' + item.id + '/restore', { method: 'POST', data: {} }); await refreshTree(); await showTrash(); toast('Restaurado.'); } catch { toast('Restaura primeiro a pasta e o separador onde este elemento estava.'); button.disabled = false; } }); row.append(wrap, button); list.append(row);
      }
      if (!$('trash-dialog').open) $('trash-dialog').showModal();
    } catch (error) { toast(error.message); }
  }
  async function boot() {
    if (booting) return; booting = true;
    try {
      await refreshTree(); $('session-gate').hidden = true;
      state.folder = state.tree.folders[0]?.id || null; state.section = state.tree.sections.find(s => s.folder_id === state.folder)?.id || null;
      renderLists(); renderEditor(); status('saved', 'Pronto'); setView('folders');
      const first = state.tree.pages.find(p => p.section_id === state.section); if (first) { await openPage(first.id); if (innerWidth <= 850) setView('folders'); }
    } catch (error) { status('error', error.message); if (error.status !== 401) { toast(error.message); $('session-gate').hidden = false; } }
    finally { booting = false; }
  }
  $('note-title').addEventListener('input', () => { if (!state.page) return; state.page.title = $('note-title').value.replace(/\n/g, ' '); resize($('note-title')); changed(); renderLists(); });
  $('page-search').addEventListener('input', () => { state.query = $('page-search').value; renderLists(); });
  for (const id of ['add-text', 'add-task']) $(id).addEventListener('mousedown', e => e.preventDefault());
  $('add-task').addEventListener('click', insertTask);
  $('add-text').addEventListener('click', () => {
    if (!state.page) return; restoreSelection();
    const range = getSelection().getRangeAt(0), caret = range.cloneRange();
    let task = null;
    for (const candidate of $('blocks').querySelectorAll('[data-task]')) {
      const after = document.createRange(); after.setStartAfter(candidate); after.collapse(true);
      if (after.compareBoundaryPoints(Range.START_TO_START, range) > 0) break;
      const between = document.createRange(); between.setStartAfter(candidate); between.setEnd(range.startContainer, range.startOffset);
      if (!editorTokens(between.cloneContents()).some(t => typeof t === 'string' && t.includes('\n'))) task = candidate;
    }
    if (task) {
      const remove = document.createRange(); remove.selectNode(task); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(remove);
      document.execCommand('delete'); selection.removeAllRanges(); selection.addRange(caret); syncEditor();
    }

  });
  $('blocks').addEventListener('input', syncEditor);
  $('blocks').addEventListener('beforeinput', event => { if (event.inputType.startsWith('format')) event.preventDefault(); });
  $('blocks').addEventListener('keyup', captureSelection);
  $('blocks').addEventListener('mouseup', captureSelection);
  document.addEventListener('selectionchange', captureSelection);
  $('blocks').addEventListener('paste', event => {
    event.preventDefault(); const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text); syncEditor();
  });
  function toggleTask(event) {
    const task = event.target.closest('[data-task]'); if (!task) return;
    event.preventDefault(); task.dataset.done = String(task.dataset.done !== 'true');
    task.setAttribute('aria-checked', task.dataset.done); syncEditor();
  }
  $('blocks').addEventListener('click', toggleTask);
  $('blocks').addEventListener('keydown', event => {
    if (event.target.matches('[data-task]') && [' ', 'Enter'].includes(event.key)) return toggleTask(event);
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const selection = getSelection(); if (!selection.rangeCount || !selection.isCollapsed) return;
    const cursor = selection.getRangeAt(0), before = cursor.cloneRange(); before.selectNodeContents($('blocks')); before.setEnd(cursor.startContainer, cursor.startOffset);
    let active = null;
    for (const token of editorTokens(before.cloneContents())) {
      if (typeof token !== 'string') { active = token; }
      else if (token.includes('\n')) { active = null; }
    }
    if (!active) return;
    event.preventDefault();
    const task = [...$('blocks').querySelectorAll('[data-task]')].find(e => e.dataset.task === active.id);
    const rest = document.createRange(); rest.selectNodeContents($('blocks')); if (task) rest.setStartAfter(task);
    let whole = ''; for (const token of editorTokens(rest.cloneContents())) { if (typeof token !== 'string') break; whole += token; if (token.includes('\n')) { whole = whole.split('\n')[0]; break; } }
    if (!whole.trim()) {
      task?.remove(); document.execCommand('insertText', false, '\n');
    } else document.execCommand('insertHTML', false, '<br>' + marker().outerHTML + '&#8203;');
    syncEditor();
  });
  for (const button of document.querySelectorAll('[data-collapse]')) {
    const key = button.dataset.collapse;
    try { if (localStorage.getItem('postqube-ideas-collapse-' + key) === 'true') document.body.dataset[key + 'Collapsed'] = 'true'; } catch {}
    const update = () => { const collapsed = document.body.dataset[key + 'Collapsed'] === 'true'; button.setAttribute('aria-expanded', String(!collapsed)); button.setAttribute('aria-label', (collapsed ? 'Expandir ' : 'Minimizar ') + labels[key]); button.title = button.getAttribute('aria-label'); };
    update(); button.addEventListener('click', () => {
      const value = String(document.body.dataset[key + 'Collapsed'] !== 'true'); document.body.dataset[key + 'Collapsed'] = value;
      try { localStorage.setItem('postqube-ideas-collapse-' + key, value); } catch {} update();
    });
  }
  // Inherit actual app tokens and font; the native theme control stays in the host header.
  function syncTheme() {
    if (parent === window) return;
    try {
      const host = parent.document.body, css = parent.getComputedStyle(host);
      for (let i = 0; i < css.length; i++) { const name = css[i]; if (name.startsWith('--new-')) document.documentElement.style.setProperty(name, css.getPropertyValue(name)); }
      const shell = parent.document.querySelector('.blurMe.bg-newBgLineColor');
      document.body.style.fontFamily = parent.getComputedStyle(shell || host).fontFamily;
      document.documentElement.dataset.theme = host.classList.contains('light') ? 'light' : 'dark';
    } catch {}
  }
  // Reuse the host's self-hosted font faces, including their original absolute URLs.
  if (parent !== window) {
    try {
      const rules = [];
      for (const sheet of parent.document.styleSheets) {
        try { for (const rule of sheet.cssRules) if (rule.type === CSSRule.FONT_FACE_RULE) rules.push(rule.cssText.replace(/url\(["']?([^"')]+)["']?\)/g, (_, url) => 'url("' + new URL(url, sheet.href || parent.location.href).href + '")')); } catch {}
      }
      const fonts = new CSSStyleSheet(); fonts.replaceSync(rules.join('\n'));
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, fonts];
    } catch {}
  }
  syncTheme();
  if (parent !== window) { try { new MutationObserver(syncTheme).observe(parent.document.body, { attributes: true, attributeFilter: ['class'] }); } catch {} }

  $('note-menu').addEventListener('click', () => state.page && itemOptions('pages', state.page));
  $('start-button').addEventListener('click', () => nameDialog(state.section ? 'pages' : state.folder ? 'sections' : 'folders'));
  $('name-form').addEventListener('submit', submitName);
  $('rename-item').addEventListener('click', () => { $('item-dialog').close(); nameDialog(state.action.kind, state.action.item); });
  $('trash-item').addEventListener('click', trashItem);
  $('trash-button').addEventListener('click', showTrash);
  $('retry-save').addEventListener('click', () => save());
  $('session-retry').addEventListener('click', async () => { if (state.page && state.dirty) { if (await save()) $('session-gate').hidden = true; } else boot(); });
  for (const button of document.querySelectorAll('[data-create]')) button.addEventListener('click', () => nameDialog(button.dataset.create));
  for (const button of document.querySelectorAll('button[data-view]')) button.addEventListener('click', () => setView(button.dataset.view));
  for (const button of document.querySelectorAll('.dialog-close,.dialog-cancel')) button.addEventListener('click', () => button.closest('dialog').close());
  $('conflict-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.page.title + '\n\n' + state.page.blocks.map((b, i) => (i && !b.inline ? '\n' : '') + (b.type === 'task' ? (b.done ? '[x] ' : '[ ] ') : '') + b.text).join('')); toast('Texto copiado.'); } catch { toast('Seleciona e copia o texto no editor.'); } });
  $('conflict-reload').addEventListener('click', async () => { if (!confirm('Abrir a versão mais recente? Copia o teu texto ou guarda-o numa nova página antes de continuar.')) return; const id = state.page.id; forgetDraft(id); state.dirty = false; state.conflict = false; await openPage(id, { force: true }); });
  $('conflict-save-copy').addEventListener('click', async () => {
    try {
      const draft = structuredClone(state.page), copy = await api('pages', { method: 'POST', data: { title: (draft.title || 'Sem título').slice(0, 145) + ' — cópia', parentId: draft.section_id } });
      await api('pages/' + copy.id, { method: 'PATCH', data: { revision: copy.revision, title: copy.title, blocks: draft.blocks } });
      forgetDraft(draft.id); state.dirty = false; state.conflict = false; await refreshTree(); await openPage(copy.id, { force: true }); toast('O teu texto foi guardado numa nova página.');
    } catch (error) { toast(error.message); }
  });
  window.addEventListener('beforeunload', event => { if (state.dirty) { rememberDraft(); event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', () => { if (state.dirty && !state.conflict) save(); });
  window.addEventListener('resize', () => document.querySelectorAll('#blocks textarea,#note-title').forEach(resize));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.dirty && !state.conflict) save(); });
  // Refresh structure when returning; never replace an editor that contains unsaved work.
  window.addEventListener('focus', async () => {
    if (booting || !state.tree.workspaceId) return;
    try {
      const latest = await api('tree');
      if (latest.workspaceId !== state.tree.workspaceId || latest.viewerId !== state.tree.viewerId) { $('session-gate').hidden = false; return; }
      state.tree = latest; renderLists();
      const changedPage = latest.pages.find(p => p.id === state.page?.id);
      if (changedPage && changedPage.revision !== state.page.revision && !state.dirty && !state.saving) await openPage(changedPage.id, { force: true });
    } catch {}
  });
  boot();
})();
