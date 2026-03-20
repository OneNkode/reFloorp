/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, onCleanup } from "solid-js";
import { splitViewConfig } from "./data/config.js";
import type { SplitViewLayout } from "./data/types.js";
import {
  clearSplitHandles,
  updateHandles,
} from "./components/split-view-splitters.js";
import {
  initLayoutPicker,
  destroyLayoutPicker,
} from "./components/split-view-layout-picker.js";
import {
  initToolbarButtonEnhancement,
  destroyToolbarButtonEnhancement,
} from "./components/split-view-toolbar-button.js";
import splitViewStyles from "./styles/split-view.css?inline";

/**
 * SplitViewManager orchestrates monkey-patching of Firefox's built-in
 * 2-pane split view system to support N panes (2-4) with multiple layouts.
 */
export class SplitViewManager {
  private styleElement: HTMLStyleElement | null = null;
  private origSplitViewPanelsSetter:
    | ((panels: string[]) => void)
    | null = null;
  private origSplitViewPanelsGetter: (() => string[]) | null = null;
  private origIsSplitViewActiveSetter:
    | ((active: boolean) => void)
    | null = null;
  private origShowSplitViewPanels:
    | ((tabs: any[]) => void)
    | null = null;
  private origReverseTabs: (() => void) | null = null;
  private wrapperProto: any = null;
  private logger: ConsoleInstance;

  // Guards against re-entrant calls that cause infinite loops
  private _inSplitViewPanelsSet = false;
  private _inShowSplitViewPanels = false;
  private _lastPanelIds: string = "";

  constructor(logger: ConsoleInstance) {
    this.logger = logger;
  }

  init(): void {
    this.logger.debug("Initializing SplitViewManager");

    this.injectStyles();
    this.patchTabpanels();
    this.patchSplitViewWrapper();
    this.patchContextMenu();

    initLayoutPicker();
    initToolbarButtonEnhancement();
    this.listenSplitViewEvents();

    // React to layout config changes
    createEffect(() => {
      const config = splitViewConfig();
      this.logger.debug(`[effect] layout config changed: ${config.layout}, maxPanes=${config.maxPanes}`);
      this.applyLayout(config.layout);
    });

    onCleanup(() => this.destroy());
  }

  private destroy(): void {
    this.logger.debug("Destroying SplitViewManager");
    this.removeStyles();
    this.unpatchTabpanels();
    this.unpatchSplitViewWrapper();
    clearSplitHandles();
    destroyLayoutPicker();
    destroyToolbarButtonEnhancement();

    // Remove dynamically created context menu item
    document?.getElementById("floorp_addPaneToSplitView")?.remove();
  }

  // ===== Style injection =====

  private injectStyles(): void {
    this.styleElement = document?.createElement("style") as HTMLStyleElement;
    if (this.styleElement) {
      this.styleElement.id = "floorp-split-view-styles";
      this.styleElement.textContent = splitViewStyles;
      document?.head?.appendChild(this.styleElement);
      this.logger.debug("[styles] injected split-view CSS");
    }
  }

  private removeStyles(): void {
    this.styleElement?.remove();
    this.styleElement = null;
  }

  // ===== Monkey-patch: MozTabpanels =====

