import Link from "next/link";
import { desc, inArray } from "drizzle-orm";

import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/card";
import { bookings, creatorProfiles, profiles, withUser } from "@/db";
import { requireSession } from "@/lib/auth/guards";
import { formatCents, formatDate } from "@/lib/utils";

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const session = await requireSession();
  const rows = await withUser(
    { userId: session.userId, role: session.role },
    async (tx) => {
      // RLS already scopes this to the caller's bookings
      const list = await tx.select().from(bookings).orderBy(desc(bookings.updatedAt));
      const creatorIds = [...new Set(list.map((b) => b.creatorId))];
      const brandIds = [...new Set(list.map((b) => b.brandId))];
      const [creators, brands] = await Promise.all([
        creatorIds.length
          ? tx.select().from(creatorProfiles).where(inArray(creatorProfiles.id, creatorIds))
          : Promise.resolve([]),
        brandIds.length
          ? tx.select().from(profiles).where(inArray(profiles.id, brandIds))
          : Promise.resolve([]),
      ]);
      return list.map((b) => ({
        ...b,
        creatorName:
          creators.find((c) => c.id === b.creatorId)?.displayName ?? "Creator",
        brandName: brands.find((p) => p.id === b.brandId)?.fullName ?? "Brand",
      }));
    },
  );
  const isBrand = session.role === "brand";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl text-text">Bookings</h1>
        <ul className="mt-6 space-y-3">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                href={`/bookings/${b.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-surface-raised"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{b.title}</p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {isBrand ? b.creatorName : b.brandName} · {formatDate(b.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num text-sm text-text-muted">
                    {formatCents(b.priceCents + b.feeCents)}
                  </span>
                  <Badge
                    tone={
                      b.status === "declined" || b.status === "cancelled"
                        ? "danger"
                        : "beam"
                    }
                  >
                    {b.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="rounded-lg border border-line bg-surface p-8 text-center text-sm text-text-muted">
              {isBrand
                ? "No bookings yet — find a creator storefront and start one."
                : "No bookings yet — publish your storefront to receive inquiries."}
            </li>
          )}
        </ul>
      </main>
    </>
  );
}
