import { and, asc, eq, inArray } from "drizzle-orm";

import { packages, publicCreatorView, withUser } from "@/db";
import { FORMAT_LABEL } from "@/lib/launch-copy";

export type PublishedStorefront = {
  slug: string;
  name: string;
  format: string;
  fromCents: number | null;
};

/**
 * Published storefronts only (`public_creator_view` already filters
 * `published = true`). No ratings, GMV, or other invented social proof.
 */
export async function loadPublishedStorefronts(
  limit?: number,
): Promise<PublishedStorefront[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await withUser(null, async (tx) => {
      const creators = await tx
        .select()
        .from(publicCreatorView)
        .limit(limit ?? 500);
      const ids = creators
        .map((c) => c.id)
        .filter((id): id is string => Boolean(id));
      const pkgs = ids.length
        ? await tx
            .select({
              creatorId: packages.creatorId,
              priceCents: packages.priceCents,
            })
            .from(packages)
            .where(and(inArray(packages.creatorId, ids), eq(packages.active, true)))
            .orderBy(asc(packages.priceCents))
        : [];
      const cheapest = new Map<string, number>();
      for (const p of pkgs) {
        if (!cheapest.has(p.creatorId)) cheapest.set(p.creatorId, p.priceCents);
      }
      return creators
        .filter((c): c is typeof c & { slug: string; displayName: string } =>
          Boolean(c.slug && c.displayName),
        )
        .map((c) => {
          const formatKey = c.formats?.[0] ?? c.theme ?? "projection";
          return {
            slug: c.slug,
            name: c.displayName,
            format: FORMAT_LABEL[formatKey] ?? formatKey,
            fromCents: c.id ? (cheapest.get(c.id) ?? null) : null,
          };
        });
    });
  } catch {
    return [];
  }
}
