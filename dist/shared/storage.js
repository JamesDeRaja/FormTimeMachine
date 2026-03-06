import { SNAPSHOT_LIMIT } from "./utils";
const STORAGE_KEY = "snapshots";
export async function loadSnapshots() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const snapshots = result[STORAGE_KEY];
    if (!Array.isArray(snapshots)) {
        return [];
    }
    return snapshots;
}
export async function saveSnapshots(snapshots) {
    await chrome.storage.local.set({ [STORAGE_KEY]: snapshots });
}
export function dedupeSnapshots(snapshots) {
    const seen = new Set();
    const deduped = [];
    for (const snapshot of snapshots.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
        if (!snapshot?.id || seen.has(snapshot.id))
            continue;
        seen.add(snapshot.id);
        deduped.push(snapshot);
    }
    return deduped.slice(0, SNAPSHOT_LIMIT);
}
export async function upsertSnapshot(snapshot) {
    const snapshots = await loadSnapshots();
    const merged = dedupeSnapshots([snapshot, ...snapshots]);
    await saveSnapshots(merged);
    return merged;
}
export async function removeSnapshot(snapshotId) {
    const snapshots = await loadSnapshots();
    const filtered = snapshots.filter((snapshot) => snapshot.id !== snapshotId);
    const deduped = dedupeSnapshots(filtered);
    await saveSnapshots(deduped);
    return deduped;
}
export async function replaceAllSnapshots(payload) {
    const snapshots = dedupeSnapshots(payload.snapshots || []);
    await saveSnapshots(snapshots);
    return snapshots;
}
