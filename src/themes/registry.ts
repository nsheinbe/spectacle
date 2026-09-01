import { ProjectionSignature } from "./projection-signature";
import type { ThemeDefinition } from "./types";
import type { Theme } from "../db/schema";

/**
 * The theme registry — verify-themes iterates this. Phase 1 ships
 * `projection` fully art-directed; the other four are deliberate base-dark
 * stubs (TODO: full art direction in a later pass) that still satisfy every
 * gate: AA stage contrast, a registered reduced-motion variant, no rAF loop.
 */
export const themeRegistry: Record<Theme, ThemeDefinition> = {
  projection: {
    name: "projection",
    label: "Projection mapping",
    stageTokens: {
      canvas: "#0a0714",
      surface: "#161028",
      text: "#f2ecff",
      textMuted: "#bfb3e0",
      textFaint: "#8b7fb3",
      accent: "#ffb24d",
    },
    reducedMotionVariant: "component-static",
    hasRafLoop: true,
    signatureFile: "src/themes/projection-signature.tsx",
    SignatureComponent: ProjectionSignature,
    stub: false,
  },
  fooh: {
    // TODO(theme): full FOOH/CGI art direction
    name: "fooh",
    label: "FOOH / CGI",
    stageTokens: {
      canvas: "#06090d",
      surface: "#101820",
      text: "#eaf4f8",
      textMuted: "#a8c3cf",
      textFaint: "#6e8894",
      accent: "#6fe3ff",
    },
    reducedMotionVariant: "static-gradient",
    hasRafLoop: false,
    stub: true,
  },
  anamorphic: {
    // TODO(theme): full anamorphic art direction
    name: "anamorphic",
    label: "Anamorphic billboard",
    stageTokens: {
      canvas: "#0b0a08",
      surface: "#17150f",
      text: "#f5f0e6",
      textMuted: "#c2baa6",
      textFaint: "#8d8672",
      accent: "#e8c15a",
    },
    reducedMotionVariant: "static-gradient",
    hasRafLoop: false,
    stub: true,
  },
  drone: {
    // TODO(theme): full drone-show art direction
    name: "drone",
    label: "Drone show",
    stageTokens: {
      canvas: "#050a08",
      surface: "#0e1713",
      text: "#eaf7f0",
      textMuted: "#a9c9bb",
      textFaint: "#6f9484",
      accent: "#7df0b2",
    },
    reducedMotionVariant: "static-gradient",
    hasRafLoop: false,
    stub: true,
  },
  street: {
    // TODO(theme): full street-art art direction
    name: "street",
    label: "Street art",
    stageTokens: {
      canvas: "#0d0709",
      surface: "#1a1114",
      text: "#f7edef",
      textMuted: "#cbb3ba",
      textFaint: "#967f87",
      accent: "#ff7a9c",
    },
    reducedMotionVariant: "static-gradient",
    hasRafLoop: false,
    stub: true,
  },
};

export function getTheme(name: Theme): ThemeDefinition {
  return themeRegistry[name];
}
