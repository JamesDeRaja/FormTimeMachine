export const SNAPSHOT_LIMIT = 200;
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function formatDateTime(isoDate) {
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString();
}
export function getPathBucket(path) {
    const parts = path.split("/").filter(Boolean);
    return `/${parts.slice(0, 2).join("/")}` || "/";
}
export function pathSimilarity(a, b) {
    const aParts = a.split("/").filter(Boolean);
    const bParts = b.split("/").filter(Boolean);
    if (!aParts.length && !bParts.length)
        return 1;
    let shared = 0;
    const size = Math.min(aParts.length, bParts.length);
    for (let i = 0; i < size; i += 1) {
        if (aParts[i] !== bParts[i])
            break;
        shared += 1;
    }
    const denom = Math.max(aParts.length, bParts.length, 1);
    return shared / denom;
}
export function summarizeUrl(url) {
    if (url.length <= 80)
        return url;
    return `${url.slice(0, 77)}…`;
}
