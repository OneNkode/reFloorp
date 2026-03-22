/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { onCleanup } from "solid-js";
import { splitViewConfig } from "../data/config.js";
import {
  getGBrowser,
  PREF_SPLIT_VIEW_SESSION_STATE,
  SPLIT_VIEW_GROUP_ATTRIBUTE,
  SPLIT_VIEW_GROUP_SESSION_KEY,
  SPLIT_VIEW_PANE_INDEX_ATTRIBUTE,
  SPLIT_VIEW_PANE_INDEX_SESSION_KEY,
  type SplitViewLayout,
  type SplitViewTab,
} from "../data/types.js";
import { scheduleSequentialSplitTabSelectionForLoad } from "./activate-split-pane-browsers.js";
import { reorderSplitTabsForDesiredOrder } from "../utils/reorder-panes.js";
import { orderSplitGroupTabsForRestore } from "../utils/order-split-group-tabs.js";

type SessionStoreWin = {
  promiseInitialized?: Promise<void>;
  promiseAllWindowsRestored?: Promise<void>;
  persistTabAttribute?(name: string): void;
  setCustomTabValue?(tab: XULElement, key: string, value: string): void;
  getCustomTabValue?(tab: XULElement, key: string): string;
  deleteCustomTabValue?(tab: XULElement, key: string): void;
};

function getSessionStore(): SessionStoreWin | null {
  const g = globalThis as typeof globalThis & {
    SessionStore?: SessionStoreWin;
  };
  return g.SessionStore ?? null;
}

const SESSION_WINDOWS_RESTORED_TOPIC = "sessionstore-windows-restored";

function initSessionStoreSplitPersistence(
  ss: SessionStoreWin,
  logger: ConsoleInstance,
): void {
  if (typeof ss.persistTabAttribute === "function") {
    try {
      ss.persistTabAttribute(SPLIT_VIEW_GROUP_ATTRIBUTE);
      ss.persistTabAttribute(SPLIT_VIEW_PANE_INDEX_ATTRIBUTE);
      logger.debug(
        `[session-restore] persistTabAttribute("${SPLIT_VIEW_GROUP_ATTRIBUTE}", "${SPLIT_VIEW_PANE_INDEX_ATTRIBUTE}") registered`,
      );
    } catch (e) {
      logger.error(`[session-restore] persistTabAttribute threw: ${e}`);
    }
    return;
  }
  if (typeof ss.setCustomTabValue === "function") {
    logger.debug(
      `[session-restore] using SessionStore.setCustomTabValue(key="${SPLIT_VIEW_GROUP_SESSION_KEY}") — persistTabAttribute not available`,
    );
    return;
  }
  logger.warn(
    "[session-restore] SessionStore has neither persistTabAttribute nor setCustomTabValue; split group will not persist",
  );
}

