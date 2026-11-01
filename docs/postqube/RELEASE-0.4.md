# Postqube 0.4.0 beta 1 — Ideas formatting and languages

Ideas now responds to the same language selector as the rest of the app. Its menu,
workspace, dates, save states, dialogs and text controls use native i18next resources
for all 14 supported languages. User notes remain unchanged.

Folders and sections have thin colored accents. The Text menu adds fonts, size,
bold, italic, underline, strike, highlight, text color, clear formatting and undo/redo.
Structured text runs persist in existing native PostgreSQL note records. No extra
service or schema migration is required.

## Validation

- Eight regression tests passed; the complete native frontend/backend build and
  route type checking passed on the VPS and in GitHub Actions.
- Browser tests selected all 14 languages through the real language modal. Menu,
  columns and Text labels changed without reloading or replacing the editor.
- Calendar ↔ Ideas preserved the same document, header and sidebar.
- Size changes preserved font/emphasis/highlight; undo/redo, autosave and reopening
  retained formatting. Task insertion at the caret preserved the surrounding text.
- Desktop and mobile at 360/390px, native light/dark themes and dropdown bounds
  were visually inspected. Screenshots contain disposable demonstration content.
- Native API validation rejected unsupported fonts, CSS URL values and mismatched
  formatted text. Existing native authorization/workspace boundaries remain in use.
- Protected database archives and their hashes were verified; native backups include
  the Ideas table and data. This is not a claim of a full off-server restore drill.
- Disposable accounts and test notes were removed after testing.

[Changes and checks](https://github.com/drdrey7/postqube/pull/4) ·
[Native build check](https://github.com/drdrey7/postqube/actions/runs/41274578981) ·
[Ideas guide](IDEAS.md) · [Release metadata](../../postqube/release.json)
