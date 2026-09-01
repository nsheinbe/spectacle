import type { ComponentType } from "react";

import type { Theme } from "../db/schema";

/**
 * Stage tokens are the ONLY colors a theme controls, and they apply ONLY
 * under [data-stage] (ThemeProvider scopes them). The booking rail is a
 * route-level sibling of the stage with its own constant background — it
 * never inherits these, and src/components/rail/** may not import
 * src/themes/** (ESLint + verify-themes enforce).
 *
 * Contrast contract (verify-themes proves per theme):
 *   text, textMuted  vs canvas AND surface — AA normal text (>= 4.5)
 *   textFaint        vs canvas — large-text-only role (>= 3.0, use >= 18px)
 *   accent           vs canvas — UI component contrast (>= 3.0)
 */
export type StageTokens = {
  canvas: string;
  surface: string;
  text: string;
  textMuted: string;
  /** large-text-only (>=18px) — never used for body copy */
  textFaint: string;
  accent: string;
};

export type SignatureProps = {
  /** static variant forced on (prefers-reduced-motion or stub themes) */
  reducedMotion?: boolean;
};

export type ThemeDefinition = {
  name: Theme;
  label: string;
  stageTokens: StageTokens;
  /**
   * Every theme MUST register a static reduced-motion variant. For themes
   * with a SignatureComponent this is the component rendered with
   * reducedMotion; for stubs it is the static gradient described here.
   */
  reducedMotionVariant: "static-gradient" | "component-static";
  /** true only when SignatureComponent runs a rAF/canvas loop (max 1/page) */
  hasRafLoop: boolean;
  /** file the loop lives in, relative to repo root — verify-themes scans it */
  signatureFile?: string;
  SignatureComponent?: ComponentType<SignatureProps>;
  /** whether this theme is fully art-directed or a Phase-1 base-dark stub */
  stub: boolean;
};
