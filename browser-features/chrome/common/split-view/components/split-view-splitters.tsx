/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  splitViewPaneSizes,
  setSplitViewPaneSizes,
} from "../data/config.js";
import type { SplitViewLayout } from "../data/types.js";

const log = console.createInstance({ prefix: "nora@split-view-splitters" });

// Track active drag cleanup so clearSplitHandles can abort in-progress drags
let activeDragCleanup: (() => void) | null = null;

function getTabpanels(): Element | null {
  return document?.getElementById("tabbrowser-tabpanels") ?? null;
}

export function clearSplitHandles(): void {
  // Abort any in-progress drag to prevent orphaned document listeners
  if (activeDragCleanup) {
    activeDragCleanup();
    activeDragCleanup = null;
  }

  const tabpanels = getTabpanels();
  if (!tabpanels) return;
  const handles = tabpanels.querySelectorAll(
    ".floorp-split-handle, .floorp-grid-handle",
  );
  log.debug(`[clearSplitHandles] removing ${handles.length} handle(s)`);
  for (const handle of handles) {
    handle.remove();
  }
}

export function insertFlexHandles(
  panelIds: string[],
  orientation: "horizontal" | "vertical",
): void {
  clearSplitHandles();
  const tabpanels = getTabpanels();
  if (!tabpanels || panelIds.length < 2) return;

  log.debug(`[insertFlexHandles] orientation=${orientation}, panels=${panelIds.length}, ids=[${panelIds.join(", ")}]`);

  const sizes = splitViewPaneSizes();
  const ratios = normalizeRatios(sizes.flexRatios, panelIds.length);
  log.debug(`[insertFlexHandles] ratios=[${ratios.map(r => r.toFixed(3)).join(", ")}]`);

  for (let i = 0; i < panelIds.length; i++) {
    const panelEl = document?.getElementById(panelIds[i]);
    if (panelEl) {
      panelEl.style.setProperty("flex", `${ratios[i]} 1 0%`);
    } else {
      log.warn(`[insertFlexHandles] panel element not found: ${panelIds[i]}`);
    }
  }

  for (let i = 0; i < panelIds.length - 1; i++) {
    const panelEl = document?.getElementById(panelIds[i]);
    if (!panelEl) continue;

    const handle = document?.createXULElement("box");
    if (!handle) continue;

    handle.className = "floorp-split-handle";
    handle.setAttribute("data-orientation", orientation);
    handle.setAttribute("data-index", String(i));

    handle.addEventListener("mousedown", (e: Event) => {
      onFlexHandleMouseDown(e as MouseEvent, i, panelIds, orientation);
    });

    panelEl.after(handle);
  }
  log.debug(`[insertFlexHandles] inserted ${panelIds.length - 1} handle(s)`);
}

