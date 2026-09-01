"use client";

import { useActionState, useEffect, useState } from "react";

import { transitionAction, type ActionState } from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/db";

const CTA_COPY: Partial<Record<BookingStatus, string>> = {
  proposal: "Send proposal",
  awaiting_payment: "Accept proposal",
};

/**
 * Role-gated status actions calling transitionBooking. Typed SD-function
 * errors surface as a toast, never a crash; disabled (later-phase) edges
 * render nothing — the DB would raise NotYetEnabled anyway.
 */
export function StatusActions({
  bookingId,
  actions,
}: {
  bookingId: string;
  actions: Array<{ to: BookingStatus; enabled: boolean }>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionAction,
    {},
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (state.error) {
      setToast(state.error);
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [state]);

  const enabled = actions.filter((a) => a.enabled && CTA_COPY[a.to]);
  if (enabled.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {enabled.map((a) => (
          <form action={formAction} key={a.to}>
            <input type="hidden" name="bookingId" value={bookingId} />
            <input type="hidden" name="to" value={a.to} />
            <Button type="submit" disabled={pending}>
              {pending ? "…" : CTA_COPY[a.to]}
            </Button>
          </form>
        ))}
      </div>
      <div aria-live="polite">
        {toast && (
          <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {toast}
          </p>
        )}
      </div>
    </div>
  );
}
