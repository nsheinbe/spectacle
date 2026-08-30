"use server";

import { redirect } from "next/navigation";

import { selectRole } from "@/lib/auth/roles";
import { getServerSession } from "@/lib/auth/session";
import { roleSelectionSchema } from "@/lib/validation";

export type ActionState = { error?: string };

export async function selectRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role) redirect("/dashboard");

  const parsed = roleSelectionSchema.safeParse({
    role: formData.get("role"),
    fullName: formData.get("fullName"),
    company: formData.get("company") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  let effectiveRole: string;
  try {
    // selectRole self-heals duplicate-profile retries (a prior attempt that
    // crashed between its two writes) and returns the authoritative role.
    effectiveRole = await selectRole(session.userId, parsed.data.role, {
      fullName: parsed.data.fullName,
      company: parsed.data.company,
    });
  } catch {
    return { error: "Could not save your role — try again." };
  }
  redirect(effectiveRole === "creator" ? "/settings" : "/dashboard");
}
