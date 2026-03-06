# Page Versioner (Chrome Extension, MV3)

Page Versioner is a **local-first snapshot-and-restore tool** for page forms and editable content.

It lets you save the current tab as a named version and later restore those values on the same site/page family (great for LinkedIn/profile/job-application style workflows).

> Important: this extension is **not** a full browser time machine. It restores form/editable DOM values only.

## Features

- Save current page state as a named version
- List saved versions filtered to current origin + path similarity
- Restore any saved version
- Delete saved versions
- Restore latest version quickly
- Search versions by label
- Export all snapshots as JSON
- Import snapshots from JSON with schema validation + merge/dedupe
- Local storage only (`chrome.storage.local`)
- Optional quick-save keyboard shortcut (`Ctrl/Cmd + Shift + S`)

## Architecture Notes (v1)

### Components

- `manifest.json`
- `src/background.ts` (MV3 service worker)
- `src/popup.html` + `src/popup.ts`
- `src/content/capture.ts` (capture logic injected via `chrome.scripting.executeScript`)
- `src/content/restore.ts` (restore logic injected via `chrome.scripting.executeScript`)
- Shared helpers in `src/shared/*`
- Styling in `styles/popup.css`

### Data model

Snapshots are stored as:

```ts
{
  snapshots: PageSnapshot[]
}
```

Each snapshot includes metadata + captured fields:

- `id`, `label`, `createdAt`
- page details (`pageTitle`, `url`, `origin`, `path`, `hostname`)
- scroll (`scrollX`, `scrollY`)
- `domFingerprint`
- `fields[]` with selector clues and values

### Capture strategy

Captured elements:

- `input` (excluding password/file)
- `textarea`
- `select`
- checkbox/radio checked state
- `[contenteditable="true"]`

Matching clues per field include:

- selector (best effort)
- id/name
- aria-label/placeholder
- label text
- domPath fallback

### Restore strategy

Restore matching priority:

1. saved selector
2. id
3. name
4. aria-label
5. placeholder
6. label text
7. domPath

After applying values, extension dispatches `input` + `change` events and restores scroll position. For SPAs, restore waits briefly (bounded observer up to ~3s) for DOM stabilization.

## Privacy & Security

- Local-only persistence in extension storage
- No analytics, telemetry, or remote backend
- No password value capture
- No file input value capture
- No hidden exfiltration behavior

## Limitations

- Does **not** restore server-side state
- Does **not** restore auth/session state
- Does **not** restore file inputs
- DOM changes between save/restore can reduce match quality
- Cross-origin iframe internals are not captured
- Complex custom editors may restore partially

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Build TypeScript

```bash
npm run build
```

### 3) Load unpacked extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (`FormTimeMachine`)
5. Pin **Page Versioner** from the extensions menu

## Usage

1. Open a form-heavy page (LinkedIn profile edit, job portal form, etc.)
2. Click extension icon
3. Enter version label (optional)
4. Click **Save Version**
5. Later choose **Restore** on a version
6. If URL differs, popup can navigate you to the saved URL first

### LinkedIn workflow tips

- Save before switching tabs/sections in the profile editor
- Restore after LinkedIn route transitions settle
- If layout changed significantly, try restoring from the exact original URL

## Manual Test Checklist

1. Plain HTML form page:
   - Save text inputs + textarea
   - Modify values
   - Restore and verify
2. React SPA form:
   - Save in route A
   - Navigate in-app and back
   - Restore with event-driven updates visible in UI
3. LinkedIn-like profile edit flow:
   - Save editable bio/summary state
   - Restore after SPA navigation
4. Checkbox/select restore:
   - Save checked boxes + select option(s)
   - Change and restore
5. Contenteditable restore:
   - Save editable block text
   - Change and restore
6. URL mismatch handling:
   - Try restoring snapshot while on different path
   - Confirm navigation prompt behavior
7. Export/import:
   - Export JSON
   - Delete a version
   - Import JSON
   - Confirm version returns
8. Blocked page behavior:
   - Open `chrome://extensions`
   - Attempt save
   - Confirm readable error instead of crash

## Permissions

The manifest requests:

- `storage`, `scripting`, `activeTab`, `tabs`, `downloads`
- optional `unlimitedStorage`
- host permissions: `<all_urls>`

These are used for local snapshot persistence, script injection for capture/restore, tab context checks, and JSON export downloads.
