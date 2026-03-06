import { dedupeSnapshots, loadSnapshots, saveSnapshots } from "./shared/storage.js";
import { filterSnapshots, formatDateTime, formatTimestamp, isSupportedUrl, normalizeTags, summarizeUrl } from "./shared/utils.js";
const titleInput = document.getElementById("titleInput");
const tagsInput = document.getElementById("tagsInput");
const saveBtn = document.getElementById("saveBtn");
const restoreLatestBtn = document.getElementById("restoreLatestBtn");
const searchInput = document.getElementById("searchInput");
const tagFilterInput = document.getElementById("tagFilterInput");
const availableTags = document.getElementById("availableTags");
const versionsList = document.getElementById("versionsList");
const emptyState = document.getElementById("emptyState");
const statusEl = document.getElementById("status");
const saveStatus = document.getElementById("saveStatus");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const currentPageTitle = document.getElementById("currentPageTitle");
const currentPageDomain = document.getElementById("currentPageDomain");
const currentPageUrl = document.getElementById("currentPageUrl");
const state = {
    snapshots: [],
    filteredSnapshots: [],
    isSaving: false,
    searchQuery: "",
    selectedTag: null
};
async function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
}
function setStatus(type, message) {
    state.status = { type, message };
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
}
function setSaveButtonState(mode) {
    if (mode === "saving") {
        saveBtn.textContent = "Saving...";
        saveBtn.disabled = true;
        return;
    }
    if (mode === "success") {
        saveBtn.textContent = "Saved";
        saveBtn.disabled = false;
        window.setTimeout(() => setSaveButtonState("idle"), 1000);
        return;
    }
    if (mode === "failure") {
        saveBtn.textContent = "Failed";
        saveBtn.disabled = false;
        window.setTimeout(() => setSaveButtonState("idle"), 1200);
        return;
    }
    saveBtn.textContent = "Save Version";
    saveBtn.disabled = state.isSaving || !state.currentTab || !isSupportedUrl(state.currentTab.url);
}
function describeRestoreReport(report) {
    const warningText = report.warnings.length ? ` Warnings: ${report.warnings.slice(0, 2).join("; ")}` : "";
    return `Restore complete: ${report.restoredCount}/${report.totalFields} fields restored (${report.missingCount} missing, ${report.skippedCount} skipped).${warningText}`;
}
function collectFilterTags(snapshots) {
    const tags = new Set();
    snapshots.forEach((snapshot) => snapshot.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort();
}
function renderTagFilterChips() {
    const tags = collectFilterTags(state.snapshots);
    availableTags.innerHTML = "";
    if (!tags.length)
        return;
    for (const tag of tags) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `tag ${state.selectedTag === tag ? "active" : ""}`;
        chip.textContent = tag;
        chip.addEventListener("click", () => {
            state.selectedTag = state.selectedTag === tag ? null : tag;
            tagFilterInput.value = state.selectedTag ?? "";
            applyFiltersAndRender();
        });
        availableTags.append(chip);
    }
}
function createTagPills(tags) {
    const wrapper = document.createElement("div");
    wrapper.className = "tagRow";
    if (!tags.length) {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = "no tags";
        wrapper.append(empty);
        return wrapper;
    }
    tags.forEach((tag) => {
        const el = document.createElement("span");
        el.className = "tag";
        el.textContent = tag;
        wrapper.append(el);
    });
    return wrapper;
}
function renderSnapshots() {
    versionsList.innerHTML = "";
    emptyState.hidden = state.filteredSnapshots.length > 0;
    for (const snapshot of state.filteredSnapshots) {
        const card = document.createElement("article");
        card.className = "snapshotCard";
        const head = document.createElement("div");
        head.className = "snapshotHead";
        const left = document.createElement("div");
        left.innerHTML = `
      <div class="snapshotTitle">${snapshot.title}</div>
      <div class="snapshotMeta">${snapshot.hostname} · ${formatTimestamp(snapshot.createdAt)}</div>
      <div class="snapshotMeta" title="${snapshot.url}">${snapshot.path || "/"} · ${snapshot.fields.length} fields</div>
    `;
        const right = document.createElement("div");
        right.className = "snapshotMeta";
        right.textContent = formatDateTime(snapshot.createdAt);
        head.append(left, right);
        const tags = createTagPills(snapshot.tags);
        const controls = document.createElement("div");
        controls.className = "controls";
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "ghost";
        const restoring = state.activeRestoreId === snapshot.id;
        restoreBtn.textContent = restoring ? "Restoring..." : "Restore";
        restoreBtn.disabled = restoring || state.isSaving;
        restoreBtn.addEventListener("click", () => void handleRestore(snapshot));
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "ghost";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => void handleDelete(snapshot.id));
        controls.append(restoreBtn, deleteBtn);
        if (state.currentTab && state.currentTab.origin === snapshot.origin && state.currentTab.url !== snapshot.url) {
            const warn = document.createElement("p");
            warn.className = "warn";
            warn.textContent = "URL differs from where this snapshot was saved. Restore may be partial.";
            card.append(head, tags, warn, controls);
        }
        else {
            card.append(head, tags, controls);
        }
        versionsList.append(card);
    }
}
function applyFiltersAndRender() {
    state.filteredSnapshots = filterSnapshots(state.snapshots, state.currentTab ? { hostname: state.currentTab.hostname, path: state.currentTab.path } : undefined, state.searchQuery, state.selectedTag);
    renderTagFilterChips();
    renderSnapshots();
}
async function refreshSnapshots() {
    const response = await sendMessage({ type: "LIST_SNAPSHOTS" });
    if (!response.ok) {
        setStatus("error", response.error);
        return;
    }
    state.snapshots = dedupeSnapshots(response.data);
    applyFiltersAndRender();
}
function updateCurrentPageCard(tab) {
    currentPageTitle.textContent = tab.title;
    currentPageDomain.textContent = tab.hostname;
    currentPageUrl.textContent = summarizeUrl(tab.url);
}
async function handleSave() {
    if (!state.currentTab)
        return;
    if (!isSupportedUrl(state.currentTab.url)) {
        setStatus("warning", "This page cannot be captured by Chrome extensions.");
        return;
    }
    state.isSaving = true;
    setSaveButtonState("saving");
    saveStatus.className = "inlineStatus info";
    saveStatus.textContent = "Saving snapshot...";
    try {
        const tags = normalizeTags(tagsInput.value);
        const title = titleInput.value.trim() || state.currentTab.title || "Untitled Snapshot";
        const response = await sendMessage({
            type: "SAVE_SNAPSHOT",
            tabId: state.currentTab.tabId,
            title,
            tags
        });
        if (!response.ok) {
            throw new Error(response.error);
        }
        await refreshSnapshots();
        saveStatus.className = "inlineStatus success";
        saveStatus.textContent = "Snapshot saved.";
        setStatus("success", `Saved “${title}” on ${response.data.hostname}.`);
        titleInput.value = "";
        setSaveButtonState("success");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save snapshot.";
        saveStatus.className = "inlineStatus error";
        saveStatus.textContent = message;
        setStatus("error", message);
        setSaveButtonState("failure");
    }
    finally {
        state.isSaving = false;
        window.setTimeout(() => setSaveButtonState("idle"), 20);
    }
}
async function handleRestore(snapshot) {
    if (!state.currentTab)
        return;
    if (snapshot.origin !== state.currentTab.origin) {
        setStatus("warning", "Snapshot origin does not match the current page origin.");
        return;
    }
    state.activeRestoreId = snapshot.id;
    renderSnapshots();
    try {
        const response = await sendMessage({
            type: "RESTORE_SNAPSHOT",
            tabId: state.currentTab.tabId,
            snapshot
        });
        if (!response.ok) {
            throw new Error(response.error);
        }
        setStatus("success", describeRestoreReport(response.data));
    }
    catch (error) {
        setStatus("error", error instanceof Error ? error.message : "Restore failed.");
    }
    finally {
        state.activeRestoreId = undefined;
        renderSnapshots();
    }
}
async function handleDelete(snapshotId) {
    const shouldDelete = window.confirm("Delete this snapshot?");
    if (!shouldDelete)
        return;
    const response = await sendMessage({ type: "DELETE_SNAPSHOT", snapshotId });
    if (!response.ok) {
        setStatus("error", response.error);
        return;
    }
    state.snapshots = response.data;
    applyFiltersAndRender();
    setStatus("success", "Snapshot deleted.");
}
async function handleRestoreLatest() {
    if (!state.filteredSnapshots.length) {
        setStatus("warning", "No snapshots available to restore.");
        return;
    }
    await handleRestore(state.filteredSnapshots[0]);
}
async function handleExport() {
    setStatus("info", "Exporting snapshots...");
    const snapshots = await loadSnapshots();
    const payload = JSON.stringify({ snapshots }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    await chrome.downloads.download({
        url,
        filename: `formtime-machine-backup-${date}.json`,
        saveAs: true
    });
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    setStatus("success", "Export started.");
}
function isSnapshotLike(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const snapshot = value;
    return (typeof snapshot.id === "string" &&
        (typeof snapshot.title === "string" || typeof snapshot.label === "string") &&
        typeof snapshot.createdAt === "string" &&
        typeof snapshot.url === "string" &&
        Array.isArray(snapshot.fields));
}
async function handleImport(file) {
    setStatus("info", "Importing snapshots...");
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.snapshots)) {
        throw new Error("Invalid import JSON: snapshots array missing.");
    }
    const incoming = parsed.snapshots.filter(isSnapshotLike);
    const existing = await loadSnapshots();
    const merged = dedupeSnapshots([...incoming, ...existing]);
    await saveSnapshots(merged);
    state.snapshots = merged;
    applyFiltersAndRender();
    const duplicateCount = incoming.length + existing.length - merged.length;
    setStatus("success", `Imported ${incoming.length} snapshots (${duplicateCount} duplicates skipped).`);
}
async function init() {
    try {
        const response = await sendMessage({ type: "GET_ACTIVE_CONTEXT" });
        if (!response.ok) {
            throw new Error(response.error);
        }
        state.currentTab = response.data;
        updateCurrentPageCard(response.data);
        if (!isSupportedUrl(response.data.url)) {
            saveBtn.disabled = true;
            saveStatus.className = "inlineStatus warning";
            saveStatus.textContent = "This page cannot be captured by Chrome extensions.";
            setStatus("warning", "Unsupported page. Use an http(s) website.");
        }
        await refreshSnapshots();
    }
    catch (error) {
        setStatus("error", error instanceof Error ? error.message : "Failed to initialize popup.");
        currentPageTitle.textContent = "Could not load current tab";
        saveBtn.disabled = true;
    }
    setSaveButtonState("idle");
}
saveBtn.addEventListener("click", () => void handleSave());
restoreLatestBtn.addEventListener("click", () => void handleRestoreLatest());
exportBtn.addEventListener("click", () => void handleExport());
searchInput.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    applyFiltersAndRender();
});
tagFilterInput.addEventListener("input", () => {
    const value = tagFilterInput.value.trim().toLowerCase();
    state.selectedTag = value || null;
    applyFiltersAndRender();
});
importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (!file)
        return;
    void handleImport(file).catch((error) => {
        setStatus("error", error instanceof Error ? error.message : "Import failed.");
    });
});
void init();