export function insertGridHandles(panelIds: string[]): void {
  clearSplitHandles();
  const tabpanels = getTabpanels();
  if (!tabpanels || panelIds.length < 4) {
    log.warn(`[insertGridHandles] skipping: tabpanels=${!!tabpanels}, panels=${panelIds.length}`);
    return;
  }

  const sizes = splitViewPaneSizes();
  if (!Number.isFinite(sizes.gridColRatio) || !Number.isFinite(sizes.gridRowRatio)) {
    log.warn(`[insertGridHandles] invalid ratios: col=${sizes.gridColRatio}, row=${sizes.gridRowRatio}`);
    return;
  }

  log.debug(`[insertGridHandles] colRatio=${sizes.gridColRatio}, rowRatio=${sizes.gridRowRatio}`);

  // Log panel elements and their classes
  for (let i = 0; i < panelIds.length; i++) {
    const el = document?.getElementById(panelIds[i]);
    log.debug(`[insertGridHandles] panel[${i}] id=${panelIds[i]}, exists=${!!el}, column=${el?.getAttribute("column")}, classes=${el?.className}`);
  }

  const colPct = (sizes.gridColRatio * 100).toFixed(2);
  const rowPct = (sizes.gridRowRatio * 100).toFixed(2);
  (tabpanels as HTMLElement).style.setProperty(
    "grid-template-columns",
    `${colPct}% calc(100% - ${colPct}%)`,
  );
  (tabpanels as HTMLElement).style.setProperty(
    "grid-template-rows",
    `${rowPct}% calc(100% - ${rowPct}%)`,
  );
  (tabpanels as HTMLElement).style.setProperty("--floorp-grid-col-ratio", `${colPct}%`);
  (tabpanels as HTMLElement).style.setProperty("--floorp-grid-row-ratio", `${rowPct}%`);

  // Log the computed styles on tabpanels
  const computed = globalThis.getComputedStyle(tabpanels as Element);
  log.debug(`[insertGridHandles] tabpanels computed display=${computed.display}, grid-template-columns=${computed.gridTemplateColumns}, grid-template-rows=${computed.gridTemplateRows}`);

  const colHandle = document?.createXULElement("box");
  if (colHandle) {
    colHandle.className = "floorp-grid-handle";
    colHandle.setAttribute("data-orientation", "grid-col");
    colHandle.addEventListener("mousedown", (e: Event) => {
      onGridColHandleMouseDown(e as MouseEvent);
    });
    tabpanels.appendChild(colHandle);
  }

  const rowHandle = document?.createXULElement("box");
  if (rowHandle) {
    rowHandle.className = "floorp-grid-handle";
    rowHandle.setAttribute("data-orientation", "grid-row");
    rowHandle.addEventListener("mousedown", (e: Event) => {
      onGridRowHandleMouseDown(e as MouseEvent);
    });
    tabpanels.appendChild(rowHandle);
  }

  const centerHandle = document?.createXULElement("box");
  if (centerHandle) {
    centerHandle.className = "floorp-grid-handle";
    centerHandle.setAttribute("data-orientation", "grid-center");
    centerHandle.addEventListener("mousedown", (e: Event) => {
      onGridCenterHandleMouseDown(e as MouseEvent);
    });
    tabpanels.appendChild(centerHandle);
  }

  log.debug(`[insertGridHandles] 3 grid handles inserted`);
}

export function updateHandles(
  panelIds: string[],
  layout: SplitViewLayout,
): void {
  log.debug(`[updateHandles] layout=${layout}, panels=${panelIds.length}`);
  if (layout === "grid-2x2" && panelIds.length === 4) {
    insertGridHandles(panelIds);
  } else if (layout === "vertical") {
    insertFlexHandles(panelIds, "vertical");
  } else {
    insertFlexHandles(panelIds, "horizontal");
  }
}

// ===== Flex handle drag logic =====

function onFlexHandleMouseDown(
  e: MouseEvent,
  handleIndex: number,
  panelIds: string[],
  orientation: "horizontal" | "vertical",
): void {
  e.preventDefault();
  const tabpanels = getTabpanels() as HTMLElement | null;
  if (!tabpanels) return;

  log.debug(`[flexDrag:start] handleIndex=${handleIndex}, orientation=${orientation}`);
  tabpanels.setAttribute("data-floorp-dragging", "true");

  const panelBefore = document?.getElementById(panelIds[handleIndex]) as HTMLElement | null;
  const panelAfter = document?.getElementById(panelIds[handleIndex + 1]) as HTMLElement | null;
  if (!panelBefore || !panelAfter) {
    log.warn(`[flexDrag:start] panel element not found: before=${!!panelBefore}, after=${!!panelAfter}`);
    return;
  }

  const isHorizontal = orientation === "horizontal";
  const startPos = isHorizontal ? e.clientX : e.clientY;
  const beforeRect = panelBefore.getBoundingClientRect();
  const afterRect = panelAfter.getBoundingClientRect();
  const startBefore = isHorizontal ? beforeRect.width : beforeRect.height;
  const startAfter = isHorizontal ? afterRect.width : afterRect.height;
  const totalSize = startBefore + startAfter;

  const minPaneSize = 140;
  let frameRequested = false;
  let pendingBefore = startBefore;
  let pendingAfter = startAfter;

  const applyFrame = () => {
    frameRequested = false;
    const ratioBefore = pendingBefore / totalSize;
    const ratioAfter = pendingAfter / totalSize;
    panelBefore.style.setProperty("flex", `${ratioBefore} 1 0%`);
    panelAfter.style.setProperty("flex", `${ratioAfter} 1 0%`);
  };

  const onMouseMove = (e: MouseEvent) => {
    const currentPos = isHorizontal ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    const newBefore = Math.max(minPaneSize, Math.min(startBefore + delta, totalSize - minPaneSize));
    const newAfter = totalSize - newBefore;
    pendingBefore = newBefore;
    pendingAfter = newAfter;
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(applyFrame);
    }
  };

  const cleanup = () => {
    tabpanels.removeAttribute("data-floorp-dragging");
    document?.removeEventListener("mousemove", onMouseMove);
    document?.removeEventListener("mouseup", onMouseUp);
    if (activeDragCleanup === cleanup) activeDragCleanup = null;
  };

  const onMouseUp = () => {
    // Apply final position directly (rAF might miss it)
    applyFrame();
    cleanup();

    const ratios: number[] = [];
    for (const id of panelIds) {
      const el = document?.getElementById(id) as HTMLElement | null;
      if (el) {
        const flex = parseFloat(el.style.getPropertyValue("flex") || "1");
        ratios.push(flex);
      } else {
        ratios.push(1);
      }
    }
    const normalizedRatios = normalizeRatios(ratios, panelIds.length);
    log.debug(`[flexDrag:end] ratios=[${normalizedRatios.map(r => r.toFixed(3)).join(", ")}]`);
    setSplitViewPaneSizes((prev) => ({
      ...prev,
      flexRatios: normalizedRatios,
    }));
  };

  // Cancel any prior drag, register this one
  activeDragCleanup?.();
  activeDragCleanup = cleanup;
  document?.addEventListener("mousemove", onMouseMove);
  document?.addEventListener("mouseup", onMouseUp);
}

