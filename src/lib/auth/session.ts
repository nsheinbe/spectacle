import { headers } from "next/headers";

import type { SessionIdentity, UserRole } from "../../db";
import { getAuth } from "./auth";

export type AppSession = {
  userId: string;
  /** null until the role-selection step completes */
  role: UserRole | null;
  email: string;
  name: string;
};

/**
 * The ONLY way application code learns who is calling — and the sole input
 * ever passed to withUser() (verify-gates' fs scan keeps it that way).
 * No domain read happens here: role rides on the Better Auth user record.
 */
export async function getServerSession(): Promise<AppSession | null> {
  const auth = getAuth();
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const rawRole = (s.user as { role?: string | null }).role ?? null;
  const role: UserRole | null =
    rawRole === "brand" || rawRole === "creator" || rawRole === "admin"
      ? rawRole
      : null;
  return { userId: s.user.id, role, email: s.user.email, name: s.user.name };
}

export class RoleNotSelectedError extends Error {
  constructor() {
    super("Role not selected yet");
    this.name = "RoleNotSelectedError";
  }
}

/** Narrow an AppSession to the identity withUser needs; throws pre-onboarding. */
export function toIdentity(session: AppSession): SessionIdentity {
  if (!session.role) throw new RoleNotSelectedError();
  return { userId: session.userId, role: session.role };
}
