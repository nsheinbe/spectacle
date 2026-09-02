"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  creatorProfiles,
  packages,
  portfolioItems,
  profiles,
  usageRightsOptions,
  withUser,
} from "@/db";
import { getServerSession, toIdentity } from "@/lib/auth/session";
import {
  creatorProfileSchema,
  packageSchema,
  profileUpdateSchema,
  usageRightsSchema,
  uuidSchema,
} from "@/lib/validation";

export type ActionState = { error?: string; ok?: boolean };

function firstIssue(err: { issues: Array<{ message: string }> }): string {
  return err.issues[0]?.message ?? "Invalid input";
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    company: formData.get("company") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await withUser(toIdentity(session), async (tx) => {
    await tx
      .update(profiles)
      .set({ fullName: parsed.data.fullName, company: parsed.data.company })
      .where(eq(profiles.id, session.userId));
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function upsertCreatorProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role !== "creator") return { error: "Creators only." };
  const parsed = creatorProfileSchema.safeParse({
    slug: formData.get("slug"),
    displayName: formData.get("displayName"),
    bio: formData.get("bio") ?? "",
    location: formData.get("location") ?? "",
    theme: formData.get("theme"),
    formats: formData.getAll("formats"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  try {
    await withUser(toIdentity(session), async (tx) => {
      const [existing] = await tx
        .select({ id: creatorProfiles.id })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, session.userId));
      if (existing) {
        await tx
          .update(creatorProfiles)
          .set({
            slug: d.slug,
            displayName: d.displayName,
            bio: d.bio,
            location: d.location,
            theme: d.theme,
            formats: [...d.formats],
            updatedAt: new Date(),
          })
          .where(eq(creatorProfiles.id, existing.id));
      } else {
        await tx.insert(creatorProfiles).values({
          userId: session.userId,
          slug: d.slug,
          displayName: d.displayName,
          bio: d.bio,
          location: d.location,
          theme: d.theme,
          formats: [...d.formats],
        });
      }
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return { error: "That storefront name is taken." };
    throw err;
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function togglePublishAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role !== "creator") return { error: "Creators only." };
  const slug = await withUser(toIdentity(session), async (tx) => {
    const [row] = await tx
      .select({ id: creatorProfiles.id, published: creatorProfiles.published, slug: creatorProfiles.slug })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.userId));
    if (!row) return null;
    await tx
      .update(creatorProfiles)
      .set({ published: !row.published, updatedAt: new Date() })
      .where(eq(creatorProfiles.id, row.id));
    return row.slug;
  });
  if (slug === null) return { error: "Create your storefront first." };
  revalidatePath("/settings");
  revalidatePath(`/c/${slug}`);
  return { ok: true };
}

async function requireOwnCreatorId(
  session: { userId: string },
  identity: Parameters<typeof withUser>[0],
): Promise<string | null> {
  return withUser(identity, async (tx) => {
    const [row] = await tx
      .select({ id: creatorProfiles.id })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.userId));
    return row?.id ?? null;
  });
}

export async function upsertPackageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role !== "creator") return { error: "Creators only." };
  const parsed = packageSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceCents: Math.round(Number(formData.get("priceDollars") ?? 0) * 100),
    turnaroundDays: Number(formData.get("turnaroundDays") ?? 14),
    deliverableSummary: formData.get("deliverableSummary") ?? "",
    // hidden "false" + checkbox "true": an unchecked box still submits the
    // field, so unchecking really deactivates. Forms without the field
    // (the add form) default to active.
    active: formData.has("active")
      ? formData.getAll("active").includes("true")
      : true,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const identity = toIdentity(session);
  const creatorId = await requireOwnCreatorId(session, identity);
  if (!creatorId) return { error: "Create your storefront first." };
  const d = parsed.data;
  await withUser(identity, async (tx) => {
    if (d.id) {
      await tx
        .update(packages)
        .set({
          name: d.name,
          description: d.description,
          priceCents: d.priceCents,
          turnaroundDays: d.turnaroundDays,
          deliverableSummary: d.deliverableSummary,
          active: d.active,
        })
        .where(and(eq(packages.id, d.id), eq(packages.creatorId, creatorId)));
    } else {
      await tx.insert(packages).values({ ...d, id: undefined, creatorId });
    }
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function upsertUsageRightsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role !== "creator") return { error: "Creators only." };
  const parsed = usageRightsSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    priceDeltaCents: Math.round(Number(formData.get("priceDeltaDollars") ?? 0) * 100),
    active: formData.has("active")
      ? formData.getAll("active").includes("true")
      : true,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const identity = toIdentity(session);
  const creatorId = await requireOwnCreatorId(session, identity);
  if (!creatorId) return { error: "Create your storefront first." };
  const d = parsed.data;
  await withUser(identity, async (tx) => {
    if (d.id) {
      await tx
        .update(usageRightsOptions)
        .set({
          name: d.name,
          description: d.description,
          priceDeltaCents: d.priceDeltaCents,
          active: d.active,
        })
        .where(
          and(eq(usageRightsOptions.id, d.id), eq(usageRightsOptions.creatorId, creatorId)),
        );
    } else {
      await tx.insert(usageRightsOptions).values({ ...d, id: undefined, creatorId });
    }
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function removePortfolioItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getServerSession();
  if (!session) redirect("/auth");
  if (session.role !== "creator") return { error: "Creators only." };
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Missing item" };
  await withUser(toIdentity(session), async (tx) => {
    await tx.delete(portfolioItems).where(eq(portfolioItems.id, id.data));
  });
  revalidatePath("/settings");
  return { ok: true };
}