// ===== Grid handle drag logic =====

function onGridColHandleMouseDown(e: MouseEvent): void {
  e.preventDefault();
  const tabpanels = getTabpanels() as HTMLElement | null;
  if (!tabpanels) return;

  log.debug("[gridDrag:col:start]");
  tabpanels.setAttribute("data-floorp-dragging", "true");

  const tabpanelsRect = tabpanels.getBoundingClientRect();
  let frameRequested = false;
  let pendingRatio = splitViewPaneSizes().gridColRatio;

  const applyFrame = () => {
    frameRequested = false;
    const pct = (pendingRatio * 100).toFixed(2);
    tabpanels.style.setProperty("grid-template-columns", `${pct}% calc(100% - ${pct}%)`);
    tabpanels.style.setProperty("--floorp-grid-col-ratio", `${pct}%`);
  };

  const onMouseMove = (e: MouseEvent) => {
    const ratio = (e.clientX - tabpanelsRect.left) / tabpanelsRect.width;
    pendingRatio = Math.max(0.15, Math.min(0.85, ratio));
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(applyFrame);
    }
  };

  const cleanup = () => {
    tabpanels.removeAttribute("data-floorp-dragging");
    document?.removeEventListener("mousemove", onMouseMove);
    document?.removeEventListener("mouseup", onMouseUp);
    if (activeDragCleanup === cleanup) activeDragCleanup = null;
  };

  const onMouseUp = () => {
    applyFrame();
    cleanup();
    log.debug(`[gridDrag:col:end] ratio=${pendingRatio.toFixed(3)}`);
    setSplitViewPaneSizes((prev) => ({ ...prev, gridColRatio: pendingRatio }));
  };

  activeDragCleanup?.();
  activeDragCleanup = cleanup;
  document?.addEventListener("mousemove", onMouseMove);
  document?.addEventListener("mouseup", onMouseUp);
}

