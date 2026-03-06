import { capturePageSnapshot } from "./content/capture";
import { restorePageSnapshot } from "./content/restore";
import { loadSnapshots, removeSnapshot, upsertSnapshot } from "./shared/storage";
import type { ActivePageContext, PageSnapshot, RestoreReport } from "./shared/types";
import { generateId, pathSimilarity } from "./shared/utils";

type RuntimeMessage =
  | { type: "GET_ACTIVE_CONTEXT" }
  | { type: "LIST_SNAPSHOTS"; context: ActivePageContext }
  | { type: "SAVE_SNAPSHOT"; tabId: number; label: string }
  | { type: "DELETE_SNAPSHOT"; snapshotId: string }
  | { type: "RESTORE_SNAPSHOT"; tabId: number; snapshot: PageSnapshot };

async function getActiveTab(): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) {
    throw new Error("No active tab found.");
  }
  return tab;
}

function toContext(tab: any): ActivePageContext {
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

function filterSnapshotsForContext(snapshots: PageSnapshot[], context: ActivePageContext): PageSnapshot[] {
  return snapshots
    .filter((snapshot) => snapshot.origin === context.origin)
    .filter((snapshot) => pathSimilarity(snapshot.path, context.path) >= 0.3)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

async function updateBadgeForTab(tabId: number, context?: ActivePageContext): Promise<void> {
  try {
    const tabContext = context ?? toContext(await chrome.tabs.get(tabId));
    const snapshots = await loadSnapshots();
    const relevant = filterSnapshotsForContext(snapshots, tabContext);
    await chrome.action.setBadgeText({ tabId, text: relevant.length ? String(Math.min(relevant.length, 99)) : "" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#1f6feb" });
  } catch {
    await chrome.action.setBadgeText({ tabId, text: "" });
  }
}

async function quickSaveActiveTab(): Promise<void> {
  const tab = await getActiveTab();
  const label = `Quick Save ${new Date().toLocaleString()}`;
  const id = generateId();
  const createdAt = new Date().toISOString();

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: capturePageSnapshot,
    args: [label, id, createdAt]
  });

  if (!result?.result) {
    throw new Error("Could not capture page state.");
  }

  await upsertSnapshot(result.result as PageSnapshot);
  await updateBadgeForTab(tab.id!);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick-save") return;
  try {
    await quickSaveActiveTab();
  } catch {
    // Keep keyboard shortcut failure silent to avoid noisy UX.
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

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_ACTIVE_CONTEXT") {
      const tab = await getActiveTab();
      sendResponse({ ok: true, data: toContext(tab) });
      return;
    }

    if (message.type === "LIST_SNAPSHOTS") {
      const snapshots = await loadSnapshots();
      sendResponse({ ok: true, data: filterSnapshotsForContext(snapshots, message.context) });
      return;
    }

    if (message.type === "SAVE_SNAPSHOT") {
      const id = generateId();
      const createdAt = new Date().toISOString();
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        func: capturePageSnapshot,
        args: [message.label, id, createdAt]
      });

      if (!result?.result) {
        throw new Error("Capture failed on this page.");
      }

      const snapshot = result.result as PageSnapshot;
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

      sendResponse({ ok: true, data: result.result as RestoreReport });
      return;
    }
  })().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : "Unexpected extension error";
    sendResponse({ ok: false, error: errorMessage });
  });

  return true;
});

