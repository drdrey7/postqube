/** Structured note formatting: text and allowlisted marks, never stored HTML. */
export const IDEA_FONTS = {
  arial: { label: 'Arial', css: 'Arial, sans-serif' },
  georgia: { label: 'Georgia', css: 'Georgia, serif' },
  times: { label: 'Times New Roman', css: '"Times New Roman", serif' },
  verdana: { label: 'Verdana', css: 'Verdana, sans-serif' },
  courier: { label: 'Courier New', css: '"Courier New", monospace' },
  trebuchet: { label: 'Trebuchet MS', css: '"Trebuchet MS", sans-serif' },
} as const;
export type IdeaFont = keyof typeof IDEA_FONTS;
export type IdeaMarks = { bold?: true; italic?: true; underline?: true; strike?: true; font?: IdeaFont; size?: number; color?: string; highlight?: string };
export type IdeaRun = IdeaMarks & { text: string };
export const IDEA_HIGHLIGHTS = ['#ffe066', '#96e6b3', '#9cd4ff', '#ffb3d7', '#ffd19a', '#d6c5ff'];
export const IDEA_TEXT_COLORS = ['#1a1919', '#ffffff', '#dc3545', '#e68619', '#258552', '#246cc0', '#7943ca', '#c13786'];
export function parseIdeaRuns(value: unknown, text: string, invalid: (message: string) => never): IdeaRun[] {
  if (!Array.isArray(value) || value.length > 2000) return invalid('Formatação demasiado extensa.');
  const runs: IdeaRun[] = value.map(v => {
    if (!v || typeof v.text !== 'string') return invalid('Texto formatado inválido.');
    const run: IdeaRun = { text: v.text };
    for (const key of ['bold', 'italic', 'underline', 'strike'] as const) {
      if (v[key] !== undefined && typeof v[key] !== 'boolean') return invalid('Estilo de texto inválido.');
      if (v[key] === true) run[key] = true;
    }
    if (v.font !== undefined) { if (typeof v.font !== 'string' || !Object.prototype.hasOwnProperty.call(IDEA_FONTS, v.font)) return invalid('Tipo de letra inválido.'); run.font = v.font as IdeaFont; }
    if (v.size !== undefined) { if (!Number.isInteger(v.size) || v.size < 8 || v.size > 48) return invalid('O tamanho deve ser entre 8 e 48 px.'); run.size = v.size; }
    for (const key of ['color', 'highlight'] as const) if (v[key] !== undefined) { if (typeof v[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(v[key])) return invalid('Cor inválida.'); run[key] = v[key].toLowerCase(); }
    return run;
  });
  if (runs.map(r => r.text).join('') !== text) return invalid('A formatação não corresponde ao texto da página.');
  return runs;
}