  private patchTabpanels(): void {
    const gBrowser = (globalThis as any).gBrowser;
    if (!gBrowser?.tabpanels) {
      this.logger.warn("[patch] gBrowser.tabpanels not available, skipping patch");
      return;
    }

    const tabpanels = gBrowser.tabpanels;
    const proto = Object.getPrototypeOf(tabpanels);
    const logger = this.logger;

    // --- Patch splitViewPanels setter ---
    const origPanelsDesc = Object.getOwnPropertyDescriptor(
      proto,
      "splitViewPanels",
    );

    if (origPanelsDesc?.set && origPanelsDesc?.get) {
      this.origSplitViewPanelsSetter = origPanelsDesc.set;
      this.origSplitViewPanelsGetter = origPanelsDesc.get;

      const manager = this;

      Object.defineProperty(tabpanels, "splitViewPanels", {
        set(newPanels: string[]) {
          // Always call the original setter to ensure upstream state:
          // - .split-view-panel class on panels
          // - column attributes
          // - click/mouseover/mouseout event listeners on browserContainer
          // Without these, clicking on a pane won't select it and
          // the URL bar split-view button won't appear.
          try {
            origPanelsDesc.set!.call(this, newPanels);
          } catch (e) {
            logger.error(`[patch:splitViewPanels.set] original setter threw: ${e}`);
          }

          // Ensure ALL split-view panels have split-view-panel-active class.
          // Upstream only sets this on the "active" panel via setSplitViewPanelActive,
          // but in N-pane mode ALL panels need it for correct layout:
          // - width: unset (prevents fixed width from overriding flex)
          // - position: relative (enables z-index stacking)
          // - margin: var(--space-xsmall) (consistent spacing)
          //
          // Also clean up stale .split-view-panel / .split-view-panel-active
          // from panels NOT in the current split view. Upstream's
          // #deactivate(skipHidePanels=true) does NOT call removePanelFromSplitView,
          // so old panels retain these classes and remain visible.
          const currentPanelSet = new Set(newPanels);
          const tabpanelsEl = this as HTMLElement;
          for (const child of tabpanelsEl.children) {
            const childId = child.id;
            if (currentPanelSet.has(childId)) {
              // Current split panel — ensure it has split-view-panel-active
              if (!child.classList.contains("split-view-panel-active")) {
                child.classList.add("split-view-panel-active");
              }
            } else {
              // NOT in current split — remove stale split-view classes
              if (child.classList.contains("split-view-panel")) {
                child.classList.remove("split-view-panel");
                child.removeAttribute("column");
                logger.debug(`[patch:splitViewPanels.set] cleaned stale .split-view-panel from ${childId}`);
              }
              if (child.classList.contains("split-view-panel-active")) {
                child.classList.remove("split-view-panel-active");
              }
            }
          }

          // Re-entrancy guard: skip Floorp DOM work (handles, layout)
          // to prevent infinite loop from the event cascade:
          // showSplitViewPanels → setter → isSplitViewActive → TabSelect → #activate → loop
          if (manager._inSplitViewPanelsSet) {
            logger.debug(`[patch:splitViewPanels.set] Floorp work skipped (re-entrant), panels=${newPanels.length}`);
            return;
          }

          // Skip Floorp DOM work if panels haven't changed
          const panelKey = newPanels.join(",");
          if (panelKey === manager._lastPanelIds) {
            logger.debug(`[patch:splitViewPanels.set] Floorp work skipped (unchanged), panels=${newPanels.length}`);
            return;
          }

          manager._inSplitViewPanelsSet = true;
          manager._lastPanelIds = panelKey;
          logger.debug(`[patch:splitViewPanels.set] panels=${newPanels.length}, ids=[${newPanels.join(", ")}]`);

          // --- DEBUG: dump panel element state ---
          for (let pi = 0; pi < newPanels.length; pi++) {
            const panelEl = document?.getElementById(newPanels[pi]) as HTMLElement | null;
            if (panelEl) {
              const rect = panelEl.getBoundingClientRect();
              const cs = globalThis.getComputedStyle(panelEl);
              logger.debug(
                `[patch:splitViewPanels.set] panel[${pi}] id=${newPanels[pi]}` +
                ` classes="${panelEl.className}"` +
                ` column="${panelEl.getAttribute("column")}"` +
                ` selected="${panelEl.getAttribute("selected")}"` +
                ` display=${cs.display}` +
                ` visibility=${cs.visibility}` +
                ` flex=${cs.flex}` +
                ` rect=${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}`,
              );
              // Check the browserStack and browser inside
              const browserStack = panelEl.querySelector(".browserStack");
              const browser = panelEl.querySelector("browser");
              if (browserStack) {
                const bsRect = (browserStack as HTMLElement).getBoundingClientRect();
                logger.debug(
                  `[patch:splitViewPanels.set]   browserStack rect=${Math.round(bsRect.x)},${Math.round(bsRect.y)},${Math.round(bsRect.width)}x${Math.round(bsRect.height)}`,
                );
              }
              if (browser) {
                const brRect = (browser as HTMLElement).getBoundingClientRect();
                const brCS = globalThis.getComputedStyle(browser as Element);
                logger.debug(
                  `[patch:splitViewPanels.set]   browser rect=${Math.round(brRect.x)},${Math.round(brRect.y)},${Math.round(brRect.width)}x${Math.round(brRect.height)}` +
                  ` visibility=${brCS.visibility}` +
                  ` src=${(browser as any).currentURI?.spec || "?"}`,
                );
              }
            } else {
              logger.warn(`[patch:splitViewPanels.set] panel[${pi}] id=${newPanels[pi]} NOT FOUND in DOM`);
            }
          }
          // --- DEBUG: tabpanels container state ---
          {
            const tp = this as HTMLElement;
            const tpRect = tp.getBoundingClientRect();
            const tpCS = globalThis.getComputedStyle(tp);
            logger.debug(
              `[patch:splitViewPanels.set] tabpanels:` +
              ` display=${tpCS.display}` +
              ` flexDirection=${tpCS.flexDirection}` +
              ` splitview="${tp.getAttribute("splitview")}"` +
              ` data-floorp-split="${tp.getAttribute("data-floorp-split")}"` +
              ` split-view-layout="${tp.getAttribute("split-view-layout")}"` +
              ` rect=${Math.round(tpRect.x)},${Math.round(tpRect.y)},${Math.round(tpRect.width)}x${Math.round(tpRect.height)}`,
            );
            // Count visible children
            let visibleChildren = 0;
            let totalChildren = 0;
            for (const child of tp.children) {
              totalChildren++;
              const childCS = globalThis.getComputedStyle(child);
              if (childCS.display !== "none" && childCS.visibility !== "hidden") {
                visibleChildren++;
              }
            }
            logger.debug(
              `[patch:splitViewPanels.set] tabpanels children: ${visibleChildren} visible / ${totalChildren} total`,
            );
          }

          // Floorp enhancement: update handles and layout
          if (newPanels.length >= 2) {
            this.setAttribute("data-floorp-split", "true");
            const layout = splitViewConfig().layout;
            logger.debug(`[patch:splitViewPanels.set] applying layout=${layout} for ${newPanels.length} panels`);
            manager.applyLayoutAttribute(layout, newPanels.length);
            updateHandles(newPanels, layout);
          }
          manager._inSplitViewPanelsSet = false;
        },
        get() {
          return origPanelsDesc.get!.call(this);
        },
        configurable: true,
      });
      logger.debug("[patch] splitViewPanels setter/getter patched");
    } else {
      logger.warn("[patch] splitViewPanels descriptor not found on prototype");
    }

    // --- Patch isSplitViewActive setter ---
    const origActiveDesc = Object.getOwnPropertyDescriptor(
      proto,
      "isSplitViewActive",
    );

    if (origActiveDesc?.set) {
      this.origIsSplitViewActiveSetter = origActiveDesc.set;

      // Capture manager reference for the setter closure
      // (the `manager` const from line 127 should be in scope, but
      // re-declare to be explicit and avoid any bundler scope issues)
      const activeSetterManager = this;

      Object.defineProperty(tabpanels, "isSplitViewActive", {
        set(isActive: any) {
          // Upstream passes tab.splitview (XULElement|null), not a boolean.
          // Coerce to boolean for our logic; pass original value to upstream.
          const isActiveAsBool = !!isActive;
          logger.debug(`[patch:isSplitViewActive.set] isActive=${isActiveAsBool} (raw=${typeof isActive === "object" ? isActive?.tagName ?? "null" : isActive})`);
          try {
            origActiveDesc.set!.call(this, isActive);
          } catch (e) {
            logger.error(`[patch:isSplitViewActive.set] original setter threw: ${e}`);
          }

          if (isActiveAsBool) {
            this.setAttribute("data-floorp-split", "true");
          } else {
            this.removeAttribute("data-floorp-split");
            this.removeAttribute("split-view-layout");
            this.removeAttribute("data-floorp-dragging");
            clearSplitHandles();
            clearGridStyles(this);
            // Clean up split-view-panel-active from ALL panels.
            // Upstream's removePanelFromSplitView removes .split-view-panel
            // but NOT .split-view-panel-active. If we added it in our
            // splitViewPanels setter, stale classes persist and cause
            // panels to remain visible behind the next split view.
            const staleActives = this.querySelectorAll(".split-view-panel-active");
            for (const el of staleActives) {
              el.classList.remove("split-view-panel-active");
            }
            // Reset panel cache so next activation re-applies layout
            activeSetterManager._lastPanelIds = "";
          }
        },
        // Upstream has no getter (write-only property); pass through for safety
        get: origActiveDesc.get,
        configurable: true,
      });
      logger.debug("[patch] isSplitViewActive setter patched");
    } else {
      logger.warn("[patch] isSplitViewActive descriptor not found on prototype");
    }

    // --- Patch showSplitViewPanels to filter out tabs with destroyed browsers ---
    if (typeof gBrowser.showSplitViewPanels === "function") {
      this.origShowSplitViewPanels = gBrowser.showSplitViewPanels.bind(gBrowser);
      gBrowser.showSplitViewPanels = (tabs: any[]) => {
        // Re-entrancy guard
        if (this._inShowSplitViewPanels) {
          logger.debug(`[patch:showSplitViewPanels] SKIPPED (re-entrant)`);
          return;
        }

        const validTabs = tabs.filter(
          (tab: any) => tab && tab.linkedBrowser,
        );
        const invalidCount = tabs.length - validTabs.length;
        if (invalidCount > 0) {
          logger.warn(`[patch:showSplitViewPanels] filtered out ${invalidCount} tab(s) with null linkedBrowser`);
        }
        logger.debug(`[patch:showSplitViewPanels] validTabs=${validTabs.length}/${tabs.length}`);
        if (validTabs.length < 2) {
          logger.warn(`[patch:showSplitViewPanels] less than 2 valid tabs, skipping`);
          return;
        }

        this._inShowSplitViewPanels = true;
        try {
          this.origShowSplitViewPanels!(validTabs);
        } catch (e) {
          logger.error(`[patch:showSplitViewPanels] original threw: ${e}`);
        } finally {
          this._inShowSplitViewPanels = false;
        }
      };
      logger.debug("[patch] showSplitViewPanels patched");
    } else {
      logger.warn("[patch] showSplitViewPanels not found on gBrowser");
    }

    this.logger.debug("[patch] MozTabpanels patched successfully");
  }

