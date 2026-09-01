import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { randomUUID } from "node:crypto";

import { _authDb } from "../../db/auth-db";
import * as schema from "../../db/schema";
import { env, need } from "../env";

/**
 * Better Auth runs as `auth_user` (via _authDb / AUTH_DATABASE_URL): grants
 * on user/session/account/verification ONLY — never the owner, zero domain
 * grants. Its schema is checked into src/db/schema.ts and applied by the
 * owner migration chain; Better Auth's own migrator never runs.
 *
 * `role` is an additionalField stamped once by the role-selection Server
 * Action (see roles.ts) so getServerSession() carries {userId, role} with no
 * domain read. profiles.role (RLS-pinned to brand|creator at INSERT) stays
 * the authoritative copy for the database.
 */
function createAuth() {
  return betterAuth({
      database: drizzleAdapter(_authDb(), {
        provider: "pg",
        schema: {
          user: schema.user,
          session: schema.session,
          account: schema.account,
          verification: schema.verification,
        },
      }),
      secret: need("BETTER_AUTH_SECRET"),
      baseURL: env.BETTER_AUTH_URL,
      emailAndPassword: { enabled: true },
      socialProviders:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? {
              google: {
                clientId: env.GOOGLE_CLIENT_ID,
                clientSecret: env.GOOGLE_CLIENT_SECRET,
              },
            }
          : {},
      user: {
        additionalFields: {
          role: { type: "string", required: false, input: false },
        },
      },
      advanced: {
        database: {
          // uuid PKs everywhere (columns are uuid; Postgres casts the string)
          generateId: () => randomUUID(),
        },
      },
    });
}

let authInstance: ReturnType<typeof createAuth> | null = null;

export function getAuth() {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}