function onGridRowHandleMouseDown(e: MouseEvent): void {
  e.preventDefault();
  const tabpanels = getTabpanels() as HTMLElement | null;
  if (!tabpanels) return;

  log.debug("[gridDrag:row:start]");
  tabpanels.setAttribute("data-floorp-dragging", "true");

  const tabpanelsRect = tabpanels.getBoundingClientRect();
  let frameRequested = false;
  let pendingRatio = splitViewPaneSizes().gridRowRatio;

  const applyFrame = () => {
    frameRequested = false;
    const pct = (pendingRatio * 100).toFixed(2);
    tabpanels.style.setProperty("grid-template-rows", `${pct}% calc(100% - ${pct}%)`);
    tabpanels.style.setProperty("--floorp-grid-row-ratio", `${pct}%`);
  };

  const onMouseMove = (e: MouseEvent) => {
    const ratio = (e.clientY - tabpanelsRect.top) / tabpanelsRect.height;
    pendingRatio = Math.max(0.15, Math.min(0.85, ratio));
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(applyFrame);
    }
  };

  const cleanup = () => {
    tabpanels.removeAttribute("data-floorp-dragging");
    document?.removeEventListener("mousemove", onMouseMove);
    document?.removeEventListener("mouseup", onMouseUp);
    if (activeDragCleanup === cleanup) activeDragCleanup = null;
  };

  const onMouseUp = () => {
    applyFrame();
    cleanup();
    log.debug(`[gridDrag:row:end] ratio=${pendingRatio.toFixed(3)}`);
    setSplitViewPaneSizes((prev) => ({ ...prev, gridRowRatio: pendingRatio }));
  };

  activeDragCleanup?.();
  activeDragCleanup = cleanup;
  document?.addEventListener("mousemove", onMouseMove);
  document?.addEventListener("mouseup", onMouseUp);
}

function onGridCenterHandleMouseDown(e: MouseEvent): void {
  e.preventDefault();
  const tabpanels = getTabpanels() as HTMLElement | null;
  if (!tabpanels) return;

  log.debug("[gridDrag:center:start]");
  tabpanels.setAttribute("data-floorp-dragging", "true");

  const tabpanelsRect = tabpanels.getBoundingClientRect();
  let frameRequested = false;
  let pendingColRatio = splitViewPaneSizes().gridColRatio;
  let pendingRowRatio = splitViewPaneSizes().gridRowRatio;

  const applyFrame = () => {
    frameRequested = false;
    const colPct = (pendingColRatio * 100).toFixed(2);
    const rowPct = (pendingRowRatio * 100).toFixed(2);
    tabpanels.style.setProperty("grid-template-columns", `${colPct}% calc(100% - ${colPct}%)`);
    tabpanels.style.setProperty("grid-template-rows", `${rowPct}% calc(100% - ${rowPct}%)`);
    tabpanels.style.setProperty("--floorp-grid-col-ratio", `${colPct}%`);
    tabpanels.style.setProperty("--floorp-grid-row-ratio", `${rowPct}%`);
  };

  const onMouseMove = (e: MouseEvent) => {
    const colRatio = (e.clientX - tabpanelsRect.left) / tabpanelsRect.width;
    const rowRatio = (e.clientY - tabpanelsRect.top) / tabpanelsRect.height;
    pendingColRatio = Math.max(0.15, Math.min(0.85, colRatio));
    pendingRowRatio = Math.max(0.15, Math.min(0.85, rowRatio));
    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(applyFrame);
    }
  };

  const cleanup = () => {
    tabpanels.removeAttribute("data-floorp-dragging");
    document?.removeEventListener("mousemove", onMouseMove);
    document?.removeEventListener("mouseup", onMouseUp);
    if (activeDragCleanup === cleanup) activeDragCleanup = null;
  };

  const onMouseUp = () => {
    applyFrame();
    cleanup();
    log.debug(`[gridDrag:center:end] col=${pendingColRatio.toFixed(3)}, row=${pendingRowRatio.toFixed(3)}`);
    setSplitViewPaneSizes((prev) => ({
      ...prev,
      gridColRatio: pendingColRatio,
      gridRowRatio: pendingRowRatio,
    }));
  };

  activeDragCleanup?.();
  activeDragCleanup = cleanup;
  document?.addEventListener("mousemove", onMouseMove);
  document?.addEventListener("mouseup", onMouseUp);
}

// ===== Utilities =====

function normalizeRatios(ratios: number[], count: number): number[] {
  if (count <= 0) return [];
  if (ratios.length === count) {
    const validRatios = ratios.map((r) => (Number.isFinite(r) && r >= 0 ? r : 0));
    const sum = validRatios.reduce((a, b) => a + b, 0);
    if (sum > 0) return validRatios.map((r) => r / sum);
  }
  return Array.from({ length: count }, () => 1 / count);
}