  private unpatchTabpanels(): void {
    const gBrowser = (globalThis as any).gBrowser;
    if (!gBrowser?.tabpanels) return;

    const tabpanels = gBrowser.tabpanels;

    if (this.origSplitViewPanelsSetter) {
      delete (tabpanels as any).splitViewPanels;
    }
    if (this.origIsSplitViewActiveSetter) {
      delete (tabpanels as any).isSplitViewActive;
    }
    if (this.origShowSplitViewPanels) {
      gBrowser.showSplitViewPanels = this.origShowSplitViewPanels;
    }

    tabpanels.removeAttribute("data-floorp-split");
    tabpanels.removeAttribute("split-view-layout");
    this.logger.debug("[unpatch] MozTabpanels restored");
  }

  // ===== Monkey-patch: MozTabSplitViewWrapper =====

  private patchSplitViewWrapper(): void {
    const WrapperClass = customElements.get("tab-split-view-wrapper");
    if (!WrapperClass) {
      this.logger.warn("[patch] tab-split-view-wrapper not registered, skipping");
      return;
    }

    this.wrapperProto = WrapperClass.prototype;
    this.origReverseTabs = this.wrapperProto.reverseTabs;

    const manager = this;
    const logger = this.logger;
    Object.defineProperty(this.wrapperProto, "reverseTabs", {
      value: function (this: any) {
        const tabs = this.tabs;
        logger.debug(`[patch:reverseTabs] tabs.length=${tabs.length}`);
        if (tabs.length === 2 && manager.origReverseTabs) {
          manager.origReverseTabs.call(this);
          return;
        }

        const gBrowser = (globalThis as any).gBrowser;
        const anchor = tabs[0];
        const reversed = [...tabs].reverse();
        for (const tab of reversed) {
          if (tab !== anchor) {
            gBrowser.moveTabBefore(tab, anchor);
          }
        }
        gBrowser.showSplitViewPanels(this.tabs);
      },
      configurable: true,
      writable: true,
    });

    this.logger.debug("[patch] MozTabSplitViewWrapper.reverseTabs patched");
  }

