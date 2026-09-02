import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { getServerSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // same-origin paths only — never redirect to another host. A second
  // character of "/" OR "\" is rejected: URL parsers treat "/\evil.com" as
  // the protocol-relative "//evil.com".
  const safeNext = next && /^\/(?![/\\])/.test(next) ? next : null;
  const session = await getServerSession();
  if (session) redirect(session.role ? (safeNext ?? "/dashboard") : "/onboarding");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <h1 className="font-display text-3xl text-text">Spectacle</h1>
      <p className="mt-2 text-sm text-text-muted">
        Book the unmissable — projection, FOOH, anamorphic, drones, street art.
      </p>
      <div className="mt-8">
        <AuthForm googleEnabled={Boolean(env.GOOGLE_CLIENT_ID)} next={safeNext} />
      </div>
    </main>
  );
}
