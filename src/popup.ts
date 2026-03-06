import { dedupeSnapshots, loadSnapshots, saveSnapshots } from "./shared/storage";
import type { ActivePageContext, PageSnapshot, RestoreReport } from "./shared/types";
import { formatDateTime, pathSimilarity, summarizeUrl } from "./shared/utils";

type RuntimeResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const pageMeta = document.getElementById("pageMeta") as HTMLParagraphElement;
const labelInput = document.getElementById("labelInput") as HTMLInputElement;
const saveBtn = document.getElementById("saveBtn") as HTMLButtonElement;
const restoreLatestBtn = document.getElementById("restoreLatestBtn") as HTMLButtonElement;
const versionsList = document.getElementById("versionsList") as HTMLUListElement;
const emptyState = document.getElementById("emptyState") as HTMLParagraphElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
const importInput = document.getElementById("importInput") as HTMLInputElement;
const searchInput = document.getElementById("searchInput") as HTMLInputElement;

let currentContext: ActivePageContext | null = null;
let currentSnapshots: PageSnapshot[] = [];

async function sendMessage<T>(message: unknown): Promise<RuntimeResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponse<T>>;
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderSnapshots(): void {
  const query = searchInput.value.trim().toLowerCase();
  const snapshots = query
    ? currentSnapshots.filter((snapshot) => snapshot.label.toLowerCase().includes(query))
    : currentSnapshots;

  versionsList.innerHTML = "";
  emptyState.style.display = snapshots.length ? "none" : "block";

  for (const snapshot of snapshots) {
    const li = document.createElement("li");
    li.className = "versionItem";

    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `
      <strong>${snapshot.label}</strong>
      <span>${formatDateTime(snapshot.createdAt)}</span>
      <span class="muted">${snapshot.fields.length} fields</span>
    `;

    const controls = document.createElement("div");
    controls.className = "controls";

    const restoreBtn = document.createElement("button");
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", () => void handleRestore(snapshot));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "danger";
    deleteBtn.addEventListener("click", () => void handleDelete(snapshot.id));

    controls.append(restoreBtn, deleteBtn);
    li.append(info, controls);
    versionsList.append(li);
  }
}

function describeRestoreReport(report: RestoreReport): string {
  const warningText = report.warnings.length ? ` Warnings: ${report.warnings.slice(0, 2).join("; ")}` : "";
  return `Restored ${report.restoredCount}/${report.totalFields}. Missing ${report.missingCount}, skipped ${report.skippedCount}.${warningText}`;
}

async function refreshSnapshots(): Promise<void> {
  if (!currentContext) return;
  const response = await sendMessage<PageSnapshot[]>({
    type: "LIST_SNAPSHOTS",
    context: currentContext
  });

  if (!response.ok) {
    setStatus(response.error, true);
    return;
  }

  currentSnapshots = response.data;
  renderSnapshots();
}

async function init(): Promise<void> {
  const response = await sendMessage<ActivePageContext>({ type: "GET_ACTIVE_CONTEXT" });
  if (!response.ok) {
    setStatus(response.error, true);
    pageMeta.textContent = "Could not read current tab.";
    return;
  }

  currentContext = response.data;
  pageMeta.textContent = `${currentContext.title} — ${summarizeUrl(currentContext.url)}`;
  await refreshSnapshots();
}

async function handleSave(): Promise<void> {
  if (!currentContext) return;
  const label = labelInput.value.trim() || `Version ${new Date().toLocaleString()}`;

  const response = await sendMessage<PageSnapshot>({
    type: "SAVE_SNAPSHOT",
    tabId: currentContext.tabId,
    label
  });

  if (!response.ok) {
    setStatus(response.error, true);
    return;
  }

  setStatus(`Saved “${label}”.`);
  labelInput.value = "";
  await refreshSnapshots();
}

async function handleDelete(snapshotId: string): Promise<void> {
  const response = await sendMessage<PageSnapshot[]>({ type: "DELETE_SNAPSHOT", snapshotId });
  if (!response.ok) {
    setStatus(response.error, true);
    return;
  }

  setStatus("Version deleted.");
  await refreshSnapshots();
}

async function handleRestore(snapshot: PageSnapshot): Promise<void> {
  if (!currentContext) return;
  if (new URL(currentContext.url).origin !== snapshot.origin) {
    setStatus("Snapshot origin does not match current tab origin.", true);
    return;
  }

  if (currentContext.url !== snapshot.url) {
    const shouldNavigate = window.confirm("Current URL differs from saved snapshot URL. Open saved URL first?");
    if (shouldNavigate) {
      await chrome.tabs.update(currentContext.tabId, { url: snapshot.url });
      setStatus("Navigating to saved URL. Re-open popup and restore again.");
      return;
    }
  }

  const response = await sendMessage<RestoreReport>({
    type: "RESTORE_SNAPSHOT",
    tabId: currentContext.tabId,
    snapshot
  });

  if (!response.ok) {
    setStatus(response.error, true);
    return;
  }

  setStatus(describeRestoreReport(response.data));
}

async function handleRestoreLatest(): Promise<void> {
  if (!currentSnapshots.length || !currentContext) {
    setStatus("No snapshots available for this page.", true);
    return;
  }

  const latest = [...currentSnapshots].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  await handleRestore(latest);
}

async function handleExport(): Promise<void> {
  const snapshots = await loadSnapshots();
  const blob = new Blob([JSON.stringify({ snapshots }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename: `page-versioner-export-${Date.now()}.json`,
    saveAs: true
  });

  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus("Export started.");
}

function isSnapshotLike(value: unknown): value is PageSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<PageSnapshot>;
  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.label === "string" &&
    typeof snapshot.createdAt === "string" &&
    typeof snapshot.url === "string" &&
    Array.isArray(snapshot.fields)
  );
}

async function handleImport(file: File): Promise<void> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as { snapshots?: unknown[] };
  if (!Array.isArray(parsed.snapshots)) {
    throw new Error("Invalid import file: snapshots array missing.");
  }

  const incoming = parsed.snapshots.filter(isSnapshotLike);
  const existing = await loadSnapshots();
  const merged = dedupeSnapshots([...incoming, ...existing]);
  await saveSnapshots(merged);

  if (currentContext) {
    const ctx = currentContext;
    currentSnapshots = merged
      .filter((snapshot) => snapshot.origin === ctx.origin)
      .filter((snapshot) => pathSimilarity(snapshot.path, ctx.path) >= 0.3)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  renderSnapshots();
  setStatus(`Imported ${incoming.length} snapshots.`);
}

saveBtn.addEventListener("click", () => void handleSave());
restoreLatestBtn.addEventListener("click", () => void handleRestoreLatest());
exportBtn.addEventListener("click", () => void handleExport());
searchInput.addEventListener("input", () => renderSnapshots());

importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  if (!file) return;

  void handleImport(file).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Import failed.";
    setStatus(message, true);
  });
});

void init();
