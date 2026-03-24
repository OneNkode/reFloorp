/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { onCleanup } from "solid-js";
import i18next from "i18next";
import { addI18nObserver } from "#i18n/config-browser-chrome.ts";
import type { SplitViewTab } from "../data/types.js";
import { getGBrowser, getTabContextMenu } from "../data/types.js";
import { splitViewConfig } from "../data/config.js";
import { swapPanesByTab } from "../utils/reorder-panes.js";

const t = (key: string, opts?: Record<string, string>): string =>
  (i18next.t as (k: string, o?: Record<string, string>) => string)(key, opts);

/**
 * Adds "Add Pane to Split View" and "Move to Pane" items to the tab
 * context menu when a split view is active.
 */
export function initContextMenu(logger: ConsoleInstance): void {
  const tabContainer = getGBrowser()?.tabContainer;
  if (!tabContainer) return;

  const updateLabels = (): void => {
    const addPaneItem = document?.getElementById("floorp_addPaneToSplitView");
    if (addPaneItem) {
      addPaneItem.setAttribute("label", t("splitView.contextMenu.addPane"));
    }
    const moveMenu = document?.getElementById("floorp_moveTabToPane");
    if (moveMenu) {
      moveMenu.setAttribute("label", t("splitView.contextMenu.moveToPane"));
    }
  };

  addI18nObserver(updateLabels);

  const onTabContextMenu = (): void => {
    const separateItem = document?.getElementById("context_separateSplitView");
    if (!separateItem) return;

    const gBrowser = getGBrowser();
    const splitViewEnabled = Services.prefs.getBoolPref(
      "browser.tabs.splitView.enabled",
      false,
    );
    if (!splitViewEnabled) return;

    const activeSplitView = gBrowser?.activeSplitView;
    const contextTabs: SplitViewTab[] = getTabContextMenu()?.contextTabs ?? [];
    const hasSplitViewTab = contextTabs.some(
      (tab: SplitViewTab) => tab.splitview,
    );

    logger.debug(
      `[contextMenu] activeSplitView=${!!activeSplitView}, ` +
        `contextTabs=${contextTabs.length}, hasSplitViewTab=${hasSplitViewTab}, ` +
        `activeTabs=${activeSplitView?.tabs?.length ?? 0}`,
    );

    // === Add Pane to Split View ===
    const shouldShowAddPane =
      hasSplitViewTab &&
      activeSplitView &&
      activeSplitView.tabs.length < splitViewConfig().maxPanes;

    let addPaneItem = document?.getElementById(
      "floorp_addPaneToSplitView",
    ) as XULElement | null;

    if (shouldShowAddPane) {
      if (!addPaneItem) {
        addPaneItem = document?.createXULElement("menuitem") as XULElement;
        if (addPaneItem) {
          addPaneItem.id = "floorp_addPaneToSplitView";
          addPaneItem.setAttribute(
            "label",
            t("splitView.contextMenu.addPane"),
          );
          addPaneItem.addEventListener("command", () => {
            const currentGBrowser = getGBrowser();
            const currentSplitView = currentGBrowser?.activeSplitView;
            const currentContextTabs: SplitViewTab[] =
              getTabContextMenu()?.contextTabs ?? [];
            const nonSplitTabs = currentContextTabs.filter(
              (tab: SplitViewTab) => !tab.splitview,
            );
            logger.debug(
              `[contextMenu:command] adding ${nonSplitTabs.length} tab(s) to split view`,
            );
            if (currentSplitView && nonSplitTabs.length > 0) {
              currentSplitView.addTabs(nonSplitTabs);
            }
          });
          separateItem.after(addPaneItem);
        }
      }
      if (addPaneItem) {
        addPaneItem.hidden = false;
      }
    } else if (addPaneItem) {
      addPaneItem.hidden = true;
    }

    // === Move to Pane submenu ===
    const shouldShowMoveToPane =
      hasSplitViewTab &&
      activeSplitView &&
      activeSplitView.tabs.length >= 2;

    let moveMenu = document?.getElementById(
      "floorp_moveTabToPane",
    ) as XULElement | null;

    if (shouldShowMoveToPane) {
      if (!moveMenu) {
        moveMenu = document?.createXULElement("menu") as XULElement;
        if (moveMenu) {
          moveMenu.id = "floorp_moveTabToPane";
          moveMenu.setAttribute(
            "label",
            t("splitView.contextMenu.moveToPane"),
          );

          const popup = document?.createXULElement(
            "menupopup",
          ) as XULElement;
          if (popup) {
            popup.id = "floorp_moveTabToPanePopup";
            popup.addEventListener("popupshowing", () => {
              onMoveToPanePopupShowing(logger);
            });
            moveMenu.appendChild(popup);
          }

          // Insert after addPaneItem if visible, otherwise after separateItem
          const insertAfter =
            addPaneItem && !addPaneItem.hidden
              ? addPaneItem
              : separateItem;
          insertAfter.after(moveMenu);
        }
      }
      if (moveMenu) {
        moveMenu.hidden = false;
        moveMenu.setAttribute(
          "label",
          t("splitView.contextMenu.moveToPane"),
        );
      }
    } else if (moveMenu) {
      moveMenu.hidden = true;
    }
  };

  tabContainer.addEventListener("contextmenu", onTabContextMenu);
  onCleanup(() => {
    tabContainer.removeEventListener("contextmenu", onTabContextMenu);
  });
  logger.debug("[patch] context menu listener attached");
}

// ===== Move to Pane helpers =====

function onMoveToPanePopupShowing(logger: ConsoleInstance): void {
  const popup = document?.getElementById("floorp_moveTabToPanePopup");
  if (!popup) return;

  // Clear previous items
  while (popup.lastChild) {
    popup.removeChild(popup.lastChild);
  }

  const gBrowser = getGBrowser();
  const activeSplitView = gBrowser?.activeSplitView;
  if (!activeSplitView) return;

  const contextTabs: SplitViewTab[] =
    getTabContextMenu()?.contextTabs ?? [];
  const contextTab = contextTabs[0];
  if (!contextTab) return;

  const splitTabs = activeSplitView.tabs;
  const currentIndex = splitTabs.indexOf(
    contextTab as SplitViewTab,
  );
  if (currentIndex === -1) return;

  for (let i = 0; i < splitTabs.length; i++) {
    if (i === currentIndex) continue;

    const targetTab = splitTabs[i];
    const tabTitle = truncateTitle(
      targetTab.label || `Tab ${i + 1}`,
      30,
    );

    const item = document?.createXULElement("menuitem") as XULElement;
    if (!item) continue;

    item.setAttribute(
      "label",
      t("splitView.contextMenu.moveToPaneN", {
        n: String(i + 1),
        title: tabTitle,
      }),
    );
    // Capture tab references (not indices) to avoid stale closure issues
    // if tabs are reordered between popup showing and command execution.
    const fromTab = contextTab;
    const toTab = targetTab;
    item.addEventListener("command", () => {
      swapPanesByTab(logger, fromTab, toTab);
    });
    popup.appendChild(item);
  }
}

function truncateTitle(title: string, maxLen: number): string {
  return title.length > maxLen
    ? `${title.substring(0, maxLen - 1)}\u2026`
    : title;
}
