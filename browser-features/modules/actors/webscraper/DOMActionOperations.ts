/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { DOMOpsDeps } from "./DOMDeps.ts";
import { unwrapElement, unwrapWindow } from "./utils.ts";

/**
 * Interaction-oriented DOM utilities (click/hover/keys/drag)
 */
export class DOMActionOperations {
  constructor(private deps: DOMOpsDeps) {}

  private get contentWindow(): (Window & typeof globalThis) | null {
    return this.deps.getContentWindow();
  }

  private get document(): Document | null {
    return this.deps.getDocument();
  }

  async clickElement(selector: string): Promise<boolean> {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return Promise.resolve(false);

      const elementTagName = element.tagName?.toLowerCase() || "element";
      const elementTextRaw = element.textContent?.trim() || "";
      const truncatedText = this.deps.translationHelper.truncate(
        elementTextRaw,
        30,
      );
      const elementInfo =
        elementTextRaw.length > 0
          ? await this.deps.translationHelper.translate(
              "clickElementWithText",
              {
                tag: elementTagName,
                text: truncatedText,
              },
            )
          : await this.deps.translationHelper.translate("clickElementNoText", {
              tag: elementTagName,
            });

      try {
        void element.nodeType;
      } catch {
        return false;
      }

      this.deps.eventDispatcher.scrollIntoViewIfNeeded(element);
      this.deps.eventDispatcher.focusElementSoft(element);

      const options = this.deps.highlightManager.getHighlightOptions("Click");

      this.deps.highlightManager
        .applyHighlight(element, options, elementInfo)
        .catch(() => {});

      const win = this.contentWindow ?? null;
      const rawWin = unwrapWindow(win);
      const rawElement = unwrapElement(
        element as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      const Ev = (rawWin?.Event ?? globalThis.Event) as typeof Event;
      const MouseEv = (rawWin?.MouseEvent ?? globalThis.MouseEvent ?? null) as
        | typeof MouseEvent
        | null;
      const cloneOpts = (opts: object) =>
        this.deps.eventDispatcher.cloneIntoPageContext(opts);

      const tagName = (element.tagName || "").toUpperCase();
      const isInput = tagName === "INPUT";
      const isButton = tagName === "BUTTON";
      const isLink = tagName === "A";
      const inputType = isInput
        ? ((element as HTMLInputElement).type || "").toLowerCase()
        : "";

      const triggerInputEvents = () => {
        try {
          rawElement.dispatchEvent(
            new Ev("input", cloneOpts({ bubbles: true })),
          );
          rawElement.dispatchEvent(
            new Ev("change", cloneOpts({ bubbles: true })),
          );
        } catch (err) {
          console.warn(
            "DOMActionOperations: input/change dispatch failed",
            err,
          );
        }
      };

      let stateChanged = false;

      if (isInput) {
        const inputEl = element as HTMLInputElement;
        if (inputType === "checkbox") {
          inputEl.checked = !inputEl.checked;
          triggerInputEvents();
          stateChanged = true;
        } else if (inputType === "radio") {
          if (!inputEl.checked) {
            inputEl.checked = true;
            triggerInputEvents();
          }
          stateChanged = true;
        }
      }

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let clickDispatched =
        this.deps.eventDispatcher.dispatchPointerClickSequence(
          element,
          centerX,
          centerY,
          0,
        );

      try {
        rawElement.click();
        clickDispatched = true;
      } catch {
        // ignore
      }

      if (!clickDispatched && MouseEv) {
        try {
          rawElement.dispatchEvent(
            new MouseEv(
              "click",
              this.deps.eventDispatcher.cloneEventInit({
                bubbles: true,
                cancelable: true,
                composed: true,
              }),
            ),
          );
          clickDispatched = true;
        } catch (err) {
          console.warn("DOMActionOperations: synthetic click failed", err);
        }
      }

      if ((isButton || isLink) && !clickDispatched) {
        try {
          rawElement.dispatchEvent(
            new Ev("submit", cloneOpts({ bubbles: true, cancelable: true })),
          );
        } catch (err) {
          console.warn("DOMActionOperations: submit dispatch failed", err);
        }
      }

      return stateChanged || clickDispatched;
    } catch (e) {
      console.error("DOMActionOperations: Error clicking element:", e);
      return Promise.resolve(false);
    }
  }