function getSplitViewGroupIdForTab(
  tab: SplitViewTab,
  ss: SessionStoreWin | null,
): string | null {
  const el = tabEl(tab);
  const fromAttr = el.getAttribute(SPLIT_VIEW_GROUP_ATTRIBUTE);
  if (fromAttr) {
    return fromAttr;
  }
  if (ss && typeof ss.getCustomTabValue === "function") {
    try {
      const v = ss.getCustomTabValue(el, SPLIT_VIEW_GROUP_SESSION_KEY);
      if (v) {
        return v;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function setSplitViewGroupOnTab(
  tab: SplitViewTab,
  groupId: string,
  ss: SessionStoreWin | null,
): void {
  const el = tabEl(tab);
  el.setAttribute(SPLIT_VIEW_GROUP_ATTRIBUTE, groupId);
  if (ss && typeof ss.setCustomTabValue === "function") {
    try {
      ss.setCustomTabValue(el, SPLIT_VIEW_GROUP_SESSION_KEY, groupId);
    } catch (e) {
      console.warn("[session-restore] setCustomTabValue failed", e);
    }
  }
}

function getPaneIndexForTab(
  tab: SplitViewTab,
  ss: SessionStoreWin | null,
): number | null {
  const el = tabEl(tab);
  const fromAttr = el.getAttribute(SPLIT_VIEW_PANE_INDEX_ATTRIBUTE);
  if (fromAttr !== null && fromAttr !== "") {
    const n = Number.parseInt(fromAttr, 10);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  if (ss && typeof ss.getCustomTabValue === "function") {
    try {
      const v = ss.getCustomTabValue(el, SPLIT_VIEW_PANE_INDEX_SESSION_KEY);
      if (v !== undefined && v !== null && String(v) !== "") {
        const n = Number.parseInt(String(v), 10);
        if (!Number.isNaN(n)) {
          return n;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function setPaneIndexOnTab(
  tab: SplitViewTab,
  index: number,
  ss: SessionStoreWin | null,
): void {
  const el = tabEl(tab);
  el.setAttribute(SPLIT_VIEW_PANE_INDEX_ATTRIBUTE, String(index));
  if (ss && typeof ss.setCustomTabValue === "function") {
    try {
      ss.setCustomTabValue(
        el,
        SPLIT_VIEW_PANE_INDEX_SESSION_KEY,
        String(index),
      );
    } catch (e) {
      console.warn("[session-restore] setCustomTabValue pane index failed", e);
    }
  }
}

function clearPaneIndexOnTab(
  tab: SplitViewTab,
  ss: SessionStoreWin | null,
): void {
  const el = tabEl(tab);
  el.removeAttribute(SPLIT_VIEW_PANE_INDEX_ATTRIBUTE);
  if (ss && typeof ss.deleteCustomTabValue === "function") {
    try {
      ss.deleteCustomTabValue(el, SPLIT_VIEW_PANE_INDEX_SESSION_KEY);
    } catch {
      // ignore
    }
  }
}

function clearSplitViewGroupOnTab(
  tab: SplitViewTab,
  ss: SessionStoreWin | null,
): void {
  const el = tabEl(tab);
  el.removeAttribute(SPLIT_VIEW_GROUP_ATTRIBUTE);
  if (ss && typeof ss.deleteCustomTabValue === "function") {
    try {
      ss.deleteCustomTabValue(el, SPLIT_VIEW_GROUP_SESSION_KEY);
    } catch {
      // ignore
    }
  }
  clearPaneIndexOnTab(tab, ss);
}

function newGroupId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function tabEl(tab: SplitViewTab): XULElement {
  return tab as unknown as XULElement;
}

function isEligibleRestoreTab(tab: SplitViewTab): boolean {
  const browser = tab.linkedBrowser as
    | { currentURI?: { spec?: string } }
    | null;
  if (!browser) {
    return false;
  }
  const spec = browser.currentURI?.spec ?? "";
  if (spec === "about:opentabs") {
    return false;
  }
  return true;
}

function persistGroupLayout(groupId: string, layout: SplitViewLayout): void {
  type GroupEntry = { groupId: string; layout: SplitViewLayout };
  type Store = { groups: GroupEntry[] };
  const empty: Store = { groups: [] };
  try {
    const raw = Services.prefs.getStringPref(
      PREF_SPLIT_VIEW_SESSION_STATE,
      "{}",
    );
    const parsed = JSON.parse(raw) as unknown;
    const store: Store =
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as Store).groups)
        ? (parsed as Store)
        : empty;
    if (!Array.isArray(store.groups)) {
      store.groups = [];
    }
    const idx = store.groups.findIndex((g) => g.groupId === groupId);
    if (idx >= 0) {
      store.groups[idx]!.layout = layout;
    } else {
      store.groups.push({ groupId, layout });
    }
    Services.prefs.setStringPref(
      PREF_SPLIT_VIEW_SESSION_STATE,
      JSON.stringify(store),
    );
  } catch (e) {
    console.error("[session-restore] persistGroupLayout failed", e);
  }
}

type TabSplitViewActivateDetail = { tabs?: SplitViewTab[] };

/**
 * Ensure split tabs carry `floorpSplitViewGroupId` so SessionStore persists them.
 * Call from TabSplitViewActivate and from patched showSplitViewPanels — upstream
 * does not always dispatch the former when N-pane split is driven from our UI.
 */
export function applySplitViewSessionMarkersForTabs(
  logger: ConsoleInstance,
  tabs: SplitViewTab[],
  source: string,
): void {
  if (!Array.isArray(tabs) || tabs.length < 2) {
    return;
  }

  const ss = getSessionStore();
  let groupId: string | null = null;
  for (const tab of tabs) {
    const existing = getSplitViewGroupIdForTab(tab, ss);
    if (existing) {
      groupId = existing;
      break;
    }
  }
  if (!groupId) {
    groupId = newGroupId();
  }

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]!;
    setSplitViewGroupOnTab(tab, groupId, ss);
    setPaneIndexOnTab(tab, i, ss);
  }

  const layout = splitViewConfig().layout;
  persistGroupLayout(groupId, layout);

  logger.debug(
    `[session-restore:markers] source=${source} groupId=${groupId}, tabs=${tabs.length}, layout=${layout}, linkedPanels=[${tabs.map((t) => t.linkedPanel).join(", ")}]`,
  );
}

function onTabSplitViewActivate(logger: ConsoleInstance, e: Event): void {
  const detail = (e as CustomEvent).detail as
    | TabSplitViewActivateDetail
    | undefined;
  const tabs = detail?.tabs;
  if (!Array.isArray(tabs) || tabs.length < 2) {
    return;
  }
  applySplitViewSessionMarkersForTabs(logger, tabs, "TabSplitViewActivate");
}

function onTabSplitViewDeactivate(logger: ConsoleInstance): void {
  const gBrowser = getGBrowser();
  if (!gBrowser?.tabs) {
    return;
  }
  const ss = getSessionStore();
  for (const tab of gBrowser.tabs) {
    if (!tab.splitview) {
      clearSplitViewGroupOnTab(tab, ss);
    }
  }
  logger.debug(
    "[session-restore:deactivate] cleared group id from non-split tabs",
  );
}

function clearSplitViewGroupMarkersExcept(
  allTabs: SplitViewTab[],
  keep: SplitViewTab[],
  ss: SessionStoreWin | null,
): void {
  const keepSet = new Set(keep);
  for (const tab of allTabs) {
    if (!keepSet.has(tab)) {
      clearSplitViewGroupOnTab(tab, ss);
    }
  }
}

function restoreSplitViewFromSession(logger: ConsoleInstance): void {
  const gBrowser = getGBrowser();
  if (!gBrowser?.tabs) {
    logger.debug("[session-restore:restore] skip: no gBrowser.tabs");
    return;
  }

  const splitEnabled = Services.prefs.getBoolPref(
    "browser.tabs.splitView.enabled",
    false,
  );
  if (!splitEnabled) {
    logger.debug(
      "[session-restore:restore] skip: browser.tabs.splitView.enabled=false",
    );
    return;
  }

  const allTabs = gBrowser.tabs;
  const ss = getSessionStore();
  logger.debug(
    `[session-restore:restore] scanning ${allTabs.length} tab(s) for split group (attr="${SPLIT_VIEW_GROUP_ATTRIBUTE}" or session key="${SPLIT_VIEW_GROUP_SESSION_KEY}")`,
  );

  const groupBuckets = new Map<string, SplitViewTab[]>();

  for (const tab of allTabs) {
    const gid = getSplitViewGroupIdForTab(tab, ss);
    const eligible = isEligibleRestoreTab(tab);
    if (gid) {
      logger.debug(
        `[session-restore:restore] tab linkedPanel=${tab.linkedPanel} gid=${gid} eligible=${eligible}`,
      );
    }
    if (!gid || !eligible) {
      continue;
    }
    const arr = groupBuckets.get(gid) ?? [];
    arr.push(tab);
    groupBuckets.set(gid, arr);
  }

  logger.debug(
    `[session-restore:restore] groupBuckets: ${groupBuckets.size} group(s) — ${[...groupBuckets.entries()].map(([k, v]) => `${k}(${v.length})`).join(", ") || "none"}`,
  );

  let chosen: SplitViewTab[] | null = null;
  for (const tab of allTabs) {
    const gid = getSplitViewGroupIdForTab(tab, ss);
    if (!gid) {
      continue;
    }
    const arr = groupBuckets.get(gid);
    if (arr && arr.length >= 2) {
      chosen = arr;
      break;
    }
  }

  if (!chosen || chosen.length < 2) {
    logger.debug(
      "[session-restore:restore] no group with 2+ eligible tabs; clearing stray group markers",
    );
    clearSplitViewGroupMarkersExcept(allTabs, [], ss);
    return;
  }

  const maxPanes = splitViewConfig().maxPanes;
  const toRestore = orderSplitGroupTabsForRestore(
    chosen.slice(0, maxPanes),
    allTabs,
    (tab) => {
      const n = getPaneIndexForTab(tab, ss);
      return n === null ? undefined : n;
    },
  );
  const canonicalGid = getSplitViewGroupIdForTab(toRestore[0]!, ss);
  if (canonicalGid) {
    for (let i = 0; i < toRestore.length; i++) {
      const t = toRestore[i]!;
      setSplitViewGroupOnTab(t, canonicalGid, ss);
      setPaneIndexOnTab(t, i, ss);
    }
  }

  try {
    reorderSplitTabsForDesiredOrder(gBrowser, toRestore);
    logger.debug(
      `[session-restore:restore] reorderSplitTabsForDesiredOrder ok: linkedPanels=[${toRestore.map((t) => t.linkedPanel).join(", ")}]`,
    );
    gBrowser.selectedTab = toRestore[0]!;
    gBrowser.showSplitViewPanels(toRestore);
    logger.debug(
      `[session-restore:restore] showSplitViewPanels ok: ${toRestore.length} pane(s) linkedPanels=[${toRestore.map((t) => t.linkedPanel).join(", ")}]`,
    );
    setTimeout(() => {
      scheduleSequentialSplitTabSelectionForLoad(logger);
    }, 40);
  } catch (e) {
    logger.error(`[session-restore:restore] showSplitViewPanels failed: ${e}`);
  }

  clearSplitViewGroupMarkersExcept(allTabs, toRestore, ss);
}

export function initSessionRestore(logger: ConsoleInstance): void {
  const tabContainer = getGBrowser()?.tabContainer;
  if (!tabContainer) {
    logger.warn("[session-restore] init skip: no tabContainer");
    return;
  }

  const ss = getSessionStore();
  if (!ss) {
    logger.warn(
      "[session-restore] SessionStore missing; split group session sync + promiseAllWindowsRestored unavailable",
    );
  } else {
    if (ss.promiseInitialized) {
      ss.promiseInitialized.then(() => {
        initSessionStoreSplitPersistence(ss, logger);
      });
    } else {
      initSessionStoreSplitPersistence(ss, logger);
    }
    if (!ss.promiseAllWindowsRestored) {
      logger.warn(
        "[session-restore] SessionStore.promiseAllWindowsRestored missing; using observer only",
      );
    }
  }

  const onActivate = (e: Event): void => {
    onTabSplitViewActivate(logger, e);
  };
  const onDeactivate = (): void => {
    onTabSplitViewDeactivate(logger);
  };

  tabContainer.addEventListener("TabSplitViewActivate", onActivate);
  tabContainer.addEventListener("TabSplitViewDeactivate", onDeactivate);

  /** Coalesce promise + observer so restore runs once after session settles. */
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRestoreFromSession = (source: string): void => {
    logger.debug(`[session-restore] scheduleRestore (${source})`);
    if (restoreTimer !== null) {
      clearTimeout(restoreTimer);
    }
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      restoreSplitViewFromSession(logger);
    }, 0);
  };

  const pRestore = ss?.promiseAllWindowsRestored;
  if (pRestore) {
    pRestore
      .then(() => {
        scheduleRestoreFromSession("promiseAllWindowsRestored");
      })
      .catch((err: Error) => {
        logger.error(`[session-restore] promiseAllWindowsRestored: ${err}`);
        scheduleRestoreFromSession("promiseAllWindowsRestored.catch");
      });
  }

  const windowsRestoredObserver = {
    observe(_subject: unknown, topic: string) {
      if (topic !== SESSION_WINDOWS_RESTORED_TOPIC) {
        return;
      }
      scheduleRestoreFromSession("obs:sessionstore-windows-restored");
    },
  };
  try {
    Services.obs.addObserver(
      windowsRestoredObserver,
      SESSION_WINDOWS_RESTORED_TOPIC,
      false,
    );
  } catch (e) {
    logger.error(`[session-restore] addObserver(sessionstore-windows-restored): ${e}`);
  }

  onCleanup(() => {
    tabContainer.removeEventListener("TabSplitViewActivate", onActivate);
    tabContainer.removeEventListener("TabSplitViewDeactivate", onDeactivate);
    if (restoreTimer !== null) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }
    try {
      Services.obs.removeObserver(
        windowsRestoredObserver,
        SESSION_WINDOWS_RESTORED_TOPIC,
      );
    } catch (e) {
      logger.debug(`[session-restore] removeObserver: ${e}`);
    }
  });

  logger.debug(
    "[session-restore] listeners attached (TabSplitView + sessionstore-windows-restored)",
  );
}