  private unpatchSplitViewWrapper(): void {
    if (this.wrapperProto && this.origReverseTabs) {
      Object.defineProperty(this.wrapperProto, "reverseTabs", {
        value: this.origReverseTabs,
        configurable: true,
        writable: true,
      });
      this.logger.debug("[unpatch] MozTabSplitViewWrapper.reverseTabs restored");
    }
  }

  // ===== Split view activation/deactivation events =====

  private onSplitViewActivate = (e: Event): void => {
    // Re-apply layout AFTER the entire event cascade has settled.
    // Only needed when returning to a split view from a non-split tab,
    // where the deactivation cleared the layout attributes.
    // Skip if layout was already applied by the splitViewPanels setter.
    const detail = (e as CustomEvent).detail;
    const tabs = detail?.tabs;
    if (!Array.isArray(tabs) || tabs.length < 2) return;

    requestAnimationFrame(() => {
      const gBrowser = (globalThis as any).gBrowser;
      const tabpanels = document?.getElementById("tabbrowser-tabpanels");
      if (!tabpanels) return;

      const panels = gBrowser?.tabpanels?.splitViewPanels;
      if (!panels || panels.length < 2) return;

      const layout = splitViewConfig().layout;
      const currentLayoutAttr = tabpanels.getAttribute("split-view-layout") ?? "";
      const expectedLayout = (layout === "grid-2x2" && panels.length !== 4) ? "" : (layout === "horizontal" ? "" : layout);

      // Only re-apply if layout attribute doesn't match expected state
      if (currentLayoutAttr === expectedLayout) {
        // Also check if handles exist
        const handleCount = tabpanels.querySelectorAll(
          ".floorp-split-handle, .floorp-grid-handle",
        ).length;
        if (handleCount > 0) {
          this.logger.debug(`[onSplitViewActivate:rAF] layout already correct (${expectedLayout || "horizontal"}), handles=${handleCount}, skipping`);
          // Log post-layout panel rects for debugging
          for (let i = 0; i < panels.length; i++) {
            const el = document?.getElementById(panels[i]) as HTMLElement | null;
            if (el) {
              const r = el.getBoundingClientRect();
              const cs = globalThis.getComputedStyle(el);
              const browser = el.querySelector("browser") as any;
              this.logger.debug(
                `[onSplitViewActivate:rAF] panel[${i}] id=${panels[i]}` +
                ` flex=${cs.flex}` +
                ` rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}` +
                ` src=${browser?.currentURI?.spec || "?"}`,
              );
            }
          }
          return;
        }
      }

      this.logger.debug(`[onSplitViewActivate:rAF] re-applying layout=${layout}, panels=${panels.length} (current="${currentLayoutAttr}", expected="${expectedLayout}")`);
      this.applyLayoutAttribute(layout, panels.length);
      updateHandles(panels, layout);
    });
  };

