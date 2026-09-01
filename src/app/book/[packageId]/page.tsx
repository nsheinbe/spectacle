import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { BookFlow } from "@/components/bookings/book-flow";
import { SiteHeader } from "@/components/site-header";
import {
  packages,
  publicCreatorView,
  usageRightsOptions,
  withUser,
} from "@/db";
import { requireSession } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { uuidSchema } from "@/lib/validation";

export const metadata = { title: "Book" };
export const dynamic = "force-dynamic";

/** Platform chrome (not themed): booking is a product surface, not a stage. */
export default async function BookPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const session = await requireSession("brand");
  const { packageId: rawPackageId } = await params;
  // A non-UUID path segment would raise 22P02 in Postgres → 500; it is a 404.
  const parsedPackageId = uuidSchema.safeParse(rawPackageId);
  if (!parsedPackageId.success) notFound();
  const packageId = parsedPackageId.data;

  const data = await withUser(
    { userId: session.userId, role: session.role },
    async (tx) => {
      const [pkg] = await tx
        .select()
        .from(packages)
        .where(and(eq(packages.id, packageId), eq(packages.active, true)));
      if (!pkg) return null;
      const [creator] = await tx
        .select()
        .from(publicCreatorView)
        .where(eq(publicCreatorView.id, pkg.creatorId));
      const rights = await tx
        .select()
        .from(usageRightsOptions)
        .where(
          and(
            eq(usageRightsOptions.creatorId, pkg.creatorId),
            eq(usageRightsOptions.active, true),
          ),
        )
        .orderBy(asc(usageRightsOptions.sort), asc(usageRightsOptions.priceDeltaCents));
      return { pkg, creator: creator ?? null, rights };
    },
  );
  if (!data || data.rights.length === 0) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <h1 className="font-display text-3xl text-text">Book a spectacle</h1>
        <div className="mt-6">
          <BookFlow
            pkg={{
              id: data.pkg.id,
              name: data.pkg.name,
              description: data.pkg.description,
              priceCents: data.pkg.priceCents,
              turnaroundDays: data.pkg.turnaroundDays,
              deliverableSummary: data.pkg.deliverableSummary,
              creatorName: data.creator?.displayName ?? "Creator",
            }}
            rights={data.rights.map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              priceDeltaCents: r.priceDeltaCents,
            }))}
            feeBps={env.PLATFORM_FEE_BPS}
          />
        </div>
      </main>
    </>
  );
}
