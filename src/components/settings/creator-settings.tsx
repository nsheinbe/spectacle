"use client";

import { useActionState } from "react";

import {
  togglePublishAction,
  upsertCreatorProfileAction,
  upsertPackageAction,
  upsertUsageRightsAction,
  type ActionState,
} from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import type { CreatorProfile, Package, UsageRightsOption } from "@/db";

const THEMES = [
  { value: "projection", label: "Projection mapping" },
  { value: "fooh", label: "FOOH / CGI" },
  { value: "anamorphic", label: "Anamorphic billboard" },
  { value: "drone", label: "Drone show" },
  { value: "street", label: "Street art" },
];

const FORMATS = ["projection", "fooh", "anamorphic", "drone", "street"];

export function StorefrontForm({ storefront }: { storefront: CreatorProfile | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    upsertCreatorProfileAction,
    {},
  );
  const [pubState, pubAction, pubPending] = useActionState<ActionState, FormData>(
    togglePublishAction,
    {},
  );

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-text">Storefront</h2>
        {storefront && (
          <form action={pubAction}>
            <Button type="submit" variant="secondary" size="sm" disabled={pubPending}>
              {storefront.published ? "Unpublish" : "Publish"}
            </Button>
          </form>
        )}
      </div>
      {pubState.error && <FieldError message={pubState.error} />}
      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="slug">Storefront URL (/c/…)</Label>
            <Input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]{3,40}"
              defaultValue={storefront?.slug ?? ""}
              placeholder="lumen-arc"
            />
          </div>
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              name="displayName"
              required
              maxLength={120}
              defaultValue={storefront?.displayName ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              maxLength={120}
              defaultValue={storefront?.location ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="theme">Stage theme</Label>
            <Select id="theme" name="theme" defaultValue={storefront?.theme ?? "projection"}>
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea id="bio" name="bio" maxLength={2000} defaultValue={storefront?.bio ?? ""} />
        </div>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-text-muted">Formats</legend>
          <div className="flex flex-wrap gap-3">
            {FORMATS.map((f) => (
              <label key={f} className="flex items-center gap-1.5 text-sm text-text-muted">
                <input
                  type="checkbox"
                  name="formats"
                  value={f}
                  defaultChecked={storefront?.formats?.includes(f) ?? false}
                  className="accent-[var(--color-beam)]"
                />
                {f}
              </label>
            ))}
          </div>
        </fieldset>
        <FieldError message={state.error} />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : storefront ? "Save storefront" : "Create storefront"}
        </Button>
      </form>
    </Card>
  );
}

function PackageFields({ pkg }: { pkg?: Package }) {
  return (
    <>
      {pkg && <input type="hidden" name="id" value={pkg.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
        <div>
          <Label>Name</Label>
          <Input name="name" required maxLength={120} defaultValue={pkg?.name ?? ""} />
        </div>
        <div>
          <Label>Price ($)</Label>
          <Input
            name="priceDollars"
            type="number"
            min={0}
            step="1"
            required
            className="num"
            defaultValue={pkg ? pkg.priceCents / 100 : ""}
          />
        </div>
        <div>
          <Label>Days</Label>
          <Input
            name="turnaroundDays"
            type="number"
            min={1}
            max={365}
            required
            className="num"
            defaultValue={pkg?.turnaroundDays ?? 14}
          />
        </div>
      </div>
      <div>
        <Label>What the brand gets</Label>
        <Input
          name="deliverableSummary"
          maxLength={1000}
          defaultValue={pkg?.deliverableSummary ?? ""}
          placeholder="1 night, 1 facade, full capture film + stills"
        />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea name="description" maxLength={4000} defaultValue={pkg?.description ?? ""} />
      </div>
      {pkg && (
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            name="active"
            value="true"
            defaultChecked={pkg.active}
            className="accent-[var(--color-beam)]"
          />
          Active (bookable)
          <input type="hidden" name="activeFallback" value="false" />
        </label>
      )}
    </>
  );
}

export function PackageEditor({ packages }: { packages: Package[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    upsertPackageAction,
    {},
  );
  return (
    <Card>
      <h2 className="font-display text-xl text-text">Packages</h2>
      <div className="mt-4 space-y-6">
        {packages.map((pkg) => (
          <form key={pkg.id} action={formAction} className="space-y-3 border-b border-line pb-6">
            <PackageFields pkg={pkg} />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              Save changes
            </Button>
          </form>
        ))}
        <form action={formAction} className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-text-faint">
            Add a package
          </h3>
          <PackageFields />
          <FieldError message={state.error} />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Add package"}
          </Button>
        </form>
      </div>
    </Card>
  );
}

function RightsFields({ opt }: { opt?: UsageRightsOption }) {
  return (
    <>
      {opt && <input type="hidden" name="id" value={opt.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div>
          <Label>Name</Label>
          <Input name="name" required maxLength={120} defaultValue={opt?.name ?? ""} />
        </div>
        <div>
          <Label>Price delta ($)</Label>
          <Input
            name="priceDeltaDollars"
            type="number"
            min={0}
            step="1"
            required
            className="num"
            defaultValue={opt ? opt.priceDeltaCents / 100 : 0}
          />
        </div>
      </div>
      <div>
        <Label>What it covers</Label>
        <Input
          name="description"
          maxLength={4000}
          defaultValue={opt?.description ?? ""}
          placeholder="Organic social, 12 months, worldwide"
        />
      </div>
    </>
  );
}

export function RightsEditor({ options }: { options: UsageRightsOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    upsertUsageRightsAction,
    {},
  );
  return (
    <Card>
      <h2 className="font-display text-xl text-text">Usage rights options</h2>
      <p className="mt-1 text-sm text-text-muted">
        Every booking picks exactly one — price it into the delta.
      </p>
      <div className="mt-4 space-y-6">
        {options.map((opt) => (
          <form key={opt.id} action={formAction} className="space-y-3 border-b border-line pb-6">
            <RightsFields opt={opt} />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              Save changes
            </Button>
          </form>
        ))}
        <form action={formAction} className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-text-faint">
            Add an option
          </h3>
          <RightsFields />
          <FieldError message={state.error} />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Add option"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