  private onSplitViewDeactivate = (): void => {
    this.logger.debug("[onSplitViewDeactivate] clearing layout state");
  };

  private listenSplitViewEvents(): void {
    const tabContainer = (globalThis as any).gBrowser?.tabContainer;
    if (!tabContainer) return;

    tabContainer.addEventListener("TabSplitViewActivate", this.onSplitViewActivate);
    tabContainer.addEventListener("TabSplitViewDeactivate", this.onSplitViewDeactivate);

    onCleanup(() => {
      tabContainer.removeEventListener("TabSplitViewActivate", this.onSplitViewActivate);
      tabContainer.removeEventListener("TabSplitViewDeactivate", this.onSplitViewDeactivate);
    });

    this.logger.debug("[events] TabSplitViewActivate/Deactivate listeners attached");
  }

  // ===== Context menu enhancements =====

  private patchContextMenu(): void {
    const tabContainer = (globalThis as any).gBrowser?.tabContainer;
    if (!tabContainer) return;

    tabContainer.addEventListener(
      "contextmenu",
      this.onTabContextMenu,
    );
    onCleanup(() => {
      tabContainer.removeEventListener(
        "contextmenu",
        this.onTabContextMenu,
      );
    });
    this.logger.debug("[patch] context menu listener attached");
  }

