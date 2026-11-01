# Postqube 0.5.0 beta 1 — write first, organize later

Ideas now supports pages at the workspace root, directly inside a folder, or in
optional nested folders. New idea opens a blank page immediately, without a folder
or naming prerequisite. Existing sections and notes keep their original data.

The native desktop view defaults to a page list and editor, with optional collapsible
organization. Mobile uses a list and Back instead of permanent hierarchy tabs.
Adds global title/content search, previews, location labels, sorting, shared pins,
Move and native drag/drop, automatic first-line titles and browser preferences for
resuming work. The same native session, workspace, theme, language and shell remain.

## Validation

- Twelve regression tests and complete native frontend/backend builds passed.
- Private API checks covered root/direct/nested/legacy pages, content search, literal
  wildcard handling, workspace isolation, team sharing, CSRF, revisions, pins,
  self/descendant/concurrent cycle rejection, moves and trash/restoration.
- Browser tests verified quick capture, automatic/manual titles, optional folders,
  movement, search outside the current folder, sorting, pins and restored preferences.
- All 14 language choices updated native controls without replacing the editor or
  changing author text. Calendar ↔ Ideas retained the document, sidebar and header.
- Exact replacement text and line breaks survived successful and simulated-failed
  metadata operations, autosave and reopening. No unhandled promise rejections.
- Fresh-page native pointer drags moved pages and folders without injected handlers.
- Desktop, tablet, 360/390px layouts and both themes were inspected. A reduced visual
  viewport kept the editor and all formatting actions within the keyboard-visible
  area. Responsive title tests verified complete lines after width/panel changes
  and portrait/landscape transitions. Tests used browser emulation, not physical phones.
- The additive database migration only adds a pinned boolean. Transactional
  before/after hashes confirmed existing rows' original fields were unchanged.
- Protected database archives, source snapshots and hashes were verified. This is
  not a claim of a complete off-server restore drill.
- Screenshots use disposable demonstration notes. Test accounts and records were removed.

[Ideas guide](IDEAS.md) ·
[Feature changes](https://github.com/drdrey7/postqube/pull/5) ·
[Responsive title follow-up](https://github.com/drdrey7/postqube/pull/6) ·
[Release metadata](https://github.com/drdrey7/postqube/blob/postqube-0.5.0-beta.1/postqube/release.json)

## Build evidence

- [Native feature build and 12 tests](https://github.com/drdrey7/postqube/actions/runs/41280929231).
- [Responsive title build and regression tests](https://github.com/drdrey7/postqube/actions/runs/41293548215).

The responsive follow-up checked manual and automatic titles at 360, 390, 844,
1024 and 1440px, retaining the same editor, note text and selected title range.
