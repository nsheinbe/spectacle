"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { authClient } from "@/lib/auth/auth-client";

export function AuthForm({
  googleEnabled,
  next,
}: {
  googleEnabled: boolean;
  /** pre-validated same-origin path from ?next (middleware bounce target) */
  next: string | null;
}) {
  const router = useRouter();
  // /onboarding forwards onboarded users to /dashboard; users mid-booking
  // land back where the middleware bounced them from.
  const destination = next ?? "/onboarding";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "");
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    router.push(mode === "signup" ? "/onboarding" : destination);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex rounded border border-line p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              "flex-1 rounded-sm py-2 text-sm font-medium transition-colors " +
              (mode === m ? "bg-surface-raised text-text" : "text-text-muted hover:text-text")
            }
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={120} autoComplete="name" />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
        <FieldError message={error ?? undefined} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>
      {googleEnabled && (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => authClient.signIn.social({ provider: "google", callbackURL: destination })}
        >
          Continue with Google
        </Button>
      )}
    </div>
  );
}
