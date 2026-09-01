import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import {
  PackageEditor,
  RightsEditor,
  StorefrontForm,
} from "@/components/settings/creator-settings";
import { ProfileForm } from "@/components/settings/profile-form";
import {
  creatorProfiles,
  packages,
  profiles,
  usageRightsOptions,
  withUser,
} from "@/db";
import { requireSession } from "@/lib/auth/guards";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const isBrand = session.role === "brand";

  const data = await withUser(
    { userId: session.userId, role: session.role },
    async (tx) => {
      const [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, session.userId));
      if (!profile) return null;
      if (isBrand) return { profile, storefront: null, pkgs: [], rights: [] };
      const [storefront] = await tx
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, session.userId));
      if (!storefront) return { profile, storefront: null, pkgs: [], rights: [] };
      const [pkgs, rights] = await Promise.all([
        tx
          .select()
          .from(packages)
          .where(eq(packages.creatorId, storefront.id))
          .orderBy(asc(packages.sort), asc(packages.createdAt)),
        tx
          .select()
          .from(usageRightsOptions)
          .where(eq(usageRightsOptions.creatorId, storefront.id))
          .orderBy(asc(usageRightsOptions.sort), asc(usageRightsOptions.createdAt)),
      ]);
      return { profile, storefront, pkgs, rights };
    },
  );
  if (!data) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
        <h1 className="font-display text-3xl text-text">Settings</h1>
        <ProfileForm profile={data.profile} isBrand={isBrand} />
        {!isBrand && (
          <>
            <StorefrontForm storefront={data.storefront} />
            {data.storefront && (
              <>
                <PackageEditor packages={data.pkgs} />
                <RightsEditor options={data.rights} />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
