/**
 * Honest launch copy for the marketing homepage.
 *
 * The live Design Home artboard (design/home.dc.html) ships a `launchCopy`
 * toggle that drops invented marketplace totals, ratings, reply-time, and logo-strip
 * social proof. This module is that mode, plus the honesty invariants the
 * Design itself still violates (see PROGRESS.md):
 *
 *   - no invented totals, ratings, reach, or reply times
 *   - no discovery CTA while FEATURE_BROWSE is false
 *   - /browse exists only when that flag is true (default false)
 *   - no briefs CTA (parked)
 *   - no legal-entity name
 *   - payment language matches what the app does today
 *
 * Every public sentence here must stay true of main at merge.
 */
export const LAUNCH_COPY = {
  productName: "Spectacle",
  eyebrow: "The spectacle marketplace",
  headlineLead: "Book the artists who turn the world into",
  headlineEm: "the ad",
  subhead:
    "Projection mapping, FOOH, anamorphic screens, drone shows, and street work. Book a productized package from a themed storefront. The creator sends a proposal. Nothing is charged today.",
  brandCta: {
    kicker: "For brands",
    label: "See a storefront",
  },
  creatorCta: {
    kicker: "For creators",
    label: "Get booked",
  },
  trustItems: ["Usage rights chosen at booking", "No card needed today"] as const,
  beamHintFine: "Move to sweep the beam",
  beamHintCoarse: "Tap to sweep the beam",

  howEyebrow: "How it works",
  howHeading: "A package, a proposal, then a wait.",
  howLead:
    "Three steps that exist today. Payment collection is not on yet — a booking stops at awaiting payment.",
  steps: [
    {
      n: "01",
      title: "Book a package",
      body: "Open a published storefront, pick a package and usage rights, and send an inquiry. That is a booking, not a charge.",
    },
    {
      n: "02",
      title: "Review the proposal",
      body: "The creator prices the work. You accept or decline. Accepting locks the package and rights into the booking.",
    },
    {
      n: "03",
      title: "Wait for payment",
      body: "The booking sits at awaiting payment. Nothing is captured, simulated, or paid out in this phase.",
    },
  ] as const,

  featuredEyebrow: "Published storefronts",
  featuredHeading: "The ones you can open today.",
  featuredEmpty:
    "No published storefronts on this instance yet. After a seed or a creator publishes, they appear here. There is no directory.",
  featuredFrom: "from",

  formatsEyebrow: "Formats",
  formatsHeading: "Five ways to stop the street.",
  formats: [
    {
      n: "01",
      name: "Projection mapping",
      body: "Light thrown onto buildings, water, and facades — the surface becomes the screen.",
    },
    {
      n: "02",
      name: "FOOH / CGI",
      body: "Fake out-of-home. Impossible billboards, built and shot for the feed.",
    },
    {
      n: "03",
      name: "Anamorphic",
      body: "Curved-screen illusions that break the corner and bend toward the camera.",
    },
    {
      n: "04",
      name: "Drone shows",
      body: "Formations of light choreographed across the night sky.",
    },
    {
      n: "05",
      name: "Street & murals",
      body: "3D pavement illusions and hand-painted walls at building scale.",
    },
  ] as const,
  formatsAside:
    "A public directory is off by default. Open a published storefront to book — there is no brief inbox in this phase.",

  creatorsEyebrow: "For creators",
  creatorsHeading: "Publish packages. Receive inquiries.",
  creatorsBody:
    "Stand up a themed storefront, productize the work, and answer bookings in a shared workspace. Payment release is not on yet.",
  assurances: [
    {
      title: "Rights fixed up front",
      body: "Usage terms are chosen when the brand books, so the proposal is priced against a known option.",
    },
    {
      title: "Proposal locks the price",
      body: "The database re-derives package plus rights when the creator proposes. The app cannot invent a total.",
    },
    {
      title: "Nothing is charged today",
      body: "Accepting a proposal moves the booking to awaiting payment. Capture and payout are a later phase.",
    },
  ] as const,

  closeHeading: "Two ways in. Both honest.",
  closeBody:
    "Open a published storefront if one exists on this instance, or sign in to publish one. There is no brief marketplace yet.",

  browseEyebrow: "Discovery",
  browseHeading: "Published storefronts",
  browseLead:
    "Creators who have published a storefront on this instance. This is a directory, not a ranking — no ratings, no totals.",
  browseEmpty:
    "No published storefronts on this instance yet. After a seed or a creator publishes, they appear here.",
  browseCta: "Browse storefronts",
  browseFormatsAside:
    "Open the directory of published storefronts to book — there is no brief inbox in this phase.",
  browseCloseBody:
    "Open a published storefront, or browse the directory on this instance. There is no brief marketplace yet.",

  footerBlurb:
    "Booking and usage-rights rails for spectacle advertising. Working name, not a final brand.",
  footerNote: "Spectacle contributors",
} as const;

export const FORMAT_LABEL: Record<string, string> = {
  projection: "Projection mapping",
  fooh: "FOOH / CGI",
  anamorphic: "Anamorphic",
  drone: "Drone shows",
  street: "Street & murals",
};

export function formatTurnaround(days: number): string {
  if (days > 0 && days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  return days === 1 ? "1 day" : `${days} days`;
}
