import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { eq, and, asc, desc } from "drizzle-orm";

import { BookingRail } from "@/components/rail/booking-rail";
import { StorefrontHero } from "@/components/stage/storefront-hero";
import { PortfolioTile } from "@/components/storefront/portfolio-tile";
import { ShareButton } from "@/components/storefront/share-button";
import {
  packages,
  portfolioItems,
  publicCreatorView,
  reviews,
  usageRightsOptions,
  withUser,
  type Theme,
} from "@/db";
import { FORMAT_LABEL } from "@/lib/launch-copy";
import { ThemeProvider } from "@/themes/theme-provider";

export const dynamic = "force-dynamic";

/**
 * Public themed storefront. Layout matches design/creator-storefront.dc.html:
 * chrome nav, themed stage (hero + identity + portfolio), locked booking rail
 * as a sibling. Anonymous read path: withUser(null).
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
  const theme = (creator.theme ?? "projection") as Theme;
  const wordmark = (creator.displayName ?? "Spectacle").toUpperCase();
  const tags = (creator.formats ?? []).map((f) => FORMAT_LABEL[f] ?? f);

  return (
    <div className="min-h-dvh bg-canvas text-text">
      <nav className="sticky top-0 z-[70] flex h-16 items-center justify-between border-b border-white/10 bg-[rgba(19,16,12,.94)] px-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="font-display text-xl font-semibold text-text-strong"
          >
            Spectacle
          </Link>
          <span className="hidden h-5 w-px bg-white/15 sm:block" />
          <Link
            href="/"
            className="hidden items-center gap-1.5 text-[13px] font-medium text-text-muted hover:text-text sm:inline-flex"
          >
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none" aria-hidden>
              <path
                d="M13 6H1M1 6L6 1M1 6L6 11"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Home
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs tracking-wide text-[#5c5346] md:inline">
            /c/{slug}
          </span>
          <ShareButton path={`/c/${slug}`} />
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:pb-16">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
          <ThemeProvider
            theme={theme}
            className="min-w-0 bg-transparent text-stage-text pb-24 lg:pb-0"
          >
            <main data-stage="1">
              <StorefrontHero wordmark={wordmark} theme={theme} />

              <div className="mt-8">
                {creator.location && (
                  <p className="text-sm uppercase tracking-[0.18em] text-stage-text-muted">
                    {creator.location}
                  </p>
                )}
                <h1 className="mt-2 font-display text-[clamp(38px,5.4vw,66px)] font-semibold leading-none tracking-[-0.015em] text-stage-text">
                  {creator.displayName}
                </h1>
                {creator.bio && (
                  <p className="mt-4 max-w-[60ch] text-base leading-relaxed text-stage-text-muted">
                    {creator.bio}
                  </p>
                )}
                {tags.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] font-medium text-[#c6b9a4]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <section aria-label="Portfolio" className="mt-[52px]">
                <div className="mb-5 flex items-baseline justify-between">
                  <h2 className="m-0 font-display text-[clamp(24px,3vw,34px)] font-medium text-stage-text">
                    Selected work
                  </h2>
                  <span className="num text-[13px] text-stage-text-faint">
                    {portfolio.length} {portfolio.length === 1 ? "project" : "projects"}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {portfolio.map((item, i) => (
                    <PortfolioTile
                      key={item.id}
                      title={item.title}
                      location={creator.location}
                      index={i}
                    />
                  ))}
                  {portfolio.length === 0 && (
                    <p className="col-span-full text-sm text-stage-text-muted">
                      Portfolio coming soon.
                    </p>
                  )}
                </div>
              </section>

              {revs.length > 0 && (
                <section aria-label="Reviews" className="mt-[52px]">
                  <h2 className="mb-5 font-display text-[clamp(24px,3vw,34px)] font-medium text-stage-text">
                    Reviews
                  </h2>
                  <div className="flex flex-col gap-3.5">
                    {revs.map((r) => (
                      <blockquote
                        key={r.id}
                        className="m-0 rounded-[11px] border border-white/[0.08] bg-stage-surface px-6 py-[22px]"
                      >
                        <p className="num text-stage-accent" aria-label={`${r.rating} out of 5`}>
                          {"★".repeat(r.rating)}
                          <span className="text-line">{"★".repeat(5 - r.rating)}</span>
                        </p>
                        {r.body && (
                          <p className="mt-2 text-base leading-relaxed text-[#ede4d5]">
                            {r.body}
                          </p>
                        )}
                      </blockquote>
                    ))}
                  </div>
                </section>
              )}
            </main>
          </ThemeProvider>

          <div className="lg:sticky lg:top-[90px]">
            <BookingRail
              creatorName={creator.displayName ?? undefined}
              packages={pkgs}
              rights={rights}
              published
            />
          </div>
        </div>
      </div>
    </div>
  );
}