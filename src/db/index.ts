/**
 * The ONLY sanctioned database surface for application code.
 * Exports withUser (RLS-scoped tenant access) + schema + types — nothing
 * else. systemDb (owner) lives in rls.ts and is import-banned outside
 * scripts/; the auth_user connection lives in auth-db.ts and is reachable
 * only from src/lib/auth/**.
 */
export { withUser, type Db, type SessionIdentity } from "./rls";
export * from "./schema";