  async hoverElement(selector: string): Promise<boolean> {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return false;

      const elementInfo = await this.deps.translationHelper.translate(
        "hoverElement",
        {},
      );
      const options = this.deps.highlightManager.getHighlightOptions("Inspect");

      this.deps.highlightManager
        .applyHighlight(element, options, elementInfo)
        .catch(() => {});

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const win = this.contentWindow;
      const rawWin = unwrapWindow(win);
      const rawElement = unwrapElement(
        element as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      if (!rawWin) return false;

      const MouseEv = rawWin.MouseEvent ?? globalThis.MouseEvent;
      const cloneEvInit = (opts: Record<string, unknown>) =>
        this.deps.eventDispatcher.cloneEventInit(opts);

      rawElement.dispatchEvent(
        new MouseEv(
          "mouseenter",
          cloneEvInit({
            bubbles: false,
            cancelable: false,
            clientX: centerX,
            clientY: centerY,
          }),
        ),
      );
      rawElement.dispatchEvent(
        new MouseEv(
          "mouseover",
          cloneEvInit({
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
          }),
        ),
      );
      rawElement.dispatchEvent(
        new MouseEv(
          "mousemove",
          cloneEvInit({
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
          }),
        ),
      );

      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error hovering element:", e);
      return false;
    }
  }

