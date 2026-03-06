import { capturePageSnapshot } from "./content/capture.js";
import { restorePageSnapshot } from "./content/restore.js";
import { loadSnapshots, removeSnapshot, upsertSnapshot } from "./shared/storage.js";
import { generateId, isSupportedUrl } from "./shared/utils.js";
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
        throw new Error("No active tab found.");
    }
    return tab;
}
function toContext(tab) {
    if (!tab.id || !tab.url) {
        throw new Error("Active tab is missing required fields.");
    }
    const url = new URL(tab.url);
    return {
        tabId: tab.id,
        title: tab.title || "Untitled",
        url: tab.url,
        origin: url.origin,
        path: url.pathname,
        hostname: url.hostname
    };
}
async function updateBadgeForTab(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || !isSupportedUrl(tab.url)) {
            await chrome.action.setBadgeText({ tabId, text: "" });
            return;
        }
        const context = toContext(tab);
        const snapshots = await loadSnapshots();
        const relevant = snapshots.filter((snapshot) => snapshot.hostname === context.hostname);
        await chrome.action.setBadgeText({ tabId, text: relevant.length ? String(Math.min(relevant.length, 99)) : "" });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
    }
    catch {
        await chrome.action.setBadgeText({ tabId, text: "" });
    }
}
async function quickSaveActiveTab() {
    const tab = await getActiveTab();
    if (!tab.url || !isSupportedUrl(tab.url)) {
        throw new Error("This page cannot be captured by Chrome extensions.");
    }
    const id = generateId();
    const createdAt = new Date().toISOString();
    const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: capturePageSnapshot,
        args: [tab.title || "Untitled Snapshot", ["quick-save"], id, createdAt]
    });
    if (!result?.result) {
        throw new Error("Could not capture page state.");
    }
    await upsertSnapshot(result.result);
    await updateBadgeForTab(tab.id);
}
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "quick-save")
        return;
    try {
        await quickSaveActiveTab();
    }
    catch {
        // keyboard shortcut failures remain silent
    }
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await updateBadgeForTab(tabId);
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
        await updateBadgeForTab(tabId);
    }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        if (message.type === "GET_ACTIVE_CONTEXT") {
            const tab = await getActiveTab();
            sendResponse({ ok: true, data: toContext(tab) });
            return;
        }
        if (message.type === "LIST_SNAPSHOTS") {
            const snapshots = await loadSnapshots();
            sendResponse({ ok: true, data: snapshots });
            return;
        }
        if (message.type === "SAVE_SNAPSHOT") {
            const tab = await chrome.tabs.get(message.tabId);
            if (!tab.url || !isSupportedUrl(tab.url)) {
                throw new Error("This page cannot be captured by Chrome extensions.");
            }
            const id = generateId();
            const createdAt = new Date().toISOString();
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                func: capturePageSnapshot,
                args: [message.title, message.tags, id, createdAt]
            });
            if (!result?.result) {
                throw new Error("Capture failed on this page.");
            }
            const snapshot = result.result;
            await upsertSnapshot(snapshot);
            await updateBadgeForTab(message.tabId);
            sendResponse({ ok: true, data: snapshot });
            return;
        }
        if (message.type === "DELETE_SNAPSHOT") {
            const snapshots = await removeSnapshot(message.snapshotId);
            sendResponse({ ok: true, data: snapshots });
            return;
        }
        if (message.type === "RESTORE_SNAPSHOT") {
            const tab = await chrome.tabs.get(message.tabId);
            const tabUrl = tab.url ? new URL(tab.url) : null;
            if (!tabUrl || tabUrl.origin !== message.snapshot.origin) {
                sendResponse({ ok: false, error: "Snapshot origin does not match current tab origin." });
                return;
            }
            const [result] = await chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                func: restorePageSnapshot,
                args: [message.snapshot]
            });
            sendResponse({ ok: true, data: result.result });
            return;
        }
    })().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : "Unexpected extension error";
        sendResponse({ ok: false, error: errorMessage });
    });
    return true;
});
