import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// Import ban (security boundary): src/db/index.ts is the ONLY sanctioned DB
// surface for application code. The module-level ban below applies to ALL of
// src/** except src/db/** — it catches src/lib/** laundering, not just app
// routes. `systemDb` (spectacle_owner) is reachable only from scripts/
// (migrate/seed/verify) and, in Phase 2, an allowlisted webhook handler.
// verify-gates.ts mirrors this ban with an fs scan so it is fail-closed even
// if ESLint is skipped.
const dbImportBan = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/db/**"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/db/rls", "**/db/rls.js", "@/db/rls"],
            message:
              "Import withUser from '@/db' (src/db/index.ts). rls.ts also exports systemDb (owner, bypasses RLS) and must not be imported by app code.",
          },
          {
            group: ["**/db/client.internal", "@/db/client.internal"],
            message: "Private module. Import from '@/db' instead.",
          },
          {
            group: ["**/db/auth-db", "@/db/auth-db"],
            message:
              "Private module (auth_user connection). Only src/lib/auth/** may touch Better Auth's database.",
          },
        ],
      },
    ],
  },
};

// src/lib/auth/** legitimately needs the auth_user connection (_authDb) but
// still must never reach rls.ts/client.internal.
const authDbException = {
  files: ["src/lib/auth/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/db/rls", "**/db/rls.js", "@/db/rls"],
            message:
              "Import withUser from '@/db'. systemDb is not available to auth code.",
          },
          {
            group: ["**/db/client.internal", "@/db/client.internal"],
            message: "Private module. Import from '@/db' instead.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  dbImportBan,
  authDbException,
  {
    ignores: ["node_modules/**", ".next/**", "drizzle/**", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
