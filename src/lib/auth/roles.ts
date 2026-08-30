import { eq } from "drizzle-orm";

import { profiles, withUser } from "../../db";
import { _authDb } from "../../db/auth-db";
import { user } from "../../db/schema";

/**
 * The role-selection step (post-signup), one action, two writes:
 *  1. the profiles row via withUser AS THE USER — the RLS INSERT policy is
 *     what pins role IN ('brand','creator') and id = app_uid(); 'admin' is
 *     unassignable through any app path (only owner SQL can promote), and
 *     verify-gates' canary row 10 proves the harness would catch a dropped pin;
 *  2. the session-cache copy onto the Better Auth user row, as auth_user
 *     (its own tables — no domain grant involved).
 * profiles.role stays authoritative for the database; the user-row copy only
 * feeds getServerSession().
 */
export async function selectRole(
  userId: string,
  role: "brand" | "creator",
  details: { fullName: string; company?: string },
): Promise<void> {
  await withUser({ userId, role }, async (tx) => {
    await tx.insert(profiles).values({
      id: userId,
      role,
      fullName: details.fullName,
      company: details.company ?? "",
    });
  });
  await _authDb().update(user).set({ role }).where(eq(user.id, userId));
}
