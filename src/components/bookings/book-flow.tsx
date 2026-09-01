"use client";

import { useActionState, useState } from "react";

import { createBookingAction, type ActionState } from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import { cn, formatCents } from "@/lib/utils";

type PackageView = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  turnaroundDays: number;
  deliverableSummary: string;
  creatorName: string;
};

type RightsView = {
  id: string;
  name: string;
  description: string;
  priceDeltaCents: number;
};

const STEPS = ["Package", "Usage rights", "Brief"] as const;

/**
 * Three steps → a booking at `inquiry`. The total shown is an estimate the
 * server re-derives; nothing here charges anything — the honest payment
 * placeholder says exactly when money would move (Phase 2).
 */
export function BookFlow({
  pkg,
  rights,
  feeBps,
}: {
  pkg: PackageView;
  rights: RightsView[];
  feeBps: number;
}) {
  const [step, setStep] = useState(0);
  const [rightsId, setRightsId] = useState<string | null>(rights[0]?.id ?? null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createBookingAction,
    {},
  );

  const selectedRights = rights.find((r) => r.id === rightsId) ?? null;
  const subtotal = pkg.priceCents + (selectedRights?.priceDeltaCents ?? 0);
  const fee = Math.floor((subtotal * feeBps) / 10_000);

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "rounded-sm px-2 py-1",
              i === step ? "bg-beam text-canvas" : i < step ? "text-beam" : "text-text-faint",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="text-sm text-text-muted">{pkg.creatorName}</p>
            <h2 className="mt-1 font-display text-2xl text-text">{pkg.name}</h2>
            {pkg.description && <p className="mt-2 text-sm text-text-muted">{pkg.description}</p>}
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Base price</dt>
                <dd className="num text-text">{formatCents(pkg.priceCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Turnaround</dt>
                <dd className="num text-text">~{pkg.turnaroundDays} days</dd>
              </div>
              {pkg.deliverableSummary && (
                <div className="flex justify-between gap-6">
                  <dt className="text-text-muted">You get</dt>
                  <dd className="text-right text-text">{pkg.deliverableSummary}</dd>
                </div>
              )}
            </dl>
          </div>
          <Button onClick={() => setStep(1)} className="w-full">
            Choose usage rights
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-3" role="radiogroup" aria-label="Usage rights">
            {rights.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={rightsId === r.id}
                onClick={() => setRightsId(r.id)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  rightsId === r.id
                    ? "border-beam bg-beam/10"
                    : "border-line bg-surface hover:bg-surface-raised",
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-text">{r.name}</span>
                  <span className="num shrink-0 text-beam">
                    {r.priceDeltaCents > 0 ? `+${formatCents(r.priceDeltaCents)}` : "Included"}
                  </span>
                </span>
                {r.description && (
                  <span className="mt-1 block text-sm text-text-muted">{r.description}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={() => setStep(2)} disabled={!rightsId} className="flex-1">
              Write the brief
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="packageId" value={pkg.id} />
          <input type="hidden" name="usageRightsOptionId" value={rightsId ?? ""} />
          <div>
            <Label htmlFor="title">Campaign title</Label>
            <Input id="title" name="title" required maxLength={140} placeholder="Spring launch takeover" />
          </div>
          <div>
            <Label htmlFor="brief">Brief</Label>
            <Textarea
              id="brief"
              name="brief"
              maxLength={8000}
              className="min-h-40"
              placeholder="Location ideas, dates, creative direction, references…"
            />
          </div>
          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Package + rights</span>
              <span className="num text-text">{formatCents(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-text-muted">Platform fee</span>
              <span className="num text-text">{formatCents(fee)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
              <span className="text-text">Estimated total</span>
              <span className="num text-beam">{formatCents(subtotal + fee)}</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-text-faint">
              No payment today. This sends an inquiry; the creator responds with a proposal
              and the final price. Payment collection arrives in Phase 2 — nothing is
              charged or simulated.
            </p>
          </div>
          <FieldError message={state.error} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button type="submit" disabled={pending || !rightsId} className="flex-1">
              {pending ? "…" : "Send inquiry"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
