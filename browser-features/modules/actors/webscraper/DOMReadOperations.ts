/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { DOMOpsDeps } from "./DOMDeps.ts";
import type { GetTextOptions, AXNode } from "./types.ts";
import { unwrapElement } from "./utils.ts";
import { TurndownService } from "./turndown/index.ts";
import { findElementByFingerprint } from "./turndown/fingerprint.ts";

/**
 * Read-only DOM utilities (queries, getters)
 */
export class DOMReadOperations {
  constructor(private deps: DOMOpsDeps) {}

  /**
   * Fingerprint → Element reverse lookup cache.
   * Uses WeakRef so GC'd elements are automatically cleaned up.
   * Populated during getText() and used by resolveFingerprint().
   */
  private fingerprintIndex = new Map<string, WeakRef<Element>>();

  private get contentWindow(): (Window & typeof globalThis) | null {
    return this.deps.getContentWindow();
  }

  private get document(): Document | null {
    return this.deps.getDocument();
  }

  /** Shared converter for plain Markdown (no fingerprints) */
  private readonly plainConverter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  /** Shared converter for Markdown with embedded fingerprints */
  private readonly fingerprintConverter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    enableFingerprints: true,
  });

  /** Shared converter for Markdown with fingerprints + selector map */
  private readonly fingerprintWithMapConverter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    enableFingerprints: true,
    fingerprintSelectorMap: true,
  });

  getHTML(options?: { selector?: string }): string | null {
    try {
      const win = this.contentWindow;
      const doc = win?.document ?? null;
      if (!win || !doc) return null;

      // Scoped mode: return only the matching element's outerHTML
      if (options?.selector) {
        const el = doc.querySelector(options.selector);
        return el ? (el.outerHTML as unknown as string) : null;
      }

      const html = doc.documentElement?.outerHTML;

      const docElement = doc.documentElement;
      if (docElement) {
        this.deps.highlightManager.runAsyncInspection(
          docElement,
          "inspectPageHtml",
        );
      }

      if (!html) {
        return null;
      }
      return html.toString();
    } catch (e) {
      console.error("DOMReadOperations: Error getting HTML:", e);
      return null;
    }
  }

  /**
   * Extracts the main article content using Firefox's built-in Readability.
   * Strips navigation, ads, and sidebars, returning clean Markdown.
   */
  getArticle(): {
    title: string;
    byline: string;
    markdown: string;
    length: number;
  } | null {
    try {
      const doc = this.document;
      if (!doc) return null;

      // Readability mutates the DOM, so work on a clone
      const clone = doc.cloneNode(true) as Document;

      // Import Firefox's built-in Readability
      const { Readability } = ChromeUtils.importESModule(
        "resource://gre/modules/reader/Readability.sys.mjs",
      );

      const reader = new Readability(clone, { charThreshold: 100 });
      const article = reader.parse();
      if (!article) return null;

      // Convert article HTML to Markdown
      const tempContainer = doc.createElement("div");
      tempContainer.innerHTML = article.content;
      const markdown = this.plainConverter.turndown(tempContainer);

      return {
        title: article.title || "",
        byline: article.byline || "",
        markdown,
        length: article.length || 0,
      };
    } catch (e) {
      console.error("DOMReadOperations: Error getting article:", e);
      return null;
    }
  }

  getElement(selector: string): string | null {
    try {
      const element = this.document?.querySelector(selector) as Element | null;
      if (element) {
        this.deps.highlightManager.runAsyncInspection(
          element,
          "inspectGetElement",
          {
            selector,
          },
        );
        return String((element as Element).outerHTML);
      }
      return null;
    } catch (e) {
      console.error("DOMReadOperations: Error getting element:", e);
      return null;
    }
  }

  getElements(selector: string): string[] {
    try {
      const nodeList = this.document?.querySelectorAll(selector) as
        | NodeListOf<Element>
        | undefined;
      if (!nodeList) return [];

      const elements = Array.from(nodeList) as Element[];
      if (elements.length === 0) return [];

      // Run async inspection with found elements
      this.deps.highlightManager.runAsyncInspection(
        elements,
        "inspectGetElements",
        {
          selector,
          count: elements.length,
        },
      );

      // Extract outerHTML from each element
      return elements.map((el: Element) => String(el.outerHTML));
    } catch (e) {
      console.error("DOMReadOperations: Error getting elements:", e);
      return [];
    }
  }

  getElementByText(textContent: string): string | null {
    try {
      const doc = this.document;
      if (!doc?.body) return null;

      // Check root element first (TreeWalker skips the root node).
      // Only match body itself if the text is in body's direct text nodes,
      // not inherited from child elements — avoids returning the entire page HTML.
      const bodyText = doc.body.textContent;
      if (bodyText && bodyText.includes(textContent)) {
        const childText = Array.from(doc.body.children)
          .map((c) => c.textContent ?? "")
          .join("");
        if (!childText.includes(textContent)) {
          this.deps.highlightManager.runAsyncInspection(
            doc.body,
            "inspectGetElementByText",
            {
              text: this.deps.translationHelper.truncate(textContent, 30),
            },
          );
          return String(doc.body.outerHTML);
        }
      }

      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const el = node as Element;
        const txt = el.textContent;
        if (txt && txt.includes(textContent)) {
          this.deps.highlightManager.runAsyncInspection(
            el,
            "inspectGetElementByText",
            {
              text: this.deps.translationHelper.truncate(textContent, 30),
            },
          );
          return String(el.outerHTML);
        }
      }
      return null;
    } catch (e) {
      console.error("DOMReadOperations: Error getting element by text:", e);
      return null;
    }
  }

  getElementText(selector: string): string | null {
    try {
      const element = this.document?.querySelector(selector) as Element | null;
      if (element) {
        this.deps.highlightManager.runAsyncInspection(
          element,
          "inspectGetElementText",
          { selector },
        );
        return element.textContent?.trim() || null;
      }
      return null;
    } catch (e) {
      console.error("DOMReadOperations: Error getting element text:", e);
      return null;
    }
  }

  // Deprecated alias for getElementText - kept for backward compatibility
  getElementTextContent(selector: string): string | null {
    return this.getElementText(selector);
  }

  async getValue(selector: string): Promise<string | null> {
    try {
      const element = this.document?.querySelector(selector) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;
      if (!element) return null;

      const elementInfo = await this.deps.translationHelper.translate(
        "inspectGetValue",
        { selector },
      );
      this.deps.highlightManager
        .applyHighlight(element, { action: "InspectPeek" }, elementInfo, true)
        .catch(() => {});

      const win = this.contentWindow;
      if (win && element instanceof win.HTMLSelectElement) {
        return element.value ?? "";
      }

      if (
        win &&
        (element instanceof win.HTMLInputElement ||
          element instanceof win.HTMLTextAreaElement)
      ) {
        return element.value ?? "";
      }

      const maybeVal = (element as { value?: unknown }).value;
      if (maybeVal !== undefined) {
        return typeof maybeVal === "string" ? maybeVal : String(maybeVal ?? "");
      }

      return element.textContent ?? "";
    } catch (e) {
      console.error("DOMReadOperations: Error getting value:", e);
      return null;
    }
  }

  getAttribute(selector: string, attributeName: string): string | null {
    try {
      const element = this.document?.querySelector(selector) as Element | null;
      if (element) {
        this.deps.highlightManager.runAsyncInspection(
          element,
          "inspectGetElement",
          {
            selector,
          },
        );

        const directAttr = element.getAttribute(attributeName);
        if (directAttr !== null) return directAttr;

        const rawElement = unwrapElement(
          element as Element & Partial<{ wrappedJSObject: Element }>,
        );

        if (rawElement !== element) {
          const rawAttr = rawElement.getAttribute(attributeName);
          if (rawAttr !== null) return rawAttr;
        }

        if (attributeName === "aria-checked") {
          // Fallback to .checked property if it's an input
          try {
            if ("checked" in rawElement) {
              return (rawElement as HTMLInputElement).checked
                ? "true"
                : "false";
            }
          } catch (e) {
            console.error(
              "[NRWebScraper] Error accessing .checked property:",
              e,
            );
          }
        }

        return null;
      }
      return null;
    } catch (e) {
      console.error("DOMReadOperations: Error getting attribute:", e);
      return null;
    }
  }

  isVisible(selector: string): boolean {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return false;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      const style = this.contentWindow?.getComputedStyle(element);
      if (!style) return false;

      if (style.getPropertyValue("display") === "none") return false;
      if (style.getPropertyValue("visibility") === "hidden") return false;
      if (style.getPropertyValue("opacity") === "0") return false;

      return true;
    } catch (e) {
      console.error("DOMReadOperations: Error checking visibility:", e);
      return false;
    }
  }

  isEnabled(selector: string): boolean {
    try {
      const element = this.document?.querySelector(
        selector,
      ) as HTMLElement | null;
      if (!element) return false;

      if ("disabled" in element) {
        return !(element as HTMLInputElement | HTMLButtonElement).disabled;
      }

      const ariaDisabled = element.getAttribute("aria-disabled");
      if (ariaDisabled === "true") return false;

      return true;
    } catch (e) {
      console.error("DOMReadOperations: Error checking enabled state:", e);
      return false;
    }
  }

  getPageTitle(): string | null {
    try {
      return this.document?.title ?? null;
    } catch (e) {
      console.error("DOMReadOperations: Error getting page title:", e);
      return null;
    }
  }

  /**
   * Gets the page content as Markdown, optionally with element fingerprints.
   *
   * When fingerprints are enabled, each block element is prefixed with an
   * HTML comment containing its fingerprint: `<!--fp:abc12345-->`
   *
   * If includeSelectorMap is true, a selector map is appended at the end:
   * `fp:abc12345def67890 | p | "Preview text"`
   *
   * Supports three modes:
   * - "full" (default): Converts the entire body
   * - "scoped": Converts only the subtree matching `selector`
   * - "visible": Converts only elements within the viewport (+ margin)
   *
   * @param options GetTextOptions or boolean for backward compatibility
   * @returns Markdown content, or null on error
   */
  getText(options: GetTextOptions | boolean = {}): string | null {
    // Backward compatibility: boolean → { includeSelectorMap }
    if (typeof options === "boolean") {
      options = { includeSelectorMap: options };
    }

    const {
      mode = "full",
      selector,
      viewportMargin = 500,
      enableFingerprints = true,
      includeSelectorMap = false,
    } = options;

    try {
      const doc = this.document;
      if (!doc?.body) return null;

      // Determine the root element based on mode
      let root: Element;
      switch (mode) {
        case "scoped":
          if (!selector) return null;
          {
            const scoped = doc.querySelector(selector);
            if (!scoped) return null;
            root = scoped.cloneNode(true) as Element;
          }
          break;
        case "visible":
          root = this.buildVisibleSubtree(doc.body, viewportMargin);
          break;
        case "full":
        default:
          root = doc.body.cloneNode(true) as Element;
          break;
      }

      // Remove non-content elements before conversion (all modes)
      const elementsToRemove = root.querySelectorAll(
        'script, style, noscript, [class^="nr-webscraper-"], [id="nr-webscraper-highlight-style"]',
      );
      for (const elem of Array.from(elementsToRemove) as Element[]) {
        elem.remove();
      }

      // Select the appropriate cached converter
      let converter: TurndownService;
      if (includeSelectorMap) {
        converter = this.fingerprintWithMapConverter;
      } else if (enableFingerprints) {
        converter = this.fingerprintConverter;
      } else {
        converter = this.plainConverter;
      }

      const markdown = converter.turndown(root);
      if (!markdown) return null;

      let result = markdown;

      // full/scoped modes: also include Shadow DOM / iframe content
      if (mode !== "visible") {
        const originalRoot =
          mode === "scoped" && selector
            ? doc.querySelector(selector) || doc.body
            : doc.body;

        const shadowText = this.getTextFromShadowDOM(originalRoot);
        if (shadowText) {
          result +=
            "\n\n---\n\n#### Shadow DOM Content\n\n" +
            shadowText.trim() +
            "\n\n";
        }
        const iframeText = this.getTextFromIframes(doc);
        if (iframeText) {
          result +=
            "\n\n---\n\n#### iframe Content\n\n" +
            iframeText.trim() +
            "\n\n";
        }
      }

      // Normalize whitespace
      return result
        .replace(/\n{3,}/g, "\n\n") // Limit consecutive newlines
        .trim();
    } catch (e) {
      console.error("DOMReadOperations: Error getting text:", e);
      return null;
    }
  }

  /**
   * @deprecated Use getText({ includeSelectorMap }) instead
   */
  getTextWithFingerprints(includeSelectorMap: boolean = false): string | null {
    return this.getText({ includeSelectorMap });
  }

  /**
   * Builds a cloned subtree containing only elements visible within
   * the viewport (plus a configurable margin).
   *
   * Preserves ancestor structure of visible leaf elements so the
   * Markdown conversion retains semantic context (headings, lists, etc.).
   */
  private buildVisibleSubtree(body: Element, margin: number): Element {
    const win = this.contentWindow;
    if (!win) return body.cloneNode(true) as Element;

    const viewportHeight = win.innerHeight;
    const top = -margin;
    const bottom = viewportHeight + margin;

    // Collect visible elements
    const visibleSet = new Set<Element>();
    const walker = body.ownerDocument!.createTreeWalker(
      body,
      NodeFilter.SHOW_ELEMENT,
    );
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();

      // Outside viewport
      if (rect.bottom < top || rect.top > bottom) continue;
      // Zero size
      if (rect.width === 0 && rect.height === 0) continue;
      // CSS hidden
      const style = win.getComputedStyle(el);
      if (!style) continue;
      if (style.getPropertyValue("display") === "none" || style.getPropertyValue("visibility") === "hidden") continue;

      // Add this element and all ancestors to the visible set
      let current: Element | null = el;
      while (current && current !== body) {
        if (visibleSet.has(current)) break;
        visibleSet.add(current);
        current = current.parentElement;
      }
    }

    // Clone body and remove non-visible elements
    const clone = body.cloneNode(true) as Element;
    const cloneWalker = clone.ownerDocument!.createTreeWalker(
      clone,
      NodeFilter.SHOW_ELEMENT,
    );
    const originalWalker = body.ownerDocument!.createTreeWalker(
      body,
      NodeFilter.SHOW_ELEMENT,
    );
    const toRemove: Element[] = [];

    let cloneNode: Node | null;
    let origNode: Node | null;

    while (
      (cloneNode = cloneWalker.nextNode()) &&
      (origNode = originalWalker.nextNode())
    ) {
      if (!visibleSet.has(origNode as Element)) {
        toRemove.push(cloneNode as Element);
      }
    }

    for (const el of toRemove) {
      el.remove();
    }

    return clone;
  }

  /**
   * Resolves a fingerprint to a CSS selector.
   *
   * Checks the reverse-lookup cache first (O(1)), then falls back
   * to a full DOM scan via findElementByFingerprint().
   */
  resolveFingerprint(fingerprint: string): string | null {
    // 1. Try the cache
    const ref = this.fingerprintIndex.get(fingerprint);
    if (ref) {
      const el = ref.deref();
      if (el && el.ownerDocument?.contains(el)) {
        return this.generateUniqueSelector(el);
      }
      this.fingerprintIndex.delete(fingerprint);
    }

    // 2. Fallback: full DOM scan
    const doc = this.document;
    if (!doc?.body) return null;
    const el = findElementByFingerprint(doc.body, fingerprint);
    if (!el) return null;

    // Cache for future lookups
    this.fingerprintIndex.set(fingerprint, new WeakRef(el));
    return this.generateUniqueSelector(el);
  }

  /**
   * Generates a unique CSS selector for an element.
   */
  private generateUniqueSelector(element: Element): string | null {
    const doc = this.document;
    if (!doc) return null;

    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== doc.documentElement) {
      let selector = current.tagName.toLowerCase();

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

      if (current.hasAttribute("data-testid")) {
        selector += `[data-testid="${CSS.escape(current.getAttribute("data-testid") ?? "")}"]`;
      } else if (current.hasAttribute("name")) {
        selector += `[name="${CSS.escape(current.getAttribute("name") ?? "")}"]`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(" > ");
  }

  // =========================================================================
  // Accessibility Tree
  // =========================================================================

  /**
   * Builds an accessibility tree from ARIA attributes and HTML semantics.
   * Equivalent to Playwright's getAccessibilityTree({ interestingOnly }).
   */
  getAccessibilityTree(
    options: { interestingOnly?: boolean; root?: string } = {},
  ): AXNode | null {
    const { interestingOnly = true, root: rootSelector } = options;
    const doc = this.document;
    if (!doc) return null;

    const rootEl = rootSelector
      ? doc.querySelector(rootSelector)
      : doc.body;
    if (!rootEl) return null;

    return this.buildAXNode(rootEl as HTMLElement, interestingOnly);
  }

  private buildAXNode(
    el: HTMLElement,
    interestingOnly: boolean,
  ): AXNode | null {
    const win = this.contentWindow;
    if (!win) return null;

    // Skip hidden elements
    const style = win.getComputedStyle(el);
    if (!style) return null;
    if (style.getPropertyValue("display") === "none" || style.getPropertyValue("visibility") === "hidden") return null;
    if (el.getAttribute("aria-hidden") === "true") return null;

    const role = this.getAXRole(el);
    const name = this.getAccessibleName(el);

    // Recurse into children
    const children: AXNode[] = [];
    for (const child of el.children) {
      const childNode = this.buildAXNode(child as HTMLElement, interestingOnly);
      if (childNode) children.push(childNode);
    }

    // interestingOnly: skip meaningless container nodes
    if (interestingOnly) {
      const isInteresting =
        role !== "generic" ||
        name !== "" ||
        el.hasAttribute("aria-label") ||
        el.hasAttribute("aria-describedby") ||
        el.matches("a, button, input, select, textarea, [tabindex]");

      if (!isInteresting && children.length > 0) {
        return children.length === 1
          ? children[0]
          : { role: "group", name: "", children };
      }
      if (!isInteresting && children.length === 0) {
        const text = el.textContent?.trim() || "";
        if (!text) return null;
      }
    }

    const node: AXNode = { role, name, children };

    // Optional attributes
    if (win.HTMLInputElement && el instanceof win.HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") {
        node.checked = (el as unknown as { indeterminate?: boolean })
          .indeterminate
          ? "mixed"
          : el.checked;
      }
      if (el.value) node.value = el.value;
      if (el.disabled) node.disabled = true;
    }
    if (win.HTMLSelectElement && el instanceof win.HTMLSelectElement) {
      node.value = el.value;
    }
    if (el.hasAttribute("aria-expanded")) {
      node.expanded = el.getAttribute("aria-expanded") === "true";
    }
    if (el.hasAttribute("aria-selected")) {
      node.selected = el.getAttribute("aria-selected") === "true";
    }
    if (el.hasAttribute("aria-disabled")) {
      node.disabled = el.getAttribute("aria-disabled") === "true";
    }
    if (el.matches("h1,h2,h3,h4,h5,h6")) {
      node.level = parseInt(el.tagName[1]);
    }

    return node;
  }

  /** Returns the ARIA role: explicit role > implicit HTML semantics */
  private getAXRole(el: HTMLElement): string {
    const explicitRole = el.getAttribute("role");
    if (explicitRole) return explicitRole;

    const tag = el.tagName.toLowerCase();
    const implicitRoles: Record<string, string> = {
      a: el.hasAttribute("href") ? "link" : "generic",
      article: "article",
      aside: "complementary",
      button: "button",
      details: "group",
      dialog: "dialog",
      footer: "contentinfo",
      form: "form",
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      header: "banner",
      img: "img",
      input: this.getInputRole(el as unknown as HTMLInputElement),
      li: "listitem",
      main: "main",
      nav: "navigation",
      ol: "list",
      option: "option",
      progress: "progressbar",
      section:
        el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")
          ? "region"
          : "generic",
      select: "combobox",
      summary: "button",
      table: "table",
      tbody: "rowgroup",
      td: "cell",
      textarea: "textbox",
      th: "columnheader",
      tr: "row",
      ul: "list",
    };

    return implicitRoles[tag] || "generic";
  }

  private getInputRole(input: HTMLInputElement): string {
    const type = (input.type || "text").toLowerCase();
    const roles: Record<string, string> = {
      button: "button",
      checkbox: "checkbox",
      email: "textbox",
      number: "spinbutton",
      password: "textbox",
      radio: "radio",
      range: "slider",
      search: "searchbox",
      submit: "button",
      tel: "textbox",
      text: "textbox",
      url: "textbox",
    };
    return roles[type] || "textbox";
  }

  /** Simplified accessible name computation */
  private getAccessibleName(el: HTMLElement): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      const names = ids
        .map((id) => this.document?.getElementById(id)?.textContent?.trim() || "")
        .filter(Boolean);
      if (names.length > 0) return names.join(" ");
    }

    // <label for="...">
    const win = this.contentWindow;
    if (
      el.id &&
      win &&
      (el instanceof win.HTMLInputElement ||
        el instanceof win.HTMLSelectElement ||
        el instanceof win.HTMLTextAreaElement)
    ) {
      const label = this.document?.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent?.trim() || "";
    }

    if (el.tagName === "IMG") {
      return el.getAttribute("alt")?.trim() || "";
    }

    if (el.matches("button, a, summary, [role=button], [role=link]")) {
      return el.textContent?.trim() || "";
    }

    if (el.matches("h1,h2,h3,h4,h5,h6")) {
      return el.textContent?.trim() || "";
    }

    if (win && el instanceof win.HTMLInputElement) {
      return el.placeholder || "";
    }

    return "";
  }

  /**
   * Extracts text from Shadow DOM trees.
   * Uses TreeWalker for efficient traversal of large DOMs.
   */
  private getTextFromShadowDOM(root: Element, depth = 0): string {
    const MAX_SHADOW_DEPTH = 5;
    if (depth >= MAX_SHADOW_DEPTH) return "";
    let text = "";

    try {
      // Use TreeWalker for efficient traversal (avoids querySelectorAll("*"))
      const ownerDocument = root.ownerDocument ?? document;
      const walker = ownerDocument!.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const elem = node as Element;
        // shadowRoot exists on Element in Firefox's DOM but not in TypeScript's lib
        const shadowRoot = (elem as unknown as { shadowRoot?: ShadowRoot })
          .shadowRoot;
        if (shadowRoot) {
          // Extract text from shadow root using textContent
          const shadowBody = shadowRoot as unknown as { body?: HTMLElement };
          if (shadowBody.body) {
            const shadowText = shadowBody.body.textContent || "";
            if (shadowText) {
              text += shadowText + "\n";
            }
          } else {
            // Fallback: use textContent directly
            const shadowText = shadowRoot.textContent || "";
            if (shadowText) {
              text += shadowText + "\n";
            }
          }

          // Recursively handle nested shadow roots
          text += this.getTextFromShadowDOM(shadowRoot as unknown as Element, depth + 1);
        }
      }
    } catch (e) {
      console.error("DOMReadOperations: Error reading Shadow DOM:", e);
    }

    return text;
  }

  /**
   * Extracts text from same-origin iframes.
   * Cross-origin iframes are skipped due to security restrictions.
   * Also extracts text from Shadow DOM within iframes.
   */
  private getTextFromIframes(doc: Document): string {
    let text = "";

    try {
      const iframes = doc.querySelectorAll("iframe");

      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument;
          if (iframeDoc?.body) {
            const iframeBody = iframeDoc.body as HTMLElement;
            let iframeText = iframeBody.textContent || "";

            // Also extract from Shadow DOM within iframe
            const shadowText = this.getTextFromShadowDOM(iframeBody);
            if (shadowText) {
              iframeText += "\n" + shadowText;
            }

            if (iframeText) {
              text += iframeText + "\n";
            }
          }
        } catch (e) {
          // Skip cross-origin iframes (security restriction)
          // console.debug("Skipping cross-origin iframe");
        }
      }
    } catch (e) {
      console.error("DOMReadOperations: Error reading iframes:", e);
    }

    return text;
  }
}
