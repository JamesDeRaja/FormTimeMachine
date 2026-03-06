import type { PageSnapshot } from "./types.js";

export const SNAPSHOT_LIMIT = 200;

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSupportedUrl(url: string): boolean {
  return /^(https?:\/\/)/.test(url);
}

export function normalizeTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const token of raw.split(",")) {
    const normalized = token.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }

  return tags;
}

export function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleString();
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? isoDate : date.toLocaleString();
}

export function pathSimilarity(a: string, b: string): number {
  const aParts = a.split("/").filter(Boolean);
  const bParts = b.split("/").filter(Boolean);
  if (!aParts.length && !bParts.length) return 1;

  let shared = 0;
  const size = Math.min(aParts.length, bParts.length);
  for (let i = 0; i < size; i += 1) {
    if (aParts[i] !== bParts[i]) break;
    shared += 1;
  }

  const denom = Math.max(aParts.length, bParts.length, 1);
  return shared / denom;
}

export function summarizeUrl(url: string): string {
  if (url.length <= 70) return url;
  return `${url.slice(0, 67)}…`;
}

export function filterSnapshots(
  snapshots: PageSnapshot[],
  context: { hostname: string; path: string } | undefined,
  query: string,
  selectedTag: string | null | undefined
): PageSnapshot[] {
  const normalizedQuery = query.trim().toLowerCase();

  const ranked = snapshots
    .map((snapshot) => ({
      snapshot,
      rank:
        context && snapshot.hostname === context.hostname
          ? 2 + pathSimilarity(snapshot.path, context.path)
          : 0
    }))
    .sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return +new Date(b.snapshot.createdAt) - +new Date(a.snapshot.createdAt);
    })
    .map((item) => item.snapshot);

  return ranked.filter((snapshot) => {
    const matchesQuery =
      !normalizedQuery ||
      snapshot.title.toLowerCase().includes(normalizedQuery) ||
      snapshot.hostname.toLowerCase().includes(normalizedQuery) ||
      snapshot.pageTitle.toLowerCase().includes(normalizedQuery) ||
      snapshot.tags.some((tag) => tag.includes(normalizedQuery));

    const matchesTag = !selectedTag || snapshot.tags.includes(selectedTag);
    return matchesQuery && matchesTag;
  });
}
