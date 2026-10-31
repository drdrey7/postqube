# Ideias — shared workspace notes

Postqube-specific functionality, available through Ideas in the native application
menu. /ideas/ opens /launches?view=ideas inside the original app shell. It does not
publish posts. The sidebar, header, workspace switcher, theme and notification
controls remain native; the note surface inherits their actual colors and font.

![Ideas desktop in a disposable demonstration workspace](assets/ideas-desktop.png)

![Native light theme with independently minimized columns](assets/ideas-light-collapsed.png)

![Ideas mobile editor with circular task checkboxes](assets/ideas-mobile.png)

Screenshots use disposable demonstration content, never customer notes.

## Organize from left to right

Folders → Sections → Pages → Editor. Use + in each column to create an item, then
select it to continue. A page has one continuous text surface, without separate fields or add-block
buttons. Place the cursor before a word and click Tarefa to insert a circular
checkbox exactly there. Click a circle to complete/reopen the task. Enter inside a
task continues the checklist; an empty task exits it. Shift+Enter inserts a line.
Texto normal removes the task marker from the current line. Paste inserts plain
text, preserving line breaks. Native undo/redo applies to text and marker insertion.

Each organizing column can be minimized independently through its top chevron.
Click its vertical label to reopen it. The choice is saved in the browser.

On mobile, the bottom navigation switches between the four levels rather than
squeezing four narrow columns onto the screen. Rename items through their ⋯ menu.
Trash hides an item and its descendants; it can be restored from the trash panel.
Restore parents before children where necessary. No permanent-delete UI is provided.

## Teams and privacy

Ideas belong to the current native Postiz workspace, not one user. Every active
member of that workspace can read/edit them, including ordinary team members.
Different workspaces are isolated. Add people through /settings?tab=teams; the
existing invitation flow still depends on email setup. This feature does not bypass
invitation delivery, invent new roles or grant global administration.

Every API request verifies the existing session and current workspace through
native /api/user/self. The browser cannot choose a different organization in an
Ideas payload. The service never reads the Postiz DB or receives a JWT signing key.

## Saving and simultaneous edits

Autosave runs shortly after typing. Wait for Guardado before closing. Network or
session failures leave text in the editor and a tab-local recovery draft. This is
not a substitute for backups. Shared devices should not retain open signed-in tabs.
A stale revision is rejected with 409: the editor keeps the local text and offers
copy, save as a new page, or open the current server version. No silent last-writer
wins and no real-time collaborative cursor editing are claimed.

## Deployment and backup

The editor is embedded from /ideas/editor/ into the native shell. The separate
service verifies the same native session on every data request. No duplicate shell
controls or theme preference are maintained.

Service source: postqube/ideas, Node 22.23.4 with built-in SQLite; no npm runtime
dependencies. The official Postiz image remains unchanged. Mount /data persistently,
run non-root and expose only 127.0.0.1:4018 behind the same HTTPS origin.
Set PUBLIC_URL and POSTIZ_NETWORK to match the deployment. Keep native cookie
scope correct; do not enable a test authentication bypass.

Copy the folder to /opt/postqube/ideas, create /var/lib/postqube-ideas owned by
container UID/GID 1000, then run its Compose file with PUBLIC_URL set. Add the
/ideas Nginx routes from postqube/deploy/site.conf.example and verify nginx -t.

For a consistent backup, execute backup.mjs inside the service with a new absolute
filename under /data. It uses SQLite VACUUM INTO, so committed WAL data is included.
Protect and copy that snapshot into the regular encrypted/off-server backup set;
restore into an isolated test service before trusting recovery. Do not copy only
ideas.sqlite while WAL writes are active. Include this source version/config.

Tests: node --test postqube/ideas/test/ideas.test.mjs covers persistence, shared
workspace access, cross-workspace denial, validation, revision conflicts, trash
and consistent backup. UI checks additionally exercise actual native sessions.

Retention/account deletion: workspace Ideas are a separate persistent store.
Deleting a native Postiz account does not automatically erase shared Ideas or its
workspace's archive. Final operator privacy/deletion procedure must cover this
store and backup retention before commercial launch.
