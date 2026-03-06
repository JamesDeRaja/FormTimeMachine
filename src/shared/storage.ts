import type { PageSnapshot, StorageShape } from "./types";
import { SNAPSHOT_LIMIT } from "./utils";

const STORAGE_KEY = "snapshots";

export async function loadSnapshots(): Promise<PageSnapshot[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const snapshots = result[STORAGE_KEY];
  if (!Array.isArray(snapshots)) {
    return [];
  }
  return snapshots as PageSnapshot[];
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
