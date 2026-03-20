/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { splitViewConfig, setSplitViewConfig } from "../data/config.js";
import type { SplitViewLayout } from "../data/types.js";

const log = console.createInstance({ prefix: "nora@split-view-picker" });

interface LayoutOption {
  layout: SplitViewLayout;
  label: string;
  minPanes: number;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { layout: "horizontal", label: "Horizontal Split", minPanes: 2 },
  { layout: "vertical", label: "Vertical Split", minPanes: 2 },
  { layout: "grid-2x2", label: "Grid (2\u00D72)", minPanes: 4 },
];

export function initLayoutPicker(): void {
  const menu = document?.getElementById("split-view-menu");
  if (!menu) {
    log.warn("[init] #split-view-menu not found");
    return;
  }

  menu.addEventListener("popupshowing", onPopupShowing);
  log.debug("[init] layout picker attached to #split-view-menu");
}

export function destroyLayoutPicker(): void {
  const menu = document?.getElementById("split-view-menu");
  if (!menu) return;

  menu.removeEventListener("popupshowing", onPopupShowing);
  removeFloorpMenuItems(menu);
  log.debug("[destroy] layout picker detached");
}

function onPopupShowing(): void {
  const menu = document?.getElementById("split-view-menu");
  if (!menu) return;

  removeFloorpMenuItems(menu);

  const firstSep = menu.querySelector("menuseparator");
  const separator = document?.createXULElement("menuseparator");
  if (separator) {
    separator.className = "floorp-split-view-menu-item";
    if (firstSep) {
      firstSep.before(separator);
    } else {
      menu.appendChild(separator);
    }
  }

  const activeSplitView = (globalThis as any).gBrowser?.activeSplitView;
  const currentPaneCount = activeSplitView?.tabs?.length ?? 2;
  const currentLayout = splitViewConfig().layout;

  log.debug(`[popupShowing] panes=${currentPaneCount}, currentLayout=${currentLayout}, activeSplitView=${!!activeSplitView}`);

  // Log tab state for debugging
  if (activeSplitView) {
    const tabs = activeSplitView.tabs;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      log.debug(
        `[popupShowing] tab[${i}]: linkedBrowser=${!!tab.linkedBrowser}, ` +
        `linkedPanel=${tab.linkedPanel}, selected=${tab.selected}, ` +
        `splitview=${!!tab.splitview}`
      );
    }
  }

  for (const opt of LAYOUT_OPTIONS) {
    if (currentPaneCount < opt.minPanes) continue;

    const item = document?.createXULElement("menuitem");
    if (!item) continue;

    item.className = "floorp-split-view-menu-item";
    item.setAttribute("label", opt.label);
    item.setAttribute("type", "radio");
    item.setAttribute("checked", String(currentLayout === opt.layout));

    item.addEventListener("command", () => {
      log.debug(`[command] switching layout to ${opt.layout}`);
      setSplitViewConfig((prev) => ({ ...prev, layout: opt.layout }));
    });

    if (separator) {
      separator.before(item);
    }
  }

  const maxPanes = splitViewConfig().maxPanes;
  if (activeSplitView && currentPaneCount < maxPanes) {
    const addItem = document?.createXULElement("menuitem");
    if (addItem) {
      addItem.className = "floorp-split-view-menu-item";
      addItem.setAttribute("label", "Add Pane");
      addItem.addEventListener("command", () => {
        log.debug("[command] adding pane");
        addPaneToActiveSplitView();
      });
      menu.appendChild(addItem);
    }
  }

  if (activeSplitView && currentPaneCount > 2) {
    const removeItem = document?.createXULElement("menuitem");
    if (removeItem) {
      removeItem.className = "floorp-split-view-menu-item";
      removeItem.setAttribute("label", "Remove Last Pane");
      removeItem.addEventListener("command", () => {
        log.debug("[command] removing last pane");
        removePaneFromActiveSplitView();
      });
      menu.appendChild(removeItem);
    }
  }
}

function removeFloorpMenuItems(menu: Element): void {
  for (const item of menu.querySelectorAll(".floorp-split-view-menu-item")) {
    item.remove();
  }
}

function addPaneToActiveSplitView(): void {
  const gBrowser = (globalThis as any).gBrowser;
  const activeSplitView = gBrowser?.activeSplitView;
  if (!activeSplitView) {
    log.warn("[addPane] no activeSplitView");
    return;
  }

  log.debug(`[addPane] current tabs=${activeSplitView.tabs.length}`);

  // Use about:opentabs to let the user pick a tab for the new pane.
  // The upstream onTabListRowClick was patched (opentabs-splitview.mjs)
  // to use the hosting tab (via browsingContext.embedderElement) instead
  // of gBrowser.selectedTab, so it correctly replaces the opentabs pane
  // even in N-pane split view.
  const newTab = gBrowser.addTrustedTab("about:opentabs");
  log.debug(`[addPane] created new tab: linkedBrowser=${!!newTab.linkedBrowser}, linkedPanel=${newTab.linkedPanel}`);
  activeSplitView.addTabs([newTab]);
  log.debug(`[addPane] after addTabs: tabs=${activeSplitView.tabs.length}`);
}

function removePaneFromActiveSplitView(): void {
  const gBrowser = (globalThis as any).gBrowser;
  const activeSplitView = gBrowser?.activeSplitView;
  if (!activeSplitView || activeSplitView.tabs.length <= 2) {
    log.warn(`[removePane] cannot remove: tabs=${activeSplitView?.tabs?.length ?? 0}`);
    return;
  }

  const tabs = activeSplitView.tabs;
  const lastTab = tabs[tabs.length - 1];
  log.debug(`[removePane] removing tab: linkedPanel=${lastTab.linkedPanel}, linkedBrowser=${!!lastTab.linkedBrowser}`);

  if (!gBrowser.moveTabToSplitView) {
    log.warn("[removePane] gBrowser.moveTabToSplitView not available");
    return;
  }
  gBrowser.moveTabToSplitView(lastTab, null);

  const remainingTabs = tabs.filter((t: any) => t !== lastTab);
  log.debug(`[removePane] remainingTabs=${remainingTabs.length}`);
  if (remainingTabs.length >= 2) {
    gBrowser.showSplitViewPanels(remainingTabs);
  }
}
