/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * NRWebScraperChild - Content process actor for web scraping operations
 *
 * This actor runs in the content process and provides functionality to:
 * - Extract HTML content from web pages
 * - Interact with DOM elements (input fields, textareas)
 * - Handle messages from the parent process WebScraper service
 * - Provide safe access to content window and document objects
 *
 * The actor is automatically created for each browser tab/content window
 * and communicates with the parent process through message passing.
 */

import type {
  NRWebScraperMessageData,
  WebScraperContext,
} from "./webscraper/types.ts";
import { DOMOperations } from "./webscraper/DOMOperations.ts";
import { FormOperations } from "./webscraper/FormOperations.ts";
import { ScreenshotOperations } from "./webscraper/ScreenshotOperations.ts";
import { findElementByFingerprint } from "./webscraper/turndown/fingerprint.ts";

export class NRWebScraperChild extends JSWindowActorChild {
  private domOps: DOMOperations | null = null;
  private formOps: FormOperations | null = null;
  private screenshotOps: ScreenshotOperations | null = null;
  private pageHideHandler: (() => void) | null = null;

  /**
   * Generate a unique CSS selector for an element
   * Tries id first, then falls back to path-based selector
   */
  private generateUniqueSelector(element: Element): string | null {
    const doc = this.document;
    if (!doc) return null;

    // Try ID first (most efficient)
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    // Build path-based selector
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== doc.documentElement) {
      let selector = current.tagName.toLowerCase();

      // Add nth-child if needed
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children);
        const sameTagSiblings = siblings.filter(
          (s) => s.tagName.toLowerCase() === selector,
        );
        if (sameTagSiblings.length > 1) {
          const index = sameTagSiblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      // Add specific attributes if available (escape values for safety)
      if (current.hasAttribute("data-testid")) {
        selector += `[data-testid="${CSS.escape(current.getAttribute("data-testid") ?? "")}"]`;
      } else if (current.hasAttribute("name")) {
        selector += `[name="${CSS.escape(current.getAttribute("name") ?? "")}"]`;
      } else if (current.hasAttribute("type")) {
        selector += `[type="${CSS.escape(current.getAttribute("type") ?? "")}"]`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(" > ");
  }

  /**
   * Lazily create and return the context object
   */
  private getContext(): WebScraperContext {
    return {
      contentWindow: this.contentWindow as (Window & typeof globalThis) | null,
      document: this.document,
      sendQuery: (name: string, data?: unknown) => this.sendQuery(name, data),
    };
  }

  /**
   * Get DOMOperations instance (lazy initialization)
   */
  private getDOMOps(): DOMOperations {
    if (!this.domOps) {
      this.domOps = new DOMOperations(this.getContext());
    }
    return this.domOps;
  }

  /**
   * Get FormOperations instance (lazy initialization)
   */
  private getFormOps(): FormOperations {
    if (!this.formOps) {
      this.formOps = new FormOperations(this.getContext());
    }
    return this.formOps;
  }

  /**
   * Get ScreenshotOperations instance (lazy initialization)
   */
  private getScreenshotOps(): ScreenshotOperations {
    if (!this.screenshotOps) {
      this.screenshotOps = new ScreenshotOperations(this.getContext());
    }
    return this.screenshotOps;
  }

  /**
   * Get HighlightManager from DOMOperations
   */
  private getHighlightManager() {
    return this.getDOMOps().getHighlightManager();
  }

  /**
   * Handles DOM events derived from JSWindowActor registration.
   * Required to prevent "Property 'handleEvent' is not callable" errors.
   */
  handleEvent(_event: Event): void {
    // No-op: We only listen to trigger actor creation or specific side-effects
  }

  /**
   * Called when the actor is created for a content window
   */
  actorCreated() {
    // SPAナビゲーション対応: pagehideイベントでクリーンアップ
    const win = this.contentWindow;
    if (win) {
      this.pageHideHandler = () => {
        this.getHighlightManager().cleanupHighlight();
        this.getHighlightManager().hideInfoPanel();
      };
      win.addEventListener("pagehide", this.pageHideHandler);
    }
  }

  /**
   * Called when the actor is about to be destroyed
   */
  willDestroy() {
    // pagehideイベントリスナーを解除
    const win = this.contentWindow;
    if (win && this.pageHideHandler) {
      try {
        win.removeEventListener("pagehide", this.pageHideHandler);
      } catch {
        // DeadObject - 無視
      }
    }
    this.pageHideHandler = null;

    // Clean up all operations
    if (this.domOps) {
      this.domOps.destroy();
      this.domOps = null;
    }
    if (this.formOps) {
      this.formOps.destroy();
      this.formOps = null;
    }
    this.screenshotOps = null;
  }

  /**
   * Handles incoming messages from the parent process
   */
  receiveMessage(message: { name: string; data?: NRWebScraperMessageData }) {
    const domOps = this.getDOMOps();
    const formOps = this.getFormOps();
    const screenshotOps = this.getScreenshotOps();
    const highlightManager = this.getHighlightManager();

    switch (message.name) {
      case "WebScraper:WaitForReady": {
        const to = message.data?.timeout || 15000;
        return domOps.waitForReady(to);
      }
      case "WebScraper:GetText":
        return domOps.getText(message.data?.includeSelectorMap ?? false);
      case "WebScraper:GetHTML":
        return domOps.getHTML();
      case "WebScraper:GetElements":
        if (message.data?.selector) {
          return domOps.getElements(message.data.selector);
        }
        break;
      case "WebScraper:GetElementByText":
        if (message.data?.textContent) {
          return domOps.getElementByText(message.data.textContent);
        }
        break;
      case "WebScraper:GetElementTextContent":
        if (message.data?.selector) {
          return domOps.getElementTextContent(message.data.selector);
        }
        break;
      case "WebScraper:GetElement":
        if (message.data?.selector) {
          return domOps.getElement(message.data.selector);
        }
        break;
      case "WebScraper:GetElementText":
        if (message.data?.selector) {
          return domOps.getElementText(message.data.selector);
        }
        break;
      case "WebScraper:GetValue":
        if (message.data?.selector) {
          return domOps.getValue(message.data.selector);
        }
        break;
      case "WebScraper:InputElement":
        if (message.data?.selector && typeof message.data.value === "string") {
          return domOps.inputElement(
            message.data.selector,
            message.data.value,
            {
              typingMode: message.data.typingMode,
              typingDelayMs: message.data.typingDelayMs,
            },
          );
        }
        break;
      case "WebScraper:ClickElement":
        if (message.data?.selector) {
          return domOps.clickElement(message.data.selector);
        }
        break;
      case "WebScraper:WaitForElement":
        if (message.data?.selector) {
          return domOps.waitForElement(
            message.data.selector,
            message.data.timeout || 5000,
            undefined,
            message.data.state || "attached",
          );
        }
        break;
      case "WebScraper:TakeScreenshot":
        return screenshotOps.takeScreenshot();
      case "WebScraper:TakeElementScreenshot":
        if (message.data?.selector) {
          return screenshotOps.takeElementScreenshot(message.data.selector);
        }
        break;
      case "WebScraper:TakeFullPageScreenshot":
        return screenshotOps.takeFullPageScreenshot();
      case "WebScraper:TakeRegionScreenshot":
        if (message.data) {
          return screenshotOps.takeRegionScreenshot(message.data.rect || {});
        }
        break;
      case "WebScraper:FillForm":
        if (message.data?.formData) {
          return formOps.fillForm(message.data.formData, {
            typingMode: message.data.typingMode,
            typingDelayMs: message.data.typingDelayMs,
          });
        }
        break;
      case "WebScraper:Submit":
        if (message.data?.selector) {
          return formOps.submit(message.data.selector);
        }
        break;
      case "WebScraper:ClearEffects":
        highlightManager.cleanupHighlight();
        highlightManager.hideInfoPanel();
        highlightManager.hideControlOverlay();
        return true;
      case "WebScraper:ShowControlOverlay":
        highlightManager.showControlOverlay();
        return true;
      case "WebScraper:HideControlOverlay":
        highlightManager.hideControlOverlay();
        return true;
      case "WebScraper:GetAttribute":
        if (message.data?.selector && message.data?.attributeName) {
          return domOps.getAttribute(
            message.data.selector,
            message.data.attributeName,
          );
        }
        break;
      case "WebScraper:IsVisible":
        if (message.data?.selector) {
          return domOps.isVisible(message.data.selector);
        }
        break;
      case "WebScraper:IsEnabled":
        if (message.data?.selector) {
          return domOps.isEnabled(message.data.selector);
        }
        break;
      case "WebScraper:ClearInput":
        if (message.data?.selector) {
          return domOps.clearInput(message.data.selector);
        }
        break;
      case "WebScraper:SelectOption":
        if (message.data?.selector && message.data?.optionValue !== undefined) {
          return domOps.selectOption(
            message.data.selector,
            message.data.optionValue,
          );
        }
        break;
      case "WebScraper:SetChecked":
        if (
          message.data?.selector &&
          typeof message.data?.checked === "boolean"
        ) {
          return domOps.setChecked(message.data.selector, message.data.checked);
        }
        break;
      case "WebScraper:HoverElement":
        if (message.data?.selector) {
          return domOps.hoverElement(message.data.selector);
        }
        break;
      case "WebScraper:ScrollToElement":
        if (message.data?.selector) {
          return domOps.scrollToElement(message.data.selector);
        }
        break;
      case "WebScraper:DoubleClick":
        if (message.data?.selector) {
          return domOps.doubleClickElement(message.data.selector);
        }
        break;
      case "WebScraper:RightClick":
        if (message.data?.selector) {
          return domOps.rightClickElement(message.data.selector);
        }
        break;
      case "WebScraper:Focus":
        if (message.data?.selector) {
          return domOps.focusElement(message.data.selector);
        }
        break;
      case "WebScraper:GetPageTitle":
        return domOps.getPageTitle();
      case "WebScraper:DragAndDrop":
        if (message.data?.selector && message.data?.targetSelector) {
          return domOps.dragAndDrop(
            message.data.selector,
            message.data.targetSelector,
          );
        }
        break;
      case "WebScraper:SetInnerHTML":
        if (
          message.data?.selector &&
          typeof message.data?.innerHTML === "string"
        ) {
          return domOps.setInnerHTML(
            message.data.selector,
            message.data.innerHTML,
          );
        }
        break;
      case "WebScraper:SetTextContent":
        if (
          message.data?.selector &&
          typeof message.data?.textContent === "string"
        ) {
          return domOps.setTextContent(
            message.data.selector,
            message.data.textContent,
          );
        }
        break;
      case "WebScraper:DispatchEvent":
        if (message.data?.selector && message.data?.eventType) {
          return domOps.dispatchEvent(
            message.data.selector,
            message.data.eventType,
            message.data.eventOptions,
          );
        }
        break;
      case "WebScraper:PressKey":
        if (message.data?.key) {
          return domOps.pressKey(message.data.key);
        }
        break;
      case "WebScraper:UploadFile":
        if (message.data?.selector && message.data?.filePath) {
          return domOps.uploadFile(
            message.data.selector,
            message.data.filePath,
          );
        }
        break;
      case "WebScraper:SetCookieString":
        if (message.data?.cookieString) {
          return domOps.setCookieString(
            message.data.cookieString,
            message.data.cookieName,
            message.data.cookieValue,
          );
        }
        break;
     case "WebScraper:DispatchTextInput": {
        const text = (
          message.data as (NRWebScraperMessageData & { text?: string }) | undefined
        )?.text;
        if (message.data?.selector && typeof text === "string") {
          return domOps.dispatchTextInput(message.data.selector, text);
        }
        break;
      }
      case "WebScraper:ResolveFingerprint":
        if (message.data?.fingerprint && this.document?.body) {
          const element = findElementByFingerprint(
            this.document.body,
            message.data.fingerprint,
          );
          if (element) {
            // Generate a unique CSS selector for this element
            return this.generateUniqueSelector(element);
          }
          return null;
        }
        break;

    }
    return null;
  }
}
