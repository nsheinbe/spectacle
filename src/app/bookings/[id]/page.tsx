import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { MessagePanel } from "@/components/bookings/message-panel";
import { StatusActions } from "@/components/bookings/status-actions";
import { Stepper } from "@/components/bookings/stepper";
import { SiteHeader } from "@/components/site-header";
import { Badge, Card } from "@/components/ui/card";
import {
  bookingEvents,
  bookings,
  creatorProfiles,
  deliverables,
  messages,
  profiles,
  withUser,
} from "@/db";
import { requireSession } from "@/lib/auth/guards";
import { availableTransitions } from "@/lib/bookings/transition";
import { formatCents, formatDate } from "@/lib/utils";
import { uuidSchema } from "@/lib/validation";

export const metadata = { title: "Booking" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  inquiry: "Inquiry",
  proposal: "Proposal",
  awaiting_payment: "Awaiting payment",
  funded: "Funded",
  in_production: "In production",
  delivered: "Delivered",
  approved: "Approved",
  paid_out: "Paid out",
  declined: "Declined",
  cancelled: "Cancelled",
};

export default async function BookingWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: rawId } = await params;
  // A non-UUID path segment would raise 22P02 in Postgres → 500; it is a 404.
  const parsedId = uuidSchema.safeParse(rawId);
  if (!parsedId.success) notFound();
  const id = parsedId.data;

  const data = await withUser(
    { userId: session.userId, role: session.role },
    async (tx) => {
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, id));
      if (!booking) return null;
      const [creator] = await tx
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, booking.creatorId));
      const participantIds = [booking.brandId, creator?.userId].filter(
        (x): x is string => Boolean(x),
      );
      const [events, msgs, files, people] = await Promise.all([
        tx
          .select()
          .from(bookingEvents)
          .where(eq(bookingEvents.bookingId, id))
          .orderBy(desc(bookingEvents.createdAt)),
        tx
          .select()
          .from(messages)
          .where(eq(messages.bookingId, id))
          .orderBy(asc(messages.createdAt)),
        tx
          .select()
          .from(deliverables)
          .where(eq(deliverables.bookingId, id))
          .orderBy(desc(deliverables.version)),
        tx.select().from(profiles).where(inArray(profiles.id, participantIds)),
      ]);
      return { booking, creator, events, msgs, files, people };
    },
  );
  if (!data) notFound();

  const { booking, creator, events, msgs, files, people } = data;
  const isBrand = booking.brandId === session.userId;
  const nameOf = (uid: string | null): string => {
    if (!uid) return "System";
    if (uid === session.userId) return "You";
    const p = people.find((x) => x.id === uid);
    if (p?.fullName) return p.fullName;
    return uid === booking.brandId ? "The brand" : (creator?.displayName ?? "The creator");
  };

  const actions = availableTransitions(booking.status, isBrand ? "brand" : "creator");

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-text-muted">
              {isBrand ? creator?.displayName : nameOf(booking.brandId)}
            </p>
            <h1 className="font-display text-3xl text-text">{booking.title}</h1>
          </div>
          <div className="text-right">
            <Badge tone={booking.status === "declined" || booking.status === "cancelled" ? "danger" : "beam"}>
              {STATUS_LABEL[booking.status]}
            </Badge>
            <p className="num mt-2 text-lg font-medium text-text">
              {formatCents(booking.priceCents + booking.feeCents)}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <Stepper status={booking.status} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-6">
            {booking.status === "awaiting_payment" && (
              <Card className="border-beam/40">
                <h2 className="font-display text-xl text-text">Proposal accepted</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  Payment arrives in Phase 2. Nothing has been charged and nothing is
                  simulated — when payments launch, this booking moves to{" "}
                  <span className="text-text">Funded</span> automatically after checkout.
                </p>
              </Card>
            )}

            {actions.some((a) => a.enabled) && (
              <Card>
                <h2 className="text-sm font-medium uppercase tracking-wide text-text-faint">
                  Your move
                </h2>
                <div className="mt-3">
                  <StatusActions bookingId={booking.id} actions={actions} />
                </div>
                {!isBrand && booking.status === "inquiry" && (
                  <p className="mt-2 text-xs text-text-faint">
                    Sending the proposal locks the price at package + usage rights.
                  </p>
                )}
              </Card>
            )}

            <Card>
              <h2 className="text-sm font-medium uppercase tracking-wide text-text-faint">
                Brief
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-muted">
                {booking.brief || "No brief provided yet."}
              </p>
            </Card>

            <Card>
              <h2 className="text-sm font-medium uppercase tracking-wide text-text-faint">
                Deliverables
              </h2>
              <ul className="mt-3 space-y-2">
                {files.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded border border-line bg-canvas px-3 py-2 text-sm"
                  >
                    <span className="truncate text-text">
                      v{f.version} · {f.fileName}
                    </span>
                    <span className="shrink-0 text-xs text-text-faint">
                      {formatDate(f.createdAt)}
                    </span>
                  </li>
                ))}
                {files.length === 0 && (
                  <li className="text-sm text-text-muted">
                    Deliverable versions appear here once production starts (Phase 2).
                  </li>
                )}
              </ul>
            </Card>

            <Card>
              <h2 className="text-sm font-medium uppercase tracking-wide text-text-faint">
                Timeline
              </h2>
              <ol className="mt-3 space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-beam" />
                    <div>
                      <p className="text-text">
                        {nameOf(e.actorId)} moved this to{" "}
                        <span className="font-medium">{STATUS_LABEL[e.toStatus]}</span>
                      </p>
                      <p className="text-xs text-text-faint">
                        {formatDate(e.createdAt)}
                        {e.priceCentsSnapshot !== null && (
                          <>
                            {" · "}
                            <span className="num">{formatCents(e.priceCentsSnapshot)}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
                <li className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-line" />
                  <div>
                    <p className="text-text">Inquiry created</p>
                    <p className="text-xs text-text-faint">{formatDate(booking.createdAt)}</p>
                  </div>
                </li>
              </ol>
            </Card>
          </div>

          <Card className="flex max-h-[70dvh] min-h-80 flex-col lg:sticky lg:top-20">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-faint">
              Messages
            </h2>
            <MessagePanel
              bookingId={booking.id}
              selfId={session.userId}
              messages={msgs.map((m) => ({
                id: m.id,
                body: m.body,
                senderId: m.senderId,
                senderName: nameOf(m.senderId),
                createdAt: formatDate(m.createdAt),
              }))}
            />
          </Card>
        </div>
      </main>
    </>
  );
}
