import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { SiteHeader } from "@/components/site-header";
import { Badge, Card } from "@/components/ui/card";
import { bookings, creatorProfiles, withUser } from "@/db";
import { requireSession } from "@/lib/auth/guards";
import { formatCents } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const isBrand = session.role === "brand";

  const data = await withUser(
    { userId: session.userId, role: session.role },
    async (tx) => {
      const myBookings = await tx
        .select()
        .from(bookings)
        .orderBy(desc(bookings.updatedAt))
        .limit(8);
      const [storefront] = isBrand
        ? [null]
        : await tx
            .select()
            .from(creatorProfiles)
            .where(eq(creatorProfiles.userId, session.userId));
      return { myBookings, storefront };
    },
  );

  const needsAction = data.myBookings.filter((b) =>
    isBrand ? b.status === "proposal" : b.status === "inquiry",
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl text-text">
          {isBrand ? "Brand dashboard" : "Creator dashboard"}
        </h1>

        {!isBrand && (
          <Card className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-medium text-text">Your storefront</h2>
                {data.storefront ? (
                  <p className="mt-1 text-sm text-text-muted">
                    /c/{data.storefront.slug} ·{" "}
                    {data.storefront.published ? (
                      <span className="text-success">published</span>
                    ) : (
                      <span className="text-danger">unpublished</span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-text-muted">
                    Not set up yet — create it to receive bookings.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {data.storefront?.published && (
                  <Link
                    href={`/c/${data.storefront.slug}`}
                    className="rounded border border-line px-4 py-2 text-sm text-text hover:bg-surface-raised"
                  >
                    View
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="rounded bg-beam px-4 py-2 text-sm font-medium text-canvas hover:brightness-110"
                >
                  {data.storefront ? "Edit" : "Create"}
                </Link>
              </div>
            </div>
          </Card>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-faint">
            {isBrand ? "Proposals waiting on you" : "Inquiries waiting on you"}
          </h2>
          <ul className="mt-3 space-y-2">
            {needsAction.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-beam/40 bg-beam/5 p-4 hover:bg-beam/10"
                >
                  <span className="truncate font-medium text-text">{b.title}</span>
                  <span className="num shrink-0 text-sm text-beam">
                    {formatCents(b.priceCents + b.feeCents)}
                  </span>
                </Link>
              </li>
            ))}
            {needsAction.length === 0 && (
              <li className="text-sm text-text-muted">Nothing waiting on you.</li>
            )}
          </ul>
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-text-faint">
              Recent bookings
            </h2>
            <Link href="/bookings" className="text-sm text-beam hover:brightness-110">
              All bookings →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {data.myBookings.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/bookings/${b.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-surface-raised"
                >
                  <span className="truncate text-text">{b.title}</span>
                  <Badge
                    tone={
                      b.status === "declined" || b.status === "cancelled"
                        ? "danger"
                        : "neutral"
                    }
                  >
                    {b.status.replace(/_/g, " ")}
                  </Badge>
                </Link>
              </li>
            ))}
            {data.myBookings.length === 0 && (
              <li className="text-sm text-text-muted">No bookings yet.</li>
            )}
          </ul>
        </section>
      </main>
    </>
  );
}
