/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Stable fingerprint generation for DOM elements
 *
 * Fingerprints are based on content and structure, not volatile attributes
 * like id/class/data-*. This allows element identification to survive
 * minor HTML attribute changes.
 */

/**
 * Element fingerprint containing short and full hash representations
 */
export interface ElementFingerprint {
  /** Short hash (8 chars) for embedding in markdown as HTML comment */
  short: string;
  /** Full hash (16 chars) for selector map entries */
  full: string;
  /** Structural path for debugging (e.g., "html/body/div[0]/p[1]") */
  path: string;
}

/**
 * Configuration for fingerprint generation
 */
export interface FingerprintOptions {
  /** Characters of text content to include in hash (default: 64) */
  textContentLength: number;
  /** Include sibling index in path (default: true) */
  includeSiblingIndex: boolean;
  /** Maximum depth to traverse for parent context (default: 3) */
  parentContextDepth: number;
  /** Attributes to exclude from fingerprinting (default: id, class, data-*, style) */
  excludedAttributes: string[];
}

const DEFAULT_OPTIONS: FingerprintOptions = {
  textContentLength: 64,
  includeSiblingIndex: true,
  parentContextDepth: 3,
  excludedAttributes: ["id", "class", "style", "data-*"],
};

/**
 * Simple non-cryptographic hash function (djb2 variant)
 * Fast and produces consistent results across runs
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Convert hash to base36 string (alphanumeric, lowercase)
 */
function toBase36(hash: number): string {
  return hash.toString(36).toLowerCase();
}

/**
 * Check if an attribute name should be excluded from fingerprinting
 */
function isExcludedAttribute(attrName: string, excluded: string[]): boolean {
  // Check exact matches
  if (excluded.includes(attrName)) {
    return true;
  }
  // Check prefix matches (e.g., "data-*")
  for (const excludedAttr of excluded) {
    if (excludedAttr.endsWith("*") && attrName.startsWith(excludedAttr.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a stable fingerprint for an element
 *
 * The fingerprint is based on:
 * - Tag name
 * - Text content (first N characters, normalized)
 * - Parent path (tag names + sibling indices)
 * - Child element count
 * - Attribute names (excluding id/class/style/data-*)
 *
 * @param element The DOM element to fingerprint
 * @param options Configuration options
 * @returns ElementFingerprint with short, full hash and path
 */
export function generateFingerprint(
  element: Element,
  options: Partial<FingerprintOptions> = {},
): ElementFingerprint {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Collect fingerprint components
  const components: string[] = [];

  // 1. Tag name (always include)
  components.push(element.nodeName.toLowerCase());

  // 2. Text content (first N characters, normalized)
  const textContent = (element.textContent || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, opts.textContentLength);
  if (textContent) {
    components.push(textContent);
  }

  // 3. Structural context (parent tags + sibling context)
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < opts.parentContextDepth) {
    const tagName = current.nodeName.toLowerCase();

    if (opts.includeSiblingIndex && current.parentElement && current.parentElement.children) {
      const siblings = Array.from(current.parentElement.children);
      const index = siblings.indexOf(current);
      path.unshift(`${tagName}[${index}]`);
    } else {
      path.unshift(tagName);
    }

    current = current.parentElement;
    depth++;
  }

  components.push(path.join("/"));

  // 4. Child element count (structural signature)
  components.push(`children:${element.children.length}`);

  // 5. Attribute names only (not values - those may change)
  const attrNames = Array.from(element.attributes)
    .map((a) => a.name)
    .filter((name) => !isExcludedAttribute(name, opts.excludedAttributes))
    .sort()
    .join(",");
  if (attrNames) {
    components.push(`attrs:${attrNames}`);
  }

  // Generate hashes
  const fingerprintString = components.join("|");
  const primaryHash = hashString(fingerprintString);
  const secondaryHash = hashString(fingerprintString + "_secondary");

  return {
    short: toBase36(primaryHash).slice(0, 8).padStart(8, "0"),
    full: (toBase36(primaryHash) + toBase36(secondaryHash)).slice(0, 16).padStart(16, "0"),
    path: path.join("/"),
  };
}

/**
 * Format fingerprint as HTML comment for embedding in markdown
 * @param fingerprint The fingerprint to format
 * @returns HTML comment string like "<!--fp:abc12345-->"
 */
export function formatFingerprintComment(fingerprint: ElementFingerprint): string {
  return `<!--fp:${fingerprint.short}-->`;
}

/**
 * Format fingerprint as selector map entry
 * @param fingerprint The fingerprint to format
 * @param tagName The element's tag name
 * @param textPreview Text preview for the entry
 * @returns Selector map entry string like "[abc12345def67890]: p \"Preview text\""
 */
export function formatSelectorMapEntry(
  fingerprint: ElementFingerprint,
  tagName: string,
  textPreview: string,
): string {
  // Escape double quotes and newlines in preview text
  const preview = textPreview
    .trim()
    .replace(/\n/g, " ")
    .replace(/"/g, '\\"')
    .slice(0, 50);
  return `[${fingerprint.full}]: ${tagName} "${preview}"`;
}

/**
 * Parsed fingerprint from markdown content
 */
export interface ParsedFingerprint {
  /** The fingerprint string */
  fingerprint: string;
  /** Start index in the markdown content */
  startIndex: number;
  /** End index in the markdown content */
  endIndex: number;
}

/**
 * Parse embedded fingerprints from markdown content
 * @param markdown Markdown content with embedded fingerprints
 * @returns Array of parsed fingerprints with their positions
 */
export function parseFingerprintsFromMarkdown(markdown: string): ParsedFingerprint[] {
  const regex = /<!--fp:([a-z0-9]{8})-->/g;
  const results: ParsedFingerprint[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    results.push({
      fingerprint: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return results;
}

/**
 * Selector map entry parsed from markdown
 */
export interface SelectorMapEntry {
  /** Full fingerprint (16 chars) */
  fingerprint: string;
  /** Element tag name */
  tagName: string;
  /** Text preview from the element */
  textPreview: string;
}

/**
 * Parse selector map from markdown content
 * @param markdown Markdown content with selector map
 * @returns Array of selector map entries
 */
export function parseSelectorMap(markdown: string): SelectorMapEntry[] {
  // Regex handles escaped quotes (\") within the text preview
  const regex = /\[([a-z0-9]{16})\]:\s*(\w+)\s*"((?:[^"\\]|\\.)*)"/g;
  const results: SelectorMapEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(markdown)) !== null) {
    // Unescape any escaped quotes in the text preview
    results.push({
      fingerprint: match[1],
      tagName: match[2],
      textPreview: match[3].replace(/\\"/g, '"'),
    });
  }

  return results;
}
