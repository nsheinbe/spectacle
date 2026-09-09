import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { languageRuleViolations } from "../scripts/language-rules";
import {
  deliverableKeyMatchesBooking,
  deliverableStorageKey,
  safeDeliverableFileName,
} from "../src/lib/deliverables";
import { env, r2Configured } from "../src/lib/env";
import { LAUNCH_COPY } from "../src/lib/launch-copy";
import { TRANSITION_MATRIX } from "../src/lib/bookings/transition";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Phase 3 — deliverable uploads and discovery", () => {
  it("FEATURE_BROWSE defaults to false; /browse 404s when false", () => {
    expect(env.FEATURE_BROWSE).toBe(false);
    expect(read(".env.example")).toMatch(/FEATURE_BROWSE=false/);
    const browse = read("src/app/browse/page.tsx");
    expect(browse).toMatch(/if\s*\(\s*!env\.FEATURE_BROWSE\s*\)\s*notFound\(\)/);
    expect(browse).not.toMatch(/no UI in Phase 1 even when flagged on/);
  });

  it("/browse lists published storefronts when the flag is true", () => {
    const browse = read("src/app/browse/page.tsx");
    expect(browse).toContain("loadPublishedStorefronts");
    expect(browse).toContain("LAUNCH_COPY.browseLead");
    expect(browse).toContain("HomeCreatorCard");
    const loader = read("src/lib/published-storefronts.ts");
    expect(loader).toContain("publicCreatorView");
    expect(loader).toMatch(/published storefronts only/i);
    expect(loader).not.toMatch(/rating|gmv|12\.4M|social proof/i);
  });

  it("browse copy is honest — no invented ratings or GMV", () => {
    const publicText = [
      LAUNCH_COPY.browseEyebrow,
      LAUNCH_COPY.browseHeading,
      LAUNCH_COPY.browseLead,
      LAUNCH_COPY.browseEmpty,
      LAUNCH_COPY.browseCta,
      LAUNCH_COPY.browseFormatsAside,
      LAUNCH_COPY.browseCloseBody,
    ].join("\n");
    expect(publicText).not.toMatch(/\$12\.4M|12\.4M|4\.9|2\.4M|5\.1M/);
    expect(LAUNCH_COPY.browseLead).toMatch(/no ratings/i);
    expect(LAUNCH_COPY.browseLead).toMatch(/no totals/i);
    expect(LAUNCH_COPY.browseLead).toMatch(/published/i);
  });

  it("workspace upload writes a deliverables row through the presign port", () => {
    const actions = read("src/actions/deliverables.ts");
    expect(actions).toContain("prepareDeliverableUploadAction");
    expect(actions).toContain("recordDeliverableAction");
    expect(actions).toContain("insertDeliverable");
    expect(actions).toContain("presignPut");
    expect(actions).toContain("assertCreatorCanPutDeliverable");
    const lib = read("src/lib/deliverables.ts");
    expect(lib).toContain("insertDeliverable");
    expect(lib).toContain("deliverables");
    expect(lib).toContain("withUser");
    const workspace = read("src/app/bookings/[id]/page.tsx");
    expect(workspace).toContain("DeliverablePanel");
    const panel = read("src/components/bookings/deliverable-panel.tsx");
    expect(panel).toContain("prepareDeliverableUploadAction");
    expect(panel).toContain("recordDeliverableAction");
    expect(panel).toContain("/api/uploads");
  });

  it("participant download uses presignGet; stranger is 403", () => {
    const uploads = read("src/app/api/uploads/route.ts");
    expect(uploads).toContain("export async function GET");
    expect(uploads).toContain("makeDeliverablePresigner");
    expect(uploads).toContain("presignGet");
    expect(uploads).toContain("StorageForbiddenError");
    expect(uploads).toMatch(/status:\s*403/);
    const panel = read("src/components/bookings/deliverable-panel.tsx");
    expect(panel).toContain("res.status === 403");
  });

  it("LocalFs remains the no-R2 path; R2 stays optional", () => {
    expect(r2Configured()).toBe(false);
    const index = read("src/storage/index.ts");
    expect(index).toContain("r2Configured()");
    expect(index).toContain("makeLocalFsAdapter");
    expect(index).toContain("makeR2Adapter");
    expect(read(".env.example")).toMatch(/R2_ACCOUNT_ID=/);
  });

  it("does not enable awaiting_payment→funded", () => {
    const edge = TRANSITION_MATRIX.find(
      (e) => e.from === "awaiting_payment" && e.to === "funded",
    );
    expect(edge).toMatchObject({ party: "system", enabled: false });
    expect(read("src/actions/deliverables.ts")).not.toMatch(/funded|stripe/i);
    expect(read("src/components/bookings/deliverable-panel.tsx")).not.toMatch(
      /funded|stripe/i,
    );
  });

  it("deliverable keys stay under the booking prefix", () => {
    const bookingId = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    expect(safeDeliverableFileName("../../etc/passwd")).toBe("passwd");
    expect(safeDeliverableFileName("hero final.mp4")).toBe("hero_final.mp4");
    const key = deliverableStorageKey(bookingId, "cut.mp4");
    expect(deliverableKeyMatchesBooking(key, bookingId)).toBe(true);
    expect(deliverableKeyMatchesBooking(key, other)).toBe(false);
    expect(deliverableKeyMatchesBooking(`deliverables/${other}/x/cut.mp4`, bookingId)).toBe(
      false,
    );
  });

  it("language rules stay clean", () => {
    expect(languageRuleViolations()).toEqual([]);
  });
});
