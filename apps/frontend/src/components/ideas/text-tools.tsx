'use client';

import { useEffect, useRef, useState } from 'react';
import { IDEA_FONTS, IDEA_HIGHLIGHTS, IDEA_TEXT_COLORS, IdeaMarks } from '@gitroom/helpers/ideas/text-format';
import { useT, useTranslationSettings } from '@gitroom/react/translation/get.transation.service.client';
import { TextCommand } from './note-editor';

export function TextTools({ marks, format, normalText }: { marks: IdeaMarks; format: (command: TextCommand, value?: string) => void; normalText: () => void }) {
  const t = useT();
  const label = (key: string) => t('ideas_ui.' + key);
  const [open, setOpen] = useState(false), menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !menu.current?.contains(e.target)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const buttons: { command: TextCommand; label: string; icon: string; className: string; active?: boolean }[] = [
    { command: 'bold', label: label('bold'), icon: 'B', className: 'format-bold', active: marks.bold },
    { command: 'italic', label: label('italic'), icon: 'I', className: 'format-italic', active: marks.italic },
    { command: 'underline', label: label('underline'), icon: 'U', className: 'format-underline', active: marks.underline },
    { command: 'strike', label: label('strike'), icon: 'S', className: 'format-strike', active: marks.strike },
  ];
  return <div className="text-tools" ref={menu}>
    <button ref={trigger} type="button" className={'toolbar-button' + (open ? ' format-open' : '')} aria-haspopup="dialog" aria-expanded={open} aria-controls="ideas-text-menu" onMouseDown={e => e.preventDefault()} onClick={() => setOpen(v => !v)}><span className="text-icon" aria-hidden>T</span>{label('Text')}<svg aria-hidden width="12" height="12" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    {open && <div id="ideas-text-menu" className="text-menu" role="dialog" aria-label={label('format')}>
      <div className="text-menu-heading"><span>{label('format_title')}</span><button type="button" aria-label={label('close_format')} onClick={() => setOpen(false)}>×</button></div>
      <div className="font-controls">
        <label>{label('font')}<select aria-label={label('font')} value={marks.font || 'native'} onChange={e => format('font', e.target.value)}><option value="native">{label('default')}</option>{Object.entries(IDEA_FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></label>
        <label>{label('size')}<select aria-label={label('text_size')} value={marks.size || ''} onChange={e => format('size', e.target.value || 'default')}><option value="">Auto</option>{[10, 12, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48].map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
      </div>
      <div className="format-buttons" role="group" aria-label={label('styles')}>{buttons.map(b => <button key={b.command} type="button" className={b.className} title={b.label} aria-label={b.label} aria-pressed={!!b.active} onMouseDown={e => e.preventDefault()} onClick={() => format(b.command)}>{b.icon}</button>)}</div>
      <div className="color-section"><span>{label('highlight')}</span><div className="format-swatches" role="group" aria-label={label('highlight_color')}>{IDEA_HIGHLIGHTS.map((color, index) => <button key={color} type="button" title={label(['yellow', 'green', 'blue', 'pink', 'orange', 'violet'][index])} aria-label={label('highlight') + ': ' + label(['yellow', 'green', 'blue', 'pink', 'orange', 'violet'][index])} aria-pressed={marks.highlight === color} style={{ backgroundColor: color }} onMouseDown={e => e.preventDefault()} onClick={() => format('highlight', color)} />)}<button className="no-highlight" type="button" title={label('no_highlight')} aria-label={label('no_highlight')} onMouseDown={e => e.preventDefault()} onClick={() => format('highlight', 'clear')}>∅</button></div></div>
      <div className="color-section"><span>{label('text_color')}</span><div className="format-swatches" role="group" aria-label={label('text_color')}>{IDEA_TEXT_COLORS.map((color, index) => <button key={color} type="button" aria-label={label('Text') + ': ' + label(['black', 'white', 'red', 'orange', 'green', 'blue', 'violet', 'pink'][index])} title={label(['black', 'white', 'red', 'orange', 'green', 'blue', 'violet', 'pink'][index])} aria-pressed={marks.color === color} style={{ backgroundColor: color }} onMouseDown={e => e.preventDefault()} onClick={() => format('color', color)} />)}</div></div>
      <div className="text-menu-actions"><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => format('clear')}>{label('clear')}</button><div><button type="button" aria-label={label('undo')} title={label('undo')} onMouseDown={e => e.preventDefault()} onClick={() => format('undo')}>↶</button><button type="button" aria-label={label('redo')} title={label('redo')} onMouseDown={e => e.preventDefault()} onClick={() => format('redo')}>↷</button></div></div>
      <button type="button" className="plain-text-action" onMouseDown={e => e.preventDefault()} onClick={normalText}>{label('remove_task')}</button>
    </div>}
  </div>;
}
