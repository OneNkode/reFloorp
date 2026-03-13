/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Valid states for element waiting operations
 */
export type WaitForElementState =
  | "attached" // element exists in DOM
  | "visible" // element is visible
  | "hidden" // element is hidden
  | "detached"; // element is removed from DOM
