/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { SplitViewLayout, SplitViewTab } from "../data/types.js";
import { getGBrowser } from "../data/types.js";
import { splitViewConfig } from "../data/config.js";
import {
  clearSplitHandles,
} from "../components/split-view-splitters.js";
import { clearGridStyles } from "../layout.js";
import type { PatchState } from "./patch-state.js";
import { applySplitViewSessionMarkersForTabs } from "./session-restore.js";
import {
  ensureSplitPanelsActiveClassFromState,
  refreshActiveSplitPaneIndicator,
} from "./active-pane-tracker.js";
import { logTabpanelsSplitDiagnostics } from "./split-view-diagnostics.js";
import {
  ensureSplitPaneTabBrowsersAreWarmed,
  scheduleSplitPaneWarmRetries,
} from "./activate-split-pane-browsers.js";

export interface TabpanelsPatchResult {
  unpatch(): void;
}

/**
 * Monkey-patches MozTabpanels to support N-pane split view:
 * - splitViewPanels setter: ensures all panels get active class, cleans stale panels, applies layout
 * - isSplitViewActive setter: manages floorp attributes and cleanup on deactivation
 * - showSplitViewPanels: filters out tabs with destroyed browsers
 */
export function patchTabpanels(
  logger: ConsoleInstance,
  state: PatchState,
  onPanelsChanged: (panelIds: string[], layout: SplitViewLayout) => void,
): TabpanelsPatchResult | null {
  const gBrowser = getGBrowser();
  if (!gBrowser?.tabpanels) {
    logger.warn(
      "[patch] gBrowser.tabpanels not available, skipping patch",
    );
    return null;
  }

  const tabpanels = gBrowser.tabpanels;
  const proto = Object.getPrototypeOf(tabpanels);

  // --- Track originals for unpatch ---
  let patchedSplitViewPanels = false;
  let patchedIsSplitViewActive = false;
  let origShowSplitViewPanels:
    | ((tabs: SplitViewTab[]) => void)
    | null = null;

  // --- Patch splitViewPanels setter ---
  const origPanelsDesc = Object.getOwnPropertyDescriptor(
    proto,
    "splitViewPanels",
  );

  if (origPanelsDesc?.set && origPanelsDesc?.get) {
    patchedSplitViewPanels = true;

    Object.defineProperty(tabpanels, "splitViewPanels", {
      set(newPanels: string[]) {
        // Always call the original setter to ensure upstream state:
        // - .split-view-panel class on panels
        // - column attributes
        // - click/mouseover/mouseout event listeners on browserContainer
        try {
          origPanelsDesc.set!.call(this, newPanels);
        } catch (e) {
          logger.error(
            `[patch:splitViewPanels.set] original setter threw: ${e}`,
          );
        }

        // Grid cell placement follows `column="0"`…`"3"`. After tab reorder,
        // keep attributes aligned with splitViewPanels order.
        if (
          newPanels.length === 4 &&
          (this as Element).getAttribute("split-view-layout") === "grid-2x2"
        ) {
          const root = this as HTMLElement;
          for (let i = 0; i < 4; i++) {
            const id = newPanels[i]!;
            const child = root.querySelector(`#${CSS.escape(id)}`);
            if (child) {
              child.setAttribute("column", String(i));
            }
          }
        }

        // Ensure ALL split-view panels have split-view-panel-active class.
        // Also clean up stale classes from panels NOT in the current split view.
        const currentPanelSet = new Set(newPanels);
        const tabpanelsEl = this as HTMLElement;
        for (const child of tabpanelsEl.children) {
          const childId = child.id;
          if (currentPanelSet.has(childId)) {
            if (
              !child.classList.contains("split-view-panel-active")
            ) {
              child.classList.add("split-view-panel-active");
            }
          } else {
            if (child.classList.contains("split-view-panel")) {
              child.classList.remove("split-view-panel");
              child.removeAttribute("column");
              logger.debug(
                `[patch:splitViewPanels.set] cleaned stale .split-view-panel from ${childId}`,
              );
            }
            if (
              child.classList.contains("split-view-panel-active")
            ) {
              child.classList.remove("split-view-panel-active");
            }
          }
        }

        // Re-entrancy guard
        if (state.inSplitViewPanelsSet) {
          logger.warn(
            `[patch:splitViewPanels.set] skipped (re-entrant); incoming=[${newPanels.join(", ")}]`,
          );
          return;
        }

        // Skip if panels haven't changed
        const panelKey = newPanels.join(",");
        if (panelKey === state.lastPanelIds) {
          logger.debug(
            `[patch:splitViewPanels.set] skip unchanged panelKey=[${panelKey}]`,
          );
          return;
        }

        state.inSplitViewPanelsSet = true;
        state.lastPanelIds = panelKey;
        logger.debug(
          `[patch:splitViewPanels.set] panels=${newPanels.length}, ids=[${newPanels.join(", ")}]`,
        );

        // Floorp enhancement: update handles and layout
        if (newPanels.length >= 2) {
          this.setAttribute("data-floorp-split", "true");
          // Ensure multibar is set for Lepton theme compatibility
          const tabsToolbar =
            document?.getElementById("TabsToolbar");
          if (
            tabsToolbar &&
            !tabsToolbar.hasAttribute("multibar")
          ) {
            tabsToolbar.setAttribute("multibar", "true");
            state.multibarSetBySplitView = true;
          }
          const layout = splitViewConfig().layout;
          onPanelsChanged(newPanels, layout);
        }
        state.inSplitViewPanelsSet = false;
      },
      get() {
        return origPanelsDesc.get!.call(this);
      },
      configurable: true,
    });
    logger.debug("[patch] splitViewPanels setter/getter patched");
  } else {
    logger.warn(
      "[patch] splitViewPanels descriptor not found on prototype",
    );
  }

  // --- Patch isSplitViewActive setter ---
  const origActiveDesc = Object.getOwnPropertyDescriptor(
    proto,
    "isSplitViewActive",
  );

  if (origActiveDesc?.set) {
    patchedIsSplitViewActive = true;

    Object.defineProperty(tabpanels, "isSplitViewActive", {
      set(isActive: XULElement | null) {
        const isActiveAsBool = !!isActive;
        logger.debug(
          `[patch:isSplitViewActive.set] isActive=${isActiveAsBool}`,
        );
        try {
          origActiveDesc.set!.call(this, isActive);
        } catch (e) {
          logger.error(
            `[patch:isSplitViewActive.set] original setter threw: ${e}`,
          );
        }

        const tabsToolbar = document?.getElementById("TabsToolbar");

        if (isActiveAsBool) {
          this.setAttribute("data-floorp-split", "true");
          // Enable multibar attribute so Lepton theme doesn't
          // apply negative margins that hide split-view tabs.
          // Record whether multibar was already set (by multirow tabs)
          // so we don't remove it on deactivation.
          if (tabsToolbar && !tabsToolbar.hasAttribute("multibar")) {
            tabsToolbar.setAttribute("multibar", "true");
            state.multibarSetBySplitView = true;
          }
        } else {
          this.removeAttribute("data-floorp-split");
          this.removeAttribute("split-view-layout");
          this.removeAttribute("data-floorp-dragging");
          clearSplitHandles();
          clearGridStyles(this);
          // Clean up split-view-panel-active from ALL panels
          const staleActives = this.querySelectorAll(
            ".split-view-panel-active",
          );
          for (const el of staleActives) {
            el.classList.remove("split-view-panel-active");
          }
          // Clean up active pane indicator
          const staleActivePanes = this.querySelectorAll(
            "[data-floorp-active-pane]",
          );
          for (const el of staleActivePanes) {
            el.removeAttribute("data-floorp-active-pane");
          }
          // Reset panel cache so next activation re-applies layout
          state.lastPanelIds = "";
          // Only remove multibar if we were the ones who set it
          if (state.multibarSetBySplitView && tabsToolbar) {
            tabsToolbar.removeAttribute("multibar");
            state.multibarSetBySplitView = false;
          }
        }
      },
      get: origActiveDesc.get,
      configurable: true,
    });
    logger.debug("[patch] isSplitViewActive setter patched");
  } else {
    logger.warn(
      "[patch] isSplitViewActive descriptor not found on prototype",
    );
  }

  // --- Patch showSplitViewPanels ---
  if (typeof gBrowser.showSplitViewPanels === "function") {
    origShowSplitViewPanels =
      gBrowser.showSplitViewPanels.bind(gBrowser);
    gBrowser.showSplitViewPanels = (tabs: SplitViewTab[]) => {
      if (state.inShowSplitViewPanels) {
        logger.warn(
          `[patch:showSplitViewPanels] skipped (re-entrant); argTabs=${tabs.length} ` +
            `linkedPanels=[${tabs.map((t) => t?.linkedPanel ?? "?").join(", ")}]`,
        );
        return;
      }

      const validTabs = tabs.filter(
        (tab: SplitViewTab) => tab && tab.linkedBrowser,
      );
      const invalidCount = tabs.length - validTabs.length;
      if (invalidCount > 0) {
        logger.warn(
          `[patch:showSplitViewPanels] filtered out ${invalidCount} tab(s) with null linkedBrowser`,
        );
      }
      const inputDetail = tabs
        .map((t, i) => `[${i}]=${t?.linkedPanel ?? "null"}:${t?.label?.slice(0, 24) ?? ""}`)
        .join(" ");
      logger.debug(
        `[patch:showSplitViewPanels] validTabs=${validTabs.length}/${tabs.length} input: ${inputDetail}`,
      );
      const validDetail = validTabs
        .map((t, i) => `[${i}]=${t.linkedPanel}`)
        .join(" ");
      logger.debug(
        `[patch:showSplitViewPanels] validTabs order: ${validDetail}`,
      );
      if (validTabs.length < 2) {
        logger.warn(
          "[patch:showSplitViewPanels] less than 2 valid tabs, skipping",
        );
        return;
      }

      state.inShowSplitViewPanels = true;
      try {
        origShowSplitViewPanels!(validTabs);
        applySplitViewSessionMarkersForTabs(
          logger,
          validTabs,
          "showSplitViewPanels",
        );
        try {
          const ids = tabpanels.splitViewPanels;
          logger.debug(
            `[patch:showSplitViewPanels:afterNative] tabpanels.splitViewPanels=[${ids?.join(", ") ?? "undefined"}]`,
          );
        } catch (readErr) {
          logger.debug(
            `[patch:showSplitViewPanels:afterNative] could not read splitViewPanels: ${readErr}`,
          );
        }
        logTabpanelsSplitDiagnostics("showSplitViewPanels:afterNative");
        scheduleSplitPaneWarmRetries(logger);
        const bumpSplitViewUi = (phase: string): void => {
          ensureSplitPaneTabBrowsersAreWarmed(logger);
          ensureSplitPanelsActiveClassFromState();
          refreshActiveSplitPaneIndicator();
          logTabpanelsSplitDiagnostics(`showSplitViewPanels:bump:${phase}`);
        };
        bumpSplitViewUi("sync");
        requestAnimationFrame(() => {
          bumpSplitViewUi("rAF1");
          requestAnimationFrame(() => bumpSplitViewUi("rAF2"));
        });
      } catch (e) {
        logger.error(
          `[patch:showSplitViewPanels] original threw: ${e}`,
        );
      } finally {
        state.inShowSplitViewPanels = false;
      }
    };
    logger.debug("[patch] showSplitViewPanels patched");
  } else {
    logger.warn("[patch] showSplitViewPanels not found on gBrowser");
  }

  logger.debug("[patch] MozTabpanels patched successfully");

  return {
    unpatch() {
      const gBrowser = getGBrowser();
      if (!gBrowser?.tabpanels) return;

      const tabpanels = gBrowser.tabpanels;

      if (patchedSplitViewPanels) {
        delete (
          tabpanels as unknown as Record<string, unknown>
        ).splitViewPanels;
      }
      if (patchedIsSplitViewActive) {
        delete (
          tabpanels as unknown as Record<string, unknown>
        ).isSplitViewActive;
      }
      if (origShowSplitViewPanels) {
        gBrowser.showSplitViewPanels = origShowSplitViewPanels;
      }

      tabpanels.removeAttribute("data-floorp-split");
      tabpanels.removeAttribute("split-view-layout");
      logger.debug("[unpatch] MozTabpanels restored");
    },
  };
}
