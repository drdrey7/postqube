# Upstream provenance

Postqube is an independent adaptation of [Postiz](https://github.com/gitroomhq/postiz-app).
It is not an official Postiz service and does not imply endorsement.

- Baseline: `v2.25.3` / `a5affe62c74e39c1e7ac960d50d8418b807d532c`.
- Original history and LICENSE are preserved. The upstream copyright notice identifies Nevo David.
- Postqube additions: 2026-10-31, André Barroso / Postqube, under AGPL v3 or later consistent with the upstream notice.
- Root package identifiers, internal Postiz names and original source paths remain compatible with upstream.
- Current distribution uses the official upstream Docker image plus the checked-in presentation layer; no Postqube application image is claimed.

## Changes in this release

Original Postqube SVG branding; auth copy; optional company through the normal
registration form; mobile onboarding/button layout; two-channel pending-Instagram
presentation; source/license access; deployment templates and documentation.
No new scheduler, authentication backend, billing engine or AI model was created.

The source for the upstream product is in this repository. Postqube runtime
customizations are under `postqube/`; maintainer helpers under `scripts/postqube/`.
The original README is retained at `docs/postqube/UPSTREAM-README.md`.

Git history may contain upstream authors' existing public contact details and sample
configuration. No live operator environment or private X Dash history was imported.
