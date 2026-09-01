import { notFound } from "next/navigation";

import { env } from "@/lib/env";

/** Discovery is Phase 2. Schema and flag exist; no UI ships behind false. */
export default function BrowsePage() {
  if (!env.FEATURE_BROWSE) notFound();
  notFound(); // no UI in Phase 1 even when flagged on
}
