import type { PageSnapshot, StorageShape } from "./types.js";
import { SNAPSHOT_LIMIT } from "./utils.js";

const STORAGE_KEY = "snapshots";

type LegacySnapshot = Partial<PageSnapshot> & { label?: string; tags?: unknown };

function sanitizeSnapshot(raw: LegacySnapshot): PageSnapshot | null {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
    return null;
  }

  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.toLowerCase().trim()).filter(Boolean)
    : [];

  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : raw.label || "Untitled Snapshot",
    tags: Array.from(new Set(tags)),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    pageTitle: typeof raw.pageTitle === "string" ? raw.pageTitle : "Untitled Page",
    url: typeof raw.url === "string" ? raw.url : "",
    origin: typeof raw.origin === "string" ? raw.origin : "",
    path: typeof raw.path === "string" ? raw.path : "/",
    hostname: typeof raw.hostname === "string" ? raw.hostname : "",
    scrollX: typeof raw.scrollX === "number" ? raw.scrollX : 0,
    scrollY: typeof raw.scrollY === "number" ? raw.scrollY : 0,
    domFingerprint: raw.domFingerprint || {
      title: typeof raw.pageTitle === "string" ? raw.pageTitle : "",
      inputCount: 0,
      textareaCount: 0,
      selectCount: 0,
      contentEditableCount: 0
    },
    fields: Array.isArray(raw.fields) ? raw.fields : []
  };
}

export async function loadSnapshots(): Promise<PageSnapshot[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const snapshots = result[STORAGE_KEY];
  if (!Array.isArray(snapshots)) {
    return [];
  }

  return snapshots
    .map((snapshot) => sanitizeSnapshot(snapshot as LegacySnapshot))
    .filter((snapshot): snapshot is PageSnapshot => !!snapshot);
}

export async function saveSnapshots(snapshots: PageSnapshot[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: snapshots });
}

export function dedupeSnapshots(snapshots: PageSnapshot[]): PageSnapshot[] {
  const seen = new Set<string>();
  const deduped: PageSnapshot[] = [];

  for (const snapshot of snapshots.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
    if (!snapshot?.id || seen.has(snapshot.id)) continue;
    seen.add(snapshot.id);
    deduped.push(snapshot);
  }

  return deduped.slice(0, SNAPSHOT_LIMIT);
}

export async function upsertSnapshot(snapshot: PageSnapshot): Promise<PageSnapshot[]> {
  const snapshots = await loadSnapshots();
  const merged = dedupeSnapshots([snapshot, ...snapshots]);
  await saveSnapshots(merged);
  return merged;
}

export async function removeSnapshot(snapshotId: string): Promise<PageSnapshot[]> {
  const snapshots = await loadSnapshots();
  const filtered = snapshots.filter((snapshot) => snapshot.id !== snapshotId);
  const deduped = dedupeSnapshots(filtered);
  await saveSnapshots(deduped);
  return deduped;
}

export async function replaceAllSnapshots(payload: StorageShape): Promise<PageSnapshot[]> {
  const snapshots = dedupeSnapshots(payload.snapshots || []);
  await saveSnapshots(snapshots);
  return snapshots;
}
