# Official updates

1. Add upstream remote https://github.com/gitroomhq/postiz-app.git.
2. Fetch the desired stable release and read its changelog/security notices.
3. Create a maintenance branch from postqube; merge the selected upstream tag.
4. Resolve conflicts explicitly; retain LICENSE/notices and Postqube changes.
5. Review dependencies, third-party licenses, Compose and database migrations.
6. Test in staging: signup/login, permissions, two-channel picker, media, calendar,
   drafts, scheduling and provider-specific delivery with approved test content.
7. Take a recoverable backup before deployment and tag the exact source release.
8. Record image digest, source tag and changes in postqube/release.json.

Do not overwrite the Postqube branch using GitHub Sync fork without reviewing the
merge. Do not force-push shared history. Selective fixes may depend on other commits.
Security fixes should not be postponed indefinitely for cosmetic preferences.

The legacy helper scripts/postqube/update-official.py operates on /opt/postiz and
updates the official image, not this source repository. It is explicit maintenance,
not automatic deployment. Configure its readiness URL before using it. Future
releases must keep the deployed source link matched to the actual overlay version.
