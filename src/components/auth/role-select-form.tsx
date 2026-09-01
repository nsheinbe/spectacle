"use client";

import { useActionState, useState } from "react";

import { selectRoleAction, type ActionState } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const ROLES = [
  {
    value: "brand",
    title: "I'm a brand",
    blurb: "Book spectacle campaigns from creators.",
  },
  {
    value: "creator",
    title: "I'm a creator",
    blurb: "Sell productized packages from your own storefront.",
  },
] as const;

export function RoleSelectForm() {
  const [role, setRole] = useState<"brand" | "creator">("brand");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    selectRoleAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="role" value={role} />
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRole(r.value)}
            aria-pressed={role === r.value}
            className={cn(
              "rounded-lg border p-4 text-left transition-colors",
              role === r.value
                ? "border-beam bg-beam/10"
                : "border-line bg-surface hover:bg-surface-raised",
            )}
          >
            <span className="block font-display text-xl text-text">{r.title}</span>
            <span className="mt-1 block text-sm text-text-muted">{r.blurb}</span>
          </button>
        ))}
      </div>
      <div>
        <Label htmlFor="fullName">Your name</Label>
        <Input id="fullName" name="fullName" required maxLength={120} />
      </div>
      {role === "brand" && (
        <div>
          <Label htmlFor="company">Company</Label>
          <Input id="company" name="company" maxLength={120} />
        </div>
      )}
      <FieldError message={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "…" : "Continue"}
      </Button>
      <p className="text-xs text-text-faint">
        This choice is permanent for this account — roles can&apos;t be switched later.
      </p>
    </form>
  );
}
