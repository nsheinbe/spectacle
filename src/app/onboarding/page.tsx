import { redirect } from "next/navigation";

import { RoleSelectForm } from "@/components/auth/role-select-form";
import { getServerSession } from "@/lib/auth/session";

export const metadata = { title: "Choose your side" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-12">
      <h1 className="font-display text-3xl text-text">Who are you here as?</h1>
      <p className="mt-2 text-sm text-text-muted">
        Welcome, {session.name.split(" ")[0] || "friend"}.
      </p>
      <div className="mt-8">
        <RoleSelectForm />
      </div>
    </main>
  );
}
