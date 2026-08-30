import type { CSSProperties, ReactNode } from "react";

import { getTheme } from "./registry";
import type { Theme } from "../db/schema";

/**
 * Scopes a theme's stage tokens to THIS subtree only, via CSS custom
 * properties on the [data-stage] element. Nothing outside the stage — the
 * booking rail above all — ever sees these values.
 */
export function ThemeProvider({
  theme,
  children,
  className,
}: {
  theme: Theme;
  children: ReactNode;
  className?: string;
}) {
  const def = getTheme(theme);
  const vars = {
    "--stage-canvas": def.stageTokens.canvas,
    "--stage-surface": def.stageTokens.surface,
    "--stage-text": def.stageTokens.text,
    "--stage-text-muted": def.stageTokens.textMuted,
    "--stage-text-faint": def.stageTokens.textFaint,
    "--stage-accent": def.stageTokens.accent,
  } as CSSProperties;

  return (
    <div data-stage data-theme={theme} style={vars} className={className}>
      {children}
    </div>
  );
}
