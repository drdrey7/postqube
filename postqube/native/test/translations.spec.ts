import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInstance } from 'i18next';
const languages = ['en', 'he', 'ru', 'zh', 'fr', 'es', 'pt', 'de', 'it', 'ja', 'ko', 'ar', 'tr', 'vi'];
const resources = Object.fromEntries(languages.map(language => [language, { translation: JSON.parse(readFileSync(join(__dirname, '../../../libraries/react-shared-libraries/src/translation/locales', language, 'translation.json'), 'utf8')) }]));
test('every supported native language has complete Ideas keys and intact interpolation', () => {
  const english = resources.en.translation.ideas_ui;
  for (const language of languages) {
    const locale = resources[language].translation;
    expect(typeof locale.ideas).toBe('string');
    expect(Object.keys(locale.ideas_ui).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      expect(locale.ideas_ui[key].trim()).not.toBe('');
      expect((locale.ideas_ui[key].match(/{{[^}]+}}/g) || []).sort()).toEqual((english[key].match(/{{[^}]+}}/g) || []).sort());
    }
  }
});
test('native i18next switches Ideas controls and save states in place', async () => {
  const i18n = createInstance(); await i18n.init({ resources, lng: 'pt', fallbackLng: 'en', interpolation: { escapeValue: false } });
  expect(i18n.t('ideas')).toBe('Ideias'); expect(i18n.t('ideas_ui.Text')).toBe('Texto');
  await i18n.changeLanguage('en');
  expect(i18n.t('ideas')).toBe('Ideas'); expect(i18n.t('ideas_ui.Text')).toBe('Text'); expect(i18n.t('ideas_ui.status_saved')).toBe('Saved');
  await i18n.changeLanguage('de'); expect(i18n.t('ideas_ui.folders')).toBe('Ordner');
  await i18n.changeLanguage('pt'); expect(i18n.t('ideas_ui.status_saved')).toBe('Guardado');
});
