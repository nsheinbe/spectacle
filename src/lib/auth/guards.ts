import { redirect } from "next/navigation";

import type { UserRole } from "../../db";
import { getServerSession, type AppSession } from "./session";

export type OnboardedSession = AppSession & { role: UserRole };

/**
 * Server-side guard matrix (middleware already bounced cookie-less visitors):
 * no session → /auth; session without a selected role → /onboarding;
 * wrong role for the surface → /dashboard.
 */
export async function requireSession(role?: UserRole): Promise<OnboardedSession> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (!session.role) redirect("/onboarding");
  if (role && session.role !== role) redirect("/dashboard");
  return session as OnboardedSession;
}
