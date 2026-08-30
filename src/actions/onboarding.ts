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
  try {
    await selectRole(session.userId, parsed.data.role, {
      fullName: parsed.data.fullName,
      company: parsed.data.company,
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") redirect("/dashboard"); // profile already exists
    return { error: "Could not save your role — try again." };
  }
  redirect(parsed.data.role === "creator" ? "/settings" : "/dashboard");
}
