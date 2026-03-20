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

const t = (key: string): string =>
  (i18next.t as (k: string) => string)(key);

/**
 * Adds an "Add Pane to Split View" item to the tab context menu
 * when a split view is active and hasn't reached maxPanes.
 */
export function initContextMenu(logger: ConsoleInstance): void {
  const tabContainer = getGBrowser()?.tabContainer;
  if (!tabContainer) return;

  const updateAddPaneLabel = (): void => {
    const addPaneItem = document?.getElementById("floorp_addPaneToSplitView");
    if (addPaneItem) {
      addPaneItem.setAttribute("label", t("splitView.contextMenu.addPane"));
    }
  };

  addI18nObserver(updateAddPaneLabel);

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
              (t: SplitViewTab) => !t.splitview,
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
  };

  tabContainer.addEventListener("contextmenu", onTabContextMenu);
  onCleanup(() => {
    tabContainer.removeEventListener("contextmenu", onTabContextMenu);
  });
  logger.debug("[patch] context menu listener attached");
}
