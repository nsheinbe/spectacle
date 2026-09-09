import { notFound } from "next/navigation";

import { HomeCreatorCard } from "@/components/home/home-creator-card";
import { SiteHeader } from "@/components/site-header";
import { env } from "@/lib/env";
import { LAUNCH_COPY } from "@/lib/launch-copy";
import { loadPublishedStorefronts } from "@/lib/published-storefronts";

export const metadata = { title: "Browse" };
export const dynamic = "force-dynamic";

/** Discovery is off by default. A real directory only when FEATURE_BROWSE is true. */
export default async function BrowsePage() {
  if (!env.FEATURE_BROWSE) notFound();

  const storefronts = await loadPublishedStorefronts();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-faint">
          {LAUNCH_COPY.browseEyebrow}
        </p>
        <h1 className="mt-3 font-display text-4xl text-text">{LAUNCH_COPY.browseHeading}</h1>
        <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-text-muted">
          {LAUNCH_COPY.browseLead}
        </p>
        {storefronts.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
            {storefronts.map((c, i) => (
              <HomeCreatorCard key={c.slug} {...c} index={i} />
            ))}
          </div>
        ) : (
          <p className="mt-10 max-w-[52ch] text-[15px] leading-relaxed text-text-muted">
            {LAUNCH_COPY.browseEmpty}
          </p>
        )}
      </main>
    </>
  );
}
