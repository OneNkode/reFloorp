/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type SplitViewLayout = "horizontal" | "vertical" | "grid-2x2";

export interface SplitViewConfig {
  layout: SplitViewLayout;
  maxPanes: number;
}

export interface SplitViewPaneSizes {
  /** For flex layouts: ratio per pane, e.g. [0.5, 0.5] or [0.33, 0.33, 0.34] */
  flexRatios: number[];
  /** For grid layout: column split ratio (0-1) */
  gridColRatio: number;
  /** For grid layout: row split ratio (0-1) */
  gridRowRatio: number;
}

export const DEFAULT_CONFIG: SplitViewConfig = {
  layout: "horizontal",
  maxPanes: 4,
};

export const DEFAULT_PANE_SIZES: SplitViewPaneSizes = {
  flexRatios: [0.5, 0.5],
  gridColRatio: 0.5,
  gridRowRatio: 0.5,
};

export const PREF_SPLIT_VIEW_CONFIG = "floorp.splitView.config";
export const PREF_SPLIT_VIEW_PANE_SIZES = "floorp.splitView.paneSizes";