  private onTabContextMenu = (): void => {
    const separateItem = document?.getElementById("context_separateSplitView");
    if (!separateItem) return;

    const gBrowser = (globalThis as any).gBrowser;
    const splitViewEnabled = Services.prefs.getBoolPref(
      "browser.tabs.splitView.enabled",
      false,
    );
    if (!splitViewEnabled) return;

    const activeSplitView = gBrowser?.activeSplitView;
    const contextTabs: any[] =
      (globalThis as any).TabContextMenu?.contextTabs ?? [];
    const hasSplitViewTab = contextTabs.some(
      (tab: any) => tab.splitview,
    );

    this.logger.debug(
      `[contextMenu] activeSplitView=${!!activeSplitView}, ` +
      `contextTabs=${contextTabs.length}, hasSplitViewTab=${hasSplitViewTab}, ` +
      `activeTabs=${activeSplitView?.tabs?.length ?? 0}`
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
        addPaneItem = document?.createXULElement("menuitem") ?? null;
        if (addPaneItem) {
          addPaneItem.id = "floorp_addPaneToSplitView";
          addPaneItem.setAttribute("label", "Add Pane to Split View");
          addPaneItem.addEventListener("command", () => {
            const currentGBrowser = (globalThis as any).gBrowser;
            const currentSplitView = currentGBrowser?.activeSplitView;
            const currentContextTabs: any[] =
              (globalThis as any).TabContextMenu?.contextTabs ?? [];
            const nonSplitTabs = currentContextTabs.filter(
              (t: any) => !t.splitview,
            );
            this.logger.debug(`[contextMenu:command] adding ${nonSplitTabs.length} tab(s) to split view`);
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

  // ===== Layout application =====

  private applyLayout(layout: SplitViewLayout): void {
    const gBrowser = (globalThis as any).gBrowser;
    const activeSplitView = gBrowser?.activeSplitView;
    if (!activeSplitView) {
      this.logger.debug(`[applyLayout] no activeSplitView, skipping`);
      return;
    }

    const panels = gBrowser.tabpanels?.splitViewPanels;
    if (!panels || panels.length < 2) {
      this.logger.debug(`[applyLayout] panels=${panels?.length ?? 0}, skipping`);
      return;
    }

    this.logger.debug(`[applyLayout] layout=${layout}, panels=${panels.length}`);
    this.applyLayoutAttribute(layout, panels.length);
    updateHandles(panels, layout);
  }

  private applyLayoutAttribute(
    layout: SplitViewLayout,
    paneCount: number,
  ): void {
    const tabpanels = document?.getElementById("tabbrowser-tabpanels");
    if (!tabpanels) return;

    let effectiveLayout = layout;

    // Grid requires exactly 4 panes
    if (layout === "grid-2x2" && paneCount !== 4) {
      this.logger.debug(`[applyLayoutAttribute] grid-2x2 requires 4 panes, got ${paneCount}, falling back to horizontal`);
      effectiveLayout = "horizontal";
    }

    if (effectiveLayout === "horizontal") {
      tabpanels.removeAttribute("split-view-layout");
      clearGridStyles(tabpanels);
    } else {
      tabpanels.setAttribute("split-view-layout", effectiveLayout);
    }
    this.logger.debug(`[applyLayoutAttribute] set effectiveLayout=${effectiveLayout}`);
  }
}

/**
 * Remove all grid-related inline styles from an element.
 */
function clearGridStyles(el: Element): void {
  const style = (el as HTMLElement).style;
  style.removeProperty("grid-template-columns");
  style.removeProperty("grid-template-rows");
  style.removeProperty("--floorp-grid-col-ratio");
  style.removeProperty("--floorp-grid-row-ratio");
}
