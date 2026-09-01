import { eq } from "drizzle-orm";

import { profiles, withUser, type UserRole } from "../../db";
import { _authDb } from "../../db/auth-db";
import { user } from "../../db/schema";

/**
 * The role-selection step (post-signup), one action, two writes:
 *  1. the profiles row via withUser AS THE USER — the RLS INSERT policy is
 *     what pins role IN ('brand','creator') and id = app_uid(); 'admin' is
 *     unassignable through any app path (only owner SQL can promote), and
 *     verify-gates' canary row proves the harness would catch a dropped pin;
 *  2. the session-cache copy onto the Better Auth user row, as auth_user
 *     (its own tables — no domain grant involved).
 * profiles.role stays authoritative for the database; the user-row copy only
 * feeds getServerSession().
 *
 * The two writes hit different pools and are NOT atomic. If the stamp (2)
 * fails after (1) commits, the session role stays null and the retry's
 * profiles insert raises 23505 — so the duplicate path SELF-HEALS: it reads
 * the AUTHORITATIVE role back from profiles (never the resubmitted form
 * value, which may differ) and re-stamps it. Retrying therefore always
 * converges instead of bricking the account in an onboarding loop.
 *
 * Returns the EFFECTIVE role (which on a healed retry can differ from the
 * requested one) so the caller redirects correctly.
 */
export async function selectRole(
  userId: string,
  role: "brand" | "creator",
  details: { fullName: string; company?: string },
): Promise<UserRole> {
  let effectiveRole: UserRole = role;
  try {
    await withUser({ userId, role }, async (tx) => {
      await tx.insert(profiles).values({
        id: userId,
        role,
        fullName: details.fullName,
        company: details.company ?? "",
      });
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code !== "23505") throw err;
    const stored = await withUser({ userId, role }, async (tx) => {
      const [row] = await tx
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, userId));
      return row ?? null;
    });
    if (!stored) throw err;
    effectiveRole = stored.role;
  }
  await _authDb()
    .update(user)
    .set({ role: effectiveRole })
    .where(eq(user.id, userId));
  return effectiveRole;
}