  async scrollToElement(selector: string): Promise<boolean> {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return false;

      const elementInfo = await this.deps.translationHelper.translate(
        "scrollToElement",
        {},
      );
      const options = this.deps.highlightManager.getHighlightOptions("Inspect");

      element.scrollIntoView({ behavior: "smooth", block: "center" });

      this.deps.highlightManager
        .applyHighlight(element, options, elementInfo)
        .catch(() => {});

      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error scrolling to element:", e);
      return false;
    }
  }

  async doubleClickElement(selector: string): Promise<boolean> {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return false;

      const elementInfo = await this.deps.translationHelper.translate(
        "doubleClickElement",
        {},
      );
      const options = this.deps.highlightManager.getHighlightOptions("Click");

      this.deps.highlightManager
        .applyHighlight(element, options, elementInfo)
        .catch(() => {});

      this.deps.eventDispatcher.scrollIntoViewIfNeeded(element);
      this.deps.eventDispatcher.focusElementSoft(element);

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      this.deps.eventDispatcher.dispatchPointerClickSequence(
        element,
        centerX,
        centerY,
        0,
      );
      this.deps.eventDispatcher.dispatchPointerClickSequence(
        element,
        centerX,
        centerY,
        0,
      );

      const win = this.contentWindow;
      const rawWin = unwrapWindow(win);
      const rawElement = unwrapElement(
        element as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      if (!rawWin) return false;

      const MouseEv = rawWin.MouseEvent ?? globalThis.MouseEvent;

      rawElement.dispatchEvent(
        new MouseEv(
          "dblclick",
          this.deps.eventDispatcher.cloneEventInit({
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
            detail: 2,
          }),
        ),
      );

      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error double clicking element:", e);
      return false;
    }
  }

  async rightClickElement(selector: string): Promise<boolean> {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return false;

      const elementInfo = await this.deps.translationHelper.translate(
        "rightClickElement",
        {},
      );
      const options = this.deps.highlightManager.getHighlightOptions("Click");

      this.deps.highlightManager
        .applyHighlight(element, options, elementInfo)
        .catch(() => {});

      this.deps.eventDispatcher.scrollIntoViewIfNeeded(element);
      this.deps.eventDispatcher.focusElementSoft(element);

      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      this.deps.eventDispatcher.dispatchPointerClickSequence(
        element,
        centerX,
        centerY,
        2,
      );

      const win = this.contentWindow;
      const rawWin = unwrapWindow(win);
      const rawElement = unwrapElement(
        element as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      if (!rawWin) return false;

      const MouseEv = rawWin.MouseEvent ?? globalThis.MouseEvent;

      rawElement.dispatchEvent(
        new MouseEv(
          "contextmenu",
          this.deps.eventDispatcher.cloneEventInit({
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY,
            button: 2,
          }),
        ),
      );

      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error right clicking element:", e);
      return false;
    }
  }

  async focusElement(selector: string): Promise<boolean> {
    try {
      const element = this.document?.querySelector(selector) as HTMLElement;
      if (!element) return false;

      this.deps.eventDispatcher.scrollIntoViewIfNeeded(element);

      const elementInfo = await this.deps.translationHelper.translate(
        "focusElement",
        {},
      );
      const options = this.deps.highlightManager.getHighlightOptions("Input");

      this.deps.highlightManager
        .applyHighlight(element, options, elementInfo)
        .catch(() => {});

      const win = this.contentWindow;
      const rawWin = unwrapWindow(win);
      const rawElement = unwrapElement(
        element as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      if (!rawWin) return false;

      const FocusEv = rawWin.FocusEvent ?? globalThis.FocusEvent;

      if (typeof rawElement.focus === "function") {
        rawElement.focus();
      } else {
        element.focus();
      }

      const cloneOpts = (opts: object) =>
        this.deps.eventDispatcher.cloneIntoPageContext(opts);

      rawElement.dispatchEvent(
        new FocusEv("focus", cloneOpts({ bubbles: false })),
      );
      rawElement.dispatchEvent(
        new FocusEv("focusin", cloneOpts({ bubbles: true })),
      );

      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error focusing element:", e);
      return false;
    }
  }

  async pressKey(keyCombo: string): Promise<boolean> {
    try {
      const win = this.contentWindow;
      const doc = this.document;
      if (!win || !doc) return false;

      const parts = keyCombo
        .split("+")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 0) return false;
      const key = parts.pop() as string;
      const modifiers = parts;

      const active = (doc.activeElement as HTMLElement | null) ?? doc.body;
      const rawWin = unwrapWindow(win);
      const activeRaw = active
        ? unwrapElement(
            active as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
          )
        : null;
      if (!rawWin) return false;

      const KeyboardEv = rawWin.KeyboardEvent ?? globalThis.KeyboardEvent;

      const dispatch = (type: string, opts: KeyboardEventInit) => {
        try {
          return (
            activeRaw?.dispatchEvent(
              new KeyboardEv(
                type,
                this.deps.eventDispatcher.cloneEventInit(
                  opts as Record<string, unknown>,
                ),
              ),
            ) ?? false
          );
        } catch {
          return false;
        }
      };

      for (const mod of modifiers) {
        dispatch("keydown", { key: mod, code: mod, bubbles: true });
      }

      dispatch("keydown", { key, code: key, bubbles: true });
      dispatch("keypress", { key, code: key, bubbles: true });
      dispatch("keyup", { key, code: key, bubbles: true });

      for (const mod of modifiers.reverse()) {
        dispatch("keyup", { key: mod, code: mod, bubbles: true });
      }

      await Promise.resolve();
      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error pressing key:", e);
      return false;
    }
  }

  async dragAndDrop(
    sourceSelector: string,
    targetSelector: string,
  ): Promise<boolean> {
    try {
      const source = this.document?.querySelector(
        sourceSelector,
      ) as HTMLElement;
      const target = this.document?.querySelector(
        targetSelector,
      ) as HTMLElement;

      if (!source || !target) return false;

      this.deps.eventDispatcher.scrollIntoViewIfNeeded(source);
      this.deps.eventDispatcher.scrollIntoViewIfNeeded(target);

      const elementInfo = await this.deps.translationHelper.translate(
        "dragAndDrop",
        {},
      );
      const options = this.deps.highlightManager.getHighlightOptions("Input");

      this.deps.highlightManager
        .applyHighlight(source, options, elementInfo)
        .catch(() => {});
      this.deps.highlightManager
        .applyHighlight(target, options, elementInfo)
        .catch(() => {});

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceX = sourceRect.left + sourceRect.width / 2;
      const sourceY = sourceRect.top + sourceRect.height / 2;
      const targetX = targetRect.left + targetRect.width / 2;
      const targetY = targetRect.top + targetRect.height / 2;

      const win = this.contentWindow;
      const rawWin = unwrapWindow(win);
      const rawSource = unwrapElement(
        source as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      const rawTarget = unwrapElement(
        target as HTMLElement & Partial<{ wrappedJSObject: HTMLElement }>,
      );
      if (!rawWin) return false;

      const DragEv = rawWin.DragEvent ?? globalThis.DragEvent;
      const DataTransferCtor = rawWin.DataTransfer ?? globalThis.DataTransfer;

      const dataTransfer = new DataTransferCtor();

      // Clone serializable properties, then re-attach dataTransfer (non-clonable DOM object)
      const makeDragInit = (serializable: Record<string, unknown>) => {
        const cloned = this.deps.eventDispatcher.cloneEventInit(serializable);
        (cloned as Record<string, unknown>).dataTransfer = dataTransfer;
        return cloned;
      };

      rawSource.dispatchEvent(
        new DragEv(
          "dragstart",
          makeDragInit({
            bubbles: true,
            cancelable: true,
            clientX: sourceX,
            clientY: sourceY,
          }),
        ),
      );

      rawSource.dispatchEvent(
        new DragEv(
          "drag",
          makeDragInit({
            bubbles: true,
            cancelable: true,
            clientX: sourceX,
            clientY: sourceY,
          }),
        ),
      );

      rawTarget.dispatchEvent(
        new DragEv(
          "dragenter",
          makeDragInit({
            bubbles: true,
            cancelable: true,
            clientX: targetX,
            clientY: targetY,
          }),
        ),
      );

      rawTarget.dispatchEvent(
        new DragEv(
          "dragover",
          makeDragInit({
            bubbles: true,
            cancelable: true,
            clientX: targetX,
            clientY: targetY,
          }),
        ),
      );

      rawTarget.dispatchEvent(
        new DragEv(
          "drop",
          makeDragInit({
            bubbles: true,
            cancelable: true,
            clientX: targetX,
            clientY: targetY,
          }),
        ),
      );

      rawSource.dispatchEvent(
        new DragEv(
          "dragend",
          makeDragInit({
            bubbles: true,
            cancelable: false,
            clientX: targetX,
            clientY: targetY,
          }),
        ),
      );

      return true;
    } catch (e) {
      console.error("DOMActionOperations: Error in drag and drop:", e);
      return false;
    }
  }
}
