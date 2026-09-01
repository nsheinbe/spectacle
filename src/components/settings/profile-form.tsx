"use client";

import { useActionState } from "react";

import { updateProfileAction, type ActionState } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/field";
import type { Profile } from "@/db";

export function ProfileForm({ profile, isBrand }: { profile: Profile; isBrand: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProfileAction,
    {},
  );
  return (
    <Card>
      <h2 className="font-display text-xl text-text">Account</h2>
      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fullName">Your name</Label>
            <Input
              id="fullName"
              name="fullName"
              required
              maxLength={120}
              defaultValue={profile.fullName}
            />
          </div>
          {isBrand && (
            <div>
              <Label htmlFor="company">Company</Label>
              <Input id="company" name="company" maxLength={120} defaultValue={profile.company} />
            </div>
          )}
        </div>
        <FieldError message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}
