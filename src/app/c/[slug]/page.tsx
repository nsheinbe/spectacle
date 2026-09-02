import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { eq, and, asc, desc } from "drizzle-orm";

import { BookingRail } from "@/components/rail/booking-rail";
import { SiteHeader } from "@/components/site-header";
import { Stage } from "@/components/stage/stage";
import {
  packages,
  portfolioItems,
  publicCreatorView,
  reviews,
  usageRightsOptions,
  withUser,
  type Theme,
} from "@/db";

export const dynamic = "force-dynamic";

/**
 * Public themed storefront. Anonymous read path: withUser(null) — RLS shows
 * only published creators; missing and unpublished slugs both 404 with the
 * SAME response (no existence oracle). React cache(): generateMetadata and
 * the page share one load per request instead of two transactions.
 */
const loadStorefront = cache(async (slug: string) => {
  return withUser(null, async (tx) => {
    const [creator] = await tx
      .select()
      .from(publicCreatorView)
      .where(eq(publicCreatorView.slug, slug));
    if (!creator || !creator.id) return null;
    const creatorId = creator.id;
    const [pkgs, rights, portfolio, revs] = await Promise.all([
      tx
        .select()
        .from(packages)
        .where(and(eq(packages.creatorId, creatorId), eq(packages.active, true)))
        .orderBy(asc(packages.sort), asc(packages.priceCents)),
      tx
        .select()
        .from(usageRightsOptions)
        .where(
          and(
            eq(usageRightsOptions.creatorId, creatorId),
            eq(usageRightsOptions.active, true),
          ),
        )
        .orderBy(asc(usageRightsOptions.sort), asc(usageRightsOptions.priceDeltaCents)),
      tx
        .select()
        .from(portfolioItems)
        .where(eq(portfolioItems.creatorId, creatorId))
        .orderBy(asc(portfolioItems.sort)),
      tx
        .select()
        .from(reviews)
        .where(eq(reviews.creatorId, creatorId))
        .orderBy(desc(reviews.createdAt))
        .limit(6),
    ]);
    return { creator, pkgs, rights, portfolio, revs };
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadStorefront(slug);
  return { title: data?.creator.displayName ?? "Creator" };
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadStorefront(slug);
  if (!data) notFound();
  const { creator, pkgs, rights, portfolio, revs } = data;

  return (
    <>
      <SiteHeader />
      <div className="lg:flex">
        <main className="min-w-0 flex-1">
          <Stage theme={(creator.theme ?? "projection") as Theme}>
            <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
              <p className="text-sm uppercase tracking-widest text-stage-text-muted">
                {creator.location}
              </p>
              <h1 className="mt-2 font-display text-4xl leading-tight sm:text-6xl">
                {creator.displayName}
              </h1>
              {creator.formats && creator.formats.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {creator.formats.map((f) => (
                    <li
                      key={f}
                      className="rounded-sm border border-stage-text-muted/40 px-2 py-0.5 text-xs uppercase tracking-wide text-stage-text-muted"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              {creator.bio && (
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-stage-text-muted">
                  {creator.bio}
                </p>
              )}
            </div>
          </Stage>

          <section aria-label="Portfolio" className="mx-auto max-w-5xl px-4 py-12">
            <h2 className="font-display text-2xl text-text">Selected work</h2>
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {portfolio.map((item) => (
                <li key={item.id}>
                  <figure className="group">
                    <div
                      className="aspect-card w-full overflow-hidden rounded-lg border border-line transition-[filter] group-hover:brightness-110"
                      style={{
                        background:
                          "radial-gradient(120% 100% at 50% 100%, rgba(255,178,77,0.28) 0%, rgba(255,178,77,0.06) 45%, var(--color-surface) 100%)",
                      }}
                      role="img"
                      aria-label={item.title || "Portfolio piece"}
                    />
                    {item.title && (
                      <figcaption className="mt-2 text-sm text-text-muted">
                        {item.title}
                      </figcaption>
                    )}
                  </figure>
                </li>
              ))}
              {portfolio.length === 0 && (
                <li className="col-span-full text-sm text-text-muted">
                  Portfolio coming soon.
                </li>
              )}
            </ul>
          </section>

          {revs.length > 0 && (
            <section aria-label="Reviews" className="mx-auto max-w-5xl px-4 pb-16">
              <h2 className="font-display text-2xl text-text">What brands say</h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {revs.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line bg-surface p-4">
                    <p className="num text-beam" aria-label={`${r.rating} out of 5`}>
                      {"★".repeat(r.rating)}
                      <span className="text-line">{"★".repeat(5 - r.rating)}</span>
                    </p>
                    {r.body && <p className="mt-2 text-sm text-text-muted">{r.body}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
        <BookingRail packages={pkgs} rights={rights} published />
      </div>
    </>
  );
}
