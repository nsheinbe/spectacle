import { cn } from "@/lib/utils";
import type { BookingStatus } from "@/db";

const HAPPY_PATH: Array<{ status: BookingStatus; label: string }> = [
  { status: "inquiry", label: "Inquiry" },
  { status: "proposal", label: "Proposal" },
  { status: "awaiting_payment", label: "Awaiting payment" },
  { status: "funded", label: "Funded" },
  { status: "in_production", label: "In production" },
  { status: "delivered", label: "Delivered" },
  { status: "approved", label: "Approved" },
  { status: "paid_out", label: "Paid out" },
];

const TERMINAL: Partial<Record<BookingStatus, string>> = {
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Mobile-first progress stepper across the happy path. */
export function Stepper({ status }: { status: BookingStatus }) {
  const terminal = TERMINAL[status];
  const activeIndex = HAPPY_PATH.findIndex((s) => s.status === status);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Booking progress">
      {HAPPY_PATH.map((step, i) => {
        const reached = activeIndex >= 0 && i <= activeIndex;
        const current = i === activeIndex;
        return (
          <li key={step.status} className="flex items-center gap-1">
            {i > 0 && <span className={cn("h-px w-3", reached ? "bg-beam" : "bg-line")} />}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                current
                  ? "bg-beam text-canvas"
                  : reached
                    ? "text-beam"
                    : "text-text-faint",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
      {terminal && (
        <li className="rounded-sm bg-danger/15 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-danger">
          {terminal}
        </li>
      )}
    </ol>
  );
}
