# FormTime Machine (Chrome Extension, Manifest V3)

FormTime Machine is a local-first Chrome extension for saving and restoring form state on web pages. It captures text fields, textareas, selects, checkbox/radio states, and contenteditable blocks so you can return to earlier drafts quickly.

> FormTime Machine is a page/form snapshot tool, not a full browser history time machine.

## What it does

- Saves a complete form snapshot from the current tab.
- Stores snapshots locally in `chrome.storage.local`.
- Supports snapshot title + comma-separated tags.
- Lets you search and filter by title, domain, page title, and tags.
- Restores saved values with matching fallbacks.
- Exports/imports snapshots as JSON backups.

## Features

- Save snapshot with status states: **Save Version → Saving... → Saved / Failed**.
- Domain-aware cards showing title, hostname, path/URL details, and timestamp.
- Tags normalized to lowercase and deduplicated.
- Restore report with restored/missing/skipped counts and warnings.
- Lightweight delete confirmation flow.
- Backup export file naming: `formtime-machine-backup-YYYY-MM-DD.json`.
- Safe blocked-page handling for unsupported URLs (like `chrome://extensions`).

## Install

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build TypeScript:
   ```bash
   npm run build
   ```

## Load unpacked extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Pin **FormTime Machine** from the extensions menu.

## How to use

1. Open a normal `http://` or `https://` page with form fields.
2. Open the FormTime Machine popup.
3. Fill optional **Title** and **Tags**.
4. Click **Save Version**.
5. Use **Restore** on any snapshot card to apply values back to the page.
6. Use **Export JSON** / **Import JSON** to back up or restore local snapshots.

## Testing on simple forms

- Use any simple page containing `input`, `textarea`, `select`, and `checkbox`.
- Fill values, save a snapshot, change values, then restore.

## Testing on LinkedIn-like pages

- Open a dynamic SPA page with editable profile-like inputs.
- Save a snapshot, navigate/edit, then restore.
- Some custom editors may restore partially; restore summary reports missing fields.

## Limitations

- Not a full browser time machine.
- Cannot restore password values.
- Cannot restore file input values.
- Cannot restore server-side state.
- DOM changes between save/restore can reduce restore accuracy.
- Some custom editors may only partially restore.
- Cross-origin iframe internals are not captured.

## Privacy

- All data stays local in `chrome.storage.local`.
- No analytics, telemetry, or external backend.
- No automatic sync outside your browser profile.

## Permissions explained

- `storage`: save snapshots locally.
- `scripting`: inject capture/restore logic into the active page.
- `activeTab`, `tabs`: read current tab context and target restore.
- `downloads`: export JSON backups.
- `host_permissions: <all_urls>`: allow operation on user-opened web pages.
- `optional_permissions: unlimitedStorage`: optional larger local storage capacity.

## Troubleshooting

- **Save does nothing**: ensure you are on `http(s)` page (not `chrome://` pages).
- **Restore partly works**: page DOM changed; try restoring on the same URL/origin and after page settles.
- **Import fails**: verify JSON contains `{ "snapshots": [] }` structure.
- **No snapshots shown**: clear search/tag filters and retry.

## TESTING (manual test cases)

### TEST CASE 1: SAVE ON SIMPLE FORM PAGE
1. Open a simple HTML form page.
2. Enter values into text input + textarea.
3. Select dropdown value.
4. Check a checkbox.
5. Click **Save Version**.

Expected:
- Button changes to **Saving...** then **Saved**.
- Snapshot stored and appears in list.
- Card shows title, domain, timestamp, and tags.
- Success status message appears.

### TEST CASE 2: RESTORE ON SIMPLE FORM PAGE
1. Modify fields after saving.
2. Click **Restore** on the saved snapshot.

Expected:
- Fields revert to saved values.
- Checkbox/select restore correctly.
- Restore status summary appears.

### TEST CASE 3: CONTENTEDITABLE RESTORE
1. Open a page with a contenteditable region.
2. Type text and save.
3. Change text.
4. Restore snapshot.

Expected:
- Contenteditable text restores correctly.

### TEST CASE 4: TAGS PARSING
1. Save with tags: `LinkedIn, Summary, Draft-1, summary`.

Expected:
- Tags normalize to: `linkedin`, `summary`, `draft-1`.
- Duplicate `summary` removed.
- Tags shown as chips.

### TEST CASE 5: SEARCH/FILTER
1. Save multiple snapshots with different titles/tags/domains.
2. Search by title/domain/tag.

Expected:
- Filtered list updates correctly.

### TEST CASE 6: DELETE SNAPSHOT
1. Delete one snapshot.

Expected:
- Snapshot disappears immediately.
- Storage updates.

### TEST CASE 7: EXPORT / IMPORT
1. Export snapshots JSON.
2. Delete snapshots.
3. Import exported JSON.

Expected:
- Snapshots restored.
- Duplicate IDs skipped.
- Import summary message appears.

### TEST CASE 8: BLOCKED PAGE
1. Open `chrome://extensions`.
2. Open popup.

Expected:
- UI shows page cannot be captured.
- Save button disabled/safe.
- No crash.

### TEST CASE 9: LINKEDIN-LIKE SPA FLOW
1. Open dynamic SPA page with form fields.
2. Enter content and save.
3. Change content.
4. Restore.

Expected:
- Common fields restore.
- Partial failures appear as warnings, not silent failure.

### TEST CASE 10: URL / DOMAIN VISIBILITY
1. Save snapshot on normal website.

Expected:
- Snapshot card clearly shows hostname/domain.
- Card metadata shows path and has URL details.
