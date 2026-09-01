import { z } from "zod";

/**
 * Zod-parsed env surface. This is the complete inventory — verify-gates
 * derives its skip-safety list from the same shape (see .env.example).
 *
 * Connection strings and secrets are OPTIONAL at parse time so `next build`
 * succeeds without a database; anything that actually needs one calls
 * `need(...)` at use time and fails fast with a precise message. Bounded
 * numerics (PLATFORM_FEE_BPS) are validated here, not at call sites.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_OWNER: z.string().url().optional(),
  AUTH_DATABASE_URL: z.string().url().optional(),

  BETTER_AUTH_SECRET: z.string().min(16).optional(),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_DELIVERABLES: z.string().optional(),
  R2_BUCKET_PUBLIC: z.string().optional(),

  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(1000),
  FEATURE_BROWSE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Deployment-platform aliases, resolved before validation so the rest of the
 * codebase sees exactly one name for each value.
 *
 * - AUTH_SECRET is the conventional name on Vercel and what the deploy
 *   instructions ask for; BETTER_AUTH_SECRET stays authoritative when both are
 *   set, so an existing environment is never silently overridden.
 * - BETTER_AUTH_URL has to be an absolute origin — it signs callback URLs and
 *   scopes the session cookie. Vercel injects the deployment's own hostname,
 *   which is the right answer for preview deploys. A production deployment on a
 *   custom domain must set BETTER_AUTH_URL explicitly: VERCEL_URL there is the
 *   deployment hostname, not the domain OAuth providers are configured with.
 */
function resolveAliases(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const vercelHost =
    source.VERCEL_ENV === "production"
      ? source.VERCEL_PROJECT_PRODUCTION_URL
      : source.VERCEL_URL;
  return {
    ...source,
    BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET || source.AUTH_SECRET,
    BETTER_AUTH_URL:
      source.BETTER_AUTH_URL || (vercelHost ? `https://${vercelHost}` : undefined),
  };
}

function parseEnv(): Env {
  const result = envSchema.safeParse(resolveAliases(process.env));
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return result.data;
}

export const env: Env = parseEnv();

/** Fail-fast accessor for env vars that are optional at build time but required at use time. */
export function need<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable ${key} — see .env.example`,
    );
  }
  return value as NonNullable<Env[K]>;
}

/** True when every R2 variable is present (else LocalFsAdapter is used). */
export function r2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_DELIVERABLES &&
      env.R2_BUCKET_PUBLIC,
  );
}
