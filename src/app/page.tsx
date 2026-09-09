import Link from "next/link";

import { HomeCreatorCard } from "@/components/home/home-creator-card";
import { HomeNav } from "@/components/home/home-nav";
import { BeamSurface } from "@/components/stage/beam-surface";
import { getServerSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { LAUNCH_COPY } from "@/lib/launch-copy";
import { loadPublishedStorefronts } from "@/lib/published-storefronts";

export const dynamic = "force-dynamic";

async function sessionOrNull() {
  try {
    return await getServerSession();
  } catch {
    return null;
  }
}

export default async function Home() {
  const [session, featured] = await Promise.all([
    sessionOrNull(),
    loadPublishedStorefronts(4),
  ]);
  const primaryHref = featured[0] ? `/c/${featured[0].slug}` : "#storefronts";
  const showBrowse = env.FEATURE_BROWSE;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-canvas text-text">
      <HomeNav
        signedIn={Boolean(session)}
        primaryHref={primaryHref}
        showBrowse={showBrowse}
      />

      <header className="relative min-h-[calc(100svh-74px)]">
        <BeamSurface
          wordmark={LAUNCH_COPY.productName.toUpperCase()}
          className="absolute inset-0 min-h-[calc(100svh-74px)]"
        />
        <div className="relative z-[5] mx-auto flex h-full min-h-[calc(100svh-74px)] max-w-[1200px] flex-col justify-center px-8 py-16">
          <div className="mb-[30px] inline-flex items-center gap-2">
            <span className="animate-live h-[7px] w-[7px] rounded-full bg-beam" />
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c6b9a4]">
              {LAUNCH_COPY.eyebrow}
            </span>
          </div>
          <h1 className="m-0 max-w-[15ch] font-display text-[clamp(44px,6.4vw,92px)] font-semibold leading-[0.98] tracking-[-0.015em] text-text-strong">
            {LAUNCH_COPY.headlineLead}{" "}
            <em className="font-semibold italic text-beam-soft">
              {LAUNCH_COPY.headlineEm}
            </em>
            .
          </h1>
          <p className="mt-[30px] max-w-[52ch] text-[clamp(16px,1.3vw,19px)] font-normal leading-relaxed text-text-muted">
            {LAUNCH_COPY.subhead}
          </p>
          <div className="mt-[38px] flex flex-wrap gap-3.5">
            <Link
              href={primaryHref}
              className="flex min-w-[180px] flex-col gap-0.5 rounded-md bg-beam px-[26px] py-[13px] text-[#17130e] hover:bg-beam-hover hover:shadow-[0_0_30px_rgba(255,178,77,.4)]"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#17130e]/60">
                {LAUNCH_COPY.brandCta.kicker}
              </span>
              <span className="text-[17px] font-semibold">{LAUNCH_COPY.brandCta.label}</span>
            </Link>
            <Link
              href="/auth"
              className="flex min-w-[180px] flex-col gap-0.5 rounded-md border border-white/20 px-[26px] py-[13px] text-[#ede4d5] hover:border-beam/55 hover:bg-beam/[0.06] hover:text-beam-wash"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-faint">
                {LAUNCH_COPY.creatorCta.kicker}
              </span>
              <span className="text-[17px] font-semibold">{LAUNCH_COPY.creatorCta.label}</span>
            </Link>
          </div>
          <div className="mt-[34px] flex flex-wrap items-center gap-[18px] text-[13px] font-medium text-text-faint">
            {LAUNCH_COPY.trustItems.map((item, i) => (
              <span key={item} className="inline-flex items-center gap-2">
                {i > 0 && (
                  <span className="mr-1 h-[3px] w-[3px] rounded-full bg-[#4a4235]" />
                )}
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="absolute bottom-[26px] left-1/2 z-[5] flex -translate-x-1/2 items-center gap-2.5 text-[11px] uppercase tracking-[0.2em] text-text-faint">
          <span className="h-[34px] w-px bg-gradient-to-b from-[#6e6353] to-transparent" />
          <span className="hidden [@media(pointer:fine)]:inline">{LAUNCH_COPY.beamHintFine}</span>
          <span className="[@media(pointer:fine)]:hidden">{LAUNCH_COPY.beamHintCoarse}</span>
        </div>
      </header>

      <section
        id="how"
        className="relative border-t border-white/[0.07] py-[clamp(88px,12vh,132px)]"
      >
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="mb-16 flex flex-wrap items-end justify-between gap-8">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-text-faint">
                {LAUNCH_COPY.howEyebrow}
              </span>
              <h2 className="mt-4 max-w-[20ch] font-display text-[clamp(32px,4vw,52px)] font-medium leading-[1.02] tracking-[-0.01em] text-text">
                {LAUNCH_COPY.howHeading}
              </h2>
            </div>
            <p className="m-0 max-w-[34ch] text-[15px] leading-relaxed text-text-muted">
              {LAUNCH_COPY.howLead}
            </p>
          </div>
          <div className="relative grid gap-[34px] sm:grid-cols-3 sm:gap-7">
            <div
              aria-hidden
              className="animate-beam-line pointer-events-none absolute left-[8%] right-[8%] top-[23px] hidden h-0.5 bg-gradient-to-r from-transparent via-beam to-transparent shadow-[0_0_16px_rgba(255,178,77,.4)] sm:block"
            />
            {LAUNCH_COPY.steps.map((step) => (
              <div key={step.n} className="relative z-[1]">
                <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full border border-beam/40 bg-canvas font-display text-lg font-semibold text-beam num">
                  {step.n}
                </div>
                <h3 className="mb-2.5 mt-[22px] text-xl font-semibold text-text">
                  {step.title}
                </h3>
                <p className="m-0 max-w-[34ch] text-[15px] leading-relaxed text-text-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="storefronts"
        className="border-t border-white/[0.07] py-[clamp(88px,12vh,120px)]"
      >
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="mb-12">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-text-faint">
              {LAUNCH_COPY.featuredEyebrow}
            </span>
            <h2 className="mt-4 font-display text-[clamp(32px,4vw,52px)] font-medium leading-[1.02] tracking-[-0.01em] text-text">
              {LAUNCH_COPY.featuredHeading}
            </h2>
          </div>
          {featured.length > 0 ? (
            <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((c, i) => (
                <HomeCreatorCard key={c.slug} {...c} index={i} />
              ))}
            </div>
          ) : (
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-text-muted">
              {LAUNCH_COPY.featuredEmpty}
            </p>
          )}
        </div>
      </section>

      <section
        id="formats"
        className="border-t border-white/[0.07] py-[clamp(88px,12vh,120px)]"
      >
        <div className="mx-auto max-w-[1200px] px-8">
          <div className="mb-[52px]">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-text-faint">
              {LAUNCH_COPY.formatsEyebrow}
            </span>
            <h2 className="mt-4 max-w-[22ch] font-display text-[clamp(32px,4vw,52px)] font-medium leading-[1.02] tracking-[-0.01em] text-text">
              {LAUNCH_COPY.formatsHeading}
            </h2>
          </div>
          <div className="grid overflow-hidden rounded-[10px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3 [&>*]:bg-canvas [&>*]:outline [&>*]:outline-1 [&>*]:outline-white/10">
            {LAUNCH_COPY.formats.map((f) => (
              <div key={f.n} className="flex min-h-[230px] flex-col p-7 hover:bg-ink">
                <span className="font-display text-[15px] font-semibold text-beam num">
                  {f.n}
                </span>
                <h3 className="mb-3 mt-auto font-display text-[26px] font-medium leading-tight text-text">
                  {f.name}
                </h3>
                <p className="m-0 max-w-[32ch] text-sm leading-relaxed text-text-muted">
                  {f.body}
                </p>
              </div>
            ))}
            <div className="flex min-h-[230px] flex-col justify-end bg-surface p-7">
              <span className="font-display text-[15px] font-semibold text-text-faint">→</span>
              <p className="mb-0 mt-auto font-display text-[22px] leading-snug text-[#ede4d5]">
                {showBrowse ? LAUNCH_COPY.browseFormatsAside : LAUNCH_COPY.formatsAside}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="creators"
        className="relative overflow-hidden border-t border-white/[0.07] py-[clamp(96px,14vh,148px)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[40%] left-1/2 h-[900px] w-[900px] -translate-x-1/2"
          style={{
            background: "radial-gradient(circle,rgba(255,178,77,.12),transparent 62%)",
          }}
        />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-10 px-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-text-faint">
              {LAUNCH_COPY.creatorsEyebrow}
            </span>
            <h2 className="mt-4 max-w-[16ch] font-display text-[clamp(34px,4.4vw,58px)] font-medium leading-none tracking-[-0.01em] text-text">
              {LAUNCH_COPY.creatorsHeading}
            </h2>
            <p className="mb-[34px] mt-[22px] max-w-[44ch] text-base leading-relaxed text-text-muted">
              {LAUNCH_COPY.creatorsBody}
            </p>
            <Link
              href="/auth"
              className="inline-flex h-12 items-center rounded-md bg-beam px-6 text-[15px] font-semibold text-[#17130e] hover:bg-beam-hover hover:shadow-[0_0_30px_rgba(255,178,77,.4)]"
            >
              {LAUNCH_COPY.creatorCta.label}
            </Link>
          </div>
          <div className="grid gap-[18px]">
            {LAUNCH_COPY.assurances.map((a) => (
              <div
                key={a.title}
                className="rounded-xl border border-white/10 bg-ink p-6"
              >
                <h3 className="font-display text-[22px] font-medium text-text">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="find"
        className="relative overflow-hidden border-t border-white/[0.07] py-[clamp(96px,15vh,160px)] text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 90% at 50% 0%,rgba(255,178,77,.14),transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[900px] px-8">
          <h2 className="mx-auto max-w-[18ch] font-display text-[clamp(38px,5.6vw,76px)] font-medium leading-none tracking-[-0.015em] text-text-strong">
            {LAUNCH_COPY.closeHeading}
          </h2>
          <p className="mx-auto mb-10 mt-6 max-w-[46ch] text-[17px] leading-relaxed text-text-muted">
            {showBrowse ? LAUNCH_COPY.browseCloseBody : LAUNCH_COPY.closeBody}
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Link
              href={primaryHref}
              className="inline-flex h-[52px] items-center rounded-md bg-beam px-[30px] text-base font-semibold text-[#17130e] hover:bg-beam-hover hover:shadow-[0_0_34px_rgba(255,178,77,.45)]"
            >
              {LAUNCH_COPY.brandCta.label}
            </Link>
            <Link
              href="/auth"
              className="inline-flex h-[52px] items-center rounded-md border border-white/20 px-[30px] text-base font-semibold text-[#ede4d5] hover:border-beam/55 hover:bg-beam/[0.06] hover:text-beam-wash"
            >
              {LAUNCH_COPY.creatorCta.label}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-deep px-8 pb-10 pt-16">
        <div className="mx-auto max-w-[1200px]">
          <div className="grid gap-8 border-b border-white/[0.07] pb-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <span className="font-display text-[22px] font-semibold text-text-strong">
                {LAUNCH_COPY.productName}
              </span>
              <p className="mt-4 max-w-[30ch] text-sm leading-relaxed text-text-faint">
                {LAUNCH_COPY.footerBlurb}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-faint">
                Formats
              </span>
              {LAUNCH_COPY.formats.slice(0, 4).map((f) => (
                <a key={f.n} href="#formats" className="text-sm text-text-muted hover:text-beam">
                  {f.name}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-text-faint">
                On this site
              </span>
              <a href="#how" className="text-sm text-text-muted hover:text-beam">
                How it works
              </a>
              {showBrowse ? (
                <Link href="/browse" className="text-sm text-text-muted hover:text-beam">
                  {LAUNCH_COPY.browseCta}
                </Link>
              ) : (
                <a href="#storefronts" className="text-sm text-text-muted hover:text-beam">
                  Published storefronts
                </a>
              )}
              <Link href="/auth" className="text-sm text-text-muted hover:text-beam">
                Sign in
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-7">
            <span className="text-[13px] text-text-faint">{LAUNCH_COPY.footerNote}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}